import type { Viewer, ViewerMouseMoveEvent } from "../src"

export interface LocationReadoutOptions {
  parent: HTMLElement
  title?: string
  ariaLabel?: string
}

export interface LocationReadoutHandle {
  element: HTMLElement
  destroy: () => void
}

export function mountLocationReadout(
  viewer: Viewer,
  options: LocationReadoutOptions
): LocationReadoutHandle {
  const panel = document.createElement("section")
  panel.className = "location-panel"
  panel.setAttribute(
    "aria-label",
    options.ariaLabel ?? "Mouse position readout"
  )

  const title = document.createElement("h2")
  title.textContent = options.title ?? "鼠标位置"

  const readout = document.createElement("dl")
  readout.className = "location-readout"

  const longitude = createReadoutItem(readout, "经度")
  const latitude = createReadoutItem(readout, "纬度")
  const height = createReadoutItem(readout, "高程")

  panel.append(title, readout)
  options.parent.append(panel)

  const update = (event: ViewerMouseMoveEvent) => {
    longitude.textContent = event.cartographic
      ? event.cartographic.longitude.toFixed(6)
      : "-"
    latitude.textContent = event.cartographic
      ? event.cartographic.latitude.toFixed(6)
      : "-"
    height.textContent = event.cartographic
      ? formatHeight(event.cartographic.height)
      : "-"
  }

  viewer.on("mousemove", update)

  return {
    element: panel,
    destroy: () => {
      viewer.off("mousemove", update)
      panel.remove()
    },
  }
}

export function formatHeight(height: number) {
  return Math.abs(height) < 0.05 ? "0.0" : height.toFixed(1)
}

function createReadoutItem(readout: HTMLElement, label: string) {
  const term = document.createElement("dt")
  term.textContent = label

  const value = document.createElement("dd")
  value.textContent = "-"

  readout.append(term, value)
  return value
}
