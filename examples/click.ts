import tellux from "../src"
import { createTelluxViewer } from "./shared"
import type { ViewerClickEvent, ViewerMouseMoveEvent } from "../src"

const container = document.querySelector("#viewer")
const tokenStatus = document.querySelector<HTMLElement>("#token-status")
const clickX = document.querySelector<HTMLElement>("#click-x")
const clickY = document.querySelector<HTMLElement>("#click-y")
const clickLongitude = document.querySelector<HTMLElement>("#click-longitude")
const clickLatitude = document.querySelector<HTMLElement>("#click-latitude")
const clickHeight = document.querySelector<HTMLElement>("#click-height")
const clickCount = document.querySelector<HTMLElement>("#click-count")
const mouseLongitude = document.querySelector<HTMLElement>("#mouse-longitude")
const mouseLatitude = document.querySelector<HTMLElement>("#mouse-latitude")
const mouseHeight = document.querySelector<HTMLElement>("#mouse-height")
const clearButton = document.querySelector("#clear")
const cesiumIonToken = import.meta.env.VITE_CESIUM_ION_TOKEN as
  | string
  | undefined

if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

if (tokenStatus) {
  tokenStatus.textContent = cesiumIonToken
    ? "当前示例使用 Cesium Ion 资源展示高程拾取。"
    : "未检测到 VITE_CESIUM_ION_TOKEN，Cesium Ion Resource 可能无法加载。"
}

const viewer = createTelluxViewer(container, {
  layers: [
    {
      source: tellux.CesiumIonResource.fromAssetId(2275207, {
        apiToken: cesiumIonToken ?? "",
      }),
    },
  ],
  camera: {
    latitude: 30.23008052218771,
    longitude: 102.79593627471901,
    height: 2689.4693767875888,
    heading: 85.73411020267382,
    pitch: -26.93261049458307,
    roll: -0.00007912632107520234,
  },
  scene: {
    clouds: false,
    lensFlare: false,
    toneMappingExposure: 7,
  },
})

let count = 0

function formatHeight(height: number) {
  return Math.abs(height) < 0.05 ? "0.0" : height.toFixed(1)
}

function updateClickReadout(event: ViewerClickEvent) {
  count += 1
  if (clickX) clickX.textContent = event.position.x.toFixed(1)
  if (clickY) clickY.textContent = event.position.y.toFixed(1)
  if (clickLongitude)
    clickLongitude.textContent = event.cartographic
      ? event.cartographic.longitude.toFixed(6)
      : "-"
  if (clickLatitude)
    clickLatitude.textContent = event.cartographic
      ? event.cartographic.latitude.toFixed(6)
      : "-"
  if (clickHeight)
    clickHeight.textContent = event.cartographic
      ? formatHeight(event.cartographic.height)
      : "-"
  if (clickCount) clickCount.textContent = String(count)
}

function updateMouseReadout(event: ViewerMouseMoveEvent) {
  if (mouseLongitude)
    mouseLongitude.textContent = event.cartographic
      ? event.cartographic.longitude.toFixed(6)
      : "-"
  if (mouseLatitude)
    mouseLatitude.textContent = event.cartographic
      ? event.cartographic.latitude.toFixed(6)
      : "-"
  if (mouseHeight)
    mouseHeight.textContent = event.cartographic
      ? formatHeight(event.cartographic.height)
      : "-"
}

viewer.on("click", updateClickReadout)
viewer.on("mousemove", updateMouseReadout)

clearButton?.addEventListener("click", () => {
  count = 0
  if (clickX) clickX.textContent = "-"
  if (clickY) clickY.textContent = "-"
  if (clickLongitude) clickLongitude.textContent = "-"
  if (clickLatitude) clickLatitude.textContent = "-"
  if (clickHeight) clickHeight.textContent = "-"
  if (clickCount) clickCount.textContent = "0"
})

window.addEventListener("beforeunload", () => {
  viewer.off("click", updateClickReadout)
  viewer.off("mousemove", updateMouseReadout)
  viewer.destroy()
})
