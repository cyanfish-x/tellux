import { describe, expect, it } from 'vitest'

import { LayerManager, type ImageryLayerChange } from '../LayerManager'

describe('LayerManager imagery layer handle lifecycle', () => {
  it('deactivates a handle after it removes its layer', () => {
    const changes: ImageryLayerChange[] = []
    const manager = new LayerManager([], (_layers, change) => {
      changes.push(change)
    })
    const layer = manager.add({
      id: 'satellite',
      name: 'Satellite',
      source: {
        type: 'xyz',
        url: 'https://example.test/tiles/{z}/{y}/{x}.jpg'
      }
    })

    expect(layer.remove()).toBe(true)
    const changeCountAfterRemoval = changes.length

    layer.setName('Removed')
    layer.show = false
    layer.setStyle({ opacity: 0.25 })
    layer.moveTo(0)

    expect(layer.remove()).toBe(false)
    expect(manager.get('satellite')).toBeNull()
    expect(changes).toHaveLength(changeCountAfterRemoval)
    expect(layer.getName()).toBe('Satellite')
    expect(layer.isVisible()).toBe(true)
    expect(layer.getStyle()).toEqual({ opacity: 1 })
  })

  it('deactivates handles removed through the manager and removeAll', () => {
    const changes: ImageryLayerChange[] = []
    const manager = new LayerManager([], (_layers, change) => {
      changes.push(change)
    })
    const first = manager.add({
      id: 'first',
      source: {
        type: 'xyz',
        url: 'https://example.test/first/{z}/{y}/{x}.jpg'
      }
    })
    const second = manager.add({
      id: 'second',
      source: {
        type: 'xyz',
        url: 'https://example.test/second/{z}/{y}/{x}.jpg'
      }
    })

    expect(manager.remove(first.id)).toBe(true)
    manager.removeAll()
    const changeCountAfterRemoval = changes.length

    first.setStyle({ opacity: 0.25 })
    second.setVisible(false)

    expect(first.remove()).toBe(false)
    expect(second.remove()).toBe(false)
    expect(changes).toHaveLength(changeCountAfterRemoval)
  })

  it('prevents a stale handle from affecting a replacement with the same id', () => {
    const changes: ImageryLayerChange[] = []
    const manager = new LayerManager([], (_layers, change) => {
      changes.push(change)
    })
    const stale = manager.add({
      id: 'shared',
      source: {
        type: 'xyz',
        url: 'https://example.test/old/{z}/{y}/{x}.jpg'
      }
    })

    expect(manager.remove(stale.id)).toBe(true)
    const replacement = manager.add({
      id: 'shared',
      visible: false,
      style: {
        opacity: 0.75
      },
      source: {
        type: 'xyz',
        url: 'https://example.test/new/{z}/{y}/{x}.jpg'
      }
    })
    const changeCountAfterReplacement = changes.length

    stale.setVisible(false)
    stale.setStyle({ opacity: 0.1 })
    stale.moveTo(0)

    expect(stale.remove()).toBe(false)
    expect(manager.get('shared')).toBe(replacement)
    expect(manager.getAll()).toEqual([replacement])
    expect(replacement.isVisible()).toBe(false)
    expect(replacement.getStyle()).toEqual({ opacity: 0.75 })
    expect(changes).toHaveLength(changeCountAfterReplacement)
  })
})
