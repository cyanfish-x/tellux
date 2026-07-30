import { describe, expect, it, vi } from 'vitest'

import { ViewerInteractionManager } from '../controls/ViewerInteractionManager'

function createFakeDomElement() {
  const listeners = new Map<string, Set<(event: MouseEvent) => void>>()
  return {
    addEventListener: (type: string, listener: (event: MouseEvent) => void) => {
      const handlers = listeners.get(type) ?? new Set()
      handlers.add(listener)
      listeners.set(type, handlers)
    },
    removeEventListener: (type: string, listener: (event: MouseEvent) => void) => {
      listeners.get(type)?.delete(listener)
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    dispatch: (type: string, clientX: number, clientY: number) => {
      listeners.get(type)?.forEach((listener) => {
        listener({ clientX, clientY } as MouseEvent)
      })
    }
  }
}

function createAnimationFrameScheduler() {
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextHandle = 0
  return {
    schedule: vi.fn((callback: FrameRequestCallback) => {
      nextHandle += 1
      callbacks.set(nextHandle, callback)
      return nextHandle
    }),
    cancel: vi.fn((handle: number) => {
      callbacks.delete(handle)
    }),
    flush(handle: number) {
      const callback = callbacks.get(handle)
      callbacks.delete(handle)
      callback?.(0)
    }
  }
}

function createManager(
  domElement: ReturnType<typeof createFakeDomElement>,
  scheduler: ReturnType<typeof createAnimationFrameScheduler>,
  pickNearest = vi.fn(() => null)
) {
  return {
    manager: new ViewerInteractionManager({
      viewer: {} as never,
      camera: { cancelFlight: vi.fn(), allowUnderground: false } as never,
      controls: { adjustHeight: false } as never,
      domElement: domElement as never,
      pickCartographic: () => null,
      pickNearest,
      pickAll: vi.fn(() => []),
      scheduleAnimationFrame: scheduler.schedule,
      cancelAnimationFrame: scheduler.cancel
    }),
    pickNearest
  }
}

describe('ViewerInteractionManager mousemove scheduling', () => {
  it('coalesces raw mousemoves into one pick per animation frame using the latest position', () => {
    const domElement = createFakeDomElement()
    const scheduler = createAnimationFrameScheduler()
    const { manager, pickNearest } = createManager(domElement, scheduler)
    const listener = vi.fn()
    manager.on('mousemove', listener)

    domElement.dispatch('mousemove', 10, 12)
    domElement.dispatch('mousemove', 20, 22)
    domElement.dispatch('mousemove', 30, 32)

    expect(scheduler.schedule).toHaveBeenCalledOnce()
    expect(pickNearest).not.toHaveBeenCalled()

    scheduler.flush(1)

    expect(pickNearest).toHaveBeenCalledOnce()
    expect(pickNearest).toHaveBeenCalledWith({ x: 30, y: 32 }, { tolerance: 4 })
    expect(listener).toHaveBeenCalledOnce()
    manager.dispose()
  })

  it('cancels a pending mousemove frame when disposed', () => {
    const domElement = createFakeDomElement()
    const scheduler = createAnimationFrameScheduler()
    const { manager, pickNearest } = createManager(domElement, scheduler)
    manager.on('mousemove', vi.fn())

    domElement.dispatch('mousemove', 10, 12)
    manager.dispose()
    scheduler.flush(1)

    expect(scheduler.cancel).toHaveBeenCalledWith(1)
    expect(pickNearest).not.toHaveBeenCalled()
  })
})
