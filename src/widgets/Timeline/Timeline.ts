import { SpringControl } from '../../SpringControl'
import type { Viewer } from '../../Viewer'
import {
  CLOCK_MULTIPLIER_SLIDER_MAX,
  clockMultiplierToSliderValue,
  createUTCDatePreservingTimeOfDay,
  dateFromUTCDayNumberAndTimeOfDay,
  formatMultiplier,
  formatUTCMonthDay,
  getDaysInUTCYear,
  getUTCDayNumber,
  getUTCDayOfYear,
  getUTCTimeOfDayHours,
  resolveDynamicDayRange,
  resolveLinkedCloudSpeed,
  shiftTimelineWindow,
  shouldWriteControlValue,
  sliderValueToClockMultiplier,
  startOfUTCDay,
} from './logic'
import { installTimelineStyles } from './styles'
import type { TimelineOptions } from './types'

const MILLISECONDS_PER_DAY = 86400000
const DEFAULT_SPRING_OPTIONS = {
  stiffness: 100,
  damping: 20,
  precision: 0.05,
} as const

const mountedTimelines = new WeakMap<object, Timeline>()

interface TimelineHandle {
  update(deltaTime: number): void
  dispose(): void
}

interface CivilTimeSpring {
  dayNumber: SpringControl
  timeOfDay: SpringControl
}

/**
 * Viewer 时间条控件。
 *
 * 控制 {@link Viewer.clock} 的播放、倍率与当前时间。仅在
 * `linkCloudSpeed: true` 时按播放态联动 `scene.clouds.speed`。
 *
 * Timeline widget for a Viewer.
 *
 * Controls {@link Viewer.clock} playback, multiplier, and current time. Only
 * links `scene.clouds.speed` when `linkCloudSpeed: true`.
 */
export class Timeline {
  private readonly viewer: Viewer
  private readonly handle: TimelineHandle
  private disposed = false

  constructor(viewer: Viewer, options: TimelineOptions = {}) {
    const existing = mountedTimelines.get(viewer)
    existing?.dispose()

    this.viewer = viewer
    this.handle = mountTimeline(viewer, options)
    mountedTimelines.set(viewer, this)
  }

  update(deltaTime = 0) {
    if (this.disposed) return
    this.handle.update(deltaTime)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    if (mountedTimelines.get(this.viewer) === this) {
      mountedTimelines.delete(this.viewer)
    }
    this.handle.dispose()
  }
}

function mountTimeline(viewer: Viewer, options: TimelineOptions) {
  installTimelineStyles()

  const linkCloudSpeed = options.linkCloudSpeed === true
  const initialTime = resolveDate(options.currentTime) ?? viewer.clock.currentTime
  if (options.currentTime !== undefined) {
    viewer.clock.currentTime = initialTime
  }
  if (options.animate !== undefined) {
    viewer.clock.animate = options.animate
  }
  if (options.multiplier !== undefined) {
    viewer.clock.multiplier = options.multiplier
  }

  const baseCloudSpeed = viewer.scene.clouds.speed
  const syncCloudSpeed = () => {
    const nextSpeed = resolveLinkedCloudSpeed(
      linkCloudSpeed,
      viewer.clock.animate,
      baseCloudSpeed,
      viewer.clock.multiplier
    )
    if (nextSpeed === null) return
    viewer.scene.clouds.speed = nextSpeed
  }

  const dynamicDayRange = options.startTime === undefined && options.endTime === undefined
  let rangeStart = resolveDate(options.startTime) ?? startOfUTCDay(initialTime)
  let rangeEnd =
    resolveDate(options.endTime) ?? new Date(rangeStart.getTime() + MILLISECONDS_PER_DAY)
  if (rangeEnd.getTime() <= rangeStart.getTime()) {
    rangeEnd = new Date(rangeStart.getTime() + MILLISECONDS_PER_DAY)
  }

  const shell = viewer.container.parentElement ?? viewer.container
  const existingTimeline = shell.querySelector('.tellux-timeline')
  existingTimeline?.remove()

  const root = document.createElement('section')
  root.className = 'tellux-timeline'
  root.setAttribute('aria-label', '时间轴')

  const spine = document.createElement('div')
  spine.className = 'tellux-timeline__spine'
  spine.setAttribute('aria-hidden', 'true')

  const body = document.createElement('div')
  body.className = 'tellux-timeline__body'

  const header = document.createElement('div')
  header.className = 'tellux-timeline__header'

  const transport = document.createElement('div')
  transport.className = 'tellux-timeline__transport'

  const previousButton = document.createElement('button')
  previousButton.className = 'tellux-timeline__step'
  previousButton.type = 'button'
  previousButton.title = '上一段时间'
  previousButton.setAttribute('aria-label', '上一段时间')
  previousButton.innerHTML = STEP_BACK_ICON

  const playButton = document.createElement('button')
  playButton.className = 'tellux-timeline__play'
  playButton.type = 'button'
  playButton.title = '播放或暂停时间'
  playButton.innerHTML = PLAY_ICON

  const nextButton = document.createElement('button')
  nextButton.className = 'tellux-timeline__step'
  nextButton.type = 'button'
  nextButton.title = '下一段时间'
  nextButton.setAttribute('aria-label', '下一段时间')
  nextButton.innerHTML = STEP_FORWARD_ICON

  transport.append(previousButton, playButton, nextButton)

  const chronograph = document.createElement('div')
  chronograph.className = 'tellux-timeline__chronograph'

  const clockOutput = document.createElement('output')
  clockOutput.className = 'tellux-timeline__clock'

  const meta = document.createElement('div')
  meta.className = 'tellux-timeline__meta'
  const dateOutput = document.createElement('span')
  dateOutput.className = 'tellux-timeline__date'
  const tzBadge = document.createElement('span')
  tzBadge.className = 'tellux-timeline__tz'
  tzBadge.textContent = 'UTC'
  meta.append(dateOutput, tzBadge)
  chronograph.append(clockOutput, meta)

  const dials = document.createElement('div')
  dials.className = 'tellux-timeline__dials'

  const dayControl = document.createElement('label')
  dayControl.className = 'tellux-timeline__field'
  const dayLabel = document.createElement('span')
  dayLabel.className = 'tellux-timeline__field-label'
  dayLabel.textContent = '日序'
  const dayInput = document.createElement('input')
  dayInput.className = 'tellux-timeline__day'
  dayInput.type = 'range'
  dayInput.min = '1'
  dayInput.step = '1'
  dayInput.setAttribute('aria-label', '年内日')
  const dayValue = document.createElement('output')
  dayValue.className = 'tellux-timeline__field-value'
  dayControl.append(dayLabel, dayValue, dayInput)

  const speedControl = document.createElement('label')
  speedControl.className = 'tellux-timeline__field'
  const speedLabel = document.createElement('span')
  speedLabel.className = 'tellux-timeline__field-label'
  speedLabel.textContent = '倍率'
  const speedInput = document.createElement('input')
  speedInput.className = 'tellux-timeline__speed'
  speedInput.type = 'range'
  speedInput.min = '0'
  speedInput.max = String(CLOCK_MULTIPLIER_SLIDER_MAX)
  speedInput.step = '0.01'
  speedInput.setAttribute('aria-label', '时间倍率')
  const speedValue = document.createElement('output')
  speedValue.className = 'tellux-timeline__field-value'
  speedControl.append(speedLabel, speedValue, speedInput)

  dials.append(dayControl, speedControl)
  header.append(transport, chronograph, dials)

  const scrub = document.createElement('div')
  scrub.className = 'tellux-timeline__scrub'

  const track = document.createElement('div')
  track.className = 'tellux-timeline__track'

  const input = document.createElement('input')
  input.className = 'tellux-timeline__range'
  input.type = 'range'
  input.min = '0'
  input.step = '1'
  input.setAttribute('aria-label', '当前时间')

  const ticks = document.createElement('div')
  ticks.className = 'tellux-timeline__ticks'
  const startLabel = document.createElement('span')
  const endLabel = document.createElement('span')
  ticks.append(startLabel, endLabel)

  track.append(input)
  scrub.append(track, ticks)
  body.append(header, scrub)
  root.append(spine, body)
  shell.appendChild(root)

  let isSpringDrivingClock = false
  let activeControl: 'range' | 'day' | 'speed' | null = null
  /** UI 设定时间；大号时钟 / 日期 / scrub / 日序只读它。 */
  let targetTime = new Date(initialTime.getTime())
  const civilSpring = createCivilTimeSpring(initialTime, options.spring)

  const composeSpringDate = (dayNumber: number, timeOfDay: number) =>
    dateFromUTCDayNumberAndTimeOfDay(dayNumber, timeOfDay)

  /** 控件读数用的设定值（不是 spring 中间值）。 */
  const getDisplayTime = () => targetTime

  const updateRangeBounds = () => {
    const durationSeconds = getRangeDurationSeconds(rangeStart, rangeEnd)
    input.max = String(durationSeconds)
    startLabel.textContent = formatUTCDate(rangeStart)
    endLabel.textContent = formatUTCDate(rangeEnd)
  }

  const syncDynamicRange = (anchorTime: Date) => {
    const next = resolveDynamicDayRange(dynamicDayRange, rangeStart, rangeEnd, anchorTime)
    if (!next.changed) return
    rangeStart = next.rangeStart
    rangeEnd = next.rangeEnd
    updateRangeBounds()
  }

  const syncSpringDrivenClock = (deltaTime: number) => {
    if (!civilSpring || !isSpringDrivingClock) return

    const dayNumber = civilSpring.dayNumber.tick(deltaTime)
    const timeOfDay = civilSpring.timeOfDay.tick(deltaTime)
    // Spring only eases lighting/sun via clock; UI keeps reading targetTime.
    viewer.clock.currentTime = composeSpringDate(dayNumber, timeOfDay)

    if (civilSpring.dayNumber.settled && civilSpring.timeOfDay.settled) {
      isSpringDrivingClock = false
      resetCivilSpring(civilSpring, viewer.clock.currentTime)
    }
  }

  const syncDayControl = (date: Date) => {
    const year = date.getUTCFullYear()
    const dayOfYear =
      activeControl === 'day' ? Number(dayInput.value) : getUTCDayOfYear(date)
    dayInput.max = String(getDaysInUTCYear(year))
    if (shouldWriteControlValue('day', activeControl)) {
      dayInput.value = String(getUTCDayOfYear(date))
    }
    dayValue.textContent = formatUTCMonthDay(year, dayOfYear)
  }

  const syncSpeedControl = (multiplier: number) => {
    if (shouldWriteControlValue('speed', activeControl)) {
      speedInput.value = String(clockMultiplierToSliderValue(multiplier))
    }
    const displayMultiplier =
      activeControl === 'speed'
        ? sliderValueToClockMultiplier(Number(speedInput.value))
        : multiplier
    speedValue.textContent = `${formatMultiplier(displayMultiplier)}×`
  }

  const syncScrubProgress = () => {
    const max = Number(input.max) || 1
    const value = Number(input.value) || 0
    const progress = clamp((value / max) * 100, 0, 100)
    input.style.setProperty('--tx-progress', `${progress}%`)
  }

  const syncDisplay = () => {
    const displayTime = getDisplayTime()
    syncDynamicRange(displayTime)

    if (shouldWriteControlValue('range', activeControl)) {
      input.value = String(dateToOffsetSeconds(displayTime, rangeStart, rangeEnd))
    }
    clockOutput.textContent = formatUTCClock(displayTime)
    dateOutput.textContent = formatUTCDate(displayTime)
    const isPlaying = viewer.clock.animate
    if (playButton.dataset.playing !== String(isPlaying)) {
      playButton.dataset.playing = String(isPlaying)
      playButton.setAttribute('aria-label', isPlaying ? '暂停时间' : '播放时间')
      playButton.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON
    }
    syncDayControl(displayTime)
    syncSpeedControl(viewer.clock.multiplier)
    syncScrubProgress()
    syncCloudSpeed()
  }

  /**
   * 对齐 takram `useLocalDateControls`：
   * - targetTime = 设定值，控件立刻跟它
   * - spring 只推进 clock → 光照/太阳
   * - 拖动中不回写正在操作的 input
   */
  const setCurrentTime = (date: Date, options: { smooth?: boolean } = {}) => {
    targetTime = new Date(date.getTime())
    const smooth = options.smooth !== false && civilSpring !== null

    if (!smooth || !civilSpring) {
      viewer.clock.currentTime = date
      isSpringDrivingClock = false
      if (civilSpring) resetCivilSpring(civilSpring, date)
      return
    }

    if (!isSpringDrivingClock) {
      resetCivilSpring(civilSpring, viewer.clock.currentTime)
    }
    civilSpring.dayNumber.target = getUTCDayNumber(date)
    civilSpring.timeOfDay.target = getUTCTimeOfDayHours(date)
    isSpringDrivingClock = true
  }

  const pauseClock = () => {
    if (!viewer.clock.animate) return
    viewer.clock.animate = false
  }

  const applyRangeFromInput = () => {
    pauseClock()
    setCurrentTime(new Date(rangeStart.getTime() + Number(input.value) * 1000))
    syncDisplay()
  }

  const beginControl = (control: 'range' | 'day' | 'speed') => {
    activeControl = control
    // Changing rate should not interrupt playback; only seeking does.
    if (control !== 'speed') {
      pauseClock()
    }
  }

  const endActiveControl = () => {
    if (activeControl === null) return

    const ended = activeControl
    activeControl = null
    if (ended === 'range') {
      applyRangeFromInput()
      return
    }
    if (ended === 'day') {
      applyDayOfYearFromInput()
      return
    }
    viewer.clock.multiplier = sliderValueToClockMultiplier(Number(speedInput.value))
    syncDisplay()
  }

  const shiftRange = (direction: -1 | 1) => {
    pauseClock()
    const shifted = shiftTimelineWindow(
      rangeStart,
      rangeEnd,
      getDisplayTime(),
      direction,
      dynamicDayRange
    )
    rangeStart = shifted.rangeStart
    rangeEnd = shifted.rangeEnd
    setCurrentTime(shifted.nextTime)
    updateRangeBounds()
    syncDisplay()
  }

  const applyDayOfYearFromInput = () => {
    pauseClock()
    const nextTime = createUTCDatePreservingTimeOfDay(
      getDisplayTime(),
      Number(dayInput.value)
    )
    if (dynamicDayRange) {
      const dayRange = resolveDynamicDayRange(true, rangeStart, rangeEnd, nextTime)
      rangeStart = dayRange.rangeStart
      rangeEnd = dayRange.rangeEnd
      updateRangeBounds()
    }
    setCurrentTime(nextTime)
    syncDisplay()
  }

  const bindPointerLifecycle = (
    element: HTMLElement,
    control: 'range' | 'day' | 'speed'
  ) => {
    element.addEventListener('pointerdown', (event) => {
      beginControl(control)
      try {
        element.setPointerCapture?.((event as PointerEvent).pointerId)
      } catch {
        // Native range inputs may reject capture on some browsers.
      }
      syncDisplay()
    })
    element.addEventListener('pointerup', endActiveControl)
    element.addEventListener('pointercancel', endActiveControl)
    element.addEventListener('change', endActiveControl)
  }

  playButton.addEventListener('click', () => {
    viewer.clock.animate = !viewer.clock.animate
    if (viewer.clock.animate) {
      // Start playback from the set-point, not a mid-spring lighting sample.
      isSpringDrivingClock = false
      viewer.clock.currentTime = new Date(targetTime.getTime())
      if (civilSpring) resetCivilSpring(civilSpring, targetTime)
    }
    syncDisplay()
  })
  previousButton.addEventListener('click', () => {
    shiftRange(-1)
  })
  nextButton.addEventListener('click', () => {
    shiftRange(1)
  })
  dayInput.addEventListener('input', () => {
    if (activeControl !== 'day') beginControl('day')
    applyDayOfYearFromInput()
  })
  speedInput.addEventListener('input', () => {
    if (activeControl !== 'speed') beginControl('speed')
    viewer.clock.multiplier = sliderValueToClockMultiplier(Number(speedInput.value))
    syncDisplay()
  })
  input.addEventListener('input', () => {
    if (activeControl !== 'range') beginControl('range')
    applyRangeFromInput()
  })
  bindPointerLifecycle(input, 'range')
  bindPointerLifecycle(dayInput, 'day')
  bindPointerLifecycle(speedInput, 'speed')
  window.addEventListener('pointerup', endActiveControl)
  window.addEventListener('blur', endActiveControl)

  updateRangeBounds()
  syncDisplay()

  return {
    update(deltaTime: number) {
      // Playback advances clock; keep the UI set-point locked to it unless seeking/springing.
      if (
        viewer.clock.animate &&
        !isSpringDrivingClock &&
        activeControl !== 'range' &&
        activeControl !== 'day'
      ) {
        targetTime = new Date(viewer.clock.currentTime.getTime())
        if (civilSpring) {
          resetCivilSpring(civilSpring, viewer.clock.currentTime)
        }
      }
      syncSpringDrivenClock(deltaTime)
      syncDisplay()
    },
    dispose() {
      window.removeEventListener('pointerup', endActiveControl)
      window.removeEventListener('blur', endActiveControl)
      if (linkCloudSpeed) {
        viewer.scene.clouds.speed = baseCloudSpeed
      }
      root.remove()
    },
  }
}

function createCivilTimeSpring(
  initialTime: Date,
  options: TimelineOptions['spring']
): CivilTimeSpring | null {
  if (options === false) return null

  const springOptions =
    options === undefined || options === true ? DEFAULT_SPRING_OPTIONS : options

  return {
    dayNumber: new SpringControl(getUTCDayNumber(initialTime), springOptions),
    timeOfDay: new SpringControl(getUTCTimeOfDayHours(initialTime), springOptions),
  }
}

function resetCivilSpring(spring: CivilTimeSpring, date: Date) {
  spring.dayNumber.reset(getUTCDayNumber(date))
  spring.timeOfDay.reset(getUTCTimeOfDayHours(date))
}

function resolveDate(value: Date | string | number | undefined) {
  if (value === undefined) return null

  const date = value instanceof Date ? new Date(value) : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function dateToOffsetSeconds(date: Date, start: Date, end: Date) {
  const offset = Math.round((date.getTime() - start.getTime()) / 1000)
  return clamp(offset, 0, getRangeDurationSeconds(start, end))
}

function getRangeDurationSeconds(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000))
}

function formatUTCDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function formatUTCClock(date: Date) {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

const PLAY_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L13 8 5 3.2z"/></svg>'
const PAUSE_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zm5 0h3v10H9z"/></svg>'
const STEP_BACK_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.8 3.2 5.2 8l5.6 4.8V3.2z"/></svg>'
const STEP_FORWARD_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.2 3.2v9.6L10.8 8 5.2 3.2z"/></svg>'
