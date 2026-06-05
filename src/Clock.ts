/**
 * 场景时钟，用于太阳方向和随时间变化的大气光照。
 *
 * Scene clock used for sun direction and time-dependent atmosphere lighting.
 */
export class Clock {
  private currentHourUTC = 0
  private currentDate = new Date(Date.UTC(2024, 2, 1))
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
    return this.currentHourUTC
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
    this.currentHourUTC = value
    this.currentDate = new Date(Date.UTC(2024, 2, 1) + this.currentHourUTC * 3600000)
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
    this.currentHourUTC = this.currentDate.getUTCHours() + this.currentDate.getUTCMinutes() / 60 + this.currentDate.getUTCSeconds() / 3600
    this.onChange()
  }
}
