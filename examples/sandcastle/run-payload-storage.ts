import type { SandcastleRunPayload, SandcastleRunnerPayload } from "./types"

export const STORAGE_PREFIX = "tellux:sandcastle-run:"
export const MAX_STORED_RUNS = 6

/** Standalone URL 回退上限（编码后字符数，留余量避免浏览器 URL 长度限制） */
export const MAX_URL_PAYLOAD_CHARS = 1_500_000

export interface StorageLike {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function toRunnerPayload(
  payload: SandcastleRunPayload
): SandcastleRunnerPayload {
  return {
    runId: payload.runId,
    html: payload.html,
    compiledJavascript: payload.compiledJavascript,
  }
}

export function serializeRunnerPayload(payload: SandcastleRunnerPayload): string {
  return JSON.stringify(payload)
}

export function isStorageQuotaExceeded(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  )
}

export function getStoredRunEntries(
  storage: StorageLike,
  prefix = STORAGE_PREFIX
) {
  const entries: Array<{ key: string; createdAt: number }> = []
  for (let index = 0; index < storage.length; index += 1) {
    const storageKey = storage.key(index)
    if (!storageKey?.startsWith(prefix)) {
      continue
    }
    const runKey = storageKey.slice(prefix.length)
    const timestamp = Number.parseInt(runKey.split("-")[0] ?? "", 36)
    entries.push({
      key: storageKey,
      createdAt: Number.isFinite(timestamp) ? timestamp : 0,
    })
  }
  return entries.sort((left, right) => left.createdAt - right.createdAt)
}

export function pruneStoredRuns(
  storage: StorageLike,
  maxRuns: number,
  prefix = STORAGE_PREFIX
) {
  const entries = getStoredRunEntries(storage, prefix)
  const removeCount = Math.max(0, entries.length - maxRuns)
  for (const entry of entries.slice(0, removeCount)) {
    storage.removeItem(entry.key)
  }
}

export function clearStoredRuns(storage: StorageLike, prefix = STORAGE_PREFIX) {
  for (const entry of getStoredRunEntries(storage, prefix)) {
    storage.removeItem(entry.key)
  }
}

function setItemWithQuotaRecovery(
  storage: StorageLike,
  storageKey: string,
  serializedPayload: string
) {
  pruneStoredRuns(storage, MAX_STORED_RUNS - 1)
  try {
    storage.setItem(storageKey, serializedPayload)
  } catch (error) {
    if (!isStorageQuotaExceeded(error)) {
      throw error
    }
    clearStoredRuns(storage)
    storage.setItem(storageKey, serializedPayload)
  }
}

export type RunnerPayloadDelivery = "localStorage" | "url"

export function tryPersistRunnerPayload(
  key: string,
  payload: SandcastleRunnerPayload,
  storage: StorageLike
): RunnerPayloadDelivery {
  const storageKey = `${STORAGE_PREFIX}${key}`
  const serializedPayload = serializeRunnerPayload(payload)

  try {
    setItemWithQuotaRecovery(storage, storageKey, serializedPayload)
    return "localStorage"
  } catch (error) {
    if (!isStorageQuotaExceeded(error)) {
      throw error
    }
  }

  const encodedPayload = encodeURIComponent(serializedPayload)
  if (encodedPayload.length > MAX_URL_PAYLOAD_CHARS) {
    throw new Error(
      "Sandcastle run payload is too large for localStorage and URL fallback."
    )
  }

  return "url"
}

export function buildStandaloneRunnerSearchParams(
  payload: SandcastleRunnerPayload,
  key: string,
  delivery: RunnerPayloadDelivery
) {
  const params = new URLSearchParams({
    runId: payload.runId,
  })

  if (delivery === "localStorage") {
    params.set("run", key)
    return params
  }

  params.set("payload", encodeURIComponent(serializeRunnerPayload(payload)))
  return params
}
