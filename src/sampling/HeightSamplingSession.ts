const DEFAULT_ABORT_MESSAGE = 'Tellux height sampling was cancelled.'

export function createHeightSamplingAbortError(
  message = DEFAULT_ABORT_MESSAGE
) {
  return new DOMException(message, 'AbortError')
}

export function getHeightSamplingAbortReason(signal: AbortSignal) {
  return signal.reason ?? createHeightSamplingAbortError()
}

export function throwIfHeightSamplingAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw getHeightSamplingAbortReason(signal)
  }
}

export function isHeightSamplingAbortError(error: unknown) {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  ) || (
    error instanceof Error && error.name === 'AbortError'
  )
}

export function waitForHeightSamplingSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) {
    return Promise.reject(getHeightSamplingAbortReason(signal))
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(getHeightSamplingAbortReason(signal))
    }
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
    }

    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        cleanup()
        if (signal.aborted) {
          reject(getHeightSamplingAbortReason(signal))
        } else {
          resolve(value)
        }
      },
      (error) => {
        cleanup()
        reject(error)
      }
    )
  })
}

/**
 * 一次 most-detailed 高度采样调用的生命周期令牌。
 *
 * Lifecycle token for one most-detailed height sampling invocation.
 */
export class HeightSamplingSession {
  private readonly controller = new AbortController()

  constructor(readonly id: number) {}

  get signal() {
    return this.controller.signal
  }

  abort(reason: unknown = createHeightSamplingAbortError()) {
    if (!this.signal.aborted) {
      this.controller.abort(reason)
    }
  }

  throwIfAborted() {
    throwIfHeightSamplingAborted(this.signal)
  }

  waitFor<T>(promise: Promise<T>) {
    return waitForHeightSamplingSignal(promise, this.signal)
  }
}
