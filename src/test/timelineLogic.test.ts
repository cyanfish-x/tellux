import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createLocalDatePreservingTimeOfDay,
  dateFromLocalDayNumberAndTimeOfDay,
  formatLocalClock,
  formatLocalDate,
  getLocalTimeZoneLabel,
  getLocalDayNumber,
  getLocalTimeOfDayHours,
  resolveDynamicDayRange,
  resolveLinkedCloudSpeed,
  shiftTimelineWindow,
  shouldWriteControlValue,
  sliderValueToClockMultiplier,
  startOfLocalDay,
} from '../widgets/Timeline/logic'

const originalTimeZone = process.env.TZ

beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

afterAll(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = originalTimeZone
  }
})

describe('timelineLogic', () => {
  it('keeps the shifted local day window when anchoring to the step target', () => {
    const currentTime = new Date(2026, 2, 7, 10, 0)
    const rangeStart = startOfLocalDay(currentTime)
    const rangeEnd = new Date(2026, 2, 8)

    const shifted = shiftTimelineWindow(rangeStart, rangeEnd, currentTime, 1, true)

    expect(localParts(shifted.nextTime)).toEqual([2026, 3, 8, 10, 0])
    expect(localParts(shifted.rangeStart)).toEqual([2026, 3, 8, 0, 0])
    expect(localParts(shifted.rangeEnd)).toEqual([2026, 3, 9, 0, 0])
    expect(shifted.rangeEnd.getTime() - shifted.rangeStart.getTime()).toBe(
      23 * 60 * 60 * 1000
    )

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
    expect(localParts(snapBack.rangeStart)).toEqual([2026, 3, 7, 0, 0])
  })

  it('does not rewrite cloud speed when linkCloudSpeed is disabled', () => {
    expect(resolveLinkedCloudSpeed(false, true, 0.001, 600)).toBeNull()
    expect(resolveLinkedCloudSpeed(true, false, 0.001, 600)).toBe(0)
    expect(resolveLinkedCloudSpeed(true, true, 0.001, 600)).toBe(0.06)
    expect(resolveLinkedCloudSpeed(true, true, 0.001, 86400)).toBe(0.06)
  })

  it('preserves time of day when jumping by day of year', () => {
    const date = createLocalDatePreservingTimeOfDay(
      new Date(2026, 5, 23, 10, 30, 15),
      1
    )
    expect(localParts(date)).toEqual([2026, 1, 1, 10, 30])
    expect(date.getSeconds()).toBe(15)
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
    const morning = new Date(2026, 5, 23, 10, 30)
    const dayNumber = getLocalDayNumber(morning)
    const timeOfDay = getLocalTimeOfDayHours(morning)

    // Simulate springing ~100 calendar days later at the same clock time.
    const jumped = dateFromLocalDayNumberAndTimeOfDay(dayNumber + 100.4, timeOfDay)
    expect(getLocalTimeOfDayHours(jumped)).toBeCloseTo(timeOfDay, 5)
    expect(jumped.getHours()).toBe(10)
    expect(jumped.getMinutes()).toBe(30)
  })

  it('formats the timeline readout in the browser local time zone', () => {
    const instant = new Date('2026-09-01T08:00:00.000Z')

    expect(formatLocalDate(instant)).toBe('2026-09-01')
    expect(formatLocalClock(instant)).toBe('04:00:00')
    expect(getLocalTimeZoneLabel(instant)).toBe('-4')
    expect(getLocalTimeZoneLabel(new Date('2026-01-01T08:00:00.000Z'))).toBe('-5')
  })
})

function localParts(date: Date) {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ]
}
