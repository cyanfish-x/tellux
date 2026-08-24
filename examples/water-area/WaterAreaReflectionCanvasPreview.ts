import { RenderTarget, Vector2 } from 'three'
import {
  RenderPipeline,
  type NodeFrame,
  type TextureNode,
  type WebGPURenderer
} from 'three/webgpu'
import { vec4 } from 'three/tsl'

import type { WaterAreaReflectionDebugPreview } from './WaterAreaOpticsEffect'

const PREVIEW_WIDTH = 512
const PREVIEW_MIN_HEIGHT = 128
const PREVIEW_MAX_HEIGHT = 512
const PREVIEW_INTERVAL_MS = 1000 / 15

/**
 * Copies the current reflection texture into a small RGBA8 target and reads it
 * back into a DOM canvas. The preview is diagnostic-only and throttled to keep
 * GPU readback outside the main water rendering cost.
 */
export class WaterAreaReflectionCanvasPreview
  implements WaterAreaReflectionDebugPreview
{
  private readonly previewTarget = new RenderTarget(
    PREVIEW_WIDTH,
    PREVIEW_MIN_HEIGHT,
    {
      depthBuffer: false,
      stencilBuffer: false
    }
  )
  private readonly renderPipeline: RenderPipeline
  private readonly drawingBufferSize = new Vector2()
  private canvas: HTMLCanvasElement | null = null
  private context: CanvasRenderingContext2D | null = null
  private lastCaptureTime = -Infinity
  private captureQueued = false
  private readbackInFlight = false
  private warnedReadbackFailure = false
  private disposed = false

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly container: HTMLElement,
    reflectionSampler: TextureNode
  ) {
    this.previewTarget.texture.name =
      'WaterAreaReflectionCanvasPreviewTexture'
    this.renderPipeline = new RenderPipeline(
      renderer,
      vec4(reflectionSampler.rgb, 1)
    )
  }

  setVisible(value: boolean): void {
    if (this.disposed) return
    if (value) {
      this.ensureCanvas()
    } else {
      this.removeCanvas()
    }
  }

  capture(_frame: NodeFrame): void {
    if (
      this.disposed ||
      !this.canvas ||
      !this.context ||
      this.captureQueued ||
      this.readbackInFlight
    ) {
      return
    }

    const now = performance.now()
    if (now - this.lastCaptureTime < PREVIEW_INTERVAL_MS) return
    this.captureQueued = true
    queueMicrotask(() => {
      this.captureQueued = false
      this.captureCurrentTexture()
    })
  }

  private captureCurrentTexture(): void {
    if (
      this.disposed ||
      !this.canvas ||
      !this.context ||
      this.readbackInFlight
    ) {
      return
    }
    this.lastCaptureTime = performance.now()

    const { width, height } = this.resolvePreviewSize()
    this.syncPreviewSize(width, height)
    this.renderPreviewTarget()
    this.readbackInFlight = true
    const canvas = this.canvas
    const context = this.context

    void this.renderer
      .readRenderTargetPixelsAsync(
        this.previewTarget,
        0,
        0,
        width,
        height
      )
      .then((pixels) => {
        if (
          this.disposed ||
          this.canvas !== canvas ||
          this.context !== context ||
          pixels.BYTES_PER_ELEMENT !== 1
        ) {
          return
        }
        const byteLength = width * height * 4
        const rgba = new Uint8ClampedArray(
          pixels.buffer,
          pixels.byteOffset,
          byteLength
        ).slice()
        context.putImageData(new ImageData(rgba, width, height), 0, 0)
      })
      .catch((error: unknown) => {
        if (this.warnedReadbackFailure) return
        this.warnedReadbackFailure = true
        console.warn('Water Area reflection preview readback failed.', error)
      })
      .finally(() => {
        this.readbackInFlight = false
      })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.removeCanvas()
    this.renderPipeline.dispose()
    this.previewTarget.dispose()
  }

  private ensureCanvas(): void {
    if (this.canvas) return
    const canvas = document.createElement('canvas')
    canvas.className = 'water-area-reflection-preview'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'Reflection camera preview')
    canvas.title = 'Reflection camera preview'
    this.canvas = canvas
    this.context = canvas.getContext('2d')
    this.container.append(canvas)
  }

  private removeCanvas(): void {
    this.canvas?.remove()
    this.canvas = null
    this.context = null
  }

  private resolvePreviewSize(): { width: number; height: number } {
    this.renderer.getDrawingBufferSize(this.drawingBufferSize)
    const aspect =
      this.drawingBufferSize.y > 0
        ? this.drawingBufferSize.x / this.drawingBufferSize.y
        : 16 / 9
    return {
      width: PREVIEW_WIDTH,
      height: Math.min(
        PREVIEW_MAX_HEIGHT,
        Math.max(PREVIEW_MIN_HEIGHT, Math.round(PREVIEW_WIDTH / aspect))
      )
    }
  }

  private syncPreviewSize(width: number, height: number): void {
    if (
      this.previewTarget.width !== width ||
      this.previewTarget.height !== height
    ) {
      this.previewTarget.setSize(width, height)
    }
    if (this.canvas) {
      if (this.canvas.width !== width) this.canvas.width = width
      if (this.canvas.height !== height) this.canvas.height = height
    }
  }

  private renderPreviewTarget(): void {
    const currentRenderTarget = this.renderer.getRenderTarget()
    const currentMRT = this.renderer.getMRT()
    const currentAutoClear = this.renderer.autoClear
    try {
      this.renderer.setMRT(null)
      this.renderer.setRenderTarget(this.previewTarget)
      this.renderer.autoClear = true
      this.renderPipeline.render()
    } finally {
      this.renderer.setMRT(currentMRT)
      this.renderer.setRenderTarget(currentRenderTarget)
      this.renderer.autoClear = currentAutoClear
    }
  }
}
