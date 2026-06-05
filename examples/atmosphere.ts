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

const skyToggleControl = skyToggle
const cloudToggleControl = cloudToggle
const timeRangeControl = timeRange
const coverageRangeControl = coverageRange
const cloudAltitudeRangeControl = cloudAltitudeRange
const cloudHeightRangeControl = cloudHeightRange
const resolutionRangeControl = resolutionRange
const exposureRangeControl = exposureRange
const pacificControl = pacificButton
const himalayaControl = himalayaButton

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
    cloudCoverage: Number(coverageRangeControl.value),
    toneMappingExposure: Number(exposureRangeControl.value),
    lensFlare: true,
    smaa: true
  },
  resolutionScale: Number(resolutionRangeControl.value)
})

viewer.clock.hourUTC = Number(timeRangeControl.value)
viewer.scene.cloudLayerAltitude = Number(cloudAltitudeRangeControl.value)
viewer.scene.cloudLayerHeight = Number(cloudHeightRangeControl.value)

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
  viewer.scene.skyAtmosphere.show = skyToggleControl.checked
  viewer.scene.clouds.show = cloudToggleControl.checked
  viewer.clock.hourUTC = Number(timeRangeControl.value)
  viewer.scene.cloudCoverage = Number(coverageRangeControl.value)
  viewer.scene.cloudLayerAltitude = Number(cloudAltitudeRangeControl.value)
  viewer.scene.cloudLayerHeight = Number(cloudHeightRangeControl.value)
  viewer.resolutionScale = Number(resolutionRangeControl.value)
  viewer.toneMappingExposure = Number(exposureRangeControl.value)
  updateStatus()
}

skyToggleControl.addEventListener('change', applyControls)
cloudToggleControl.addEventListener('change', applyControls)
timeRangeControl.addEventListener('input', applyControls)
coverageRangeControl.addEventListener('input', applyControls)
cloudAltitudeRangeControl.addEventListener('input', applyControls)
cloudHeightRangeControl.addEventListener('input', applyControls)
resolutionRangeControl.addEventListener('input', applyControls)
exposureRangeControl.addEventListener('input', applyControls)

pacificControl.addEventListener('click', () => {
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

himalayaControl.addEventListener('click', () => {
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
