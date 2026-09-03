import type { Object3D } from 'three'

/**
 * 局部光照模型使用的 Three.js layer。主相机仍渲染 layer 0，mask pass 只画本层。
 *
 * Three.js layer used by locally lit models. The main camera still renders
 * layer 0; the lighting-mask pass draws only this layer.
 */
export const LOCAL_LIGHTING_LAYER = 2

export function setObjectLocalLighting(object: Object3D, enabled: boolean) {
  object.traverse((child) => {
    if (enabled) {
      child.layers.enable(LOCAL_LIGHTING_LAYER)
      return
    }
    child.layers.disable(LOCAL_LIGHTING_LAYER)
  })
}
