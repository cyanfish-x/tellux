import { SpringControl } from "../../SpringControl"
import type { Viewer } from "../../Viewer"
import { installTimelineStyles } from "./styles"
import type { TimelineOptions } from "./types"

const DEFAULT_SPEEDS = [1, 60, 600, 3600, 21600, 86400] as const
const MILLISECONDS_PER_DAY = 86400000
const DEFAULT_SPRING_OPTIONS = {
  stiffness: 80,
  damping: 18,
  precision: 0.05,
} as const

interface TimelineHandle {
  update(deltaTime: number): void
  dispose(): void
}

/**
 * Viewer 时间条控件。
 *
 * Timeline widget for a Viewer.
 */
export class Timeline {
  private readonly handle: TimelineHandle

  constructor(viewer: Viewer, options: TimelineOptions = {}) {
    this.handle = mountTimeline(viewer, options)
  }

  update(deltaTime = 0) {
    this.handle.update(deltaTime)
  }

  dispose() {
    this.handle.dispose()
  }
}

function mountTimeline(viewer: Viewer, options: TimelineOptions) {
  installTimelineStyles()

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

  const dynamicDayRange = options.startTime === undefined && options.endTime === undefined
  let rangeStart = resolveDate(options.startTime) ?? startOfUTCDay(initialTime)
  let rangeEnd = resolveDate(options.endTime) ?? new Date(rangeStart.getTime() + MILLISECONDS_PER_DAY)
  if (rangeEnd.getTime() <= rangeStart.getTime()) {
    rangeEnd = new Date(rangeStart.getTime() + MILLISECONDS_PER_DAY)
  }

  const shell = viewer.container.parentElement ?? viewer.container
  const existingTimeline = shell.querySelector(".tellux-timeline")
  existingTimeline?.remove()

  const root = document.createElement("section")
  root.className = "tellux-timeline"
  root.setAttribute("aria-label", "时间轴")

  const controls = document.createElement("div")
  controls.className = "tellux-timeline__controls"

  const previousButton = document.createElement("button")
  previousButton.className = "tellux-timeline__step"
  previousButton.type = "button"
  previousButton.textContent = "<"
  previousButton.title = "上一段时间"
  previousButton.setAttribute("aria-label", "上一段时间")

  const playButton = document.createElement("button")
  playButton.className = "tellux-timeline__play"
  playButton.type = "button"
  playButton.title = "播放或暂停时间"

  const nextButton = document.createElement("button")
  nextButton.className = "tellux-timeline__step"
  nextButton.type = "button"
  nextButton.textContent = ">"
  nextButton.title = "下一段时间"
  nextButton.setAttribute("aria-label", "下一段时间")

  const speedSelect = document.createElement("select")
  speedSelect.className = "tellux-timeline__speed"
  speedSelect.title = "时间倍率"
  speedSelect.setAttribute("aria-label", "时间倍率")
  createSpeedOptions(speedSelect, viewer.clock.multiplier)

  controls.append(previousButton, playButton, nextButton, speedSelect)

  const track = document.createElement("div")
  track.className = "tellux-timeline__track"

  const input = document.createElement("input")
  input.className = "tellux-timeline__range"
  input.type = "range"
  input.min = "0"
  input.step = "1"
  input.setAttribute("aria-label", "当前时间")

  const ticks = document.createElement("div")
  ticks.className = "tellux-timeline__ticks"

  const startLabel = document.createElement("span")
  const endLabel = document.createElement("span")
  ticks.append(startLabel, endLabel)

  track.append(input, ticks)

  const status = document.createElement("div")
  status.className = "tellux-timeline__status"

  const timeOutput = document.createElement("output")
  timeOutput.className = "tellux-timeline__time"
  status.appendChild(timeOutput)

  root.append(controls, track, status)
  shell.appendChild(root)

  const timeSpring = createTimelineSpring(initialTime, options.spring)

  // 单向数据流：input.value 绑定 targetTime（用户意图层），
  // spring 驱动 viewer.clock.currentTime（实际生效层）缓动追向 targetTime。
  // 拖动 input → input 事件 → 更新 targetTime；
  // 非拖动场景（按钮跳转、播放推进）→ targetTime 变化 → syncDisplay 把 input 同步到 targetTime。
  // 拖动时 targetTime 源自 input，回写幂等不会跳；缓动永远只作用于 currentTime，不碰 input。
  let targetTime = initialTime

  const updateRangeBounds = () => {
    const durationSeconds = getRangeDurationSeconds(rangeStart, rangeEnd)
    input.max = String(durationSeconds)
    startLabel.textContent = formatUTCDate(rangeStart)
    endLabel.textContent = formatUTCDate(rangeEnd)
  }

  const syncDynamicRange = (date: Date) => {
    if (!dynamicDayRange || isTimeInsideRange(date, rangeStart, rangeEnd)) return

    rangeStart = startOfUTCDay(date)
    rangeEnd = new Date(rangeStart.getTime() + MILLISECONDS_PER_DAY)
    updateRangeBounds()
  }

  // 每帧推进真实时间：spring 把 currentTime 缓动追向 targetTime；
  // 播放时让时钟自主前进，并带动 targetTime 跟随，使 input 一并前进。
  const advanceClock = (deltaTime: number) => {
    if (viewer.clock.animate) {
      targetTime = viewer.clock.currentTime
      timeSpring?.reset(dateToUnixSeconds(targetTime))
      return
    }
    if (!timeSpring) {
      viewer.clock.currentTime = targetTime
      return
    }
    timeSpring.target = dateToUnixSeconds(targetTime)
    viewer.clock.currentTime = unixSecondsToDate(timeSpring.tick(deltaTime))
  }

  const syncDisplay = () => {
    syncDynamicRange(targetTime)
    // input 单向绑定 targetTime，无条件同步：拖动时幂等不跳，非拖动时跟随 targetTime。
    input.value = String(dateToOffsetSeconds(targetTime, rangeStart, rangeEnd))
    // 显示文本反映实际生效的 currentTime，缓动效果在这里体现，而不是体现在 input 上。
    timeOutput.textContent = formatUTCDateTime(viewer.clock.currentTime)
    playButton.dataset.playing = String(viewer.clock.animate)
    playButton.setAttribute("aria-label", viewer.clock.animate ? "暂停时间" : "播放时间")
    syncSpeedOption(speedSelect, viewer.clock.multiplier)
  }

  // 设置用户意图目标，currentTime 由 advanceClock 缓动追上。
  const setCurrentTime = (date: Date) => {
    targetTime = date
  }

  const shiftRange = (direction: -1 | 1) => {
    const duration = rangeEnd.getTime() - rangeStart.getTime()
    rangeStart = new Date(rangeStart.getTime() + direction * duration)
    rangeEnd = new Date(rangeStart.getTime() + direction * duration)
    setCurrentTime(new Date(targetTime.getTime() + direction * duration))
    updateRangeBounds()
    syncDisplay()
  }

  playButton.addEventListener("click", () => {
    viewer.clock.animate = !viewer.clock.animate
    if (viewer.clock.animate) {
      // 进入播放时，让用户意图层 targetTime 对齐当前真实时间，
      // 否则暂停后 spring 会把时间拉回旧的 targetTime。
      targetTime = viewer.clock.currentTime
      timeSpring?.reset(dateToUnixSeconds(targetTime))
    }
    syncDisplay()
  })
  previousButton.addEventListener("click", () => {
    shiftRange(-1)
  })
  nextButton.addEventListener("click", () => {
    shiftRange(1)
  })
  speedSelect.addEventListener("change", () => {
    viewer.clock.multiplier = Number(speedSelect.value)
    syncDisplay()
  })
  input.addEventListener("input", () => {
    // 拖动只更新用户意图层 targetTime；缓动只作用于 currentTime，不会回写 input。
    setCurrentTime(new Date(rangeStart.getTime() + Number(input.value) * 1000))
  })

  updateRangeBounds()
  syncDisplay()

  return {
    update(deltaTime: number) {
      advanceClock(deltaTime)
      syncDisplay()
    },
    dispose() {
      root.remove()
    },
  }
}

function createTimelineSpring(
  initialTime: Date,
  options: TimelineOptions["spring"]
) {
  if (options === false) return null

  return new SpringControl(
    dateToUnixSeconds(initialTime),
    options === undefined || options === true ? DEFAULT_SPRING_OPTIONS : options
  )
}

function createSpeedOptions(select: HTMLSelectElement, multiplier: number) {
  const speeds = new Set<number>(DEFAULT_SPEEDS)
  speeds.add(multiplier)

  Array.from(speeds)
    .sort((a, b) => a - b)
    .forEach((speed) => {
      const option = document.createElement("option")
      option.value = String(speed)
      option.textContent = `${formatMultiplier(speed)}x`
      select.appendChild(option)
    })
  select.value = String(multiplier)
}

function syncSpeedOption(select: HTMLSelectElement, multiplier: number) {
  const value = String(multiplier)
  const hasOption = Array.from(select.options).some((option) => option.value === value)
  if (!hasOption) {
    Array.from(select.options)
      .filter((option) => option.dataset.dynamic === "true")
      .forEach((option) => option.remove())

    const option = document.createElement("option")
    option.value = value
    option.textContent = `${formatMultiplier(multiplier)}x`
    option.dataset.dynamic = "true"
    select.appendChild(option)
  }
  select.value = value
}

function resolveDate(value: Date | string | number | undefined) {
  if (value === undefined) return null

  const date = value instanceof Date ? new Date(value) : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function startOfUTCDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function isTimeInsideRange(date: Date, start: Date, end: Date) {
  const time = date.getTime()
  return time >= start.getTime() && time <= end.getTime()
}

function dateToOffsetSeconds(date: Date, start: Date, end: Date) {
  const offset = Math.round((date.getTime() - start.getTime()) / 1000)
  return clamp(offset, 0, getRangeDurationSeconds(start, end))
}

function dateToUnixSeconds(date: Date) {
  return date.getTime() / 1000
}

function unixSecondsToDate(seconds: number) {
  return new Date(seconds * 1000)
}

function getRangeDurationSeconds(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000))
}

function formatUTCDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function formatUTCDateTime(date: Date) {
  return `${formatUTCDate(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
}

function formatMultiplier(value: number) {
  if (value < 1000) return String(value)
  if (value < 3600) return `${Math.round(value / 60)}m`
  if (value < 86400) return `${Math.round(value / 3600)}h`
  return `${Math.round(value / 86400)}d`
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
