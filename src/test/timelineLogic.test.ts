import { describe, expect, it } from 'vitest'

import {
  createUTCDatePreservingTimeOfDay,
  dateFromUTCDayNumberAndTimeOfDay,
  getUTCDayNumber,
  getUTCTimeOfDayHours,
  resolveDynamicDayRange,
  resolveLinkedCloudSpeed,
  shiftTimelineWindow,
  shouldWriteControlValue,
  sliderValueToClockMultiplier,
  startOfUTCDay,
} from '../widgets/Timeline/logic'

describe('timelineLogic', () => {
  it('keeps the shifted day window when anchoring to the step target', () => {
    const currentTime = new Date('2026-06-23T10:00:00.000Z')
    const rangeStart = startOfUTCDay(currentTime)
    const rangeEnd = new Date(rangeStart.getTime() + 86400000)

    const shifted = shiftTimelineWindow(rangeStart, rangeEnd, currentTime, 1, true)

    expect(shifted.nextTime.toISOString()).toBe('2026-06-24T10:00:00.000Z')
    expect(shifted.rangeStart.toISOString()).toBe('2026-06-24T00:00:00.000Z')
    expect(shifted.rangeEnd.toISOString()).toBe('2026-06-25T00:00:00.000Z')

    const anchored = resolveDynamicDayRange(
      true,
      shifted.rangeStart,
      shifted.rangeEnd,
      shifted.nextTime
    )
    expect(anchored.changed).toBe(false)

    const snapBack = resolveDynamicDayRange(
      true,
      shifted.rangeStart,
      shifted.rangeEnd,
      currentTime
    )
    expect(snapBack.changed).toBe(true)
    expect(snapBack.rangeStart.toISOString()).toBe('2026-06-23T00:00:00.000Z')
  })

  it('does not rewrite cloud speed when linkCloudSpeed is disabled', () => {
    expect(resolveLinkedCloudSpeed(false, true, 0.001, 600)).toBeNull()
    expect(resolveLinkedCloudSpeed(true, false, 0.001, 600)).toBe(0)
    expect(resolveLinkedCloudSpeed(true, true, 0.001, 600)).toBe(0.06)
    expect(resolveLinkedCloudSpeed(true, true, 0.001, 86400)).toBe(0.06)
  })

  it('preserves time of day when jumping by day of year', () => {
    const date = createUTCDatePreservingTimeOfDay(
      new Date('2026-06-23T10:30:15.000Z'),
      1
    )
    expect(date.toISOString()).toBe('2026-01-01T10:30:15.000Z')
  })

  it('maps the multiplier slider up to one day per second', () => {
    expect(sliderValueToClockMultiplier(Math.log2(86400 + 1))).toBe(86400)
  })

  it('never writes back to the control currently being dragged', () => {
    expect(shouldWriteControlValue('range', 'range')).toBe(false)
    expect(shouldWriteControlValue('day', 'range')).toBe(true)
    expect(shouldWriteControlValue('speed', null)).toBe(true)
  })

  it('composes day-number springs without sweeping through night', () => {
    const morning = new Date('2026-06-23T10:30:00.000Z')
    const dayNumber = getUTCDayNumber(morning)
    const timeOfDay = getUTCTimeOfDayHours(morning)

    // Simulate springing ~100 calendar days later at the same clock time.
    const jumped = dateFromUTCDayNumberAndTimeOfDay(dayNumber + 100.4, timeOfDay)
    expect(getUTCTimeOfDayHours(jumped)).toBeCloseTo(timeOfDay, 5)
    expect(jumped.getUTCHours()).toBe(10)
    expect(jumped.getUTCMinutes()).toBe(30)
  })
})
