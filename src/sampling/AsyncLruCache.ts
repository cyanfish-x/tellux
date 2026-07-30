type AsyncLruCacheEntry<T> = {
  controller: AbortController
  promise: Promise<T>
  settled: boolean
}

/**
 * 有容量边界、并发去重和失败淘汰语义的异步 LRU 缓存。
 *
 * Async LRU cache with bounded settled entries, concurrent request
 * deduplication, failed-entry eviction, and abortable pending loaders.
 */
export class AsyncLruCache<Key, Value> {
  private readonly entries = new Map<Key, AsyncLruCacheEntry<Value>>()
  readonly maxEntries: number

  constructor(maxEntries: number) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new RangeError('AsyncLruCache maxEntries must be a positive integer.')
    }
    this.maxEntries = maxEntries
  }

  get size() {
    return this.entries.size
  }

  getOrCreate(
    key: Key,
    loader: (signal: AbortSignal) => Promise<Value> | Value
  ): Promise<Value> {
    const cached = this.entries.get(key)
    if (cached) {
      this.touch(key, cached)
      return cached.promise
    }

    const controller = new AbortController()
    const entry = {
      controller,
      promise: Promise.resolve().then(() => {
        if (controller.signal.aborted) {
          throw controller.signal.reason
        }
        return loader(controller.signal)
      }),
      settled: false
    }
    this.entries.set(key, entry)
    void entry.promise.then(
      () => {
        if (this.entries.get(key) !== entry) return
        entry.settled = true
        this.trim()
      },
      () => {
        if (this.entries.get(key) === entry) {
          this.entries.delete(key)
        }
      }
    )
    this.trim()
    return entry.promise
  }

  abortPending(reason?: unknown) {
    for (const [key, entry] of this.entries) {
      if (entry.settled) continue
      this.entries.delete(key)
      entry.controller.abort(reason)
    }
  }

  clear(reason?: unknown) {
    for (const entry of this.entries.values()) {
      if (!entry.settled) {
        entry.controller.abort(reason)
      }
    }
    this.entries.clear()
  }

  private touch(key: Key, entry: AsyncLruCacheEntry<Value>) {
    this.entries.delete(key)
    this.entries.set(key, entry)
  }

  private trim() {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.entries().next()
        .value as [Key, AsyncLruCacheEntry<Value>] | undefined
      if (!oldest || !oldest[1].settled) return
      this.entries.delete(oldest[0])
    }
  }
}
