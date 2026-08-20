import type { Viewer } from '../Viewer'
import type {
  AnyViewerEventListener,
  ViewerEvent,
  ViewerEventListener,
  ViewerEventMap
} from '../types'

export type ViewerEventPayload<T extends keyof ViewerEventMap> = Omit<
  ViewerEventMap[T],
  keyof ViewerEvent
>

export class ViewerEventDispatcher {
  private readonly listeners = new Map<keyof ViewerEventMap, Set<AnyViewerEventListener>>()
  private isDisposed = false

  constructor(private readonly viewer: Viewer) {}

  on<T extends keyof ViewerEventMap>(type: T, listener: ViewerEventListener<T>) {
    if (this.isDisposed) return

    let listeners = this.listeners.get(type)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(type, listeners)
    }
    listeners.add(listener as AnyViewerEventListener)
  }

  off<T extends keyof ViewerEventMap>(type: T, listener: ViewerEventListener<T>) {
    const listeners = this.listeners.get(type)
    listeners?.delete(listener as AnyViewerEventListener)
    if (listeners?.size === 0) {
      this.listeners.delete(type)
    }
  }

  hasListeners(type: keyof ViewerEventMap) {
    return Boolean(this.listeners.get(type)?.size)
  }

  dispatch<T extends keyof ViewerEventMap>(
    type: T,
    payload: ViewerEventPayload<T> | ViewerEventMap[T]
  ) {
    if (this.isDisposed) return

    const event = {
      ...payload,
      type,
      viewer: this.viewer
    } as ViewerEventMap[T]
    const listeners = this.listeners.get(type)
    if (!listeners) return

    for (const listener of [...listeners]) {
      listener(event)
    }
  }

  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
    this.listeners.clear()
  }
}
