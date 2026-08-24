import {
  type Node,
  type NodeFrame,
  type ReflectorNode,
  type TextureNode,
  type UniformNode
} from 'three/webgpu'
import { reflector, texture, uniform } from 'three/tsl'

import {
  skyEnvironment,
  type SkyEnvironmentNode
} from '@takram/three-atmosphere/webgpu'

import {
  normalizeWaterAreaOptics,
  type ResolvedWaterAreaOptics,
  type WaterAreaEnvironment,
  type WaterAreaOptics,
  type WaterAreaOpticsOptions,
  type WaterAreaReflection
} from './WaterAreaOptics'
import { createWaterAreaReflectionTarget } from './WaterAreaReflection'
import type { WaterAreaWaveFrame } from './WaterAreaWaveFrame'

export interface WaterAreaReflectionDebugPreview {
  setVisible(value: boolean): void
  capture(frame: NodeFrame): void
  dispose(): void
}

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

class ReflectionState implements WaterAreaReflection {
  constructor(private readonly owner: WaterAreaOpticsEffect) {}

  get enabled(): boolean {
    return this.owner.reflectionEnabled
  }

  set enabled(value: boolean) {
    const changed = this.owner.reflectionEnabled !== value
    this.owner.reflectionEnabled = value
    this.owner.syncReflectionWeight()
    if (changed && value) {
      this.owner.reflectionNode.reflector.forceUpdate = true
    }
  }

  get intensity(): number {
    return this.owner.reflectionIntensity
  }

  set intensity(value: number) {
    this.owner.reflectionIntensity = normalizeWaterAreaOptics({
      reflection: { intensity: value }
    }).reflection.intensity
    this.owner.syncReflectionWeight()
  }

  get resolutionScale(): number {
    return this.owner.reflectionNode.reflector.resolutionScale
  }

  set resolutionScale(value: number) {
    const next = normalizeWaterAreaOptics({
      reflection: { resolutionScale: value }
    }).reflection.resolutionScale
    this.owner.reflectionNode.reflector.resolutionScale = next
    this.owner.reflectionNode.reflector.forceUpdate = true
  }

  get debugView(): boolean {
    return this.owner.reflectionDebugViewEnabled
  }

  set debugView(value: boolean) {
    this.owner.setReflectionDebugView(value)
  }
}

export class WaterAreaOpticsEffect implements WaterAreaOptics {
  readonly environmentNode: SkyEnvironmentNode
  readonly reflectionTarget
  readonly reflectionNode: ReflectorNode
  readonly reflectionTextureNode: TextureNode
  readonly environmentWeightNode: UniformNode<number>
  readonly reflectionWeightNode: UniformNode<number>
  readonly environment: WaterAreaEnvironment
  readonly reflection: WaterAreaReflection

  environmentEnabled = true
  environmentIntensity = 1
  reflectionEnabled = true
  reflectionIntensity = 0.65
  reflectionDebugViewEnabled = false
  private effectVisible = true
  private reflectionDebugPreview: WaterAreaReflectionDebugPreview | null =
    null

  private disposed = false

  constructor(
    options: WaterAreaOpticsOptions,
    waveFrame: WaterAreaWaveFrame
  ) {
    const resolved = normalizeWaterAreaOptics(options)
    this.environmentNode = skyEnvironment(64)
    this.reflectionTarget = createWaterAreaReflectionTarget(waveFrame)
    this.reflectionNode = reflector({
      target: this.reflectionTarget,
      resolutionScale: resolved.reflection.resolutionScale,
      bounces: false,
      generateMipmaps: false,
      samples: 0
    })
    // ReflectorNode r184 clones share the reflector base but not the texture
    // reference that is replaced with the per-camera render target. Keep one
    // ordinary TextureNode as the stable sampling base for all tile materials.
    this.reflectionTextureNode = texture(this.reflectionNode.value)
    this.environmentWeightNode = uniform(0)
    this.reflectionWeightNode = uniform(0)
    this.environment = new EnvironmentState(this)
    this.reflection = new ReflectionState(this)

    const updateReflection =
      this.reflectionNode.reflector.updateBefore.bind(
        this.reflectionNode.reflector
      )
    this.reflectionNode.reflector.updateBefore = (frame: NodeFrame) => {
      if (!this.reflectionCaptureEnabled) return
      updateReflection(frame)
      this.syncReflectionTexture()
      if (
        this.reflectionDebugViewEnabled &&
        this.reflectionNode.reflector.hasOutput
      ) {
        this.reflectionDebugPreview?.capture(frame)
      }
    }

    this.applyResolved(resolved)
  }

  assign(options: WaterAreaOpticsOptions): void {
    const current = this.toJSON()
    this.applyResolved(
      normalizeWaterAreaOptics({
        environment: {
          ...current.environment,
          ...options.environment
        },
        reflection: {
          ...current.reflection,
          ...options.reflection
        }
      })
    )
  }

  toJSON(): ResolvedWaterAreaOptics {
    return {
      environment: {
        enabled: this.environment.enabled,
        intensity: this.environment.intensity
      },
      reflection: {
        enabled: this.reflection.enabled,
        intensity: this.reflection.intensity,
        resolutionScale: this.reflection.resolutionScale,
        debugView: this.reflection.debugView
      }
    }
  }

  syncEnvironmentWeight(): void {
    this.environmentWeightNode.value = this.environmentEnabled
      ? this.environmentIntensity
      : 0
  }

  syncReflectionWeight(): void {
    this.reflectionWeightNode.value = this.reflectionEnabled
      ? this.reflectionIntensity
      : 0
  }

  get reflectionCaptureEnabled(): boolean {
    return (
      this.reflectionDebugViewEnabled ||
      (this.effectVisible && this.reflectionEnabled)
    )
  }

  setReflectionDebugView(value: boolean): void {
    const changed = this.reflectionDebugViewEnabled !== value
    this.reflectionDebugViewEnabled = value
    this.reflectionDebugPreview?.setVisible(value)
    if (changed && value) {
      this.reflectionNode.reflector.forceUpdate = true
    }
  }

  setReflectionDebugPreview(
    preview: WaterAreaReflectionDebugPreview | null
  ): void {
    if (this.reflectionDebugPreview === preview) return
    this.reflectionDebugPreview?.dispose()
    this.reflectionDebugPreview = preview
    preview?.setVisible(this.reflectionDebugViewEnabled)
  }

  sampleReflection(uvNode: Node): ReflectorNode {
    const sampler = this.reflectionNode.sample(uvNode) as ReflectorNode
    // Keep ReflectorNode in the material graph so Three schedules its shared
    // base update, but resolve the sampled value through the stable texture
    // node that follows the current camera's render target.
    sampler.referenceNode = this.reflectionTextureNode
    return sampler
  }

  syncReflectionTexture(): void {
    this.reflectionTextureNode.value = this.reflectionNode.value
  }

  setEffectVisible(value: boolean): void {
    const changed = this.effectVisible !== value
    this.effectVisible = value
    if (
      changed &&
      value &&
      (this.reflectionEnabled || this.reflectionDebugViewEnabled)
    ) {
      this.reflectionNode.reflector.forceUpdate = true
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.reflectionTarget.removeFromParent()
    this.reflectionDebugPreview?.dispose()
    this.reflectionDebugPreview = null
    this.reflectionNode.dispose()
    this.environmentNode.dispose()
  }

  private applyResolved(options: ResolvedWaterAreaOptics): void {
    this.environmentEnabled = options.environment.enabled
    this.environmentIntensity = options.environment.intensity
    this.reflectionEnabled = options.reflection.enabled
    this.reflectionIntensity = options.reflection.intensity
    this.reflectionNode.reflector.resolutionScale =
      options.reflection.resolutionScale
    this.setReflectionDebugView(options.reflection.debugView)
    this.syncEnvironmentWeight()
    this.syncReflectionWeight()
  }
}
