import { describe, expect, it, vi } from 'vitest'

import { Clock } from '../Clock'

describe('Clock', () => {
  it.each([
    ['Date', new Date('2026-09-01T08:00:00.000Z')],
    ['ISO string', '2026-09-01T08:00:00.000Z'],
    ['timestamp', Date.parse('2026-09-01T08:00:00.000Z')]
  ])('accepts %s as the initial current time', (_label, currentTime) => {
    const clock = new Clock({ currentTime })

    expect(clock.currentTime.toISOString()).toBe('2026-09-01T08:00:00.000Z')
  })

  it('copies Date inputs and returned current-time values', () => {
    const initialTime = new Date('2026-09-01T08:00:00.000Z')
    const clock = new Clock({ currentTime: initialTime })

    initialTime.setUTCFullYear(2030)
    const returnedTime = clock.currentTime
    returnedTime.setUTCFullYear(2040)

    expect(clock.currentTime.toISOString()).toBe('2026-09-01T08:00:00.000Z')
  })

  it('accepts a valid Date for runtime current-time assignment', () => {
    const clock = new Clock({ currentTime: '2026-09-01T08:00:00.000Z' })
    const nextTime = new Date('2026-09-02T10:30:00.000Z')

    clock.currentTime = nextTime
    nextTime.setUTCFullYear(2030)

    expect(clock.currentTime.toISOString()).toBe('2026-09-02T10:30:00.000Z')
  })

  it('rejects invalid initial and runtime dates', () => {
    expect(() => new Clock({ currentTime: 'not-a-date' })).toThrow(TypeError)

    const clock = new Clock()
    expect(() => {
      clock.currentTime = new Date(Number.NaN)
    }).toThrow(TypeError)
  })

  it('uses explicit playback defaults and supports negative multipliers', () => {
    const clock = new Clock()

    expect(clock.shouldAnimate).toBe(false)
    expect(clock.multiplier).toBe(1)

    clock.shouldAnimate = true
    clock.multiplier = -2

    expect(clock.shouldAnimate).toBe(true)
    expect(clock.multiplier).toBe(-2)
  })

  it('rejects non-finite multipliers', () => {
    const clock = new Clock()

    expect(() => {
      clock.multiplier = Number.POSITIVE_INFINITY
    }).toThrow(RangeError)
    expect(() => new Clock({ multiplier: Number.NaN })).toThrow(RangeError)
  })

  it('does not advance while paused and returns a current-time copy', () => {
    const clock = new Clock({ currentTime: '2026-09-01T08:00:00.000Z' })
    const listener = vi.fn()
    clock.on('tick', listener)

    const result = clock.tick(60)
    result.setUTCFullYear(2030)

    expect(clock.currentTime.toISOString()).toBe('2026-09-01T08:00:00.000Z')
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        deltaSeconds: 60,
        simulationDeltaSeconds: 0
      })
    )
  })

  it('advances forwards and backwards using the configured multiplier', () => {
    const clock = new Clock({
      currentTime: '2026-09-01T08:00:00.000Z',
      shouldAnimate: true,
      multiplier: 2
    })

    clock.tick(30)
    expect(clock.currentTime.toISOString()).toBe('2026-09-01T08:01:00.000Z')

    clock.multiplier = -1
    clock.tick(30)
    expect(clock.currentTime.toISOString()).toBe('2026-09-01T08:00:30.000Z')
  })

  it('rejects negative and non-finite tick intervals', () => {
    const clock = new Clock()

    expect(() => clock.tick(-1)).toThrow(RangeError)
    expect(() => clock.tick(Number.NaN)).toThrow(RangeError)
  })

  it('emits change events only for effective state changes', () => {
    const clock = new Clock({ currentTime: '2026-09-01T08:00:00.000Z' })
    const listener = vi.fn()
    clock.on('change', listener)

    clock.shouldAnimate = false
    clock.multiplier = 1
    clock.currentTime = new Date('2026-09-01T08:00:00.000Z')
    expect(listener).not.toHaveBeenCalled()

    clock.shouldAnimate = true
    clock.multiplier = -2
    clock.currentTime = new Date('2026-09-01T09:00:00.000Z')

    expect(listener.mock.calls.map(([event]) => event.reason)).toEqual([
      'shouldAnimate',
      'multiplier',
      'currentTime'
    ])
    expect(listener.mock.lastCall?.[0].currentTime.toISOString()).toBe(
      '2026-09-01T09:00:00.000Z'
    )
  })

  it('emits tick details and supports removing listeners', () => {
    const clock = new Clock({
      currentTime: '2026-09-01T08:00:00.000Z',
      shouldAnimate: true,
      multiplier: -2
    })
    const listener = vi.fn()
    const changeListener = vi.fn()
    clock.on('tick', listener)
    clock.on('change', changeListener)

    clock.tick(30)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tick',
        deltaSeconds: 30,
        simulationDeltaSeconds: -60
      })
    )
    expect(listener.mock.lastCall?.[0].currentTime.toISOString()).toBe(
      '2026-09-01T07:59:00.000Z'
    )
    expect(changeListener).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'tick',
        deltaSeconds: 30,
        simulationDeltaSeconds: -60
      })
    )

    clock.off('tick', listener)
    clock.tick(30)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reports a zero simulation delta without preserving a negative-zero multiplier result', () => {
    const clock = new Clock({ shouldAnimate: true, multiplier: -2 })
    const listener = vi.fn()
    clock.on('tick', listener)

    clock.tick(0)

    expect(listener.mock.lastCall?.[0].simulationDeltaSeconds).toBe(0)
  })
})
