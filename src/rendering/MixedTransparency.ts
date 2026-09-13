import * as THREE from 'three'
import type {RenderItem} from 'three/src/renderers/webgl/WebGLRenderLists.js'
import type {EntityRenderManager} from '../entities/EntityRenderManager'
import {TransparentDepthSlice} from './TransparentDepthSlice'
import {SparkDepthBuckets} from './SparkDepthBuckets'

type DrawItems = (items: readonly RenderItem[], target: THREE.WebGLRenderTarget, slice?: Pick<TransparentDepthSlice, 'attach'>) => void

/**
 * 使用表面深度分段，统一普通透明、Spark 与实体 OIT 的内部合成。
 * Partitions surface depth to compose native transparency, Spark and entity OIT.
 * 最多逐像素剥离八层表面，其余部分保留原排序；不修改上游云积分。
 * Peels up to eight surfaces per pixel; the remainder retains native ordering.
 */
export class MixedTransparency {
  private readonly layers: THREE.WebGLRenderTarget[] = []
  private readonly slice = new TransparentDepthSlice()
  private readonly sparkBuckets = new SparkDepthBuckets()

  constructor(private readonly entities?: EntityRenderManager) {}

  /** 返回是否已接管此帧的透明绘制。 Returns whether this frame's transparent draw was handled. */
  render(
    renderer: THREE.WebGLRenderer,
    destination: THREE.WebGLRenderTarget,
    nativeItems: readonly RenderItem[],
    collectEntities: (root: THREE.Object3D) => RenderItem[],
    draw: DrawItems,
  ) {
    if (!destination.depthTexture) return false
    const overlays = nativeItems.filter(item => !item.material.depthTest)
    const sparks = nativeItems.filter(item => item.material.depthTest && isSparkMaterial(item.material))
    const surfaces = nativeItems.filter(item => item.material.depthTest && !isSparkMaterial(item.material))
    const root = this.entities?.mode === 'weighted-oit' ? this.entities.prepareTransparency() : null
    const entityItems = root ? collectEntities(root) : []
    if (!(surfaces.length && (sparks.length || entityItems.length) || sparks.length && entityItems.length)) return false
    const handled = this.renderLayers(renderer, destination, surfaces, sparks, entityItems, draw)
    if (handled && overlays.length) draw(overlays, destination)
    return handled
  }

  private renderLayers(
    renderer: THREE.WebGLRenderer, destination: THREE.WebGLRenderTarget,
    surfaces: readonly RenderItem[], sparks: readonly RenderItem[], entities: readonly RenderItem[], draw: DrawItems,
  ) {
    // Only Spark requires individual entity boundaries; otherwise preserve entity OIT within each interval.
    const boundaries = sparks.length ? [...surfaces, ...entities] : [...surfaces]
    // Bound memory and repeated draws. The unsliced remainder is rendered, never silently discarded.
    // Eight exact surface layers cover the supported mixed fixtures; deeper overlap keeps native ordering.
    const count = Math.min(8, boundaries.reduce((sum, item) => {
      const geometry = item.geometry
      if (!geometry) return sum
      return sum + Math.ceil(Math.min(geometry.drawRange.count, item.group?.count ?? Infinity,
        geometry.index?.count ?? geometry.attributes.position?.count ?? 3) / 3)
    }, 0))
    if (!count) return false
    while (this.layers.length < count) this.layers.push(new THREE.WebGLRenderTarget(destination.width, destination.height, {
      depthTexture: new THREE.DepthTexture(destination.width, destination.height, THREE.UnsignedIntType),
      format: THREE.RedFormat,
      depthBuffer: true, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    }))
    for (const layer of this.layers) layer.setSize(destination.width, destination.height)
    const oldTarget = renderer.getRenderTarget(), oldAuto = renderer.autoClear
    const oldColor = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha()
    const states = [...new Set(boundaries.map(item => item.material))].map(material => ({
      material, depthWrite: material.depthWrite, depthTest: material.depthTest, colorWrite: material.colorWrite,
    }))
    const updates = sparks.map(item => {
      const object = item.object as THREE.Object3D & {autoUpdate?: boolean}
      return {object, autoUpdate: object.autoUpdate}
    })
    const range = (lower: THREE.Texture | null, upper: THREE.Texture | null) =>
      this.slice.setRange(lower, upper, destination.width, destination.height)
    const restoreMaterials = () => {
      for (const {material, depthWrite, depthTest, colorWrite} of states) Object.assign(material, {depthWrite, depthTest, colorWrite})
    }
    const entityRange = (lower: THREE.Texture | null, upper: THREE.Texture | null) => {
      if (entities.length) this.entities!.renderDepthRange(renderer, destination, destination.depthTexture!, lower, upper)
    }
    try {
      renderer.autoClear = false
      this.slice.setCapture(true)
      for (const {material} of states) Object.assign(material, {depthWrite: true, depthTest: true, colorWrite: false})
      for (let i = 0; i < count; i++) {
        const layer = this.layers[i]
        renderer.setRenderTarget(layer); renderer.setClearColor(0, 0); renderer.clear(true, true, false)
        range(i ? this.layers[i - 1].depthTexture : null, destination.depthTexture)
        draw(boundaries, layer, this.slice)
      }
      restoreMaterials()
      this.slice.endFrame()
      if (sparks.length) this.sparkBuckets.capture(renderer, destination, this.layers.slice(0, count).map(layer => layer.depthTexture!), (target, adapter) => {
        draw(sparks, target, adapter)
        for (const {object, autoUpdate} of updates) if (typeof autoUpdate === 'boolean') object.autoUpdate = false
      })
      // Draw the tail first, then interleave surfaces and the original Spark/OIT renderers back to front.
      const tail = this.layers[count - 1].depthTexture
      range(tail, null)
      if (surfaces.length) draw(surfaces, destination, this.slice)
      if (sparks.length) this.sparkBuckets.composite(renderer, destination, count)
      entityRange(tail, null)
      for (let i = count - 1; i >= 0; i--) {
        const lower = i ? this.layers[i - 1].depthTexture : null, upper = this.layers[i].depthTexture
        range(lower, upper)
        if (surfaces.length) draw(surfaces, destination, this.slice)
        entityRange(lower, upper)
        if (sparks.length) this.sparkBuckets.composite(renderer, destination, i)
      }
      return true
    } finally {
      restoreMaterials()
      for (const {object, autoUpdate} of updates) if (typeof autoUpdate === 'boolean') object.autoUpdate = autoUpdate
      this.slice.endFrame()
      renderer.setRenderTarget(oldTarget); renderer.autoClear = oldAuto; renderer.setClearColor(oldColor, oldAlpha)
    }
  }

  dispose() {
    this.slice.endFrame()
    this.sparkBuckets.dispose()
    for (const layer of this.layers) layer.dispose()
    this.layers.length = 0
  }
}

function isSparkMaterial(material:THREE.Material) {
  const fragment=(material as THREE.ShaderMaterial).fragmentShader
  return typeof fragment==='string' && fragment.includes('vec4 rgba = vRgba;')
}
