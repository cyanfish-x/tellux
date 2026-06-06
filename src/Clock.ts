/**
 * 场景时钟，用于太阳方向和随时间变化的大气光照。
 *
 * Scene clock used for sun direction and time-dependent atmosphere lighting.
 */
export class Clock {
  private currentDate = new Date()
  private readonly onChange: () => void
  private isAnimating = false
  private currentMultiplier = 1

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  /**
   * 是否随渲染循环自动推进时间，默认 `false`。
   *
   * Whether time advances automatically with the render loop. Defaults to
   * `false`.
   */
  get animate() {
    return this.isAnimating
  }

  set animate(value: boolean) {
    this.isAnimating = value
  }

  /**
   * 自动推进时间的倍率，默认 `1`。
   *
   * Time multiplier used while animating. Defaults to `1`.
   */
  get multiplier() {
    return this.currentMultiplier
  }

  set multiplier(value: number) {
    this.currentMultiplier = Math.max(0, toFinite(value, 1))
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

  /**
   * 按秒推进时钟。通常由 {@link Viewer.render} 在 `animate` 为 `true` 时调用。
   *
   * Advances the clock by seconds. Usually called by {@link Viewer.render} when
   * `animate` is `true`.
   */
  tick(deltaTime: number) {
    if (!this.animate || this.multiplier === 0) return

    const deltaMilliseconds = toFinite(deltaTime, 0) * this.multiplier * 1000
    if (deltaMilliseconds === 0) return

    this.currentDate = new Date(this.currentDate.getTime() + deltaMilliseconds)
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
