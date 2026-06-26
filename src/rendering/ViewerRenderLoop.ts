import type { TelluxRendererAdapter } from './RendererAdapter'
import type { HeightSampler } from '../sampling/HeightSampler'

export interface ViewerRenderLoopOptions {
  renderer: TelluxRendererAdapter
  heightSampler: HeightSampler
  renderFrame: (deltaTime: number, time: number) => void
}

export class ViewerRenderLoop {
  private previousTime = 0
  private isDestroyed = false
  private isUsingDefaultRenderLoop = false
  private isHeightSamplingUpdateScheduled = false
  private heightSamplingUpdateFrameId = 0

  constructor(private readonly options: ViewerRenderLoopOptions) {}

  get useDefaultRenderLoop() {
    return this.isUsingDefaultRenderLoop
  }

  set useDefaultRenderLoop(value: boolean) {
    this.isUsingDefaultRenderLoop = value
    this.options.renderer.setAnimationLoop(value ? (time) => this.render(time) : null)
  }

  render(time = performance.now()) {
    const deltaTime = this.previousTime === 0 ? 0 : (time - this.previousTime) / 1000
    this.previousTime = time

    this.options.renderFrame(deltaTime, time)
    this.scheduleHeightSamplingUpdate()
    return deltaTime
  }

  dispose() {
    if (this.isDestroyed) return

    this.isDestroyed = true
    this.useDefaultRenderLoop = false
    if (this.heightSamplingUpdateFrameId !== 0) {
      cancelAnimationFrame(this.heightSamplingUpdateFrameId)
      this.heightSamplingUpdateFrameId = 0
      this.isHeightSamplingUpdateScheduled = false
    }
  }

  private scheduleHeightSamplingUpdate() {
    if (
      this.isDestroyed ||
      this.isHeightSamplingUpdateScheduled ||
      !this.options.heightSampler.hasPendingMostDetailedSampling
    ) {
      return
    }

    this.isHeightSamplingUpdateScheduled = true
    this.heightSamplingUpdateFrameId = requestAnimationFrame(() => {
      this.isHeightSamplingUpdateScheduled = false
      this.heightSamplingUpdateFrameId = 0
      if (this.isDestroyed) return

      this.options.heightSampler.updateMostDetailedSampling()
    })
  }
}
