import * as THREE from 'three'
import type { Viewer } from '../../src'
import type { AtmosphereManager } from '../../src/rendering/AtmosphereManager'
import type { ThreeEffectPass, ThreeRendererWithEffects } from '../../src/effects'
import { TransparentStage, attachDepth } from './TransparentStage'
import { attachSplatAtmosphere } from './SplatAtmosphere'

/** 启动案例级实验；内部访问集中于此，不是应用 API。 Start a case-level experiment; internal access is not an application API. */
export async function startRenderingPrototype(viewer: Viewer, kind: 'stages' | 'splat' | 'clouds') {
  const renderer = viewer.renderer.raw
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error('These prototypes require WebGL')
  // Deliberate, guarded prototype seam. Production integration must replace this with owned stages.
  const internal = viewer as unknown as {
    atmosphere: AtmosphereManager
    postProcessing: { atmosphereAdapter: ThreeEffectPass; cloudAtmosphereAdapter: ThreeEffectPass; applyEffects(): void }
  }
  if (!internal.atmosphere || !internal.postProcessing) throw new Error('Unsupported Tellux pipeline')
  const raw = renderer as ThreeRendererWithEffects
  const scene = viewer.scene.raw
  const camera = viewer.camera.raw as THREE.PerspectiveCamera
  const root = new THREE.Group()
  root.matrixAutoUpdate = false
  const anchor = { longitude: 0, latitude: 0, height: kind === 'clouds' ? 1800 : 200 }
  root.matrix.copy(viewer.cartographicToMatrix4(anchor))
  scene.add(root)
  let disposed = false
  let mode = 'after'
  let fog = true
  let callbacks = 0
  let splatAdapter: ReturnType<typeof attachSplatAtmosphere> | undefined
  let spark: import('@sparkjsdev/spark').SparkRenderer | undefined
  let splat: import('@sparkjsdev/spark').SplatMesh | undefined
  const resources: Array<{ dispose(): void }> = []
  const stage = new TransparentStage(scene, camera, () => {
    if (splatAdapter) { splatAdapter.enabled.value = fog && viewer.scene.atmosphere.show; splatAdapter.update(camera) }
  })
  const originalSetEffects = raw.setEffects
  let base: THREE.Effect[] = []
  const apply = () => {
    const effects = [...base]
    const index = effects.findIndex(effect => effect === internal.postProcessing.atmosphereAdapter || effect === internal.postProcessing.cloudAtmosphereAdapter)
    if (mode !== 'baseline') effects.splice(index < 0 ? 0 : index + (mode === 'after' ? 1 : 0), 0, stage)
    originalSetEffects.call(raw, effects)
  }
  raw.setEffects = effects => { base = effects ?? []; apply() }
  internal.postProcessing.applyEffects()

  const controls = document.createElement('aside')
  controls.style.cssText = 'position:absolute;top:12px;left:12px;z-index:20;width:350px;max-height:90vh;overflow:auto;background:#14202eeb;color:white;padding:16px;font:13px/1.6 sans-serif;border-radius:8px'
  controls.innerHTML = `<strong>渲染边界实验 / Rendering boundary: ${kind}</strong>
    <p>实验代码，不是正式引擎管线。切换时保持相机不动进行对照。</p>
    <label>合成位置 / Stage <select id="prototype-mode"><option value="after">大气后 / After atmosphere</option><option value="baseline">原始主场景 / Baseline</option><option value="before">大气前独立 pass / Before atmosphere</option></select></label>
    <p><label><input id="prototype-atmosphere" type="checkbox" checked>大气 / Atmosphere</label></p>
    <p><label><input id="prototype-fog" type="checkbox" checked>高斯自身空气透视 / Splat atmosphere</label></p>
    <p><label><input id="prototype-clouds" type="checkbox" ${kind === 'clouds' ? 'checked' : ''}>体积云 / Clouds</label></p>
    <p>观察距离 / Distance <input id="prototype-distance" type="range" min="500" max="40000" value="4000" step="100"></p>
    <p><button id="prototype-view">固定视角 / Reset view</button> <button id="prototype-report">导出观测 / Export</button></p>
    <p id="prototype-help"></p><pre id="prototype-status" style="white-space:pre-wrap"></pre>`
  document.body.append(controls)
  const input = <T extends HTMLElement>(id: string) => controls.querySelector<T>(`#prototype-${id}`)!
  input('help').textContent = kind === 'stages'
    ? '青色透明柱跨地平线；白色墙应遮挡柱下部。检查完整性、遮挡及回调次数。此原型不验证所有材质分组或阴影算法。'
    : kind === 'splat'
      ? '真实 Spark Butterfly。对比大气后无雾 / 自身散射 / 原始路径。远近变化应连续；尚不代表多高斯层的精确体积积分。'
      : '橙色不透明柱与青色透明柱置于同一云层高度。比较相邻柱的云遮挡。前后合成都可能错误：此实验用于暴露上游单张 overlay 的边界，不宣称已解决云穿插。'
  input('fog').parentElement!.hidden = kind !== 'splat'
  const transparentObjects: THREE.Object3D[] = []
  const track = (object: THREE.Object3D) => {
    object.layers.set(mode === 'baseline' ? 0 : 30)
    transparentObjects.push(object)
    const original = object.onBeforeRender
    object.onBeforeRender = function (...args) { callbacks++; original.apply(this, args) }
  }
  function box(x: number, z: number, color: number, transparent: boolean, height = 1000) {
    const geometry = new THREE.BoxGeometry(450, height, 450)
    const material = new THREE.MeshStandardMaterial({ color, transparent, opacity: transparent ? 0.65 : 1, depthWrite: !transparent })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, height / 2, z)
    if (transparent) { attachDepth(material, stage); track(mesh) }
    root.add(mesh)
    resources.push(geometry, material)
    return mesh
  }
  if (kind !== 'splat') {
    box(-350, 0, 0xffa030, false, kind === 'clouds' ? 4500 : 1200)
    box(350, 0, 0x20ffff, true, kind === 'clouds' ? 4500 : 1200)
    const wall = box(350, -700, 0xffffff, false, 350)
    wall.scale.x = 2
    if (kind === 'clouds') {
      const crossing = box(650, 0, 0xff40c0, true, 3600)
      crossing.scale.set(2, 1, 0.15)
      crossing.rotation.y = Math.PI / 4
    }
  }
  if (kind === 'splat') box(0, -700, 0xffffff, false, 250).scale.x = 2
  // Lights remain owned by the original scene; the extra pass uses the same light objects.
  scene.traverse(object => { if ((object as THREE.Light).isLight) object.layers.enable(30) })
  const locate = () => viewer.flyToTarget(anchor, {
    offset: { heading: 0, pitch: kind === 'clouds' ? 8 : -3, distance: Number(input<HTMLInputElement>('distance').value) }, duration: 0,
  })
  input<HTMLSelectElement>('mode').onchange = event => {
    mode = (event.target as HTMLSelectElement).value
    for (const object of transparentObjects) object.layers.set(mode === 'baseline' ? 0 : 30)
    if (spark) spark.material.depthTest = mode === 'baseline'
    apply()
  }
  input<HTMLInputElement>('atmosphere').onchange = event => { viewer.scene.atmosphere.show = (event.target as HTMLInputElement).checked }
  input<HTMLInputElement>('clouds').onchange = event => { viewer.scene.clouds.show = (event.target as HTMLInputElement).checked }
  input<HTMLInputElement>('fog').onchange = event => { fog = (event.target as HTMLInputElement).checked }
  input('view').onclick = locate
  input<HTMLInputElement>('distance').onchange = locate
  const report = () => ({ kind, mode, fog, atmosphere: viewer.scene.atmosphere.show, clouds: viewer.scene.clouds.show,
    depthAvailable: stage.depthAvailable, stageDraws: stage.draws, callbacks,
    camera: camera.matrixWorld.toArray(), projection: camera.projectionMatrix.toArray(),
    status: 'Observation only; visual acceptance is not automatic', renderer: 'WebGL',
  })
  input('report').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `rendering-${kind}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  let frameId = 0
  let count = 0
  function frame(time: number) {
    if (disposed) return
    viewer.render(time)
    if (++count % 30 === 0) input('status').textContent = JSON.stringify({ mode, depth: stage.depthAvailable, passes: stage.draws, callbacks, lut: !!internal.atmosphere.aerialPerspectiveEffect.scatteringTexture }, null, 2)
    frameId = requestAnimationFrame(frame)
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frameId)
    raw.setEffects = originalSetEffects
    originalSetEffects.call(raw, base)
    stage.dispose(); splatAdapter?.dispose(); spark?.removeFromParent(); spark?.dispose(); splat?.dispose()
    root.removeFromParent(); resources.forEach(resource => resource.dispose()); controls.remove()
    window.removeEventListener('pagehide', dispose)
    viewer.destroy()
  }
  window.addEventListener('pagehide', dispose)
  Object.assign(window, { viewer, renderingPrototype: { report, dispose } })
  locate()
  frameId = requestAnimationFrame(frame)
  if (kind === 'splat') {
    try {
      const { SparkRenderer, SplatMesh } = await import('@sparkjsdev/spark')
      if (disposed) return
      splat = new SplatMesh({ url: 'https://sparkjs.dev/assets/splats/butterfly.spz' })
      await splat.initialized
      if (disposed) { splat.dispose(); return }
      const bounds = splat.getBoundingBox()
      const scale = 1200 / bounds.getSize(new THREE.Vector3()).length()
      splat.scale.setScalar(scale)
      splat.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
      splat.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-scale).applyQuaternion(splat.quaternion)
      splat.position.y += 600
      root.add(splat)
      splat.layers.enable(30)
      spark = new SparkRenderer({ renderer, depthWrite: false, depthTest: mode === 'baseline', focalAdjustment: 2, encodeLinear: true })
      track(spark)
      scene.add(spark)
      splatAdapter = attachSplatAtmosphere(spark, internal.atmosphere.aerialPerspectiveEffect, stage)
    } catch (error) {
      input('help').textContent = `高斯加载失败 / Splat failed: ${error instanceof Error ? error.message : String(error)}`
      console.error(error)
    }
  }
}
