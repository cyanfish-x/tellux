import { describe, expect, it, vi } from 'vitest'

import { AsyncLruCache } from '../sampling/AsyncLruCache'

describe('AsyncLruCache', () => {
  it('deduplicates concurrent loads and retries rejected entries', async () => {
    const cache = new AsyncLruCache<string, number>(2)
    const loadShared = vi.fn(async () => 1)

    await expect(Promise.all([
      cache.getOrCreate('shared', loadShared),
      cache.getOrCreate('shared', loadShared)
    ])).resolves.toEqual([1, 1])
    expect(loadShared).toHaveBeenCalledOnce()

    const loadFailure = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(2)

    await expect(cache.getOrCreate('retry', loadFailure)).rejects.toThrow('temporary failure')
    await expect(cache.getOrCreate('retry', loadFailure)).resolves.toBe(2)
    expect(loadFailure).toHaveBeenCalledTimes(2)
  })

  it('evicts the least recently used settled entry at the capacity boundary', async () => {
    const cache = new AsyncLruCache<string, string>(2)
    const loads: string[] = []
    const load = (value: string) => async () => {
      loads.push(value)
      return value
    }

    await cache.getOrCreate('a', load('a'))
    await cache.getOrCreate('b', load('b'))
    await cache.getOrCreate('a', load('a-again'))
    await cache.getOrCreate('c', load('c'))
    await cache.getOrCreate('b', load('b-reloaded'))

    expect(loads).toEqual(['a', 'b', 'c', 'b-reloaded'])
    expect(cache.size).toBe(2)
  })

  it('aborts and removes pending entries without discarding settled entries', async () => {
    const cache = new AsyncLruCache<string, number>(2)
    await cache.getOrCreate('settled', async () => 1)
    const pending = cache.getOrCreate('pending', (signal) => new Promise<number>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))

    cache.abortPending(new DOMException('cancelled', 'AbortError'))

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(cache.getOrCreate('settled', async () => 2)).resolves.toBe(1)
    expect(cache.size).toBe(1)
  })
})
