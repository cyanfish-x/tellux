import { createTelluxViewer, showTokenNotice } from './shared'
import type { ViewerClickEvent } from '../src'

const container = document.querySelector('#viewer')
const tokenStatus = document.querySelector<HTMLElement>('#token-status')
const clickX = document.querySelector<HTMLElement>('#click-x')
const clickY = document.querySelector<HTMLElement>('#click-y')
const clickLongitude = document.querySelector<HTMLElement>('#click-longitude')
const clickLatitude = document.querySelector<HTMLElement>('#click-latitude')
const clickHeight = document.querySelector<HTMLElement>('#click-height')
const clickCount = document.querySelector<HTMLElement>('#click-count')
const clearButton = document.querySelector('#clear')

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

showTokenNotice(tokenStatus)

const viewer = createTelluxViewer(container, {
  camera: {
    latitude: 35.6812,
    longitude: 139.8,
    height: 800,
    heading: -90,
    pitch: -15
  },
  scene: {
    clouds: false,
    lensFlare: false,
    toneMappingExposure: 7
  }
})

let count = 0

function updateClickReadout(event: ViewerClickEvent) {
  count += 1
  if (clickX) clickX.textContent = event.position.x.toFixed(1)
  if (clickY) clickY.textContent = event.position.y.toFixed(1)
  if (clickLongitude) clickLongitude.textContent = event.cartographic ? event.cartographic.longitude.toFixed(6) : '-'
  if (clickLatitude) clickLatitude.textContent = event.cartographic ? event.cartographic.latitude.toFixed(6) : '-'
  if (clickHeight) clickHeight.textContent = event.cartographic ? event.cartographic.height.toFixed(1) : '-'
  if (clickCount) clickCount.textContent = String(count)
}

viewer.on('click', updateClickReadout)

clearButton?.addEventListener('click', () => {
  count = 0
  if (clickX) clickX.textContent = '-'
  if (clickY) clickY.textContent = '-'
  if (clickLongitude) clickLongitude.textContent = '-'
  if (clickLatitude) clickLatitude.textContent = '-'
  if (clickHeight) clickHeight.textContent = '-'
  if (clickCount) clickCount.textContent = '0'
})

window.addEventListener('beforeunload', () => {
  viewer.off('click', updateClickReadout)
  viewer.destroy()
})
