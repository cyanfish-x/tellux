import * as THREE from 'three'

/**
 * 实验用提交作用域：过滤材质组，并复用外层本帧的矩阵、阴影和场景回调。
 * Experimental submission scope: filter material groups and reuse the outer frame state.
 * 只验证稳定场景；不承诺回调中修改可见性、嵌套 Viewer 或 transmission 的生产契约。
 * Tests a stable scene, not a production contract for callback mutation or transmission.
 */
export function withSubmissionState(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  include: (material: THREE.Material) => boolean,
  draw: () => void,
) {
  const materials = new Map<THREE.Material, boolean>()
  const before = scene.onBeforeRender, after = scene.onAfterRender
  const sceneMatrices = scene.matrixWorldAutoUpdate, cameraMatrices = camera.matrixWorldAutoUpdate
  const shadowAuto = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate
  try {
    scene.traverse(object => {
      const material = (object as THREE.Mesh).material
      if (!material) return
      for (const item of Array.isArray(material) ? material : [material]) {
        if (!item || materials.has(item)) continue
        materials.set(item, item.visible)
        item.visible = item.visible && include(item)
      }
    })
    scene.onBeforeRender = () => {}
    scene.onAfterRender = () => {}
    scene.matrixWorldAutoUpdate = false
    camera.matrixWorldAutoUpdate = false
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = false
    draw()
  } finally {
    for (const [material, visible] of materials) material.visible = visible
    scene.onBeforeRender = before; scene.onAfterRender = after
    scene.matrixWorldAutoUpdate = sceneMatrices; camera.matrixWorldAutoUpdate = cameraMatrices
    renderer.shadowMap.autoUpdate = shadowAuto
    renderer.shadowMap.needsUpdate = shadowNeeds || renderer.shadowMap.needsUpdate
  }
}
