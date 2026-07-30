export type ResourceDisposer = () => void

/**
 * Tracks resources created during a synchronous construction phase.
 *
 * Call {@link commit} after construction succeeds, or {@link rollback} to
 * dispose registered resources in reverse order after a failure.
 */
export class ResourceScope {
  private readonly disposers: ResourceDisposer[] = []
  private active = true

  defer(disposer: ResourceDisposer) {
    if (!this.active) {
      throw new Error('ResourceScope is no longer active.')
    }

    this.disposers.push(disposer)
  }

  commit() {
    if (!this.active) return

    this.active = false
    this.disposers.length = 0
  }

  rollback() {
    if (!this.active) return []

    this.active = false
    const errors: unknown[] = []

    for (let index = this.disposers.length - 1; index >= 0; index -= 1) {
      try {
        this.disposers[index]()
      } catch (error) {
        errors.push(error)
      }
    }

    this.disposers.length = 0
    return errors
  }
}

interface ReadyDestroyable {
  readonly ready: PromiseLike<unknown>
  destroy(): void
}

/**
 * Waits for an owned resource to initialize and destroys it if initialization
 * fails. Cleanup failures never replace the original initialization error.
 */
export async function awaitReadyOrDestroy<T extends ReadyDestroyable>(resource: T): Promise<T> {
  try {
    await resource.ready
    return resource
  } catch (error) {
    try {
      resource.destroy()
    } catch {
      // Preserve the initialization error as the public failure.
    }
    throw error
  }
}
