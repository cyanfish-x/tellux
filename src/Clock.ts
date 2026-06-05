/**
 * 场景时钟，用于太阳方向和随时间变化的大气光照。
 *
 * Scene clock used for sun direction and time-dependent atmosphere lighting.
 */
export class Clock {
  private currentDate = new Date()
  private readonly onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  /**
   * 当前 UTC 小时偏移量，用于计算太阳方向。
   *
   * Current UTC hour offset used to compute sun direction.
   */
  get hourUTC() {
    return getUTCHour(this.currentDate)
  }

  set hourUTC(value: number) {
    this.setHourUTC(value)
  }

  /**
   * 设置 UTC 小时偏移量，并更新随时间变化的光照。
   *
   * Sets the UTC hour offset and updates time-dependent lighting.
   */
  setHourUTC(value: number) {
    const nextDate = new Date(this.currentDate)
    const totalSeconds = Math.round(clamp(toFinite(value, this.hourUTC), 0, 24) * 3600) % 86400
    const hour = Math.floor(totalSeconds / 3600)
    const minute = Math.floor((totalSeconds % 3600) / 60)
    const second = totalSeconds % 60

    nextDate.setUTCHours(hour, minute, second, 0)
    this.currentDate = nextDate
    this.onChange()
  }

  /**
   * 当前太阳方向计算时间。
   *
   * Current time used for sun direction calculations.
   */
  get currentTime() {
    return new Date(this.currentDate)
  }

  set currentTime(value: Date) {
    this.setCurrentTime(value)
  }

  /**
   * 设置太阳方向计算时间，并更新随时间变化的光照。
   *
   * Sets the time used for sun direction calculations and updates
   * time-dependent lighting.
   */
  setCurrentTime(value: Date) {
    this.currentDate = new Date(value)
    this.onChange()
  }
}

function getUTCHour(date: Date) {
  return date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
}

function toFinite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
