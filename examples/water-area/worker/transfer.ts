import workerpool from 'workerpool'

// The type parameter is used to recover the message type on the main thread.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface TransferResult<T> {}

export function transferResult<T extends object>(
  message: T,
  transfer: Transferable[]
): TransferResult<T> {
  return new workerpool.Transfer(message, transfer)
}
