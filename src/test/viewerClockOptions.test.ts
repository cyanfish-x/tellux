import { describe, expect, it } from 'vitest'

import { Clock } from '../Clock'
import { resolveViewerClockOptions } from '../ViewerOptionsResolver'

describe('resolveViewerClockOptions', () => {
  it('follows real time at 1x by default when the timeline is enabled', () => {
    const clock = new Clock(
      resolveViewerClockOptions({
        clock: { currentTime: '2026-09-01T08:00:00.000Z' },
        widgets: { timeline: true },
      })
    )

    clock.tick(2)

    expect(clock.currentTime.toISOString()).toBe('2026-09-01T08:00:02.000Z')
    expect(clock.shouldAnimate).toBe(true)
    expect(clock.multiplier).toBe(1)
    expect(resolveViewerClockOptions({ widgets: { timeline: {} } }).shouldAnimate).toBe(true)
  })

  it('keeps clock playback paused by default without the timeline', () => {
    expect(resolveViewerClockOptions({}).shouldAnimate).toBe(false)
    expect(resolveViewerClockOptions({ widgets: { timeline: false } }).shouldAnimate).toBe(false)
  })

  it('respects an explicit clock playback setting', () => {
    expect(
      resolveViewerClockOptions({
        clock: { shouldAnimate: false },
        widgets: { timeline: true },
      }).shouldAnimate
    ).toBe(false)
    expect(resolveViewerClockOptions({ clock: { shouldAnimate: true } }).shouldAnimate).toBe(true)
  })
})
