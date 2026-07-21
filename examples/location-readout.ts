import type { Viewer, ViewerMouseMoveEvent } from "../src"
import { t } from "./i18n"

export interface LocationReadoutOptions {
  parent: HTMLElement
  title?: string
  ariaLabel?: string
  position?: "left-bottom" | "right-bottom"
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
  panel.className =
    options.position === "left-bottom"
      ? "location-panel location-panel--left"
      : "location-panel"
  panel.setAttribute(
    "aria-label",
    options.ariaLabel ?? "Mouse position readout"
  )

  const title = document.createElement("h2")
  title.textContent = options.title ?? t("common.location.title")

  const readout = document.createElement("dl")
  readout.className = "location-readout"

  const longitude = createReadoutItem(readout, t("common.location.longitude"))
  const latitude = createReadoutItem(readout, t("common.location.latitude"))
  const height = createReadoutItem(readout, t("common.location.height"))

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
