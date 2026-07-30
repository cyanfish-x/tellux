import { describe, expect, it, vi } from 'vitest'

import {
  ResourceScope,
  awaitReadyOrDestroy
} from '../lifecycle/ResourceLifecycle'

describe('ResourceScope', () => {
  it('rolls resources back in reverse registration order', () => {
    const order: string[] = []
    const scope = new ResourceScope()

    scope.defer(() => order.push('renderer'))
    scope.defer(() => order.push('canvas'))
    scope.defer(() => order.push('manager'))

    expect(scope.rollback()).toEqual([])
    expect(order).toEqual(['manager', 'canvas', 'renderer'])
  })

  it('continues rolling back after one disposer fails', () => {
    const disposeRenderer = vi.fn()
    const scope = new ResourceScope()
    const failure = new Error('manager cleanup failed')

    scope.defer(disposeRenderer)
    scope.defer(() => {
      throw failure
    })

    expect(scope.rollback()).toEqual([failure])
    expect(disposeRenderer).toHaveBeenCalledOnce()
  })

  it('releases rollback callbacks after construction commits', () => {
    const dispose = vi.fn()
    const scope = new ResourceScope()
    scope.defer(dispose)

    scope.commit()

    expect(scope.rollback()).toEqual([])
    expect(dispose).not.toHaveBeenCalled()
  })
})

describe('awaitReadyOrDestroy', () => {
  it('destroys a resource and preserves the initialization error', async () => {
    const failure = new Error('renderer init failed')
    const resource = {
      ready: Promise.reject(failure),
      destroy: vi.fn(() => {
        throw new Error('cleanup failed')
      })
    }

    await expect(awaitReadyOrDestroy(resource)).rejects.toBe(failure)
    expect(resource.destroy).toHaveBeenCalledOnce()
  })

  it('returns an initialized resource without destroying it', async () => {
    const resource = {
      ready: Promise.resolve(),
      destroy: vi.fn()
    }

    await expect(awaitReadyOrDestroy(resource)).resolves.toBe(resource)
    expect(resource.destroy).not.toHaveBeenCalled()
  })
})
