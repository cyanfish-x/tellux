import type { GlobeControls } from '3d-tiles-renderer'
import type { Camera } from '../Camera'
import type { Viewer } from '../Viewer'
import type {
  AnyViewerEventListener,
  ScreenPosition,
  ViewerEventListener,
  ViewerEventMap,
  ViewerMouseEvent,
  ViewerPickOptions,
  ViewerPickResult
} from '../types'

export interface ViewerInteractionManagerOptions {
  viewer: Viewer
  camera: Camera
  controls: GlobeControls
  domElement: HTMLElement
  pickCartographic: (position: ScreenPosition) => ViewerMouseEvent['cartographic']
  pickNearest: (
    position: ScreenPosition,
    options?: ViewerPickOptions
  ) => ViewerPickResult | null
  pickAll: (
    position: ScreenPosition,
    options?: ViewerPickOptions
  ) => ViewerPickResult[]
  scheduleAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
}

const ENTITY_CLICK_PICK_TOLERANCE = 6
const ENTITY_MOUSEMOVE_PICK_TOLERANCE = 4

export class ViewerInteractionManager {
  private readonly eventListeners = new Map<keyof ViewerEventMap, Set<AnyViewerEventListener>>()
  private pendingMouseMove: MouseEvent | null = null
  private mouseMoveFrameHandle: number | null = null
  private isDisposed = false

  constructor(private readonly options: ViewerInteractionManagerOptions) {
    this.options.domElement.addEventListener('pointerdown', this.handleCameraInteraction)
    this.options.domElement.addEventListener('wheel', this.handleCameraInteraction)
    this.options.domElement.addEventListener('pointerdown', this.enableAdjustHeight)
    this.options.domElement.addEventListener('wheel', this.enableAdjustHeight)
    this.options.domElement.addEventListener('click', this.handleCanvasClick)
    this.options.domElement.addEventListener('mousemove', this.handleCanvasMouseMove)
  }

  on<T extends keyof ViewerEventMap>(type: T, listener: ViewerEventListener<T>) {
    let listeners = this.eventListeners.get(type)
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(type, listeners)
    }

    listeners.add(listener as AnyViewerEventListener)
  }

  off<T extends keyof ViewerEventMap>(type: T, listener: ViewerEventListener<T>) {
    const listeners = this.eventListeners.get(type)
    listeners?.delete(listener as AnyViewerEventListener)
    if (type === 'mousemove' && listeners?.size === 0) {
      this.cancelPendingMouseMove()
    }
  }

  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
    this.cancelPendingMouseMove()
    this.options.domElement.removeEventListener('pointerdown', this.handleCameraInteraction)
    this.options.domElement.removeEventListener('wheel', this.handleCameraInteraction)
    this.options.domElement.removeEventListener('pointerdown', this.enableAdjustHeight)
    this.options.domElement.removeEventListener('wheel', this.enableAdjustHeight)
    this.options.domElement.removeEventListener('click', this.handleCanvasClick)
    this.options.domElement.removeEventListener('mousemove', this.handleCanvasMouseMove)
    this.clearEventListeners()
  }

  private readonly handleCameraInteraction = () => {
    this.options.camera.cancelFlight()
  }

  private readonly enableAdjustHeight = () => {
    // 允许穿地时不启用离地约束；保留监听器以便开关切回 false 时仍能在下次交互生效。
    // Skip the ground-clamp constraint when underground movement is allowed. Keep the
    // listener attached so flipping back to false still takes effect on next interaction.
    if (this.options.camera.allowUnderground) return
    this.options.controls.adjustHeight = true
    this.options.domElement.removeEventListener('pointerdown', this.enableAdjustHeight)
    this.options.domElement.removeEventListener('wheel', this.enableAdjustHeight)
  }

  private createMouseEvent(type: 'click', originalEvent: MouseEvent): ViewerEventMap['click']
  private createMouseEvent(type: 'mousemove', originalEvent: MouseEvent): ViewerEventMap['mousemove']
  private createMouseEvent(type: ViewerMouseEvent['type'], originalEvent: MouseEvent): ViewerMouseEvent {
    const rect = this.options.domElement.getBoundingClientRect()
    const position = {
      x: originalEvent.clientX - rect.left,
      y: originalEvent.clientY - rect.top
    }
    const tolerance =
      type === 'click' ? ENTITY_CLICK_PICK_TOLERANCE : ENTITY_MOUSEMOVE_PICK_TOLERANCE
    const pickOptions: ViewerPickOptions = { tolerance }

    const picks =
      type === 'click'
        ? this.options.pickAll(position, pickOptions)
        : (() => {
            const nearest = this.options.pickNearest(position, pickOptions)
            return nearest ? [nearest] : []
          })()
    const pick = picks[0] ?? null
    const cartographicFromPick =
      pick?.type === 'tilesFeature' ? pick.feature.cartographic : null

    return {
      type,
      viewer: this.options.viewer,
      originalEvent,
      position,
      cartographic: cartographicFromPick ?? this.options.pickCartographic(position),
      pick,
      picks
    }
  }

  private hasEventListeners(type: keyof ViewerEventMap) {
    return Boolean(this.eventListeners.get(type)?.size)
  }

  private readonly handleCanvasClick = (originalEvent: MouseEvent) => {
    this.dispatchEvent('click', this.createMouseEvent('click', originalEvent))
  }

  private readonly handleCanvasMouseMove = (originalEvent: MouseEvent) => {
    if (!this.hasEventListeners('mousemove')) return

    this.pendingMouseMove = originalEvent
    if (this.mouseMoveFrameHandle !== null) return

    const schedule = this.options.scheduleAnimationFrame ?? globalThis.requestAnimationFrame
    this.mouseMoveFrameHandle = schedule(this.dispatchPendingMouseMove)
  }

  private readonly dispatchPendingMouseMove = () => {
    this.mouseMoveFrameHandle = null
    const originalEvent = this.pendingMouseMove
    this.pendingMouseMove = null
    if (this.isDisposed || !originalEvent || !this.hasEventListeners('mousemove')) return

    this.dispatchEvent('mousemove', this.createMouseEvent('mousemove', originalEvent))
  }

  private dispatchEvent<T extends keyof ViewerEventMap>(type: T, event: ViewerEventMap[T]) {
    this.eventListeners.get(type)?.forEach((listener) => {
      listener(event)
    })
  }

  private clearEventListeners() {
    this.eventListeners.clear()
  }

  private cancelPendingMouseMove() {
    if (this.mouseMoveFrameHandle !== null) {
      const cancel = this.options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame
      cancel(this.mouseMoveFrameHandle)
      this.mouseMoveFrameHandle = null
    }
    this.pendingMouseMove = null
  }
}
