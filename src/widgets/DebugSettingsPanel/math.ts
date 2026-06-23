import { getDaysInUTCYear } from './time'

export const MAX_CLOCK_MULTIPLIER = 86400
export const CLOCK_MULTIPLIER_SLIDER_MAX = Math.log2(MAX_CLOCK_MULTIPLIER + 1)

export function clockMultiplierToSliderValue(value: number) {
  return Math.log2(Math.min(Math.max(toFinite(value, 1), 0), MAX_CLOCK_MULTIPLIER) + 1)
}

export function createUTCDatePreservingTimeOfDay(date: Date, dayOfYear: number) {
  const nextDate = new Date(date)
  nextDate.setUTCMonth(0, clamp(Math.round(dayOfYear), 1, getDaysInUTCYear(date.getUTCFullYear())))
  return nextDate
}

export function sliderValueToClockMultiplier(value: number) {
  return Math.min(
    Math.max(Math.pow(2, toFinite(value, 0)) - 1, 0),
    MAX_CLOCK_MULTIPLIER
  )
}

function toFinite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
