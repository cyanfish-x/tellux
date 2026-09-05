import type { DebugSettingsPanelOptions } from './types'

const DEBUG_SETTINGS_STORAGE_VERSION = 'v2'

export function loadStoredDebugSettings(): DebugSettingsPanelOptions {
  try {
    const stored = window.localStorage.getItem(getDebugSettingsStorageKey())
    if (!stored) return {}

    const parsed: unknown = JSON.parse(stored)
    if (!isRecord(parsed)) return {}

    return sanitizeStoredDebugSettings(parsed)
  } catch {
    return {}
  }
}

export function saveStoredDebugSettings(settings: DebugSettingsPanelOptions) {
  try {
    window.localStorage.setItem(
      getDebugSettingsStorageKey(),
      JSON.stringify(settings)
    )
  } catch {
    // Ignore storage failures in private browsing or quota-limited contexts.
  }
}

export function mergeDebugSettings(
  base: DebugSettingsPanelOptions,
  overlay: DebugSettingsPanelOptions
): DebugSettingsPanelOptions {
  return {
    atmosphere: deepMerge(base.atmosphere, overlay.atmosphere),
    clouds: deepMerge(base.clouds, overlay.clouds),
    postProcess: deepMerge(base.postProcess, overlay.postProcess),
    renderer: deepMerge(base.renderer, overlay.renderer),
    showFps: overlay.showFps ?? base.showFps
  }
}

function getDebugSettingsStorageKey() {
  const page = window.location.pathname.replace(/\/$/, '/index.html')
  return `tellux:debug-settings:${page}:${DEBUG_SETTINGS_STORAGE_VERSION}`
}

function sanitizeStoredDebugSettings(
  value: Record<string, unknown>
): DebugSettingsPanelOptions {
  const settings: DebugSettingsPanelOptions = {}
  if (isRecord(value.atmosphere)) settings.atmosphere = value.atmosphere
  if (isRecord(value.clouds)) settings.clouds = value.clouds
  if (isRecord(value.postProcess)) settings.postProcess = value.postProcess
  if (isRecord(value.renderer)) {
    const resolutionScale = value.renderer.resolutionScale
    if (typeof resolutionScale === 'number' && Number.isFinite(resolutionScale)) {
      settings.renderer = { resolutionScale }
    }
  }
  if (typeof value.showFps === 'boolean') settings.showFps = value.showFps
  return settings
}

function deepMerge<T>(base?: T, overlay?: T): T | undefined {
  if (overlay === undefined) return base
  if (base === undefined) return overlay
  if (!isRecord(base) || !isRecord(overlay)) return overlay

  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    result[key] = deepMerge(
      (base as Record<string, unknown>)[key],
      value
    )
  }
  return result as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
