/**
 * 时钟初始化支持的时间输入。
 *
 * Time input supported when initializing a clock.
 */
export type DateTimeInput = Date | string | number

/**
 * 场景时钟初始化配置。
 *
 * Scene clock initialization options.
 */
export interface ClockOptions {
  /**
   * 初始模拟时间，数字表示 Unix 毫秒时间戳；默认使用当前系统时间。
   *
   * Initial simulation time. Numbers are Unix timestamps in milliseconds.
   * Defaults to the current system time.
   */
  currentTime?: DateTimeInput
  /**
   * 是否随渲染循环推进模拟时间，默认 `false`。
   *
   * Whether simulation time advances with the render loop. Defaults to `false`.
   */
  shouldAnimate?: boolean
  /**
   * 模拟时间倍率，默认 `1`。负数表示倒放。
   *
   * Simulation-time multiplier. Defaults to `1`. Negative values run backwards.
   */
  multiplier?: number
}

/** 时钟状态变化原因。Reason for a clock state change. */
export type ClockChangeReason = 'currentTime' | 'shouldAnimate' | 'multiplier' | 'tick'

/**
 * 时钟状态变化事件。
 *
 * Clock state change event.
 */
export interface ClockChangeEvent {
  /** 事件类型。Event type. */
  readonly type: 'change'
  /** 触发事件的时钟。Clock that emitted the event. */
  readonly clock: Clock
  /** 状态变化原因。Reason for the state change. */
  readonly reason: ClockChangeReason
  /** 变化后的当前时间副本。Copy of the current time after the change. */
  readonly currentTime: Date
  /** 变化后的播放状态。Playback state after the change. */
  readonly shouldAnimate: boolean
  /** 变化后的时间倍率。Time multiplier after the change. */
  readonly multiplier: number
  /** tick 的真实时间增量（秒）。Elapsed real seconds for a tick. */
  readonly deltaSeconds?: number
  /** tick 的模拟时间增量（秒）。Elapsed simulation seconds for a tick. */
  readonly simulationDeltaSeconds?: number
}

/**
 * 时钟逐帧推进事件。
 *
 * Clock tick event.
 */
export interface ClockTickEvent {
  /** 事件类型。Event type. */
  readonly type: 'tick'
  /** 触发事件的时钟。Clock that emitted the event. */
  readonly clock: Clock
  /** tick 完成后的当前时间副本。Copy of the current time after the tick. */
  readonly currentTime: Date
  /** 传入 tick 的真实时间增量（秒）。Elapsed real seconds passed to tick. */
  readonly deltaSeconds: number
  /** 应用播放状态和倍率后的模拟时间增量（秒）。Simulation seconds after playback state and multiplier. */
  readonly simulationDeltaSeconds: number
}

/** 时钟事件映射。Clock event map. */
export interface ClockEventMap {
  change: ClockChangeEvent
  tick: ClockTickEvent
}

/** 时钟事件监听函数。Clock event listener. */
export type ClockEventListener<T extends keyof ClockEventMap> = (event: ClockEventMap[T]) => void

/**
 * 场景模拟时钟。
 *
 * Scene simulation clock.
 */
export class Clock {
  private currentDate: Date
  private isAnimating: boolean
  private currentMultiplier: number
  private readonly changeListeners = new Set<ClockEventListener<'change'>>()
  private readonly tickListeners = new Set<ClockEventListener<'tick'>>()

  constructor(options: ClockOptions = {}) {
    this.currentDate = resolveDateTime(options.currentTime ?? new Date())
    this.isAnimating = options.shouldAnimate ?? false
    this.currentMultiplier = resolveMultiplier(options.multiplier ?? 1)
  }

  /**
   * 当前模拟时间。读取和赋值时都会复制 `Date`。
   *
   * Current simulation time. The `Date` is copied when read or assigned.
   */
  get currentTime() {
    return new Date(this.currentDate)
  }

  set currentTime(value: Date) {
    const nextDate = resolveRuntimeDate(value)
    if (nextDate.getTime() === this.currentDate.getTime()) return

    this.currentDate = nextDate
    this.emitChange('currentTime')
  }

  /**
   * 是否随渲染循环推进模拟时间，默认 `false`。
   *
   * Whether simulation time advances with the render loop. Defaults to `false`.
   */
  get shouldAnimate() {
    return this.isAnimating
  }

  set shouldAnimate(value: boolean) {
    if (value === this.isAnimating) return

    this.isAnimating = value
    this.emitChange('shouldAnimate')
  }

  /**
   * 模拟时间倍率，默认 `1`。负数表示倒放。
   *
   * Simulation-time multiplier. Defaults to `1`. Negative values run backwards.
   */
  get multiplier() {
    return this.currentMultiplier
  }

  set multiplier(value: number) {
    const nextMultiplier = resolveMultiplier(value)
    if (nextMultiplier === this.currentMultiplier) return

    this.currentMultiplier = nextMultiplier
    this.emitChange('multiplier')
  }

  /**
   * 注册时钟事件监听函数。
   *
   * Registers a clock event listener.
   */
  on<T extends keyof ClockEventMap>(type: T, listener: ClockEventListener<T>) {
    if (type === 'change') {
      this.changeListeners.add(listener as ClockEventListener<'change'>)
    } else {
      this.tickListeners.add(listener as ClockEventListener<'tick'>)
    }
    return this
  }

  /**
   * 移除时钟事件监听函数。
   *
   * Removes a clock event listener.
   */
  off<T extends keyof ClockEventMap>(type: T, listener: ClockEventListener<T>) {
    if (type === 'change') {
      this.changeListeners.delete(listener as ClockEventListener<'change'>)
    } else {
      this.tickListeners.delete(listener as ClockEventListener<'tick'>)
    }
    return this
  }

  /**
   * 按真实经过秒数推进时钟，并返回当前时间副本。
   *
   * Advances the clock by elapsed real seconds and returns a copy of the current time.
   */
  tick(deltaSeconds: number) {
    validateDeltaSeconds(deltaSeconds)

    const simulationDeltaSeconds =
      this.shouldAnimate && deltaSeconds !== 0 ? deltaSeconds * this.multiplier : 0
    if (simulationDeltaSeconds !== 0) {
      const nextTimestamp = this.currentDate.getTime() + simulationDeltaSeconds * 1000
      const nextDate = new Date(nextTimestamp)
      if (!Number.isFinite(nextDate.getTime())) {
        throw new RangeError('Clock tick result must be within the valid Date range.')
      }

      this.currentDate = nextDate
      this.emitChange('tick', deltaSeconds, simulationDeltaSeconds)
    }

    const event: ClockTickEvent = {
      type: 'tick',
      clock: this,
      currentTime: this.currentTime,
      deltaSeconds,
      simulationDeltaSeconds
    }
    for (const listener of [...this.tickListeners]) listener(event)

    return this.currentTime
  }

  private emitChange(
    reason: ClockChangeReason,
    deltaSeconds?: number,
    simulationDeltaSeconds?: number
  ) {
    const event: ClockChangeEvent = {
      type: 'change',
      clock: this,
      reason,
      currentTime: this.currentTime,
      shouldAnimate: this.shouldAnimate,
      multiplier: this.multiplier,
      deltaSeconds,
      simulationDeltaSeconds
    }
    for (const listener of [...this.changeListeners]) listener(event)
  }
}

function resolveDateTime(value: DateTimeInput) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('Clock currentTime must be a valid Date, date string, or timestamp.')
  }
  return date
}

function resolveRuntimeDate(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError('Clock currentTime must be a valid Date.')
  }
  return new Date(value)
}

function resolveMultiplier(value: number) {
  if (!Number.isFinite(value)) {
    throw new RangeError('Clock multiplier must be a finite number.')
  }
  return value
}

function validateDeltaSeconds(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Clock deltaSeconds must be a non-negative finite number.')
  }
}
