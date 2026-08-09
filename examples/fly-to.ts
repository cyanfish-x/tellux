import tellux from "../src"
import { bootExampleI18n, t } from "./i18n"
import { exampleMapServiceConfig, showTokenNotice } from "./shared"
import type { CameraFlyToOptions } from "../src"
import { setupExamplePanels } from "./example-panel"

bootExampleI18n()
setupExamplePanels()


/**
 * 飞行目的地顶层配置：按钮名称、飞行参数（位置、姿态、时长）与目标时刻
 * （datetime，北京时间，内部换算为 UTC 供太阳方向计算）均从此处读取，
 * 页面按钮由该配置动态生成，新增目的地只需在此追加一项。
 *
 * Top-level flight destinations: button labels, flight params (position,
 * orientation, duration) and target time (datetime, Beijing time, converted
 * to UTC for sun-direction computation) are all read from here. Buttons are
 * generated from this list, so adding a destination is just appending an entry.
 */
interface FlightDestination extends CameraFlyToOptions {
  label: string
  /** 飞行同时过渡到的目标时刻；省略则只移动相机。Target time to transition to. */
  datetime?: Date
  /**
   * 飞行同时过渡到的目标焦距（35mm 等效，毫米）；省略则不改变视场角。
   * Target focal length (35mm-equivalent, mm) to transition to.
   */
  focalLength?: number
}

/**
 * 按北京时间（UTC+8）构造 Date：传入北京时间分量（月份从 1 起），内部换算为 UTC，
 * 供引擎按真实 UTC 瞬时计算太阳方向。负数/溢出分量由 Date.UTC 自动进位。
 *
 * Build a Date from Beijing-time (UTC+8) components (1-based month), converting
 * to UTC so the engine computes sun direction from the correct UTC instant.
 */
function beijingTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second))
}

const DESTINATIONS: FlightDestination[] = [
  {
    label: t({ zh: "成都都江堰", en: "Chengdu Dujiangyan" }),
    destination: {
      latitude: 31.033741870740627,
      longitude: 103.60506004084334,
      height: 2722.872462869822,
    },
    orientation: {
      heading: -132.4690228833339,
      pitch: -23.838793071603863,
      roll: 0.00005864915930498756,
    },
    duration: 4,
    // 夏季某天 17:30:00（北京时间），呈现都江堰黄昏前的光线。
    datetime: beijingTime(2024, 7, 15, 17, 30, 0),
    // 35mm 焦距，呈现都江堰工程与周边山谷的中景。
    focalLength: 15,
  },
  {
    label: t({ zh: "桂林-千里江山图", en: "Guilin – A Thousand Miles of Rivers and Mountains" }),
    destination: {
      latitude: 25.015593451980674,
      longitude: 110.25909678096521,
      height: 751.5618954532096,
    },
    orientation: {
      heading: -83.51042738420931,
      pitch: -9.017073368837835,
      roll: 0.000017528340412510116,
    },
    duration: 4,
    // 4 月某天 18:40:30（北京时间），呈现相公山日落时分。
    datetime: beijingTime(2024, 4, 15, 18, 40, 30),
    // 40mm 长焦，呈现相公山漓江峰林全景。
    focalLength: 40,
  },
  {
    label: t({ zh: "西藏南迦巴瓦峰", en: "Namcha Barwa, Tibet" }),
    destination: {
      latitude: 29.488841833702445,
      longitude: 94.80333750399797,
      height: 6027.084824306177,
    },
    orientation: {
      heading: 23.454397766423956,
      pitch: -1.153805843492858,
      roll: -0.00006213357053011512,
    },
    duration: 5,
    // 9 月某天 19:10:00（北京时间），呈现南迦巴瓦峰秋日傍晚。
    datetime: beijingTime(2024, 9, 15, 19, 35, 0),
    // 85mm 中长焦，压缩呈现南迦巴瓦峰的雄伟。
    focalLength: 80,
  },
]

const container = document.querySelector("#viewer")
const tokenStatus = document.querySelector<HTMLElement>("#token-status")
const flightStatus = document.querySelector<HTMLElement>("#flight-status")
const destinationRow = document.querySelector<HTMLElement>("#destination-row")
const cancelButton = document.querySelector("#cancel-flight")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

showTokenNotice(tokenStatus)

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: "/draco/gltf/",
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  layers: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    latitude: 30,
    longitude: 103,
    height: 1500000,
    heading: 0,
    pitch: -32,
  },
  scene: {
    clouds: {
      coverage: 0.2,
    },
  },
})

;(window as any).viewer = viewer

function setStatus(message: string) {
  if (flightStatus) flightStatus.textContent = message
}

// 当前活动的飞行序号；飞行结束/取消回调据此判断是否已被后续飞行取代。
// Active flight generation; completion/cancellation callbacks no-op if superseded.
let activeFlightId = 0
let timeTweenId: number | null = null

function stopTimeTween() {
  if (timeTweenId !== null) {
    cancelAnimationFrame(timeTweenId)
    timeTweenId = null
  }
}

const SECONDS_PER_DAY = 24 * 60 * 60

// 飞行时同步推进场景时钟：目标日期（年月日）瞬间切过去，只对当天的时分秒做过渡。
// 若直接对完整时间戳逐帧插值，会跨越数月乃至数年、每帧推进数天，太阳相位在帧间
// 重复循环，表现为昼夜快速交替的画面爆闪；限定在一天内过渡即可避免。
//
// During flight the scene clock follows: the target calendar day snaps instantly and
// only the time-of-day animates. Interpolating the full timestamp frame-by-frame spans
// months/years, advancing several days per frame so the sun phase cycles repeatedly
// between frames — visible as rapid day/night flicker. Staying within one day avoids it.
function tweenClockTo(target: Date, durationSeconds: number, flightId: number) {
  stopTimeTween()

  const startOfDay = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate()
  )
  const secondsOf = (d: Date) =>
    d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()
  const startSeconds = secondsOf(viewer.clock.currentTime)
  const targetSeconds = secondsOf(target)

  // 取一天内跨午夜的较短方向，与相机姿态的最短角差一致。
  // Shorter direction across midnight, matching the camera's shortest-angle delta.
  let delta = targetSeconds - startSeconds
  if (delta > SECONDS_PER_DAY / 2) delta -= SECONDS_PER_DAY
  else if (delta < -SECONDS_PER_DAY / 2) delta += SECONDS_PER_DAY

  // 起点：目标日期 + 当前的时分秒（日期瞬间切换）。
  // Start: target day at the current time-of-day (the day snaps over).
  viewer.clock.setCurrentTime(new Date(startOfDay + startSeconds * 1000))

  if (delta === 0 || durationSeconds <= 0) {
    viewer.clock.setCurrentTime(target)
    return
  }

  const startedAt = performance.now()
  const durationMs = durationSeconds * 1000
  const step = (now: number) => {
    if (flightId !== activeFlightId) return
    const raw = Math.min(Math.max((now - startedAt) / durationMs, 0), 1)
    if (raw >= 1) {
      viewer.clock.setCurrentTime(target)
      timeTweenId = null
      return
    }
    // 与相机飞行一致的 easeInOutCubic 缓动，在目标当天内推进时分秒。
    // easeInOutCubic matching the camera flight, advancing time-of-day within the target day.
    const eased =
      raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2
    viewer.clock.setCurrentTime(
      new Date(startOfDay + (startSeconds + delta * eased) * 1000)
    )
    timeTweenId = requestAnimationFrame(step)
  }
  timeTweenId = requestAnimationFrame(step)
}

const SENSOR_HEIGHT_MM = 24 // 35mm 全画幅传感器高度，用于焦距↔垂直视场角换算

// 焦距（35mm 等效，毫米）↔ 垂直视场角（度）换算。
// Convert between focal length (35mm-equivalent, mm) and vertical FOV (degrees).
function focalLengthToFov(focalLengthMm: number): number {
  const f = Math.max(1, focalLengthMm)
  return (2 * Math.atan(SENSOR_HEIGHT_MM / (2 * f)) * 180) / Math.PI
}

function fovToFocalLength(fovDeg: number): number {
  const fov = Math.max(1, fovDeg)
  return SENSOR_HEIGHT_MM / (2 * Math.tan((fov * Math.PI) / 360))
}

let focalTweenId: number | null = null

function stopFocalTween() {
  if (focalTweenId !== null) {
    cancelAnimationFrame(focalTweenId)
    focalTweenId = null
  }
}

function setFocalLength(focalLengthMm: number) {
  const camera = viewer.camera.threeCamera
  camera.fov = focalLengthToFov(focalLengthMm)
  camera.updateProjectionMatrix()
}

// 随飞行进度同步插值相机焦距（视场角），与相机/时钟过渡共用同一缓动与时长。
// Interpolate the camera focal length (FOV) in step with the flight, sharing its easing and duration.
function tweenFocalLengthTo(
  targetFocalLength: number,
  durationSeconds: number,
  flightId: number
) {
  stopFocalTween()
  const startFocalLength = fovToFocalLength(viewer.camera.threeCamera.fov)
  const delta = targetFocalLength - startFocalLength
  if (delta === 0 || durationSeconds <= 0) {
    setFocalLength(targetFocalLength)
    return
  }
  const startedAt = performance.now()
  const durationMs = durationSeconds * 1000
  const step = (now: number) => {
    if (flightId !== activeFlightId) return
    const raw = Math.min(Math.max((now - startedAt) / durationMs, 0), 1)
    if (raw >= 1) {
      setFocalLength(targetFocalLength)
      focalTweenId = null
      return
    }
    const eased =
      raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2
    setFocalLength(startFocalLength + delta * eased)
    focalTweenId = requestAnimationFrame(step)
  }
  focalTweenId = requestAnimationFrame(step)
}

function flyToDestination(destination: FlightDestination) {
  const flightId = ++activeFlightId
  const { label, datetime, focalLength, duration, ...flyOptions } = destination
  setStatus(t({ zh: "正在飞往{label}...", en: "Flying to {label}..." }, { label }))

  if (datetime) {
    if (duration && duration > 0) {
      tweenClockTo(datetime, duration, flightId)
    } else {
      stopTimeTween()
      viewer.clock.setCurrentTime(datetime)
    }
  } else {
    stopTimeTween()
  }

  if (focalLength) {
    if (duration && duration > 0) {
      tweenFocalLengthTo(focalLength, duration, flightId)
    } else {
      stopFocalTween()
      setFocalLength(focalLength)
    }
  } else {
    stopFocalTween()
  }

  viewer.camera.flyTo({
    ...flyOptions,
    duration,
    complete: () => {
      if (flightId !== activeFlightId) return
      stopTimeTween()
      stopFocalTween()
      if (datetime) viewer.clock.setCurrentTime(datetime)
      if (focalLength) setFocalLength(focalLength)
      setStatus(t({ zh: "已抵达{label}。", en: "Arrived at {label}." }, { label }))
    },
    cancel: () => {
      if (flightId !== activeFlightId) return
      stopTimeTween()
      stopFocalTween()
      setStatus(t({ zh: "飞行已取消。", en: "Flight cancelled." }))
    },
  })
}

// 按配置生成目的地按钮：按钮名称与飞行参数均来自顶层 DESTINATIONS 配置。
// Generate destination buttons from the top-level DESTINATIONS config.
DESTINATIONS.forEach((destination) => {
  if (!destinationRow) return
  const button = document.createElement("button")
  button.type = "button"
  button.className = "example-panel__button"
  button.textContent = destination.label
  button.addEventListener("click", () => flyToDestination(destination))
  destinationRow.appendChild(button)
})

cancelButton?.addEventListener("click", () => {
  viewer.camera.cancelFlight()
})

window.addEventListener("beforeunload", () => {
  stopTimeTween()
  stopFocalTween()
  viewer.destroy()
})
