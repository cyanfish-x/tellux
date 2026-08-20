import { describe, expect, it, vi } from 'vitest'

import { ViewerEventDispatcher } from '../events/ViewerEventDispatcher'
import type { ViewerEventMap } from '../types'

function createDispatcher() {
  return new ViewerEventDispatcher({} as never)
}

describe('ViewerEventDispatcher', () => {
  it('dispatches listeners in registration order and deduplicates identical listeners', () => {
    const dispatcher = createDispatcher()
    const calls: string[] = []
    const first = vi.fn(() => calls.push('first'))
    const second = vi.fn(() => calls.push('second'))

    dispatcher.on('preRender', first)
    dispatcher.on('preRender', first)
    dispatcher.on('preRender', second)
    dispatcher.dispatch('preRender', { deltaTime: 0.016, time: 100 })

    expect(calls).toEqual(['first', 'second'])
    expect(first).toHaveBeenCalledOnce()
  })

  it('uses a listener snapshot when subscriptions change during dispatch', () => {
    const dispatcher = createDispatcher()
    const calls: string[] = []
    const late = vi.fn(() => calls.push('late'))
    const second = vi.fn(() => calls.push('second'))
    const first = vi.fn(() => {
      calls.push('first')
      dispatcher.off('preRender', second)
      dispatcher.on('preRender', late)
    })

    dispatcher.on('preRender', first)
    dispatcher.on('preRender', second)
    dispatcher.dispatch('preRender', { deltaTime: 0, time: 1 })
    dispatcher.dispatch('preRender', { deltaTime: 0, time: 2 })

    expect(calls).toEqual(['first', 'second', 'first', 'late'])
  })

  it('clears all listeners on dispose and keeps off idempotent', () => {
    const dispatcher = createDispatcher()
    const listener = vi.fn()
    dispatcher.on('preRender', listener)

    dispatcher.off('preRender', vi.fn())
    dispatcher.dispose()
    dispatcher.dispose()
    dispatcher.dispatch('preRender', { deltaTime: 0, time: 1 })

    expect(listener).not.toHaveBeenCalled()
    expect(dispatcher.hasListeners('preRender')).toBe(false)
  })

  it('propagates listener errors', () => {
    const dispatcher = createDispatcher()
    const error = new Error('ocean update failed')
    dispatcher.on('preRender', () => {
      throw error
    })

    expect(() => dispatcher.dispatch('preRender', { deltaTime: 0, time: 1 })).toThrow(error)
  })

  it('adds the event type and viewer to dispatched payloads', () => {
    const viewer = {} as never
    const dispatcher = new ViewerEventDispatcher(viewer)
    let received: ViewerEventMap['preRender'] | undefined
    dispatcher.on('preRender', (event) => {
      received = event
    })

    dispatcher.dispatch('preRender', { deltaTime: 0.25, time: 42 })

    expect(received).toEqual({
      type: 'preRender',
      viewer,
      deltaTime: 0.25,
      time: 42
    })
  })
})
