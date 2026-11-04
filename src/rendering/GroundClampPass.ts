import * as THREE from 'three'
import type { SceneDepthResources } from './SceneFrameResources'
import type { GroundClampSharedUniforms } from '../entities/groundClamp'
import { RTCAutoUniforms } from './RTCAutoUniforms'

/**
 * 贴地分类：使用管线显式提供的场景深度，必要时中转颜色以避免附件采样冲突。
 * Ground classification uses explicit scene depth and a color detour when attachment sampling would conflict.
 * 持有贴地几何 root 和共享 uniforms；借用的场景深度不归本组件释放。仅 WebGL。
 * Owns clamped geometry root and shared uniforms, but never disposes borrowed scene depth. WebGL only.
 */
export class GroundClampPass {
  enabled = true

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
    readBuffer: THREE.WebGLRenderTarget,
    resources: SceneDepthResources
  ) {
    if (!this.hasRenderableGeometry()) return
    const depth = resources.depth
    // 资源身份决定采样/附件冲突；颜色交换不改变深度来源。
    // Resource identity determines feedback conflicts; color swaps never select the depth source.
    const depthOnRead = readBuffer.depthTexture === depth
    const target = depthOnRead ? writeBuffer : readBuffer
    if (target.depthTexture === depth) throw new Error('Tellux: ground classification cannot sample its depth attachment')

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
        // 拷回当前主色，保持阶段的无交换合同。
        // Copy back to the current color destination, preserving the no-swap contract.
        renderer.setRenderTarget(readBuffer)
        this.copyMaterial.uniforms.tDiffuse.value = writeBuffer.texture
        renderer.render(this.fullscreenScene, this.fullscreenCamera)
      }
    } finally {
      renderer.setRenderTarget(previousRenderTarget)
      renderer.autoClear = previousAutoClear
      this.sharedUniforms.telluxGroundDepth.value = null
      this.copyMaterial.uniforms.tDiffuse.value = null
    }

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
