import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindRangePointer } from '../widgets/Timeline/rangePointer'

function setup() {
  vi.stubGlobal('window', new EventTarget())
  const captures = new Set<number>()
  const input = Object.assign(new EventTarget(), {
    min: '0', max: '100', value: '50',
    focus: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, width: 110 }),
    setPointerCapture: (id: number) => captures.add(id),
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: (id: number) => captures.delete(id),
  })
  const begin = vi.fn()
  const end = vi.fn()
  const cleanup = bindRangePointer(input as unknown as HTMLInputElement, 10, begin, end)
  const send = (type: string, x: number, pointerId = 1, buttons = 1) => {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      clientX: x, pointerId, buttons, button: 0, isPrimary: true,
    })
    input.dispatchEvent(event)
    return event
  }
  return { input, begin, end, cleanup, send, captures }
}

afterEach(() => vi.unstubAllGlobals())

describe('Timeline pointer dragging', () => {
  it('commits pointerup position even when the final pointermove was skipped', () => {
    const { input, send, end } = setup()
    expect(send('pointerdown', 55).defaultPrevented).toBe(true)
    send('pointerup', 95, 1, 0)
    expect(Number(input.value)).toBe(90)
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('clamps fast excursions and follows the pointer when it returns', () => {
    const { input, send } = setup()
    send('pointerdown', 55)
    send('pointermove', 500)
    expect(Number(input.value)).toBe(100)
    send('pointermove', -500)
    expect(Number(input.value)).toBe(0)
    send('pointermove', 25)
    expect(Number(input.value)).toBe(20)
  })

  it('keeps the thumb grab offset and ignores another pointer', () => {
    const { input, send, end } = setup()
    send('pointerdown', 58)
    send('pointerup', 100, 2, 0)
    expect(end).not.toHaveBeenCalled()
    send('pointermove', 78)
    expect(Number(input.value)).toBe(70)
  })

  it.each(['pointercancel', 'lostpointercapture'])('cleans up %s and allows a new drag', type => {
    const { input, send, end, captures } = setup()
    send('pointerdown', 55)
    send(type, 55)
    expect(captures.size).toBe(0)
    expect(end).toHaveBeenCalledTimes(1)
    send('pointermove', 95)
    expect(Number(input.value)).toBe(50)
    send('pointerdown', 25)
    expect(Number(input.value)).toBe(20)
  })

  it('releases capture on blur and removes listeners on disposal', () => {
    const { input, send, end, cleanup, captures } = setup()
    send('pointerdown', 55)
    window.dispatchEvent(new Event('blur'))
    expect(captures.size).toBe(0)
    expect(end).toHaveBeenCalledTimes(1)
    cleanup()
    send('pointerdown', 95)
    expect(Number(input.value)).toBe(50)
  })
})
