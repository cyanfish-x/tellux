export interface SpringControlOptions {
  /**
   * 弹簧刚度，默认 `100`。
   *
   * Spring stiffness. Defaults to `100`.
   */
  stiffness?: number
  /**
   * 阻尼系数，默认 `20`。
   *
   * Damping coefficient. Defaults to `20`.
   */
  damping?: number
  /**
   * 弹簧质量，默认 `1`。
   *
   * Spring mass. Defaults to `1`.
   */
  mass?: number
  /**
   * 判定为到达目标的精度，默认 `0.0001`。
   *
   * Precision used to decide when the spring has reached the target. Defaults
   * to `0.0001`.
   */
  precision?: number
}

const DEFAULT_STIFFNESS = 100
const DEFAULT_DAMPING = 20
const DEFAULT_MASS = 1
const DEFAULT_PRECISION = 0.0001
const MAX_SIMULATION_STEP = 1 / 60

/**
 * 数值弹簧控制器。
 *
 * 用于将目标值平滑过渡到当前值。公开属性本身不会自动接入该控制器；
 * 用户需要在渲染循环中调用 {@link SpringControl.tick}，并把返回值写入
 * 需要缓动的属性。
 *
 * Numeric spring controller.
 *
 * Smoothly moves the current value toward a target value. Public properties do
 * not use this controller automatically; call {@link SpringControl.tick} in the
 * render loop and write the returned value to the property that should be
 * smoothed.
 */
export class SpringControl {
  private currentValue: number
  private targetValue: number
  private currentVelocity = 0
  private currentStiffness: number
  private currentDamping: number
  private currentMass: number
  private currentPrecision: number

  constructor(value = 0, options: SpringControlOptions = {}) {
    this.currentValue = toFinite(value, 0)
    this.targetValue = this.currentValue
    this.currentStiffness = positiveFinite(options.stiffness, DEFAULT_STIFFNESS)
    this.currentDamping = positiveFinite(options.damping, DEFAULT_DAMPING)
    this.currentMass = positiveFinite(options.mass, DEFAULT_MASS)
    this.currentPrecision = positiveFinite(options.precision, DEFAULT_PRECISION)
  }

  /**
   * 当前弹簧值。
   *
   * Current spring value.
   */
  get value() {
    return this.currentValue
  }

  /**
   * 目标值。
   *
   * Target value.
   */
  get target() {
    return this.targetValue
  }

  set target(value: number) {
    this.targetValue = toFinite(value, this.targetValue)
  }

  /**
   * 当前速度。
   *
   * Current velocity.
   */
  get velocity() {
    return this.currentVelocity
  }

  /**
   * 弹簧刚度。
   *
   * Spring stiffness.
   */
  get stiffness() {
    return this.currentStiffness
  }

  set stiffness(value: number) {
    this.currentStiffness = positiveFinite(value, DEFAULT_STIFFNESS)
  }

  /**
   * 阻尼系数。
   *
   * Damping coefficient.
   */
  get damping() {
    return this.currentDamping
  }

  set damping(value: number) {
    this.currentDamping = positiveFinite(value, DEFAULT_DAMPING)
  }

  /**
   * 弹簧质量。
   *
   * Spring mass.
   */
  get mass() {
    return this.currentMass
  }

  set mass(value: number) {
    this.currentMass = positiveFinite(value, DEFAULT_MASS)
  }

  /**
   * 判定为到达目标的精度。
   *
   * Precision used to decide when the spring has reached the target.
   */
  get precision() {
    return this.currentPrecision
  }

  set precision(value: number) {
    this.currentPrecision = positiveFinite(value, DEFAULT_PRECISION)
  }

  /**
   * 是否已经接近目标并停止运动。
   *
   * Whether the spring is close to the target and no longer moving.
   */
  get settled() {
    return (
      Math.abs(this.targetValue - this.currentValue) <= this.currentPrecision &&
      Math.abs(this.currentVelocity) <= this.currentPrecision
    )
  }

  /**
   * 设置目标值。
   *
   * Sets the target value.
   */
  setTarget(value: number) {
    this.target = value
    return this
  }

  /**
   * 立即重置当前值、目标值和速度。
   *
   * Immediately resets the current value, target value, and velocity.
   */
  reset(value: number) {
    const nextValue = toFinite(value, this.currentValue)
    this.currentValue = nextValue
    this.targetValue = nextValue
    this.currentVelocity = 0
    return this
  }

  /**
   * 推进弹簧并返回新的当前值。
   *
   * `deltaTime` 使用秒为单位。通常每帧调用一次。
   *
   * Advances the spring and returns the new current value.
   *
   * `deltaTime` is in seconds. Usually called once per frame.
   */
  tick(deltaTime: number) {
    let remainingTime = Math.max(0, toFinite(deltaTime, 0))
    if (remainingTime === 0 || this.settled) {
      if (this.settled) {
        this.currentValue = this.targetValue
        this.currentVelocity = 0
      }
      return this.currentValue
    }

    while (remainingTime > 0) {
      const step = Math.min(remainingTime, MAX_SIMULATION_STEP)
      const displacement = this.currentValue - this.targetValue
      const springForce = -this.currentStiffness * displacement
      const dampingForce = -this.currentDamping * this.currentVelocity
      const acceleration = (springForce + dampingForce) / this.currentMass

      this.currentVelocity += acceleration * step
      this.currentValue += this.currentVelocity * step
      remainingTime -= step
    }

    if (this.settled) {
      this.currentValue = this.targetValue
      this.currentVelocity = 0
    }

    return this.currentValue
  }
}

function toFinite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function positiveFinite(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback
}
