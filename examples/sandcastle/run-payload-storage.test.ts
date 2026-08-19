import { describe, expect, it } from "vitest"

import {
  MAX_URL_PAYLOAD_CHARS,
  STORAGE_PREFIX,
  buildStandaloneRunnerSearchParams,
  clearStoredRuns,
  getStoredRunEntries,
  isStorageQuotaExceeded,
  pruneStoredRuns,
  serializeRunnerPayload,
  toRunnerPayload,
  tryPersistRunnerPayload,
  type StorageLike,
} from "./run-payload-storage"
import type { SandcastleRunPayload } from "./types"

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    getItem(key: string) {
      return map.get(key) ?? null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
    removeItem(key: string) {
      map.delete(key)
    },
  }
}

function createQuotaStorage(limitBytes: number): StorageLike {
  const inner = createMemoryStorage()
  return {
    get length() {
      return inner.length
    },
    key(index: number) {
      return inner.key(index)
    },
    getItem(key: string) {
      return inner.getItem(key)
    },
    setItem(key: string, value: string) {
      const nextSize =
        [...Array.from({ length: inner.length }).keys()].reduce(
          (total, index) => {
            const existingKey = inner.key(index)
            if (!existingKey) return total
            const existingValue = inner.getItem(existingKey)
            return total + existingKey.length + (existingValue?.length ?? 0)
          },
          0
        ) +
        key.length +
        value.length

      if (nextSize > limitBytes) {
        throw new DOMException("QuotaExceededError", "QuotaExceededError")
      }
      inner.setItem(key, value)
    },
    removeItem(key: string) {
      inner.removeItem(key)
    },
  }
}

const samplePayload: SandcastleRunPayload = {
  runId: "run-1",
  html: "<div id='viewer'></div>",
  javascript: "const viewer = new tellux.Viewer('viewer')",
  compiledJavascript: "const viewer = new tellux.Viewer('viewer');",
}

describe("run-payload-storage", () => {
  it("drops editor-only javascript from runner payload", () => {
    expect(toRunnerPayload(samplePayload)).toEqual({
      runId: "run-1",
      html: samplePayload.html,
      compiledJavascript: samplePayload.compiledJavascript,
    })
  })

  it("persists slim payload to localStorage when quota allows", () => {
    const storage = createMemoryStorage()
    const delivery = tryPersistRunnerPayload("abc123", toRunnerPayload(samplePayload), storage)

    expect(delivery).toBe("localStorage")
    expect(storage.getItem(`${STORAGE_PREFIX}abc123`)).toBe(
      serializeRunnerPayload(toRunnerPayload(samplePayload))
    )
    expect(storage.getItem(`${STORAGE_PREFIX}abc123`)).not.toContain("javascript")
  })

  it("falls back to URL payload when localStorage quota is exceeded", () => {
    const storage = createQuotaStorage(120)
    const runnerPayload = toRunnerPayload(samplePayload)
    const delivery = tryPersistRunnerPayload("abc123", runnerPayload, storage)

    expect(delivery).toBe("url")
    expect(storage.getItem(`${STORAGE_PREFIX}abc123`)).toBeNull()

    const params = buildStandaloneRunnerSearchParams(runnerPayload, "abc123", delivery)
    expect(params.get("run")).toBeNull()
    expect(params.get("payload")).toBeTruthy()
    expect(params.get("runId")).toBe("run-1")
  })

  it("prunes oldest stored runs before saving a new one", () => {
    const storage = createMemoryStorage()
    for (let index = 0; index < 8; index += 1) {
      storage.setItem(`${STORAGE_PREFIX}${index.toString(36).padStart(6, "0")}-key`, "{}")
    }

    pruneStoredRuns(storage, 6)
    expect(getStoredRunEntries(storage)).toHaveLength(6)
    clearStoredRuns(storage)
    expect(getStoredRunEntries(storage)).toHaveLength(0)
  })

  it("detects QuotaExceededError", () => {
    expect(isStorageQuotaExceeded(new DOMException("", "QuotaExceededError"))).toBe(true)
    expect(isStorageQuotaExceeded(new Error("nope"))).toBe(false)
  })

  it("rejects payloads that exceed URL fallback limit", () => {
    const storage = createQuotaStorage(0)
    const hugePayload = {
      runId: "run-huge",
      html: "x".repeat(MAX_URL_PAYLOAD_CHARS),
      compiledJavascript: "y".repeat(MAX_URL_PAYLOAD_CHARS),
    }

    expect(() => tryPersistRunnerPayload("abc123", hugePayload, storage)).toThrow(
      /too large for localStorage and URL fallback/
    )
  })
})
