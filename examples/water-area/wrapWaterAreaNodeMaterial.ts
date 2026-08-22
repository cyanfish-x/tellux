import { Texture, type Mesh } from 'three'
import { attribute, Fn, texture, uniform } from 'three/tsl'
import type { NodeFrame, NodeMaterial } from 'three/webgpu'

import type { WaterAreaOverlayParams } from './WaterAreaOverlayPlugin'

const OVERLAY_PARAMS = Symbol('WATER_AREA_OVERLAY_PARAMS')

interface OverlayParamsHost {
  [OVERLAY_PARAMS]?: WaterAreaOverlayParams
  defines?: Record<string, unknown>
}

function getOverlayParams(frame: NodeFrame): WaterAreaOverlayParams | undefined {
  const material = frame.material as OverlayParamsHost
  const object = frame.object as OverlayParamsHost
  return material[OVERLAY_PARAMS] ?? object[OVERLAY_PARAMS]
}

const emptyTexture = new Texture()

const layerMapNode = texture()
type LayerMapUpdate = Parameters<typeof layerMapNode.onObjectUpdate>[0]
const layerMap = layerMapNode.onObjectUpdate(
  ((frame: NodeFrame, self: { value: Texture }) => {
    const params = getOverlayParams(frame)
    self.value = params?.layerMaps.value[0] ?? emptyTexture
  }) as unknown as LayerMapUpdate
)

const layerMapFlipYNode = uniform(false as never, 'bool' as never)
type LayerMapFlipYUpdate = Parameters<
  typeof layerMapFlipYNode.onObjectUpdate
>[0]
const layerMapFlipY = layerMapFlipYNode.onObjectUpdate(
  ((frame: NodeFrame, self: { value: boolean }) => {
    const image = getOverlayParams(frame)?.layerMaps.value[0]?.image
    self.value =
      typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap
  }) as unknown as LayerMapFlipYUpdate
)

const layerUV = attribute('layer_uv_0', 'vec3').toVarying(
  'waterAreaLayerUv0'
) as any

export const waterAreaMask = Fn(() => {
  const uv = layerMapFlipY.select(layerUV.xy.flipY(), layerUV.xy).uniformFlow()
  return layerMap.sample(uv).r
})().toVar('waterAreaMask')

export function wrapWaterAreaNodeMaterial(
  material: NodeMaterial | NodeMaterial[],
  mesh: Mesh & OverlayParamsHost
): WaterAreaOverlayParams {
  const materials = Array.isArray(material) ? material : [material]
  const existing = materials
    .map((item) => (item as OverlayParamsHost)[OVERLAY_PARAMS])
    .find((item) => item !== undefined)
  if (existing) {
    mesh[OVERLAY_PARAMS] = existing
    return existing
  }

  const params: WaterAreaOverlayParams = {
    layerMaps: { value: [] },
    layerInfo: { value: [] }
  }
  mesh[OVERLAY_PARAMS] = params

  let layerCount = 0
  for (const item of materials) {
    const host = item as OverlayParamsHost
    host[OVERLAY_PARAMS] = params
    host.defines = {
      ...host.defines,
      get LAYER_COUNT() {
        return layerCount
      },
      set LAYER_COUNT(value: number) {
        layerCount = value
      }
    }
  }

  return params
}
