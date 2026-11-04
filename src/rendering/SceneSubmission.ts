import * as THREE from 'three'
import type { ThreeEffectPass } from '../effects'
import type { TransparentAtmosphere } from './TransparentAtmosphere'
import type { RenderItem } from 'three/src/renderers/webgl/WebGLRenderLists.js'
import type { EntityRenderManager } from '../entities/EntityRenderManager'
import { MixedTransparency } from './MixedTransparency'
import { SceneFrameResources } from './SceneFrameResources'
import { isSymbolOcclusionObject } from '../entities/SymbolOcclusionPass'

/** 内部主场景提交阶段。 Internal main-scene submission phase. */
export type SceneSubmissionPhase = 'opaque' | 'transparent'

interface SubmissionOptions {
  prepareMaterial?: (material: THREE.Material) => void
  draw?: () => void
  captureTransparent?: (items: RenderItem[]) => void
  captureOpaque?: (items: RenderItem[]) => void
  transparentItems?: readonly RenderItem[]
}

/**
 * 筛选 Three.js 已分类的材质组，复用外层的矩阵、阴影和场景回调。
 * Filters Three.js material-group lists and reuses outer matrices, shadows and scene callbacks.
 * 依赖 r184 renderLists/finish 接缝；不修改材质、对象层或父子关系。
 * Depends on the r184 renderLists/finish seam without changing materials, layers or parenting.
 */
export function submitScenePhase(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  phase: SceneSubmissionPhase,
  options: SubmissionOptions = {},
) {
  const lists = renderer.renderLists
  const get = lists.get
  const before = scene.onBeforeRender, after = scene.onAfterRender
  const sceneMatrices = scene.matrixWorldAutoUpdate, cameraMatrices = camera.matrixWorldAutoUpdate
  const shadowAuto = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate
  const background = scene.background
  const tone = renderer.toneMapping, autoClear = renderer.autoClear
  let restoreList: (() => void) | undefined
  let transparentCount = 0
  try {
    // Only the immediate submission is filtered. Nested callback renders keep their own lists.
    lists.get = function (requestedScene, depth) {
      const list = get.call(this, requestedScene, depth)
      if (requestedScene === scene) {
        lists.get = get
        const finish = list.finish
        restoreList = () => { list.finish = finish }
        list.finish = function () {
          finish.call(this)
          restoreList?.()
          transparentCount = this.transparent.length
          options.captureTransparent?.(this.transparent)
          options.captureOpaque?.(this.opaque)
          if (phase === 'opaque') this.transparent.length = 0
          else {
            this.opaque.length = 0; this.transmissive.length = 0
            if (options.transparentItems) {
              this.transparent.length = 0
              for (const item of options.transparentItems) this.transparent.push(item)
            }
            if (options.prepareMaterial) for (const item of this.transparent) options.prepareMaterial(item.material)
          }
        }
      }
      return list
    }
    scene.onBeforeRender = () => {}
    scene.onAfterRender = () => {}
    scene.matrixWorldAutoUpdate = false
    camera.matrixWorldAutoUpdate = false
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = false
    renderer.toneMapping = THREE.NoToneMapping
    if (phase === 'transparent') {
      scene.background = null
      renderer.autoClear = false
    }
    if (options.draw) options.draw()
    else renderer.render(scene, camera)
    return transparentCount
  } finally {
    restoreList?.()
    lists.get = get
    scene.onBeforeRender = before; scene.onAfterRender = after
    scene.matrixWorldAutoUpdate = sceneMatrices; camera.matrixWorldAutoUpdate = cameraMatrices
    renderer.shadowMap.autoUpdate = shadowAuto
    renderer.shadowMap.needsUpdate = shadowNeeds || renderer.shadowMap.needsUpdate
    scene.background = background
    renderer.toneMapping = tone; renderer.autoClear = autoClear
  }
}

/**
 * 管线借用上游主目标及硬件深度；仅在颜色交换后复制一次颜色，不分配透明目标。
 * Borrows the upstream scene target and hardware depth; copies color only after a swap.
 */
export class SceneSubmission {
  hasPointNormalMask = false
  atmosphereEnabled = true
  private hasTransparent = false
  private transparentItems: RenderItem[] = []
  private readonly mixed: MixedTransparency
  private readonly copyMaterial = new THREE.ShaderMaterial({
    uniforms: { map: { value: null as THREE.Texture | null } },
    vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D map;varying vec2 v;void main(){gl_FragColor=texture2D(map,v);}',
    depthTest: false, depthWrite: false, toneMapped: false,
  })
  private readonly copy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial)
  private readonly copyCamera = new THREE.Camera()

  readonly opaque: ThreeEffectPass & { isRenderPass: boolean; needsSwap: boolean } = {
    isRenderPass: true, needsSwap: false,
    setSize() {}, dispose() {},
    render: (renderer, _write, read) => {
      const target = renderer.getRenderTarget()
      try {
        renderer.setRenderTarget(read)
        this.hasTransparent = submitScenePhase(renderer, this.scene, this.camera, 'opaque', {
          // The nested render list recycles its item records. Preserve the frame's original
          // classification/material references when application draw callbacks mutate them.
          captureTransparent: items => { this.transparentItems = items.map(item => ({ ...item })) },
          captureOpaque: items => { this.hasPointNormalMask = items.some(item => item.geometry?.hasAttribute('aPointSize')) },
        }) > 0
        this.frame.publish(read)
      } finally { renderer.setRenderTarget(target) }
    },
  }

  readonly transparent: ThreeEffectPass & { needsSwap: boolean } = {
    needsSwap: false,
    setSize() {}, dispose() {},
    render: (renderer, write, read) => {
      this.transparent.needsSwap = false
      const entityRoot = this.entities?.mode === 'weighted-oit' ? this.entities.prepareTransparency() : null
      if (!this.hasTransparent && !entityRoot) return
      const resources = this.frame.require('transparent submission')
      if (!this.hasTransparent) {
        this.entities!.renderTransparency(renderer, read, resources.depth)
        return
      }
      const destination = resources.target
      if (destination !== read && destination !== write) {
        throw new Error('Tellux: scene submission target is not part of the current frame')
      }
      this.transparent.needsSwap = destination !== read
      const target = renderer.getRenderTarget(), autoClear = renderer.autoClear, tone = renderer.toneMapping
      try {
        renderer.autoClear = false
        renderer.toneMapping = THREE.NoToneMapping
        renderer.setRenderTarget(destination)
        if (destination !== read) {
          this.copyMaterial.uniforms.map.value = read.texture
          renderer.render(this.copy, this.copyCamera)
          this.copyMaterial.uniforms.map.value = null
        }
        const draw = (items: readonly RenderItem[], drawTarget: THREE.WebGLRenderTarget, slice?: Pick<import('./TransparentDepthSlice').TransparentDepthSlice, 'attach'> & {depthOnly?: boolean}) => {
          renderer.setRenderTarget(drawTarget)
          this.atmosphere?.update(this.camera,read.width,read.height)
          if(this.atmosphere)this.atmosphere.active.value=this.atmosphereEnabled && !slice?.depthOnly
          submitScenePhase(renderer,this.scene,this.camera,'transparent',{
            prepareMaterial: material => {this.atmosphere?.attach(material);slice?.attach(material)},
            transparentItems:items,
          })
        }
        const handled = this.mixed.render(renderer,destination,this.transparentItems,entityRoot,root => {
          const entities: RenderItem[]=[]
          const collect = (items: RenderItem[]) => {
            for (const item of items) {
              if (isSymbolOcclusionObject(item.object) || !(item.material.transparent || item.material.opacity < 1)) continue
              let parent:THREE.Object3D|null=item.object
              while(parent&&parent!==root)parent=parent.parent
              if(parent===root)entities.push({...item})
            }
          }
          submitScenePhase(renderer,this.scene,this.camera,'transparent',{
            captureTransparent:collect,captureOpaque:collect,transparentItems:[],
          })
          return entities
        },draw)
        if (!handled) {
          draw(this.transparentItems, destination)
          if (entityRoot) this.entities!.renderTransparency(renderer, destination, resources.depth)
        }
      } finally {
        if (this.atmosphere) this.atmosphere.active.value = false
        this.copyMaterial.uniforms.map.value = null
        renderer.setRenderTarget(target)
        renderer.autoClear = autoClear; renderer.toneMapping = tone
      }
    },
  }

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly atmosphere?: TransparentAtmosphere,
    private readonly entities?: EntityRenderManager,
    readonly frame = new SceneFrameResources(),
  ) { this.mixed = new MixedTransparency(entities) }

  beginFrame() {
    this.frame.begin()
    this.hasTransparent = false
    this.hasPointNormalMask = false
    this.transparentItems = []
    this.entities?.beginFrame()
  }

  endFrame() {
    this.entities?.endFrame()
    this.frame.end()
    this.hasTransparent = false
    this.transparentItems = []
    if (this.atmosphere) this.atmosphere.active.value = false
  }

  dispose() {
    this.endFrame()
    this.mixed.dispose()
    this.copy.geometry.dispose()
    this.copyMaterial.dispose()
  }
}
