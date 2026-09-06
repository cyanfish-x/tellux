import * as THREE from 'three'
import type { ThreeEffectPass } from '../../src/effects'

/** 实验用独立透明阶段，不属于公开 API。 Experimental transparent stage, not a public API. */
export class TransparentStage implements ThreeEffectPass {
  enabled = true
  needsSwap = false
  draws = 0
  depthAvailable = false
  readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
  readonly depth = { value: null as THREE.Texture | null }
  readonly size = { value: new THREE.Vector2(1, 1) }
  readonly active = { value: false }
  private readonly quadScene = new THREE.Scene()
  private readonly quadCamera = new THREE.Camera()
  private readonly quadMaterial = new THREE.ShaderMaterial({
    uniforms: { map: { value: this.target.texture } },
    vertexShader: 'varying vec2 uv0; void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D map; varying vec2 uv0; void main(){gl_FragColor=texture2D(map,uv0);}',
    transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false,
    toneMapped: false,
  })
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMaterial)
  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private update: () => void) {
    this.quadScene.add(this.quad)
  }
  setSize(width: number, height: number) { this.target.setSize(width, height) }
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    this.depth.value = read.depthTexture ?? write.depthTexture ?? null
    this.depthAvailable = this.depth.value !== null
    if (!this.depthAvailable) throw new Error('Prototype: opaque scene depth is unavailable')
    this.target.setSize(read.width, read.height)
    this.size.value.set(read.width, read.height)
    const target = renderer.getRenderTarget()
    const autoClear = renderer.autoClear
    const tone = renderer.toneMapping
    const background = this.scene.background
    const mask = this.camera.layers.mask
    const alpha = renderer.getClearAlpha()
    const color = renderer.getClearColor(new THREE.Color())
    try {
      this.active.value = true
      this.camera.layers.set(30)
      this.scene.background = null
      renderer.toneMapping = THREE.NoToneMapping
      renderer.autoClear = false
      renderer.setRenderTarget(this.target)
      renderer.setClearColor(0, 0)
      renderer.clear(true, false, false)
      this.update()
      renderer.render(this.scene, this.camera)
      renderer.setRenderTarget(read)
      renderer.render(this.quadScene, this.quadCamera)
      this.draws++
    } finally {
      this.active.value = false
      this.camera.layers.mask = mask
      this.scene.background = background
      renderer.setRenderTarget(target)
      renderer.setClearColor(color, alpha)
      renderer.autoClear = autoClear
      renderer.toneMapping = tone
    }
  }
  dispose() { this.target.dispose(); this.quad.geometry.dispose(); this.quadMaterial.dispose() }
}

export const depthDeclarations = `
uniform sampler2D prototypeDepth;
uniform vec2 prototypeSize;
uniform bool prototypeActive;
`
export const depthCheck = `
if (prototypeActive && gl_FragCoord.z > texture2D(prototypeDepth, gl_FragCoord.xy / prototypeSize).r + 0.0000001) discard;
`

/** 给普通网格注入场景深度遮挡。 Inject opaque depth rejection into mesh shaders. */
export function attachDepth(material: THREE.Material, stage: TransparentStage) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { prototypeDepth: stage.depth, prototypeSize: stage.size, prototypeActive: stage.active })
    shader.fragmentShader = depthDeclarations + shader.fragmentShader.replace('void main() {', `void main() {${depthCheck}`)
  }
  material.customProgramCacheKey = () => 'prototype-opaque-depth-v1'
}
