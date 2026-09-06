/** Own pointer dragging; keep the native range for keyboard and accessibility. */
export function bindRangePointer(
  input: HTMLInputElement,
  thumbSize: number,
  begin: () => void,
  end: () => void
) {
  let pointerId: number | null = null
  let grabOffset = 0

  const applyPosition = (clientX: number) => {
    const rect = input.getBoundingClientRect()
    const width = rect.width - thumbSize
    if (width <= 0) return
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - thumbSize / 2 - grabOffset) / width))
    const min = Number(input.min)
    const max = Number(input.max)
    const previous = input.value
    // Let the native value sanitizer clamp and quantize to step.
    input.value = String(min + ratio * (max - min))
    if (input.value !== previous) input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const finish = () => {
    if (pointerId === null) return
    const releasedId = pointerId
    pointerId = null
    if (input.hasPointerCapture(releasedId)) input.releasePointerCapture(releasedId)
    end()
  }
  const onDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || pointerId !== null) return
    // Do not run two competing drag implementations (UA range + ours).
    event.preventDefault()
    input.focus({ preventScroll: true })
    pointerId = event.pointerId
    const rect = input.getBoundingClientRect()
    const ratio = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))
    const thumbCenter = rect.left + thumbSize / 2 + ratio * (rect.width - thumbSize)
    grabOffset = Math.abs(event.clientX - thumbCenter) <= thumbSize / 2
      ? event.clientX - thumbCenter
      : 0
    input.setPointerCapture(pointerId)
    begin()
    applyPosition(event.clientX)
  }
  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return
    if (event.buttons === 0) {
      finish()
      return
    }
    applyPosition(event.clientX)
  }
  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return
    // The last move can be coalesced; pointerup still owns the final position.
    applyPosition(event.clientX)
    finish()
  }
  const onCancel = (event: PointerEvent) => {
    if (event.pointerId === pointerId) finish()
  }
  input.addEventListener('pointerdown', onDown)
  input.addEventListener('pointermove', onMove)
  input.addEventListener('pointerup', onUp)
  input.addEventListener('pointercancel', onCancel)
  input.addEventListener('lostpointercapture', onCancel)
  window.addEventListener('blur', finish)

  return () => {
    finish()
    input.removeEventListener('pointerdown', onDown)
    input.removeEventListener('pointermove', onMove)
    input.removeEventListener('pointerup', onUp)
    input.removeEventListener('pointercancel', onCancel)
    input.removeEventListener('lostpointercapture', onCancel)
    window.removeEventListener('blur', finish)
  }
}
