import type { UniformNode } from 'three/webgpu'
import { uniform } from 'three/tsl'

import {
  skyEnvironment,
  type SkyEnvironmentNode
} from '@takram/three-atmosphere/webgpu'

import {
  normalizeWaterAreaOptics,
  type ResolvedWaterAreaOptics,
  type WaterAreaEnvironment,
  type WaterAreaOptics,
  type WaterAreaOpticsOptions
} from './WaterAreaOptics'

class EnvironmentState implements WaterAreaEnvironment {
  constructor(private readonly owner: WaterAreaOpticsEffect) {}

  get enabled(): boolean {
    return this.owner.environmentEnabled
  }

  set enabled(value: boolean) {
    this.owner.environmentEnabled = value
    this.owner.syncEnvironmentWeight()
  }

  get intensity(): number {
    return this.owner.environmentIntensity
  }

  set intensity(value: number) {
    this.owner.environmentIntensity = normalizeWaterAreaOptics({
      environment: { intensity: value }
    }).environment.intensity
    this.owner.syncEnvironmentWeight()
  }
}

export class WaterAreaOpticsEffect implements WaterAreaOptics {
  readonly environmentNode: SkyEnvironmentNode
  readonly environmentWeightNode: UniformNode<number>
  readonly environment: WaterAreaEnvironment

  environmentEnabled = true
  environmentIntensity = 1

  private disposed = false

  constructor(options: WaterAreaOpticsOptions) {
    const resolved = normalizeWaterAreaOptics(options)
    this.environmentNode = skyEnvironment(64)
    this.environmentWeightNode = uniform(0)
    this.environment = new EnvironmentState(this)
    this.applyResolved(resolved)
  }

  assign(options: WaterAreaOpticsOptions): void {
    const current = this.toJSON()
    this.applyResolved(
      normalizeWaterAreaOptics({
        environment: {
          ...current.environment,
          ...options.environment
        }
      })
    )
  }

  toJSON(): ResolvedWaterAreaOptics {
    return {
      environment: {
        enabled: this.environment.enabled,
        intensity: this.environment.intensity
      }
    }
  }

  syncEnvironmentWeight(): void {
    this.environmentWeightNode.value = this.environmentEnabled
      ? this.environmentIntensity
      : 0
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.environmentNode.dispose()
  }

  private applyResolved(options: ResolvedWaterAreaOptics): void {
    this.environmentEnabled = options.environment.enabled
    this.environmentIntensity = options.environment.intensity
    this.syncEnvironmentWeight()
  }
}
