import { describe, expect, it, vi } from 'vitest'

import { Clock } from '../Clock'

describe('Clock', () => {
  it('does not advance time when animation is disabled', () => {
    const onChange = vi.fn()
    const clock = new Clock(onChange)
    const start = new Date('2026-06-23T00:00:00.000Z')

    clock.currentTime = start
    onChange.mockClear()

    clock.tick(60)

    expect(clock.currentTime.toISOString()).toBe(start.toISOString())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('advances time with the configured multiplier while animating', () => {
    const onChange = vi.fn()
    const clock = new Clock(onChange)

    clock.currentTime = new Date('2026-06-23T00:00:00.000Z')
    clock.animate = true
    clock.multiplier = 2
    onChange.mockClear()

    clock.tick(30)

    expect(clock.currentTime.toISOString()).toBe('2026-06-23T00:01:00.000Z')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('clamps utc hour input into the supported day range', () => {
    const clock = new Clock(vi.fn())

    clock.currentTime = new Date('2026-06-23T08:30:00.000Z')
    clock.hourUTC = 24

    expect(clock.hourUTC).toBe(0)

    clock.hourUTC = -2

    expect(clock.hourUTC).toBe(0)
  })
})
