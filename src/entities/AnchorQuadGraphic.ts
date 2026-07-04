import * as THREE from 'three'
import type { ColorInput } from '../types'
import { resolveDisplayColor } from './invertToneMapping'
import { setSymbolOcclusionController } from './SymbolOcclusionPass'

/**
 * 屏幕空间 billboard 四边形原语，用 SDF atlas 纹理（或程序化圆角矩形）渲染。
 *
 * 顶点着色器把单位四边形按像素尺寸缩放、旋转、按像素偏移平移后，叠加到锚点世界
 * 位置的屏幕投影上——像素大小在 VS 里一次算完，不需每帧按距离 rescale。片元着色器
 * 图标使用 Tellux 自有 0.5-edge SDF；文字 glyph 使用 Mapbox/TinySDF 的 0.75-edge
 * SDF 与 glyph atlas UV。颜色作为 uniform，取 display sRGB 编码值（symbol 在
 * tone mapping 之后直接向 canvas 混合，见 SymbolOcclusionPass）。
 *
 * Symbol 不走实体 OIT：主场景渲染前由 SymbolOcclusionPass 临时隐藏，随后在独立
 * pass 中读取场景深度并按锚点全有 / 全无遮挡绘制。材质使用普通 alpha 混合，让
 * SDF 的半透明边缘真正混到已经合成好的场景颜色上；是否整块显示仍由锚点深度控制。
 *
 * Screen-space billboard quad primitive rendered from an SDF atlas texture
 * (or a procedural rounded rect). The VS sizes / rotates / offsets a unit quad in
 * pixels and adds it to the anchor's screen projection — pixel size is computed in
 * the VS, no per-distance rescale. Icons use Tellux's 0.5-edge SDF; text glyphs
 * use Mapbox/TinySDF's 0.75-edge SDF and atlas UVs. Symbols are rendered by
 * SymbolOcclusionPass rather than entity OIT; SDF alpha edges are normally blended
 * over the composed scene while anchor-depth testing keeps the whole symbol
 * all-or-nothing.
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
      uUvMin: { value: new THREE.Vector2(0, 0) },
      uUvMax: { value: new THREE.Vector2(1, 1) },
      uSpread: { value: 1 },
      uTint: { value: new THREE.Color(0xffffff) },
      uOutlineColor: { value: new THREE.Color(0x000000) },
      uOutlineWidth: { value: 0 },
      uSmoothing: { value: 0.5 },
      uOpacity: { value: 1 },
      uHasMap: { value: 0 },
      uMode: { value: 0 },
      uMsdfUnitRange: { value: new THREE.Vector2(0, 0) },
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
      // 透明混合，但不进入实体 OIT——symbol 是点锚定的 billboard，遮挡应该以锚点
      // 为准（全有或全无），而非 OIT 的逐片元深度 discard。OIT 的 telluxDepthDiscard
      // 用 gl_FragCoord.xy 采样场景深度，四边形不同片元的 xy 各异，会部分被 discard、
      // 部分保留，加上 Float32 锚点抖动即产生闪烁。
      // SymbolOcclusionPass 会让主场景先隐藏 symbol，之后单独读取 scene depth，用锚点
      // 投影深度做全有 / 全无遮挡；此处保留 normal alpha blending，让 SDF 字形边缘能
      // 像 MapboxGL 一样按 coverage 混合到已合成的场景颜色上。
      //
      // Transparent blending bypasses entity OIT — symbols are point-anchored billboards,
      // so occlusion should be all-or-nothing at the anchor, not per-fragment via OIT's
      // telluxDepthDiscard. SymbolOcclusionPass samples scene depth at the anchor while
      // this material keeps standard coverage blending for antialiased SDF edges.
      transparent: true,
      blending: THREE.NormalBlending,
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
        uniform vec2 uUvMin;
        uniform vec2 uUvMax;
        uniform float uSpread;
        uniform vec3 uTint;
        uniform vec3 uOutlineColor;
        uniform float uOutlineWidth;
        uniform float uSmoothing;
        uniform float uOpacity;
        uniform float uHasMap;
        uniform float uMode;
        uniform vec2 uMsdfUnitRange;
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

        // MSDF median函数：从RGB三通道中取中值
        float median(float r, float g, float b) {
          return max(min(r, g), min(max(r, g), b));
        }

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
          if (uMode > 3.5) {
            // 原色图标模式：直接采样 RGBA 纹理，保留图标原本颜色与细节。
            // uTint 作为可选乘法调色（默认白色 = 不调）。symbol 在 tone mapping 之后
            // 直接向 canvas 混合，纹理按 NoColorSpace 取原始 sRGB 字节直出。
            if (uHasMap < 0.5) discard;
            vec2 atlasUv = mix(uUvMin, uUvMax, vUv);
            vec4 tex = texture2D(uMap, atlasUv);
            float alpha = tex.a * uOpacity;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(tex.rgb * uTint, alpha);
            return;
          } else if (uMode > 2.5) {
            // MSDF 模式（多通道距离场）—— msdfgen 官方 screenPxRange 解析 AA。
            if (uHasMap < 0.5) discard;
            vec2 atlasUv = mix(uUvMin, uUvMax, vUv);
            vec3 msd = texture2D(uMap, atlasUv).rgb;
            float sd = median(msd.r, msd.g, msd.b);

            // screenPxRange：distanceRange 在当前屏幕缩放下覆盖多少个屏幕像素。
            // = unitRange(UV 空间) / fwidth(atlasUv) 的分量，取 x/y 均值即可稳健。
            // 这一步把 [0,1] 的距离场换算回真实屏幕像素，AA 只在边缘 ±0.5px 内过渡，
            // 缩小采样时依然锐利——这是 MSDF 不糊的关键，取代原先过宽的 fwidth(sd)。
            vec2 unitPerTexel = uMsdfUnitRange / max(fwidth(atlasUv), vec2(1e-6));
            float screenPxRange = max(0.5 * (unitPerTexel.x + unitPerTexel.y), 1.0);

            float fillPx = (sd - 0.5) * screenPxRange;
            float fill = clamp(fillPx + 0.5, 0.0, 1.0);
            // 描边：向外扩 outlineWidth 个屏幕像素（quad 已按 pr 放大，outlineWidth 亦然）。
            // 距离场只能表达 ±0.5*screenPxRange 的范围：远场 sd 饱和为 0，
            // fillPx = -0.5*screenPxRange。若 haloPx 超过该范围，quad 远场也会落进
            // halo 区间，整个矩形被描边色填满（字形背后出现色块）。clamp 到可表达上限。
            // The field only encodes ±0.5*screenPxRange; an unclamped halo floods the
            // whole quad with outline color once it exceeds that range.
            float maxHaloPx = max(0.5 * screenPxRange - 0.5, 0.0);
            float outerPx = fillPx + min(uOutlineWidth, maxHaloPx);
            float outer = clamp(outerPx + 0.5, 0.0, 1.0);

            float ring = max(outer - fill, 0.0);
            float alpha = max(fill, ring) * uOpacity;
            if (alpha < 0.01) discard;
            vec3 rgb = mix(uOutlineColor, uTint, fill / max(fill + ring, 1e-4));
            gl_FragColor = vec4(rgb, alpha);
            return;
          } else if (uMode > 1.5) {
            // Glyph SDF 模式（TinySDF，0.75 edge）
            if (uHasMap < 0.5) discard;
            vec2 atlasUv = mix(uUvMin, uUvMax, vUv);
            float r = texture2D(uMap, atlasUv).r;
            float fill = smoothstep(0.75 - uSmoothing, 0.75 + uSmoothing, r);
            // halo 边缘不得低于远场（r=0）的过渡带下界，否则整块 quad 被描边色填满。
            // Keep the halo edge above the far-field ramp so it never floods the quad.
            float haloEdge = max(0.75 - uOutlineWidth / max(uSpread, 1e-4), uSmoothing + 0.02);
            float outer = smoothstep(haloEdge - uSmoothing, haloEdge + uSmoothing, r);
            // 移除 Gamma 校正，让 Mapbox 的 smoothing 公式自己控制
            float ring = max(outer - fill, 0.0);
            float alpha = max(fill, ring) * uOpacity;
            if (alpha < 0.01) discard;
            vec3 rgb = mix(uOutlineColor, uTint, fill / max(fill + ring, 1e-4));
            gl_FragColor = vec4(rgb, alpha);
            return;
          } else if (uMode > 0.5) {
            float edgeDist = roundedBoxSDF(vUv, uPixelSize * 0.5, uCornerRadius);
            pxDist = -edgeDist; // 内正外负 / inside positive
          } else {
            if (uHasMap < 0.5) discard;
            vec2 atlasUv = mix(uUvMin, uUvMax, vUv);
            float r = texture2D(uMap, atlasUv).r;
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
    ;(this.uniforms.uTint.value as THREE.Color).copy(resolveDisplayColor(color))
  }

  /** 直接设已解析的 display sRGB 色（文字路径：SymbolGraphic 已 resolveDisplayColor）。Set a pre-resolved display-sRGB tint. */
  setTintRaw(color: THREE.Color) {
    ;(this.uniforms.uTint.value as THREE.Color).copy(color)
  }

  setOutlineColor(color: ColorInput) {
    ;(this.uniforms.uOutlineColor.value as THREE.Color).copy(resolveDisplayColor(color))
  }

  /** 直接设已解析的 display sRGB 描边色。Set a pre-resolved display-sRGB outline color. */
  setOutlineColorRaw(color: THREE.Color) {
    ;(this.uniforms.uOutlineColor.value as THREE.Color).copy(color)
  }

  setOutlineWidth(width: number) {
    this.uniforms.uOutlineWidth.value = Math.max(0, width)
  }

  setSmoothing(width: number) {
    this.uniforms.uSmoothing.value = Math.max(0.01, width)
  }

  setOpacity(opacity: number) {
    this.uniforms.uOpacity.value = Math.max(0, Math.min(1, opacity))
  }

  /** tint 的 hex（display sRGB 编码值，即用户传入的原始色）。Tint hex (display sRGB = the user's input color). */
  get tintHex(): number {
    // 存的分量已是 sRGB 编码值；getHex() 默认会再做一次 linear→sRGB 编码，须跳过。
    // Components are already sRGB-encoded; default getHex() would double-encode.
    return (this.uniforms.uTint.value as THREE.Color).getHex(THREE.LinearSRGBColorSpace)
  }

  /** 描边色的 hex。Outline-color hex. */
  get outlineColorHex(): number {
    return (this.uniforms.uOutlineColor.value as THREE.Color).getHex(THREE.LinearSRGBColorSpace)
  }

  /** 程序化圆角矩形背景的圆角半径（像素）。Corner radius (px) for procedural bg. */
  setCornerRadius(radius: number) {
    this.uniforms.uCornerRadius.value = Math.max(0, radius)
  }

  /**
   * 切到整张纹理 SDF 模式（icon）。`texture` 仅被引用，生命周期由调用方管理。
   *
   * Switch to full-texture SDF mode (icon). `texture` is only referenced; its
   * lifetime is owned by the caller.
   */
  setMap(texture: THREE.Texture) {
    this.uniforms.uMode.value = 0
    this.uniforms.uHasMap.value = 1
    this.uniforms.uMap.value = texture
    ;(this.uniforms.uUvMin.value as THREE.Vector2).set(0, 0)
    ;(this.uniforms.uUvMax.value as THREE.Vector2).set(1, 1)
  }

  /**
   * 切到原色纹理模式（icon 保留原图颜色）。`texture` 仅被引用，生命周期由调用方管理。
   * `uTint` 默认白色不调色；设 tint 则做乘法调色。
   *
   * Switch to raw-color texture mode (icon keeps its original colors). `texture` is
   * only referenced; its lifetime is owned by the caller. `uTint` defaults to white
   * (no tint); setting a tint multiplies.
   */
  setRawMap(texture: THREE.Texture) {
    this.uniforms.uMode.value = 4
    this.uniforms.uHasMap.value = 1
    this.uniforms.uMap.value = texture
    ;(this.uniforms.uUvMin.value as THREE.Vector2).set(0, 0)
    ;(this.uniforms.uUvMax.value as THREE.Vector2).set(1, 1)
  }

  setGlyphSdfMap(texture: THREE.Texture, uvMin: THREE.Vector2, uvMax: THREE.Vector2) {
    this.uniforms.uMode.value = 2
    this.uniforms.uHasMap.value = 1
    this.uniforms.uMap.value = texture
    ;(this.uniforms.uUvMin.value as THREE.Vector2).copy(uvMin)
    ;(this.uniforms.uUvMax.value as THREE.Vector2).copy(uvMax)
  }

  /**
   * 设置 MSDF 字形纹理（多通道距离场，模式3）。
   *
   * `unitRange` 为 distanceRange 换算到 atlas UV 空间的值（distanceRange / atlasSize，
   * x、y 各一），shader 用它 + fwidth 推 screenPxRange 做解析 AA。
   */
  setGlyphMsdfMap(
    texture: THREE.Texture,
    uvMin: THREE.Vector2,
    uvMax: THREE.Vector2,
    unitRange: THREE.Vector2
  ) {
    this.uniforms.uMode.value = 3
    this.uniforms.uHasMap.value = 1
    this.uniforms.uMap.value = texture
    ;(this.uniforms.uUvMin.value as THREE.Vector2).copy(uvMin)
    ;(this.uniforms.uUvMax.value as THREE.Vector2).copy(uvMax)
    ;(this.uniforms.uMsdfUnitRange.value as THREE.Vector2).copy(unitRange)
  }

  /**
   * SDF 距离场半径（绘制缓冲像素）。icon 为自有 SDF spread，glyph 为 TinySDF 半径。
   *
   * SDF radius in drawing-buffer px. For icons this is the local SDF spread; for
   * glyphs it is the TinySDF radius. Computed by SymbolGraphic per use case.
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
