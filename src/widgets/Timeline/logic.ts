const MILLISECONDS_PER_DAY = 86400000
export const MAX_CLOCK_MULTIPLIER = 86400
export const CLOCK_MULTIPLIER_SLIDER_MAX = Math.log2(MAX_CLOCK_MULTIPLIER + 1)
export const CLOUD_SPEED_MULTIPLIER_CAP = 60

export function startOfUTCDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function getUTCDayOfYear(date: Date) {
  const year = date.getUTCFullYear()
  const start = Date.UTC(year, 0, 1)
  const current = Date.UTC(year, date.getUTCMonth(), date.getUTCDate())
  return Math.floor((current - start) / MILLISECONDS_PER_DAY) + 1
}

export function getDaysInUTCYear(year: number) {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / MILLISECONDS_PER_DAY
}

export function formatUTCMonthDay(year: number, dayOfYear: number) {
  const safeYear = Math.round(toFinite(year, new Date().getUTCFullYear()))
  const safeDayOfYear = clamp(
    Math.round(toFinite(dayOfYear, 1)),
    1,
    getDaysInUTCYear(safeYear)
  )
  const date = new Date(Date.UTC(safeYear, 0, safeDayOfYear))
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
}

export function getUTCTimeOfDayHours(date: Date) {
  return (
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3_600_000
  )
}

/**
 * UTC 日序号（相对 Unix 纪元的整日），与日内时刻拆开后可分别做 spring。
 * Absolute UTC day index since the Unix epoch; spring separately from time-of-day.
 */
export function getUTCDayNumber(date: Date) {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      MILLISECONDS_PER_DAY
  )
}

/**
 * 对齐 takram：用 floor(day) + timeOfDay 合成日期，改「年内日」时不会扫过黑夜。
 * Matches takram: compose with floor(day) + timeOfDay so day jumps keep solar altitude.
 */
export function dateFromUTCDayNumberAndTimeOfDay(
  dayNumber: number,
  timeOfDayHours: number
) {
  const day = Math.floor(toFinite(dayNumber, 0))
  const hours = toFinite(timeOfDayHours, 0)
  const hour = Math.floor(hours)
  const minuteFloat = (hours - hour) * 60
  const minute = Math.floor(minuteFloat)
  const secondFloat = (minuteFloat - minute) * 60
  const second = Math.floor(secondFloat)
  const ms = Math.round((secondFloat - second) * 1000)
  return new Date(day * MILLISECONDS_PER_DAY + hour * 3600000 + minute * 60000 + second * 1000 + ms)
}

export function createUTCDatePreservingTimeOfDay(date: Date, dayOfYear: number) {
  const nextDate = new Date(date)
  nextDate.setUTCMonth(
    0,
    clamp(Math.round(dayOfYear), 1, getDaysInUTCYear(date.getUTCFullYear()))
  )
  return nextDate
}

export function isTimeInsideRange(date: Date, start: Date, end: Date) {
  const time = date.getTime()
  return time >= start.getTime() && time <= end.getTime()
}

export function getUTCDayRange(date: Date) {
  const rangeStart = startOfUTCDay(date)
  const rangeEnd = new Date(rangeStart.getTime() + MILLISECONDS_PER_DAY)
  return { rangeStart, rangeEnd }
}

/**
 * 动态日窗口应对齐「目标时间」，而不是弹簧插值中的当前时钟。
 *
 * Dynamic day ranges should follow the target time, not the in-flight spring value.
 */
export function resolveDynamicDayRange(
  dynamicDayRange: boolean,
  rangeStart: Date,
  rangeEnd: Date,
  anchorTime: Date
) {
  if (!dynamicDayRange || isTimeInsideRange(anchorTime, rangeStart, rangeEnd)) {
    return { rangeStart, rangeEnd, changed: false }
  }

  return { ...getUTCDayRange(anchorTime), changed: true }
}

export function shiftTimelineWindow(
  rangeStart: Date,
  rangeEnd: Date,
  currentTime: Date,
  direction: -1 | 1,
  dynamicDayRange: boolean
) {
  const duration = rangeEnd.getTime() - rangeStart.getTime()
  const nextTime = new Date(currentTime.getTime() + direction * duration)

  if (dynamicDayRange) {
    const dayRange = getUTCDayRange(nextTime)
    return {
      rangeStart: dayRange.rangeStart,
      rangeEnd: dayRange.rangeEnd,
      nextTime,
    }
  }

  return {
    rangeStart: new Date(rangeStart.getTime() + direction * duration),
    rangeEnd: new Date(rangeEnd.getTime() + direction * duration),
    nextTime,
  }
}

export function resolveLinkedCloudSpeed(
  linkCloudSpeed: boolean,
  animate: boolean,
  baseCloudSpeed: number,
  multiplier: number
) {
  if (!linkCloudSpeed) return null
  if (!animate) return 0
  return baseCloudSpeed * Math.min(Math.max(multiplier, 0), CLOUD_SPEED_MULTIPLIER_CAP)
}

export function clockMultiplierToSliderValue(value: number) {
  return Math.log2(
    Math.min(Math.max(toFinite(value, 1), 0), MAX_CLOCK_MULTIPLIER) + 1
  )
}

export function sliderValueToClockMultiplier(value: number) {
  return Math.min(
    Math.max(Math.pow(2, toFinite(value, 0)) - 1, 0),
    MAX_CLOCK_MULTIPLIER
  )
}

export function formatMultiplier(value: number) {
  if (value < 1000) return String(Math.round(value))
  if (value < 3600) return `${Math.round(value / 60)}m`
  if (value < 86400) return `${Math.round(value / 3600)}h`
  return `${Math.round(value / 86400)}d`
}

export function shouldWriteControlValue(
  control: 'range' | 'day' | 'speed',
  activeControl: 'range' | 'day' | 'speed' | null
) {
  return activeControl !== control
}

function toFinite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
