import { bootExampleI18n } from "./i18n"
import { createLocalMeadowAtmosphereDemo } from "./atmosphere-local-meadow/createLocalMeadowAtmosphereDemo"

bootExampleI18n()

const container = document.querySelector("#viewer")
if (!(container instanceof HTMLElement)) {
  throw new Error("Viewer container not found.")
}

createLocalMeadowAtmosphereDemo(container)
