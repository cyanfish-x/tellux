import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { ScenePicker } from '../sampling/ScenePicker'
function createPicker(overrides: {
  entityPick?: ReturnType<typeof vi.fn>
  entityPickEntities?: ReturnType<typeof vi.fn>
  hismPick?: ReturnType<typeof vi.fn>
  hismList?: ReturnType<typeof vi.fn>
  tilesPick?: ReturnType<typeof vi.fn>
  objectPick?: ReturnType<typeof vi.fn>
  objectPickObjects?: ReturnType<typeof vi.fn>
  getObjectRoot?: () => THREE.Object3D
} = {}) {
  const entityPick = overrides.entityPick ?? vi.fn(() => null)
  const entityPickEntities = overrides.entityPickEntities ?? vi.fn(() => [])
  const hismPick = overrides.hismPick ?? vi.fn(() => null)
  const hismList = overrides.hismList ?? vi.fn(() => [{ id: 'forest' }])
  const tilesPick = overrides.tilesPick ?? vi.fn(() => null)
  const objectPick = overrides.objectPick ?? vi.fn(() => null)
  const objectPickObjects = overrides.objectPickObjects ?? vi.fn(() => [])
  const root = new THREE.Group()

  const picker = new ScenePicker({
    entityPicker: {
      pick: entityPick,
      pickEntities: entityPickEntities
    } as never,
    tilesetFeaturePicker: {
      pick: tilesPick
    } as never,
    objectPicker: {
      pick: objectPick,
      pickObjects: objectPickObjects
    } as never,
    hismManager: {
      pick: hismPick,
      list: hismList
    } as never,
    getObjectRoot: overrides.getObjectRoot ?? (() => root)
  })

  return {
    picker,
    entityPick,
    entityPickEntities,
    hismPick,
    hismList,
    tilesPick,
    objectPick,
    objectPickObjects,
    root
  }
}

describe('ScenePicker', () => {
  it('pick returns the nearest hit across layers without full entity drill', () => {
    const entity = {
      entity: { id: 'e1' },
      point: new THREE.Vector3(),
      distance: 30
    }
    const feature = {
      layerId: 'tiles',
      distance: 10,
      object: new THREE.Mesh(),
      point: new THREE.Vector3(),
      featureId: 1,
      properties: {},
      cartographic: { longitude: 0, latitude: 0, height: 0 },
      tileset: {},
      faceIndex: 0
    }
    const instance = {
      layerId: 'forest',
      clusterKey: '0:0',
      archetypeIndex: 0,
      lodIndex: 0,
      partIndex: 0,
      instanceId: 1,
      point: new THREE.Vector3(),
      distance: 20
    }

    const fixture = createPicker({
      entityPick: vi.fn(() => entity as never),
      entityPickEntities: vi.fn(() => [entity, { ...entity, distance: 40 }] as never[]),
      tilesPick: vi.fn(() => feature as never),
      hismPick: vi.fn(() => instance as never)
    })

    const hit = fixture.picker.pick({ x: 1, y: 2 })
    expect(hit).toEqual({
      type: 'tilesFeature',
      distance: 10,
      feature
    })
    expect(hit?.type).toBe('tilesFeature')
    expect(fixture.entityPick).toHaveBeenCalledTimes(1)
    expect(fixture.entityPickEntities).not.toHaveBeenCalled()
  })

  it('pickAll merges all hits nearest-first', () => {
    const nearEntity = {
      entity: { id: 'near' },
      point: new THREE.Vector3(),
      distance: 5
    }
    const farEntity = {
      entity: { id: 'far' },
      point: new THREE.Vector3(),
      distance: 50
    }
    const feature = {
      layerId: 'tiles',
      distance: 15,
      object: new THREE.Mesh(),
      point: new THREE.Vector3(),
      featureId: 1,
      properties: {},
      cartographic: { longitude: 0, latitude: 0, height: 0 },
      tileset: {},
      faceIndex: 0
    }

    const fixture = createPicker({
      entityPickEntities: vi.fn(() => [farEntity, nearEntity]),
      tilesPick: vi.fn(() => feature),
      hismList: vi.fn(() => [])
    })

    const hits = fixture.picker.pickAll({ x: 3, y: 4 })
    expect(hits.map((h) => h.distance)).toEqual([5, 15, 50])
    expect(hits[0]).toMatchObject({ type: 'entity', entity: nearEntity })
    expect(fixture.hismPick).not.toHaveBeenCalled()
  })

  it('defaults to object layer when root is set and layers omitted', () => {
    const objectHit = {
      object: new THREE.Mesh(),
      point: new THREE.Vector3(),
      distance: 1,
      faceIndex: 0
    }
    const fixture = createPicker({
      objectPick: vi.fn(() => objectHit),
      entityPick: vi.fn(() => ({
        entity: { id: 'e' },
        point: new THREE.Vector3(),
        distance: 0.1
      }))
    })

    const hit = fixture.picker.pick({ x: 0, y: 0 }, { root: fixture.root })
    expect(hit?.type).toBe('object')
    expect(fixture.objectPick).toHaveBeenCalled()
    expect(fixture.entityPick).not.toHaveBeenCalled()
    expect(fixture.tilesPick).not.toHaveBeenCalled()
  })

  it('skips hismInstance when no HISM layers are registered', () => {
    const fixture = createPicker({
      hismList: vi.fn(() => []),
      hismPick: vi.fn(() => ({
        layerId: 'x',
        clusterKey: '0:0',
        archetypeIndex: 0,
        lodIndex: 0,
        partIndex: 0,
        instanceId: 0,
        point: new THREE.Vector3(),
        distance: 1
      }))
    })

    fixture.picker.pick({ x: 0, y: 0 })
    expect(fixture.hismPick).not.toHaveBeenCalled()
  })
})
