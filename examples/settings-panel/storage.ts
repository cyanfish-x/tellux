import type { ExampleSettingsPanelOptions } from "./types"

const EXAMPLE_SETTINGS_STORAGE_VERSION = "v1"

export function loadStoredExampleSettings(): ExampleSettingsPanelOptions {
  try {
    const stored = window.localStorage.getItem(getExampleSettingsStorageKey())
    if (!stored) return {}

    const parsed: unknown = JSON.parse(stored)
    if (!isRecord(parsed)) return {}

    return sanitizeStoredExampleSettings(parsed)
  } catch {
    return {}
  }
}

export function saveStoredExampleSettings(
  settings: ExampleSettingsPanelOptions
) {
  try {
    window.localStorage.setItem(
      getExampleSettingsStorageKey(),
      JSON.stringify(settings)
    )
  } catch {
    // Ignore storage failures in private browsing or quota-limited contexts.
  }
}

function getExampleSettingsStorageKey() {
  const page = window.location.pathname.replace(/\/$/, "/index.html")
  return `tellux:example-settings:${page}:${EXAMPLE_SETTINGS_STORAGE_VERSION}`
}

function sanitizeStoredExampleSettings(
  value: Record<string, unknown>
): ExampleSettingsPanelOptions {
  const settings: Record<string, unknown> = {}

  copyBooleanSetting(value, settings, "skyAtmosphere")
  copyBooleanSetting(value, settings, "clockAnimate")
  copyNumberSetting(value, settings, "clockMultiplier")
  copyBooleanSetting(value, settings, "clouds")
  copyNumberSetting(value, settings, "cloudCoverage")
  copyNumberSetting(value, settings, "cloudLayerAltitude")
  copyNumberSetting(value, settings, "cloudLayerHeight")
  copyNumberSetting(value, settings, "atmosphereInscatterIntensity")
  copyBooleanSetting(value, settings, "atmosphereInscatterHorizonBlend")
  copyBooleanSetting(value, settings, "atmosphereCorrectAltitude")
  copyBooleanSetting(value, settings, "atmosphereCorrectGeometricError")
  copyBooleanSetting(value, settings, "atmosphereTransmittance")
  copyBooleanSetting(value, settings, "atmosphereInscatter")
  copyAtmosphereLightingModeSetting(value, settings)
  copyBooleanSetting(value, settings, "atmosphereSunLight")
  copyBooleanSetting(value, settings, "atmosphereSkyLight")
  copyNumberSetting(value, settings, "atmosphereSunLightIntensity")
  copyNumberSetting(value, settings, "atmosphereSkyLightIntensity")
  copyBooleanSetting(value, settings, "fallbackAmbientLight")
  copyNumberSetting(value, settings, "fallbackAmbientLightIntensity")
  copyBooleanSetting(value, settings, "atmosphereSun")
  copyBooleanSetting(value, settings, "atmosphereMoon")
  copyBooleanSetting(value, settings, "atmosphereGround")
  copyNumberSetting(value, settings, "atmosphereAlbedoScale")
  copyNumberSetting(value, settings, "atmosphereSunAngularRadius")
  copyNumberSetting(value, settings, "atmosphereMoonAngularRadius")
  copyNumberSetting(value, settings, "atmosphereLunarRadianceScale")
  copyNumberSetting(value, settings, "atmosphereShadowRadius")
  copyNumberSetting(value, settings, "atmosphereShadowSampleCount")
  copyNumberSetting(value, settings, "atmosphereSolarIrradianceScale")
  copyNumberSetting(value, settings, "atmosphereRayleighScatteringScale")
  copyNumberSetting(value, settings, "atmosphereMieScatteringScale")
  copyNumberSetting(value, settings, "atmosphereMieExtinctionScale")
  copyNumberSetting(value, settings, "atmosphereMiePhaseFunctionG")
  copyNumberSetting(value, settings, "atmosphereAbsorptionExtinctionScale")
  copyNumberSetting(value, settings, "atmosphereGroundAlbedo")
  copyNumberSetting(value, settings, "toneMappingExposure")
  copyNumberSetting(value, settings, "resolutionScale")
  copyBooleanSetting(value, settings, "lensFlare")
  copyBooleanSetting(value, settings, "smaa")
  copyBooleanSetting(value, settings, "dithering")
  copyBooleanSetting(value, settings, "showFps")

  const horizonRange = value.atmosphereInscatterHorizonRange
  if (
    Array.isArray(horizonRange) &&
    horizonRange.length === 2 &&
    horizonRange.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry)
    )
  ) {
    settings.atmosphereInscatterHorizonRange = horizonRange
  }

  copyNumberSetting(value, settings, "dayOfYear")
  copyNumberSetting(value, settings, "hourUTC")

  return settings as ExampleSettingsPanelOptions
}

function copyBooleanSetting(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  key: keyof ExampleSettingsPanelOptions
) {
  const value = source[key]
  if (typeof value === "boolean") {
    target[key] = value
  }
}

function copyNumberSetting(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  key: keyof ExampleSettingsPanelOptions
) {
  const value = source[key]
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value
  }
}

function copyAtmosphereLightingModeSetting(
  source: Record<string, unknown>,
  target: Record<string, unknown>
) {
  if (
    source.atmosphereLightingMode === "post-process" ||
    source.atmosphereLightingMode === "light-source"
  ) {
    target.atmosphereLightingMode = source.atmosphereLightingMode
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
