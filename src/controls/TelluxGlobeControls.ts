import { EnvironmentControls, GlobeControls as BaseGlobeControls } from '3d-tiles-renderer'

export class TelluxGlobeControls extends BaseGlobeControls {
  _updateRotation(deltaTime: number) {
    ;(
      EnvironmentControls.prototype as unknown as {
        _updateRotation(this: TelluxGlobeControls, deltaTime: number): void
      }
    )._updateRotation.call(this, deltaTime)
  }
}
