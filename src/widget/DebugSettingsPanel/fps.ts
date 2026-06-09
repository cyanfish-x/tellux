export function mountDebugFpsHud(shell: HTMLElement, isVisible: boolean) {
  const hud = document.createElement("div")
  hud.className = "tellux-debug-fps"
  hud.textContent = "-- fps"
  hud.hidden = !isVisible
  shell.appendChild(hud)

  let frames = 0
  let lastSampleTime = performance.now()

  return {
    setVisible(value: boolean) {
      hud.hidden = !value
    },
    update(time = performance.now()) {
      frames += 1

      const elapsed = time - lastSampleTime
      if (elapsed >= 500) {
        hud.textContent = `${Math.round((frames * 1000) / elapsed)} fps`
        frames = 0
        lastSampleTime = time
      }
    },
    dispose() {
      hud.remove()
    },
  }
}
