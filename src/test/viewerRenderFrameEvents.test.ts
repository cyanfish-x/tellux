import { describe, expect, it, vi } from 'vitest'

import { Viewer } from '../Viewer'

describe('Viewer preRender event', () => {
  it('fires after internal frame updates and before the final scene render', () => {
    const order: string[] = []
    const eventDispatcher = {
      dispatch: vi.fn((_type: string, event: { deltaTime: number, time: number }) => {
        order.push('preRender')
        expect(event).toEqual({ deltaTime: 0.016, time: 125 })
      })
    }
    const fakeViewer = {
      clearFrameBuffer: () => order.push('clear'),
      clock: { tick: () => order.push('clock') },
      postProcessing: null,
      resize: () => order.push('resize'),
      controls: { update: () => order.push('controls') },
      widgets: { update: () => order.push('widgets') },
      syncFallbackAmbientLight: () => 100,
      tilesets: { update: () => order.push('tilesets') },
      atmosphere: null,
      models: { update: () => order.push('models') },
      hismManager: { update: () => order.push('hism') },
      highlightManager: { update: () => order.push('highlight') },
      entitiesManager: { update: () => order.push('entities') },
      entityRenderManager: { beginFrame: () => order.push('entityBegin') },
      symbolOcclusionPass: { beginFrame: () => order.push('symbolBegin') },
      events: eventDispatcher,
      rendererAdapter: { render: () => order.push('render') },
      scene: { threeScene: {} },
      threeCamera: {},
      renderSymbolsAfterComposite: () => order.push('symbols')
    }

    const renderFrame = (Viewer.prototype as unknown as {
      renderFrame(deltaTime: number, time: number): void
    }).renderFrame
    renderFrame.call(fakeViewer, 0.016, 125)

    expect(order.indexOf('preRender')).toBeGreaterThan(order.indexOf('symbolBegin'))
    expect(order.indexOf('preRender')).toBeLessThan(order.indexOf('render'))
    expect(eventDispatcher.dispatch).toHaveBeenCalledOnce()
  })
})
