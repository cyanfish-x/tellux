import tellux from "../src"
import { bootExampleI18n, t } from "./i18n"
import { createTelluxPanel, type TelluxPanel } from "./example-panel-leva"
import { exampleMapServiceConfig, getTokenNoticeMessage } from "./shared"
import type { CameraFlyToOptions } from "../src"

bootExampleI18n()

/**
 * 飞行目的地顶层配置：按钮名称、飞行参数（位置、姿态）与目标时刻
 * （datetime，北京时间，内部换算为 UTC 供太阳方向计算）均从此处读取。
 * 飞行时长由面板调节。页面按钮由该配置动态生成，新增目的地只需在此追加一项。
 *
 * Top-level flight destinations: button labels, flight params (position,
 * orientation) and target time (datetime, Beijing time, converted to UTC
 * for sun-direction computation) are all read from here. Flight duration is
 * controlled by the panel. Buttons are generated from this list, so adding a
 * destination is just appending an entry.
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

function getDestinations(): FlightDestination[] {
  return [
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
      datetime: beijingTime(2024, 7, 15, 17, 30, 0),
      focalLength: 15,
    },
    {
      label: t({
        zh: "桂林-千里江山图",
        en: "Guilin – A Thousand Miles of Rivers and Mountains",
      }),
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
      datetime: beijingTime(2024, 4, 15, 18, 40, 30),
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
      datetime: beijingTime(2024, 9, 15, 19, 35, 0),
      focalLength: 80,
    },
  ]
}

const container = document.querySelector("#viewer")

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

const viewer = new tellux.Viewer(container, {
  terrain: exampleMapServiceConfig.createTerrainOptions(),
  overlays: [
    {
      source: exampleMapServiceConfig.createImagerySource(),
    },
  ],
  camera: {
    destination: {
      longitude: 103,
      latitude: 30,
      height: 1500000,
    },
    orientation: {
      heading: 0,
      pitch: -32,
    },
  },
  scene: {
    clouds: {
      coverage: 0.2,
    },
  },
})

;(window as any).viewer = viewer

let panel: TelluxPanel<ReturnType<typeof flyToSchema>> | undefined

function setStatus(message: string) {
  panel?.setStatus(message)
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

  let delta = targetSeconds - startSeconds
  if (delta > SECONDS_PER_DAY / 2) delta -= SECONDS_PER_DAY
  else if (delta < -SECONDS_PER_DAY / 2) delta += SECONDS_PER_DAY

  viewer.clock.currentTime = new Date(startOfDay + startSeconds * 1000)

  if (delta === 0 || durationSeconds <= 0) {
    viewer.clock.currentTime = target
    return
  }

  const startedAt = performance.now()
  const durationMs = durationSeconds * 1000
  const step = (now: number) => {
    if (flightId !== activeFlightId) return
    const raw = Math.min(Math.max((now - startedAt) / durationMs, 0), 1)
    if (raw >= 1) {
      viewer.clock.currentTime = target
      timeTweenId = null
      return
    }
    const eased =
      raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2
    viewer.clock.currentTime =
      new Date(startOfDay + (startSeconds + delta * eased) * 1000)
    timeTweenId = requestAnimationFrame(step)
  }
  timeTweenId = requestAnimationFrame(step)
}

const SENSOR_HEIGHT_MM = 24

function focalLengthToFov(focalLengthMm: number): number {
  const f = Math.max(1, focalLengthMm)
  return (2 * Math.atan(SENSOR_HEIGHT_MM / (2 * f)) * 180) / Math.PI
}

function fovToFocalLength(fovDeg: number): number {
  const fov = Math.max(1, fovDeg)
  return SENSOR_HEIGHT_MM / (2 * Math.tan((fov * Math.PI) / 360))
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function wrapHeading(deg: number) {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

function valuesClose(a: number, b: number, epsilon: number) {
  return Math.abs(a - b) <= epsilon
}

let focalTweenId: number | null = null

function stopFocalTween() {
  if (focalTweenId !== null) {
    cancelAnimationFrame(focalTweenId)
    focalTweenId = null
  }
}

function setFocalLength(focalLengthMm: number) {
  const camera = viewer.camera.raw
  camera.fov = focalLengthToFov(focalLengthMm)
  camera.updateProjectionMatrix()
}

function tweenFocalLengthTo(
  targetFocalLength: number,
  durationSeconds: number,
  flightId: number
) {
  stopFocalTween()
  const startFocalLength = fovToFocalLength(viewer.camera.raw.fov)
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

function readFlightControls() {
  const flight = panel?.controls.flight
  return {
    duration: flight?.duration ?? 4,
    maximumHeight: flight?.maximumHeight ?? 0,
  }
}

function flyToDestination(destination: FlightDestination) {
  const flightId = ++activeFlightId
  const { label, datetime, focalLength, ...flyOptions } = destination
  const { duration, maximumHeight } = readFlightControls()
  setStatus(t({ zh: "正在飞往{label}...", en: "Flying to {label}..." }, { label }))

  if (datetime) {
    if (duration > 0) {
      tweenClockTo(datetime, duration, flightId)
    } else {
      stopTimeTween()
      viewer.clock.currentTime = datetime
    }
  } else {
    stopTimeTween()
  }

  if (focalLength) {
    if (duration > 0) {
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
    ...(maximumHeight > 0 ? { maximumHeight } : {}),
    complete: () => {
      if (flightId !== activeFlightId) return
      stopTimeTween()
      stopFocalTween()
      if (datetime) viewer.clock.currentTime = datetime
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

function buildDestinationButtons() {
  const buttons: Record<string, { onClick: () => void; label: string }> = {}
  for (const [index, destination] of getDestinations().entries()) {
    buttons[`dest${index}`] = {
      onClick: () => flyToDestination(destination),
      label: destination.label,
    }
  }
  return buttons
}

const INITIAL_FOV = viewer.camera.raw.fov
const INITIAL_FOCAL_LENGTH = roundTo(fovToFocalLength(INITIAL_FOV), 2)

const flyToSchema = () =>
  ({
    destination: {
      $: { label: t({ zh: "目的地", en: "Destinations" }) },
      hint: {
        type: "hint" as const,
        value: t({
          zh: "使用 viewer.camera.flyTo 触发 Cesium 风格的相机飞行动画。下方滑块可改当前镜头；拖动姿态会打断飞行。",
          en: "Use viewer.camera.flyTo for Cesium-style camera flight. Sliders below edit the current lens; dragging pose cancels flight.",
        }),
      },
      ...buildDestinationButtons(),
    },
    camera: {
      $: { label: t({ zh: "相机", en: "Camera" }) },
      hint: {
        type: "hint" as const,
        value: t({
          zh: "FOV 为垂直视场角。焦距按 35mm 全画幅、传感器高度 24mm 换算，与目的地预设相同。",
          en: "FOV is vertical. Focal length uses a 35mm full-frame 24mm-tall sensor, same as destination presets.",
        }),
      },
      fov: {
        value: roundTo(INITIAL_FOV, 2),
        min: 10,
        max: 120,
        step: 0.1,
        label: t({ zh: "FOV (°)", en: "FOV (°)" }),
      },
      focalLength: {
        value: INITIAL_FOCAL_LENGTH,
        min: 8,
        max: 200,
        step: 0.1,
        label: t({ zh: "焦距 (mm)", en: "Focal length (mm)" }),
      },
      heading: {
        value: 0,
        min: -180,
        max: 180,
        step: 0.1,
        label: t({ zh: "航向 (°)", en: "Heading (°)" }),
      },
      pitch: {
        value: -32,
        min: -89,
        max: 89,
        step: 0.1,
        label: t({ zh: "俯仰 (°)", en: "Pitch (°)" }),
      },
      height: {
        value: 1500000,
        min: 1,
        step: 1,
        label: t({ zh: "高度 (m)", en: "Height (m)" }),
      },
      longitude: {
        type: "hint" as const,
        label: t({ zh: "经度", en: "Longitude" }),
        value: "103.000000°",
      },
      latitude: {
        type: "hint" as const,
        label: t({ zh: "纬度", en: "Latitude" }),
        value: "30.000000°",
      },
    },
    flight: {
      $: { label: t({ zh: "飞行", en: "Flight" }) },
      duration: {
        value: 4,
        min: 0,
        max: 12,
        step: 0.1,
        label: t({ zh: "时长 (秒)", en: "Duration (s)" }),
      },
      maximumHeight: {
        value: 0,
        min: 0,
        step: 1000,
        label: t({ zh: "最高高度 (m，0=自动)", en: "Max height (m, 0=auto)" }),
      },
      allowUnderground: {
        value: false,
        label: t({ zh: "允许地下", en: "Allow underground" }),
      },
    },
    actions: {
      $: { label: t({ zh: "操作", en: "Actions" }) },
      cancel: {
        onClick: () => viewer.camera.cancelFlight(),
        label: t({ zh: "取消飞行", en: "Cancel flight" }),
      },
    },
    status: {
      $: { label: t({ zh: "状态", en: "Status" }) },
      token: {
        type: "hint" as const,
        value: getTokenNoticeMessage(),
      },
      flight: {
        type: "hint" as const,
        value: t({
          zh: "选择一个目的地开始飞行。",
          en: "Pick a destination to start flying.",
        }),
      },
    },
  }) as const

let suppressCameraApply = false

function syncPanelFromCamera(
  currentPanel: TelluxPanel<ReturnType<typeof flyToSchema>>
) {
  const state = viewer.camera.getState()
  const fov = viewer.camera.raw.fov
  const camera = currentPanel.controls.camera
  suppressCameraApply = true
  camera.fov = roundTo(fov, 2)
  camera.focalLength = roundTo(fovToFocalLength(fov), 2)
  camera.heading = roundTo(wrapHeading(state.orientation.heading), 2)
  camera.pitch = roundTo(state.orientation.pitch, 2)
  camera.height = roundTo(state.destination.height, 1)
  camera.longitude = `${state.destination.longitude.toFixed(6)}°`
  camera.latitude = `${state.destination.latitude.toFixed(6)}°`
  suppressCameraApply = false
}

function applyCameraFromPanel(
  currentPanel: TelluxPanel<ReturnType<typeof flyToSchema>>
) {
  if (suppressCameraApply) return

  const camera = currentPanel.controls.camera
  const threeCam = viewer.camera.raw
  const currentFov = threeCam.fov
  const currentFocalLength = fovToFocalLength(currentFov)
  const fovChanged = !valuesClose(camera.fov, currentFov, 0.05)
  const focalChanged = !valuesClose(camera.focalLength, currentFocalLength, 0.05)

  if (fovChanged || focalChanged) {
    stopFocalTween()
    const nextFov = focalChanged && !fovChanged
      ? focalLengthToFov(camera.focalLength)
      : camera.fov
    threeCam.fov = nextFov
    threeCam.updateProjectionMatrix()
    suppressCameraApply = true
    camera.fov = roundTo(nextFov, 2)
    camera.focalLength = roundTo(fovToFocalLength(nextFov), 2)
    suppressCameraApply = false
  }

  const state = viewer.camera.getState()
  const nextHeading = wrapHeading(camera.heading)
  const poseChanged =
    !valuesClose(nextHeading, wrapHeading(state.orientation.heading), 0.05) ||
    !valuesClose(camera.pitch, state.orientation.pitch, 0.05) ||
    !valuesClose(camera.height, state.destination.height, Math.max(1, Math.abs(state.destination.height) * 1e-4))

  if (!poseChanged) return

  viewer.camera.setView({
    destination: {
      longitude: state.destination.longitude,
      latitude: state.destination.latitude,
      height: camera.height,
    },
    orientation: {
      heading: nextHeading,
      pitch: camera.pitch,
      roll: state.orientation.roll,
    },
  })
}

function bindPanelInteractions(
  currentPanel: TelluxPanel<ReturnType<typeof flyToSchema>>
) {
  const { controls } = currentPanel
  const root = currentPanel.root
  const cleanups: Array<() => void> = []
  let poseSyncFrame = 0
  let panelPointerDown = false

  const isEditingPanel = () =>
    panelPointerDown || root.contains(document.activeElement)

  const onPointerDown = () => {
    panelPointerDown = true
  }
  const onPointerUp = () => {
    panelPointerDown = false
  }

  root.addEventListener("pointerdown", onPointerDown)
  window.addEventListener("pointerup", onPointerUp)
  window.addEventListener("pointercancel", onPointerUp)
  cleanups.push(() => {
    root.removeEventListener("pointerdown", onPointerDown)
    window.removeEventListener("pointerup", onPointerUp)
    window.removeEventListener("pointercancel", onPointerUp)
  })

  syncPanelFromCamera(currentPanel)

  cleanups.push(
    controls.effect(() => {
      void controls.camera.fov
      void controls.camera.focalLength
      void controls.camera.heading
      void controls.camera.pitch
      void controls.camera.height
      applyCameraFromPanel(currentPanel)
    })
  )

  cleanups.push(
    controls.effect(() => {
      viewer.camera.allowUnderground = controls.flight.allowUnderground
    })
  )

  const syncPose = () => {
    poseSyncFrame = requestAnimationFrame(syncPose)
    if (isEditingPanel()) return
    syncPanelFromCamera(currentPanel)
  }
  poseSyncFrame = requestAnimationFrame(syncPose)
  cleanups.push(() => cancelAnimationFrame(poseSyncFrame))

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}

panel = createTelluxPanel(flyToSchema, {
  id: "fly-to-panel",
  title: () => t({ zh: "相机飞行", en: "Camera fly-to" }),
  statusPath: "status.flight",
  onRebuild: bindPanelInteractions,
})

window.addEventListener("beforeunload", () => {
  stopTimeTween()
  stopFocalTween()
  panel?.dispose()
  viewer.destroy()
})
