import * as THREE from 'three'
import type { ColorInput } from '../types'
import { resolveColor } from './invertToneMapping'
import { setSymbolOcclusionController } from './SymbolOcclusionPass'

/**
 * 屏幕空间 billboard 四边形原语，用单通道 SDF 纹理（或程序化圆角矩形）渲染。
 *
 * 顶点着色器把单位四边形按像素尺寸缩放、旋转、按像素偏移平移后，叠加到锚点世界
 * 位置的屏幕投影上——像素大小在 VS 里一次算完，不需每帧按距离 rescale。片元着色器
 * 采样 SDF：`pxDist = (r - 0.5) * spread`（>0 内部），`smoothstep` 做抗锯齿填充，
 * 距离阈值带做描边 / halo，颜色作为 uniform（经 resolveColor 反求）。
 *
 * Symbol 不走实体 OIT：主场景渲染前由 SymbolOcclusionPass 临时隐藏，随后在独立
 * pass 中读取场景深度并按锚点全有 / 全无遮挡绘制。材质本身保持不透明队列，SDF
 * 透明边用 discard 处理，避免被 OIT 按 quad 片元深度切碎。
 *
 * Screen-space billboard quad primitive rendered from a single-channel SDF texture
 * (or a procedural rounded rect). The VS sizes / rotates / offsets a unit quad in
 * pixels and adds it to the anchor's screen projection — pixel size is computed in
 * the VS, no per-distance rescale. The FS samples the SDF, anti-aliases the fill
 * with `smoothstep`, draws an outline / halo as a distance band, and takes color
 * from uniforms (WYSIWYG via resolveColor). Symbols are rendered by
 * SymbolOcclusionPass rather than entity OIT; alpha edges use discard so the quad is
 * never partially clipped by per-fragment scene depth.
 */
export class AnchorQuadGraphic {
  readonly object3D: THREE.Mesh
  private readonly uniforms: Record<string, THREE.IUniform>
  private readonly material: THREE.ShaderMaterial

  constructor() {
    this.uniforms = {
      uAnchorWorld: { value: new THREE.Vector3() },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPixelSize: { value: new THREE.Vector2(1, 1) },
      uPixelOffset: { value: new THREE.Vector2(0, 0) },
      uRotation: { value: 0 },
      uMap: { value: null as THREE.Texture | null },
      uSpread: { value: 1 },
      uTint: { value: new THREE.Color(0xffffff) },
      uOutlineColor: { value: new THREE.Color(0x000000) },
      uOutlineWidth: { value: 0 },
      uSmoothing: { value: 0.5 },
      uOpacity: { value: 1 },
      uHasMap: { value: 0 },
      uMode: { value: 0 },
      uCornerRadius: { value: 0 },
      uSceneDepth: { value: null as THREE.Texture | null },
      uSceneDepthTexelSize: { value: new THREE.Vector2(1, 1) },
      uUseAnchorOcclusion: { value: 0 },
      uOcclusionDepthBias: { value: 5e-4 },
      uOcclusionSampleRadius: { value: 1.5 }
    }

    this.material = new THREE.ShaderMaterial({
      name: 'TelluxAnchorQuadSDF',
      uniforms: this.uniforms,
      // 不透明渲染，绕过 OIT——symbol 是点锚定的 billboard，遮挡应该以锚点为准
      // （全有或全无），而非 OIT 的逐片元深度 discard。OIT 的 telluxDepthDiscard 用
      // gl_FragCoord.xy 采样场景深度，四边形不同片元的 xy 各异，会部分被 discard、
      // 部分保留，加上 Float32 锚点抖动即产生闪烁。
      // 改为 SymbolOcclusionPass：主场景先隐藏 symbol，之后单独读取 scene depth，
      // 用锚点投影深度做全有 / 全无遮挡。锚点深度带一个朝相机方向的 bias，并采样
      // 邻域 depth，避免贴近地表或落在瓦片边界时因深度量化来回翻转。
      //
      // Opaque rendering bypasses OIT — symbols are point-anchored billboards, so
      // occlusion should be all-or-nothing at the anchor, not per-fragment via OIT's
      // telluxDepthDiscard (which samples scene depth at gl_FragCoord.xy, differing across
      // the quad, causing partial discard + Float32 flicker). SymbolOcclusionPass samples
      // scene depth at the anchor with a small camera-facing bias and neighbor taps, so
      // surface-adjacent labels do not flip on depth quantization boundaries.
      transparent: false,
      depthWrite: false,
      depthTest: true,
      vertexShader: /* glsl */ `
        uniform vec3 uAnchorWorld;
        uniform vec2 uResolution;
        uniform vec2 uPixelSize;
        uniform vec2 uPixelOffset;
        uniform float uRotation;
        varying vec2 vUv;
        varying vec2 vAnchorUv;
        varying float vAnchorDepth;
        void main() {
          vUv = uv;
          vec2 corner = position.xy;
          float c = cos(uRotation);
          float s = sin(uRotation);
          vec2 rotated = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
          vec2 screenPx = rotated * uPixelSize + uPixelOffset;
          vec2 ndcOffset = screenPx / uResolution * 2.0;
          vec4 clip = projectionMatrix * viewMatrix * vec4(uAnchorWorld, 1.0);
          vec3 anchorNdc = clip.xyz / clip.w;
          vAnchorUv = anchorNdc.xy * 0.5 + 0.5;
          vAnchorDepth = anchorNdc.z * 0.5 + 0.5;
          clip.xy += ndcOffset * clip.w;
          gl_Position = clip;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uMap;
        uniform float uSpread;
        uniform vec3 uTint;
        uniform vec3 uOutlineColor;
        uniform float uOutlineWidth;
        uniform float uSmoothing;
        uniform float uOpacity;
        uniform float uHasMap;
        uniform float uMode;
        uniform vec2 uPixelSize;
        uniform float uCornerRadius;
        uniform sampler2D uSceneDepth;
        uniform vec2 uSceneDepthTexelSize;
        uniform float uUseAnchorOcclusion;
        uniform float uOcclusionDepthBias;
        uniform float uOcclusionSampleRadius;
        varying vec2 vUv;
        varying vec2 vAnchorUv;
        varying float vAnchorDepth;

        // 圆角矩形解析距离场：返回值 < 0 在内部，> 0 在外部。
        // Analytical rounded-rect SDF: < 0 inside, > 0 outside.
        float roundedBoxSDF(vec2 uv, vec2 halfSize, float radius) {
          vec2 p = (uv - 0.5) * halfSize * 2.0;
          vec2 d = abs(p) - halfSize + radius;
          return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
        }

        float sampleAnchorSceneDepth(vec2 uv) {
          vec2 d = uSceneDepthTexelSize * uOcclusionSampleRadius;
          float depth = texture2D(uSceneDepth, uv).x;
          depth = max(depth, texture2D(uSceneDepth, uv + vec2(d.x, 0.0)).x);
          depth = max(depth, texture2D(uSceneDepth, uv - vec2(d.x, 0.0)).x);
          depth = max(depth, texture2D(uSceneDepth, uv + vec2(0.0, d.y)).x);
          depth = max(depth, texture2D(uSceneDepth, uv - vec2(0.0, d.y)).x);
          return depth;
        }

        void main() {
          if (uUseAnchorOcclusion > 0.5) {
            if (
              vAnchorUv.x < 0.0 || vAnchorUv.x > 1.0 ||
              vAnchorUv.y < 0.0 || vAnchorUv.y > 1.0 ||
              vAnchorDepth < 0.0 || vAnchorDepth > 1.0
            ) {
              discard;
            }
            float sceneDepth = sampleAnchorSceneDepth(vAnchorUv);
            float biasedAnchorDepth = vAnchorDepth - uOcclusionDepthBias;
            if (biasedAnchorDepth > sceneDepth) {
              discard;
            }
          }

          float pxDist;
          if (uMode > 0.5) {
            float edgeDist = roundedBoxSDF(vUv, uPixelSize * 0.5, uCornerRadius);
            pxDist = -edgeDist; // 内正外负 / inside positive
          } else {
            if (uHasMap < 0.5) discard;
            float r = texture2D(uMap, vUv).r;
            pxDist = (r - 0.5) * uSpread;
          }

          float fill = smoothstep(-uSmoothing, uSmoothing, pxDist);
          float outer = smoothstep(-uOutlineWidth - uSmoothing, -uOutlineWidth + uSmoothing, pxDist);
          float ring = max(outer - fill, 0.0);
          float alpha = max(fill, ring) * uOpacity;
          if (alpha < 0.01) discard;
          vec3 rgb = mix(uOutlineColor, uTint, fill / max(fill + ring, 1e-4));
          gl_FragColor = vec4(rgb, alpha);
        }
      `
    })

    // 自写 ShaderMaterial 经 EntityRenderManager OIT 时会被 clone 一份做
    // accumulation / revealage pass，而 ShaderMaterial.copy 会深拷贝 uniforms——派生材质
    // 与原材质的 uniform 值对象就此分离，运行时改色 / 改位置无法同步到 OIT 渲染。
    // three 对 ShaderMaterial 是从 material.uniforms 实时上传（programCache.getUniforms
    // 直接返回 material.uniforms，不缓存），故覆盖 clone 让派生材质直接共享原材质的
    // uniforms 对象即可保持同步。
    //
    // OIT clones this ShaderMaterial for its accumulation / revealage passes, and
    // ShaderMaterial.copy deep-clones uniforms — the derived material's uniform value
    // objects would diverge from the original, so runtime color / position updates would
    // not reach the OIT render. Three uploads ShaderMaterial uniforms live from
    // material.uniforms (programCache.getUniforms returns it directly, uncached), so
    // overriding clone to share the original's uniforms object keeps them in sync.
    const original = this.material
    original.clone = function () {
      const cloned = THREE.Material.prototype.clone.call(original) as THREE.ShaderMaterial
      cloned.uniforms = original.uniforms
      return cloned
    }
    this.material.customProgramCacheKey = () => 'tellux-anchor-quad-sdf'

    const geometry = new THREE.PlaneGeometry(1, 1)
    this.object3D = new THREE.Mesh(geometry, this.material)
    setSymbolOcclusionController(this.object3D, {
      setDepthTexture: (texture, texelSize) => {
        this.uniforms.uSceneDepth.value = texture
        if (texelSize) {
          ;(this.uniforms.uSceneDepthTexelSize.value as THREE.Vector2).copy(texelSize)
        }
      },
      setEnabled: (enabled) => {
        this.uniforms.uUseAnchorOcclusion.value = enabled ? 1 : 0
      }
    })
    this.object3D.matrixAutoUpdate = false
    this.object3D.updateMatrix()
    this.object3D.renderOrder = 0
    // billboard 的位置在 VS 里由 uAnchorWorld + 屏幕偏移算出，几何本身留在原点、矩阵为单位。
    // Three.js 按对象矩阵算包围球做视锥体裁剪——原点包围球通常不在观察地球表面的相机视野内，
    // 会被错误剔除，故关闭视锥体裁剪。VS 输出的 gl_Position.z 来自锚点投影，OIT 深度剔除
    // (telluxDepthDiscard) 仍然按锚点与场景深度正确遮挡。
    //
    // The billboard is positioned in the VS from uAnchorWorld + a screen offset; the
    // geometry itself stays at the origin with an identity matrix. Three.js frustum-culls
    // by the object's matrix-derived bounding sphere — an origin-centered sphere is almost
    // never in the camera frustum when viewing Earth's surface. Disable frustum culling;
    // SymbolOcclusionPass samples scene depth at the anchor projection, so occlusion
    // stays all-or-nothing even though the quad is expanded in screen space.
    this.object3D.frustumCulled = false
  }

  setPosition(position: THREE.Vector3) {
    ;(this.uniforms.uAnchorWorld.value as THREE.Vector3).copy(position)
  }

  setPixelSize(width: number, height: number) {
    ;(this.uniforms.uPixelSize.value as THREE.Vector2).set(width, height)
  }

  setPixelOffset(dx: number, dy: number) {
    ;(this.uniforms.uPixelOffset.value as THREE.Vector2).set(dx, dy)
  }

  setRotation(rotation: number) {
    this.uniforms.uRotation.value = rotation
  }

  setTint(color: ColorInput) {
    ;(this.uniforms.uTint.value as THREE.Color).copy(resolveColor(color))
  }

  /** 直接设已反求的 linear 色（文字路径：颜色在 SymbolGraphic 已 resolveColor）。Set a pre-resolved linear tint. */
  setTintRaw(color: THREE.Color) {
    ;(this.uniforms.uTint.value as THREE.Color).copy(color)
  }

  setOutlineColor(color: ColorInput) {
    ;(this.uniforms.uOutlineColor.value as THREE.Color).copy(resolveColor(color))
  }

  /** 直接设已反求的 linear 描边色。Set a pre-resolved linear outline color. */
  setOutlineColorRaw(color: THREE.Color) {
    ;(this.uniforms.uOutlineColor.value as THREE.Color).copy(color)
  }

  setOutlineWidth(width: number) {
    this.uniforms.uOutlineWidth.value = Math.max(0, width)
  }

  setOpacity(opacity: number) {
    this.uniforms.uOpacity.value = Math.max(0, Math.min(1, opacity))
  }

  /** tint 的 hex（已反求的 linear 色）。Tint hex (resolved linear color). */
  get tintHex(): number {
    return (this.uniforms.uTint.value as THREE.Color).getHex()
  }

  /** 描边色的 hex。Outline-color hex. */
  get outlineColorHex(): number {
    return (this.uniforms.uOutlineColor.value as THREE.Color).getHex()
  }

  /** 程序化圆角矩形背景的圆角半径（像素）。Corner radius (px) for procedural bg. */
  setCornerRadius(radius: number) {
    this.uniforms.uCornerRadius.value = Math.max(0, radius)
  }

  /**
   * 切到纹理 SDF 模式（icon / text）。`texture` 仅被引用，生命周期由调用方
   * （SymbolGraphic 的图标缓存 / 文字纹理）管理，本方法不持有所有权。
   *
   * Switch to textured-SDF mode (icon / text). `texture` is only referenced; its
   * lifetime is owned by the caller (SymbolGraphic's icon cache / text texture).
   */
  setMap(texture: THREE.Texture) {
    this.uniforms.uMode.value = 0
    this.uniforms.uHasMap.value = 1
    this.uniforms.uMap.value = texture
  }

  /**
   * SDF 距离场半径（绘制缓冲像素）。对文字（1:1 显示）= 源 spread × pixelRatio；
   * 对图标（SDF 被拉伸）= 源 spread × scale × pixelRatio。由 SymbolGraphic 按场景算好传入。
   *
   * SDF radius in drawing-buffer px. For text (1:1) = source spread × pixelRatio;
   * for icons (stretched SDF) = source spread × scale × pixelRatio. Computed by
   * SymbolGraphic per use case.
   */
  setSpread(spread: number) {
    this.uniforms.uSpread.value = spread
  }

  /** 切到程序化圆角矩形背景模式。Switch to procedural rounded-rect background mode. */
  setProceduralBackground() {
    this.uniforms.uMode.value = 1
    this.uniforms.uHasMap.value = 1
    this.uniforms.uMap.value = null
  }

  setRenderOrder(order: number) {
    this.object3D.renderOrder = order
  }

  syncResolution(width: number, height: number) {
    ;(this.uniforms.uResolution.value as THREE.Vector2).set(width, height)
  }

  dispose() {
    this.object3D.geometry.dispose()
    this.material.dispose()
  }
}
