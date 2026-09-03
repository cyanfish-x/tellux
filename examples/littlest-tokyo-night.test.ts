import { describe, expect, it } from "vitest"
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three"
import {
  computeLittlestTokyoLightOffset,
  computeSunAltitudeAtLocation,
  isNightLightsOn,
  pointLightIntensityForModelScale,
  resolveLittlestTokyoLightParent,
  setupLittlestTokyoNightRig,
} from "./littlest-tokyo-night"

const MODEL_LONGITUDE = 113.9958
const MODEL_LATITUDE = 30.0072

describe("littlest-tokyo-night", () => {
  it("toggles window lights with the upstream binary threshold", () => {
    const wuhanEvening = new Date(Date.UTC(2026, 8, 2, 11, 0, 0))
    const wuhanLateNight = new Date(Date.UTC(2026, 8, 2, 14, 0, 0))
    const wuhanMorning = new Date(Date.UTC(2026, 8, 2, 23, 0, 0))
    const wuhanNoon = new Date(Date.UTC(2026, 8, 2, 4, 0, 0))

    expect(
      isNightLightsOn(
        computeSunAltitudeAtLocation(MODEL_LONGITUDE, MODEL_LATITUDE, wuhanEvening)
      )
    ).toBe(1)
    expect(
      isNightLightsOn(
        computeSunAltitudeAtLocation(MODEL_LONGITUDE, MODEL_LATITUDE, wuhanLateNight)
      )
    ).toBe(1)
    expect(
      isNightLightsOn(
        computeSunAltitudeAtLocation(MODEL_LONGITUDE, MODEL_LATITUDE, wuhanMorning)
      )
    ).toBe(0)
    expect(
      isNightLightsOn(
        computeSunAltitudeAtLocation(MODEL_LONGITUDE, MODEL_LATITUDE, wuhanNoon)
      )
    ).toBe(0)
  })

  it("scales point-light intensity with model scale squared against the upstream 0.01 / 0.1 anchor", () => {
    expect(pointLightIntensityForModelScale(0.01)).toBeCloseTo(0.1)
    expect(pointLightIntensityForModelScale(0.45)).toBeCloseTo(0.1 * (0.45 / 0.01) ** 2)
  })

  it("parents lantern lights under the scaled glTF scene, not the unscaled layer root", () => {
    const layerRoot = new Group()
    const model = new Group()
    model.scale.setScalar(0.45)
    layerRoot.add(model)

    expect(resolveLittlestTokyoLightParent(layerRoot)).toBe(model)
    expect(resolveLittlestTokyoLightParent(model)).toBe(model)
  })

  it("subtracts the upstream scene offset so authored lantern coords land in unshifted glTF space", () => {
    const model = new Group()
    model.scale.setScalar(0.45)
    model.add(new Mesh(new BoxGeometry(200, 100, 200), new MeshStandardMaterial()))
    model.updateMatrixWorld(true)

    const offset = computeLittlestTokyoLightOffset(model)
    expect(offset.x).toBeCloseTo(0)
    expect(offset.y).toBeCloseTo(50 - 12)
    expect(offset.z).toBeCloseTo(0)

    const shifted = new Group()
    shifted.scale.setScalar(0.45)
    const mesh = new Mesh(new BoxGeometry(200, 100, 200), new MeshStandardMaterial())
    mesh.position.set(40, 0, -20)
    shifted.add(mesh)
    shifted.updateMatrixWorld(true)
    const shiftedOffset = computeLittlestTokyoLightOffset(shifted)
    expect(shiftedOffset.x).toBeCloseTo(-40)
    expect(shiftedOffset.z).toBeCloseTo(20)

    const rig = setupLittlestTokyoNightRig(model, new Texture())
    const red = rig.lights[0]
    expect(red.position.x).toBeCloseTo(95 - offset.x)
    expect(red.position.y).toBeCloseTo(115 - offset.y)
    expect(red.position.z).toBeCloseTo(29 - offset.z)
    rig.dispose()
  })
})
