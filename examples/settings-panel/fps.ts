import type { Viewer } from "../../src"

export function mountFpsHud(
  viewer: Viewer,
  shell: HTMLElement,
  isVisible: boolean
) {
  const hud = document.createElement("div")
  hud.className = "example-fps"
  hud.textContent = "-- fps"
  hud.hidden = !isVisible
  shell.appendChild(hud)

  const render = viewer.render.bind(viewer)
  let frames = 0
  let lastSampleTime = performance.now()

  viewer.render = (time = performance.now()) => {
    const deltaTime = render(time)
    frames += 1

    const elapsed = time - lastSampleTime
    if (elapsed >= 500) {
      hud.textContent = `${Math.round((frames * 1000) / elapsed)} fps`
      frames = 0
      lastSampleTime = time
    }

    return deltaTime
  }

  return {
    setVisible(value: boolean) {
      hud.hidden = !value
    },
    dispose() {
      viewer.render = render
      hud.remove()
    },
  }
}
