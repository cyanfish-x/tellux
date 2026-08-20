import { setupExamplePanels } from './example-panel'
import { bootExampleI18n } from './i18n'
import {
  createRiyueBayOceanDemo,
  mountRiyueBayOceanControls
} from './ocean'

bootExampleI18n()

const status = document.querySelector<HTMLElement>('#ocean-status')
const controls = document.querySelector<HTMLElement>('#ocean-controls')
if (!controls) throw new Error('Ocean control panel was not found.')

function setStatus(message: string) {
  if (status) status.textContent = message
}

let destroyDemo: (() => void) | undefined

void createRiyueBayOceanDemo('viewer', { onStatus: setStatus })
  .then((demo) => {
    destroyDemo = demo.destroy
    mountRiyueBayOceanControls(controls, demo)
    setupExamplePanels()
    ;(window as Window & { viewer?: unknown, ocean?: unknown }).viewer = demo.viewer
    ;(window as Window & { viewer?: unknown, ocean?: unknown }).ocean = demo.ocean
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    setStatus(message)
    console.error(error)
  })

window.addEventListener('beforeunload', () => destroyDemo?.())
