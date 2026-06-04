import { createTelluxViewer } from './shared'

const container = document.querySelector('#viewer')
const skyToggle = document.querySelector<HTMLInputElement>('#sky-toggle')
const cloudToggle = document.querySelector<HTMLInputElement>('#cloud-toggle')
const timeRange = document.querySelector<HTMLInputElement>('#time-range')
const coverageRange = document.querySelector<HTMLInputElement>('#coverage-range')
const cloudAltitudeRange = document.querySelector<HTMLInputElement>('#cloud-altitude-range')
const cloudHeightRange = document.querySelector<HTMLInputElement>('#cloud-height-range')
const resolutionRange = document.querySelector<HTMLInputElement>('#resolution-range')
const exposureRange = document.querySelector<HTMLInputElement>('#exposure-range')
const status = document.querySelector<HTMLElement>('#atmosphere-status')
const pacificButton = document.querySelector<HTMLButtonElement>('#pacific')
const himalayaButton = document.querySelector<HTMLButtonElement>('#himalaya')

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

if (
  !skyToggle ||
  !cloudToggle ||
  !timeRange ||
  !coverageRange ||
  !cloudAltitudeRange ||
  !cloudHeightRange ||
  !resolutionRange ||
  !exposureRange ||
  !pacificButton ||
  !himalayaButton
) {
  throw new Error('Atmosphere controls not found.')
}

const viewer = createTelluxViewer(container, {
  camera: {
    latitude: 22.8,
    longitude: 151.4,
    height: 760000,
    heading: -55,
    pitch: -38,
    far: 8000000
  },
  scene: {
    clouds: true,
    skyAtmosphere: true,
    cloudCoverage: Number(coverageRange.value),
    toneMappingExposure: Number(exposureRange.value),
    lensFlare: true,
    smaa: true
  },
  resolutionScale: Number(resolutionRange.value)
})

viewer.clock.hourUTC = Number(timeRange.value)
viewer.scene.cloudLayerAltitude = Number(cloudAltitudeRange.value)
viewer.scene.cloudLayerHeight = Number(cloudHeightRange.value)

function formatHour(value: number) {
  const hour = Math.floor(value)
  const minute = Math.round((value - hour) * 60)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function updateStatus() {
  if (!status) return

  status.textContent =
    `UTC ${formatHour(viewer.clock.hourUTC)} / 云量 ${viewer.scene.cloudCoverage.toFixed(2)} / ` +
    `低云云底 ${Math.round(viewer.scene.cloudLayerAltitude)}m / 低云厚度 ${Math.round(viewer.scene.cloudLayerHeight)}m / ` +
    `像素 ${viewer.resolutionScale.toFixed(2)}x / 曝光 ${viewer.toneMappingExposure.toFixed(1)}`
}

function applyControls() {
  viewer.scene.skyAtmosphere.show = skyToggle.checked
  viewer.scene.clouds.show = cloudToggle.checked
  viewer.clock.hourUTC = Number(timeRange.value)
  viewer.scene.cloudCoverage = Number(coverageRange.value)
  viewer.scene.cloudLayerAltitude = Number(cloudAltitudeRange.value)
  viewer.scene.cloudLayerHeight = Number(cloudHeightRange.value)
  viewer.resolutionScale = Number(resolutionRange.value)
  viewer.toneMappingExposure = Number(exposureRange.value)
  updateStatus()
}

skyToggle.addEventListener('change', applyControls)
cloudToggle.addEventListener('change', applyControls)
timeRange.addEventListener('input', applyControls)
coverageRange.addEventListener('input', applyControls)
cloudAltitudeRange.addEventListener('input', applyControls)
cloudHeightRange.addEventListener('input', applyControls)
resolutionRange.addEventListener('input', applyControls)
exposureRange.addEventListener('input', applyControls)

pacificButton.addEventListener('click', () => {
  viewer.flyTo({
    destination: {
      latitude: 22.8,
      longitude: 151.4,
      height: 760000
    },
    orientation: {
      heading: -55,
      pitch: -38
    }
  })
})

himalayaButton.addEventListener('click', () => {
  viewer.flyTo({
    destination: {
      latitude: 28.1,
      longitude: 86.9,
      height: 340000
    },
    orientation: {
      heading: -95,
      pitch: -32
    }
  })
})

applyControls()

window.addEventListener('beforeunload', () => {
  viewer.destroy()
})
