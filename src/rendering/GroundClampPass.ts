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

    // 深度在 readBuffer（=targetA）：主色也在其中，先整帧拷到 writeBuffer、叠加分类，
    // 再把结果 blit 回 readBuffer——不 swap。swap 会让后续大气 pass 的 readBuffer 变成
    // 无深度的 targetB，空气透视静默失效；分类几何又必须在 targetB 上画（材质采样
    // targetA 的深度，向 targetA 写色会构成 feedback loop），故用"绕道再拷回"。
    // 深度在 writeBuffer（readBuffer=targetB 已有主色）：直接就地叠加，不拷贝不 swap。
    //
    // Depth on readBuffer (=targetA): copy the frame to writeBuffer, overlay the
    // classification there, then blit the result back — never swap. A swap would
    // hand the downstream atmosphere pass a depth-less targetB readBuffer and
    // silently break aerial perspective; yet the classification must be drawn on
    // targetB (its materials sample targetA's depth — writing targetA would be a
    // feedback loop). Hence the round-trip. Depth on writeBuffer: overlay in place.
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
      if (depthOnRead) {
        // 结果拷回 readBuffer（targetA），保持深度所在 buffer 始终是 read 侧。
        // Blit the result back so the depth-carrying buffer stays on the read side.
        renderer.setRenderTarget(readBuffer)
        this.copyMaterial.uniforms.tDiffuse.value = writeBuffer.texture
        renderer.render(this.fullscreenScene, this.fullscreenCamera)
      }
    } finally {
      renderer.setRenderTarget(previousRenderTarget)
      renderer.autoClear = previousAutoClear
    }

    this.needsSwap = false
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
