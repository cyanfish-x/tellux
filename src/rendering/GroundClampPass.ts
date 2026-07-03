import * as THREE from 'three'
import type { ThreeEffectPass } from '../effects'
import type { GroundClampSharedUniforms } from '../entities/groundClamp'
import { RTCAutoUniforms } from './RTCAutoUniforms'

/**
 * 贴地分类 pass。对标 Cesium `TERRAIN_CLASSIFICATION` pass 的编排，与
 * `EntityRenderManager` 同构（都读 `readBuffer.depthTexture`、用自定义材质渲一组
 * 几何、合成回主色）。
 *
 * 持有 `root`（贴地线/面几何的挂载根，不入 threeScene、由本 pass 自渲）与一批
 * 共享 uniform（`RTCAutoUniforms` + 深度/分辨率/逆投影），每帧刷新后所有贴地材质
 * 自动生效。
 *
 * Ground-clamp classification pass. Mirrors `EntityRenderManager`: reads
 * `readBuffer.depthTexture`, renders a set of classification geometries with a
 * custom material, and composites onto the main color. Owns `root` (parent of
 * clamped geometries, rendered here rather than in the main scene) and a bundle
 * of shared uniforms refreshed every frame.
 *
 * 仅 WebGL；WebGPU 无 setEffects 后处理链，不创建本 pass。
 */
export class GroundClampPass implements ThreeEffectPass {
  enabled = true
  needsSwap = false

  readonly root = new THREE.Group()
  readonly sharedUniforms: GroundClampSharedUniforms

  private readonly rtc: RTCAutoUniforms
  private readonly fullscreenScene = new THREE.Scene()
  private readonly fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly copyMaterial: THREE.ShaderMaterial
  private readonly copyMesh: THREE.Mesh

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.root.name = 'tellux-ground-clamp'
    this.rtc = new RTCAutoUniforms(camera)
    this.sharedUniforms = {
      u_cameraHigh: this.rtc.uniforms.u_cameraHigh,
      u_cameraLow: this.rtc.uniforms.u_cameraLow,
      u_viewMatrixRTE: this.rtc.uniforms.u_viewMatrixRTE,
      u_projectionMatrix: this.rtc.uniforms.u_projectionMatrix,
      telluxGroundDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uInverseProjection: { value: new THREE.Matrix4() }
    }

    this.copyMaterial = new THREE.ShaderMaterial({
      name: 'TelluxGroundClampBlit',
      depthTest: false,
      depthWrite: false,
      transparent: false,
      uniforms: { tDiffuse: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `
    })
    this.copyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial)
    this.copyMesh.frustumCulled = false
    this.fullscreenScene.add(this.copyMesh)
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ) {
    // 深度纹理只存在于内置合成器的 targetA（场景每帧固定渲入其中，内容每帧刷新）；
    // read/write 中必有一个是 targetA，但取决于前序 pass（如实体 OIT）是否 swap，
    // targetA 可能在任一侧。两侧探测，按奇偶性选择输出目标，避免"向 targetA 写色
    // 同时采样它自己的深度"造成 feedback loop。
    const depthOnRead = readBuffer.depthTexture ?? null
    const depth = depthOnRead ?? writeBuffer.depthTexture ?? null

    if (!depth || !this.hasRenderableGeometry()) {
      this.needsSwap = false
      return
    }

    // 深度在 readBuffer（=targetA）：主色也在其中，需先整帧拷到 writeBuffer 再叠加
    // 分类，然后 swap。深度在 writeBuffer（readBuffer=targetB 已被前序 pass 写好主
    // 色）：直接把分类就地叠加进 readBuffer，不拷贝不 swap。
    const target = depthOnRead ? writeBuffer : readBuffer

    // 刷新共享 uniform：相机 RTC、逆投影、深度、分辨率。
    this.rtc.update()
    this.sharedUniforms.uInverseProjection.value
      .copy(this.sharedUniforms.u_projectionMatrix.value)
      .invert()
    this.sharedUniforms.telluxGroundDepth.value = depth
    this.sharedUniforms.uResolution.value.set(target.width, target.height)

    const previousRenderTarget = renderer.getRenderTarget()
    const previousAutoClear = renderer.autoClear
    try {
      renderer.autoClear = false
      renderer.setRenderTarget(target)
      if (depthOnRead) {
        this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture
        renderer.render(this.fullscreenScene, this.fullscreenCamera)
      }
      renderer.render(this.root, this.camera)
    } finally {
      renderer.setRenderTarget(previousRenderTarget)
      renderer.autoClear = previousAutoClear
    }

    this.needsSwap = depthOnRead !== null
  }

  setSize(width: number, height: number) {
    this.sharedUniforms.uResolution.value.set(Math.max(1, width), Math.max(1, height))
  }

  dispose() {
    this.copyMesh.geometry.dispose()
    this.copyMaterial.dispose()
  }

  private hasRenderableGeometry(): boolean {
    return this.root.children.some((child) => child.visible)
  }
}
