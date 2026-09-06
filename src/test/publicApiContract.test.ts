import { describe, expect, it } from 'vitest'

import type { Camera } from '../Camera'
import type { ViewerControls } from '../controls/ViewerControls'
import type { Globe } from '../Globe'
import type { HighlightManager } from '../highlight/HighlightManager'
import type { ViewerRenderer } from '../rendering/ViewerRenderer'
import type { Scene } from '../Scene'
import type {
  LonLat,
  LonLatHeight,
  LonLatHeightLike,
  LonLatLike,
  SampleHeightMostDetailedOptions,
  SampleHeightOptions
} from '../types'
import type { Viewer } from '../Viewer'

type Assert<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false
type OmitsKey<T, K extends PropertyKey> = K extends keyof T ? false : true

type _LonLatShape = Assert<Equal<LonLat, {
  readonly longitude: number
  readonly latitude: number
}>>
type _LonLatHeightShape = Assert<Equal<LonLatHeight, {
  readonly longitude: number
  readonly latitude: number
  readonly height: number
}>>
type _LonLatLikeShape = Assert<Equal<
  LonLatLike,
  LonLat | readonly [longitude: number, latitude: number]
>>
type _LonLatHeightLikeShape = Assert<Equal<
  LonLatHeightLike,
  LonLatHeight | readonly [longitude: number, latitude: number, height: number]
>>
type _LonLatLikeOmitsHeight = Assert<OmitsKey<LonLat, 'height'>>

type _RendererRaw = Assert<'raw' extends keyof ViewerRenderer ? true : false>
type _GlobeRaw = Assert<'raw' extends keyof Globe ? true : false>
type _CameraRaw = Assert<'raw' extends keyof Camera ? true : false>
type _SceneRaw = Assert<'raw' extends keyof Scene ? true : false>
type _ControlsRaw = Assert<'raw' extends keyof ViewerControls ? true : false>

type PostProcessKey = keyof Viewer['postProcess']
type _PostProcessFields = Assert<Equal<
  PostProcessKey,
  | 'bloom'
  | 'lensFlare'
  | 'smaa'
  | 'taa'
  | 'dithering'
  | 'autoExposure'
  | 'toneMappingExposure'
>>

type SampleHeightOverloads = {
  (point: LonLatLike, options?: SampleHeightOptions): number | undefined
  (points: readonly LonLatLike[], options?: SampleHeightOptions): (number | undefined)[]
}
type SampleHeightMostDetailedOverloads = {
  (point: LonLatLike, options?: SampleHeightMostDetailedOptions): Promise<number | undefined>
  (
    points: readonly LonLatLike[],
    options?: SampleHeightMostDetailedOptions
  ): Promise<(number | undefined)[]>
}
type _SampleHeight = Assert<Equal<Viewer['sampleHeight'], SampleHeightOverloads>>
type _SampleHeightMostDetailed = Assert<
  Equal<Viewer['sampleHeightMostDetailed'], SampleHeightMostDetailedOverloads>
>

type _OmitsLegacyViewerPaths = Assert<
  OmitsKey<
    Viewer,
    | 'layers'
    | 'tileset'
    | 'highlight'
    | 'threeScene'
    | 'threeCamera'
    | 'toneMappingExposure'
    | 'load3DTileset'
    | 'setTerrain'
    | 'addModel'
  >
>
type _OmitsHighlighterInternals = Assert<
  OmitsKey<HighlightManager, 'syncStyleFromSettings' | 'outlineEffect'>
>

describe('stable public API contract', () => {
  it('keeps domain facades on Viewer', () => {
    const keys: Array<keyof Viewer> = [
      'overlays',
      'tilesets',
      'models',
      'terrain',
      'globe',
      'postProcess',
      'highlighter',
      'renderer',
      'controls',
      'entities',
      'hism',
      'scene',
      'camera',
      'clock'
    ]
    expect(keys).toHaveLength(14)
  })
})
