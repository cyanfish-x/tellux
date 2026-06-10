import tellux from '../src'
import { arcgisWorldImageryUrl, defaultTerrainUrl, showTokenNotice } from './shared'
import type { CameraFlyToOptions } from '../src'

const container = document.querySelector('#viewer')
const tokenStatus = document.querySelector<HTMLElement>('#token-status')
const flightStatus = document.querySelector<HTMLElement>('#flight-status')
const cancelButton = document.querySelector('#cancel-flight')

if (!(container instanceof HTMLElement)) {
  throw new Error('Viewer container not found.')
}

showTokenNotice(tokenStatus)

const viewer = new tellux.Viewer(container, {
  dracoDecoderPath: '/draco/gltf/',
  terrain: defaultTerrainUrl
    ? {
        url: defaultTerrainUrl
      }
    : undefined,
  layers: [
    {
      source: {
        type: 'xyz',
        url: arcgisWorldImageryUrl,
        levels: 19
      }
    }
  ],
  camera: {
    latitude: 35.6812,
    longitude: 139.8,
    height: 900,
    heading: -90,
    pitch: -14
  },
  scene: {
    clouds: {
      coverage: 0.2
    },
    postProcess: {
      toneMappingExposure: 8
    }
  }
})

;(window as any).viewer = viewer

const destinations: Record<string, CameraFlyToOptions & { label: string }> = {
  tokyo: {
    label: '东京',
    destination: {
      latitude: 35.6812,
      longitude: 139.8,
      height: 900
    },
    orientation: {
      heading: -90,
      pitch: -14
    },
    duration: 3
  },
  shanghai: {
    label: '上海',
    destination: {
      latitude: 31.2304,
      longitude: 121.4737,
      height: 1300
    },
    orientation: {
      heading: -78,
      pitch: -18
    },
    duration: 4
  },
  singapore: {
    label: '新加坡',
    destination: {
      latitude: 1.3521,
      longitude: 103.8198,
      height: 1800
    },
    orientation: {
      heading: -35,
      pitch: -20
    },
    duration: 5
  }
}

function setStatus(message: string) {
  if (flightStatus) flightStatus.textContent = message
}

document.querySelectorAll<HTMLElement>('[data-destination]').forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.destination
    if (!key) return

    const options = destinations[key]
    if (!options) return

    setStatus(`正在飞往${options.label}...`)
    viewer.camera.flyTo({
      ...options,
      complete: () => {
        setStatus(`已抵达${options.label}。`)
      },
      cancel: () => {
        setStatus('飞行已取消。')
      }
    })
  })
})

cancelButton?.addEventListener('click', () => {
  viewer.camera.cancelFlight()
})

window.addEventListener('beforeunload', () => {
  viewer.destroy()
})
