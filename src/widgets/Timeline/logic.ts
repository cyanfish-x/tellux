const MILLISECONDS_PER_DAY = 86400000
export const MAX_CLOCK_MULTIPLIER = 86400
export const CLOCK_MULTIPLIER_SLIDER_MAX = Math.log2(MAX_CLOCK_MULTIPLIER + 1)
export const CLOUD_SPEED_MULTIPLIER_CAP = 60

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getLocalDayOfYear(date: Date) {
  const year = date.getFullYear()
  const start = Date.UTC(year, 0, 1)
  const current = Date.UTC(year, date.getMonth(), date.getDate())
  return Math.floor((current - start) / MILLISECONDS_PER_DAY) + 1
}

export function getDaysInLocalYear(year: number) {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / MILLISECONDS_PER_DAY
}

export function formatLocalMonthDay(year: number, dayOfYear: number) {
  const safeYear = Math.round(toFinite(year, new Date().getFullYear()))
  const safeDayOfYear = clamp(
    Math.round(toFinite(dayOfYear, 1)),
    1,
    getDaysInLocalYear(safeYear)
  )
  const date = new Date(safeYear, 0, safeDayOfYear)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatLocalClock(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function getLocalTimeZoneLabel(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteMinutes = Math.abs(offsetMinutes)
  const hours = Math.floor(absoluteMinutes / 60)
  const minutes = absoluteMinutes % 60
  return minutes === 0 ? `${sign}${hours}` : `${sign}${hours}:${pad(minutes)}`
}

export function getLocalTimeOfDayHours(date: Date) {
  return (
    date.getHours() +
    date.getMinutes() / 60 +
    date.getSeconds() / 3600 +
    date.getMilliseconds() / 3_600_000
  )
}

/**
 * 本地民用日期的日序号，与本地日内时刻拆开后可分别做 spring。
 * Local civil-day index; spring separately from local time-of-day.
 */
export function getLocalDayNumber(date: Date) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
      MILLISECONDS_PER_DAY
  )
}

/**
 * 对齐 takram：用 floor(day) + timeOfDay 合成日期，改「年内日」时不会扫过黑夜。
 * Matches takram: compose with floor(day) + timeOfDay so day jumps keep solar altitude.
 */
export function dateFromLocalDayNumberAndTimeOfDay(
  dayNumber: number,
  timeOfDayHours: number
) {
  const day = Math.floor(toFinite(dayNumber, 0))
  const civilDate = new Date(day * MILLISECONDS_PER_DAY)
  const hours = toFinite(timeOfDayHours, 0)
  const hour = Math.floor(hours)
  const minuteFloat = (hours - hour) * 60
  const minute = Math.floor(minuteFloat)
  const secondFloat = (minuteFloat - minute) * 60
  const second = Math.floor(secondFloat)
  const ms = Math.round((secondFloat - second) * 1000)
  return new Date(
    civilDate.getUTCFullYear(),
    civilDate.getUTCMonth(),
    civilDate.getUTCDate(),
    hour,
    minute,
    second,
    ms
  )
}

export function createLocalDatePreservingTimeOfDay(date: Date, dayOfYear: number) {
  const nextDate = new Date(date)
  nextDate.setMonth(
    0,
    clamp(Math.round(dayOfYear), 1, getDaysInLocalYear(date.getFullYear()))
  )
  return nextDate
}

export function isTimeInsideRange(date: Date, start: Date, end: Date) {
  const time = date.getTime()
  return time >= start.getTime() && time <= end.getTime()
}

export function getLocalDayRange(date: Date) {
  const rangeStart = startOfLocalDay(date)
  const rangeEnd = new Date(
    rangeStart.getFullYear(),
    rangeStart.getMonth(),
    rangeStart.getDate() + 1
  )
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

  return { ...getLocalDayRange(anchorTime), changed: true }
}

export function shiftTimelineWindow(
  rangeStart: Date,
  rangeEnd: Date,
  currentTime: Date,
  direction: -1 | 1,
  dynamicDayRange: boolean
) {
  if (dynamicDayRange) {
    const nextTime = new Date(currentTime)
    nextTime.setDate(nextTime.getDate() + direction)
    const dayRange = getLocalDayRange(nextTime)
    return {
      rangeStart: dayRange.rangeStart,
      rangeEnd: dayRange.rangeEnd,
      nextTime,
    }
  }

  const duration = rangeEnd.getTime() - rangeStart.getTime()
  const nextTime = new Date(currentTime.getTime() + direction * duration)
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

function pad(value: number) {
  return String(value).padStart(2, '0')
}
