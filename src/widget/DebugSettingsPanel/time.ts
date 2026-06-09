export function formatHour(value: number) {
  const totalMinutes = Math.round(value * 60) % (24 * 60)
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export function formatRadians(value: number) {
  return `${value.toFixed(4)}rad`
}

export function getUTCHour(date: Date) {
  return (
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  )
}

export function getUTCDayOfYear(date: Date) {
  const year = date.getUTCFullYear()
  const start = Date.UTC(year, 0, 1)
  const current = Date.UTC(year, date.getUTCMonth(), date.getUTCDate())
  return Math.floor((current - start) / 86400000) + 1
}

export function getDaysInUTCYear(year: number) {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000
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

export function createUTCDateFromControls(
  year: number,
  dayOfYear: number,
  hourUTC: number
) {
  const safeYear = Math.round(toFinite(year, new Date().getUTCFullYear()))
  const safeDayOfYear = clamp(
    Math.round(toFinite(dayOfYear, 1)),
    1,
    getDaysInUTCYear(safeYear)
  )
  const totalSeconds =
    Math.round(clamp(toFinite(hourUTC, 0), 0, 24) * 3600) % 86400
  const hour = Math.floor(totalSeconds / 3600)
  const minute = Math.floor((totalSeconds % 3600) / 60)
  const second = totalSeconds % 60

  return new Date(Date.UTC(safeYear, 0, safeDayOfYear, hour, minute, second, 0))
}

function toFinite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
