import { describe, expect, it } from 'vitest'

import { TelluxGlobeControls } from '../controls/TelluxGlobeControls'
import type { ViewerControls } from '../controls/ViewerControls'

type Assert<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false
type OmitsKey<T, K extends PropertyKey> = K extends keyof T ? false : true

type ViewerControlsKey =
  | 'enabled'
  | 'enableDamping'
  | 'dampingFactor'
  | 'adjustHeight'
  | 'minDistance'
  | 'maxDistance'
  | 'minAltitude'
  | 'maxAltitude'
  | 'rotationSpeed'
  | 'zoomSpeed'
  | 'addEventListener'
  | 'removeEventListener'
  | 'update'
  | 'attach'
  | 'detach'
  | 'dispose'
  | 'setEllipsoid'
  | 'raw'

type _KeysAreFrozen = Assert<Equal<keyof ViewerControls, ViewerControlsKey>>
type _OmitsUpstreamCenterMath = Assert<OmitsKey<ViewerControls, 'getDistanceToCenter'>>
type _OmitsUpstreamMargins = Assert<OmitsKey<ViewerControls, 'nearMargin'>>
type _OmitsTelluxPivotHelper = Assert<OmitsKey<ViewerControls, 'useWebGPUCompatiblePivotMaterial'>>
const _runtimeIsAssignable: ViewerControls = null as unknown as TelluxGlobeControls
void _runtimeIsAssignable

describe('ViewerControls public contract', () => {
  it('exposes raw as the same instance', () => {
    const controls = new TelluxGlobeControls()
    expect(controls.raw).toBe(controls)
    controls.dispose()
  })
})
