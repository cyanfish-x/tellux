import * as THREE from 'three'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ViewerInteractionManager } from '../controls/ViewerInteractionManager'
import { EntityManager } from '../entities/EntityManager'
import { EntityPicker } from '../sampling/EntityPicker'
import type { CartographicInput } from '../types'

const CANVAS_SIZE = 200

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        beginPath: vi.fn(),
        arc: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        fillStyle: ''
      })
    })
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('EntityPicker', () => {
  it('picks a point within its visual radius plus screen-space tolerance', () => {
    const fixture = createEntityPickerFixture()
    const pointWorld = fixture.worldPointAtScreen(110, 100)
    fixture.entities.add({
      id: 'point',
      position: [pointWorld.x, pointWorld.y, pointWorld.z],
      point: { pixelSize: 10 }
    })

    expect(fixture.picker.pick({ x: 100, y: 100 })).toBeNull()
    expect(fixture.picker.pick({ x: 100, y: 100 }, { tolerance: 6 })?.entity.id).toBe('point')
    expect(fixture.picker.pick({ x: 100, y: 100 }, { tolerance: 4 })).toBeNull()
  })

  it('returns all picked entities sorted by distance and uses the first as the single pick', () => {
    const fixture = createEntityPickerFixture()
    const nearWorld = fixture.worldPointAtScreen(100, 100, 0)
    const farWorld = fixture.worldPointAtScreen(100, 100, -2)
    fixture.entities.add({
      id: 'far-point',
      position: [farWorld.x, farWorld.y, farWorld.z],
      point: { pixelSize: 10 }
    })
    fixture.entities.add({
      id: 'near-point',
      position: [nearWorld.x, nearWorld.y, nearWorld.z],
      point: { pixelSize: 10 }
    })

    const pickedEntities = fixture.picker.pickEntities({ x: 100, y: 100 })

    expect(pickedEntities.map((picked) => picked.entity.id)).toEqual(['near-point', 'far-point'])
    expect(fixture.picker.pick({ x: 100, y: 100 })?.entity.id).toBe('near-point')
  })

  it('includes point outline width in the visual picking radius', () => {
    const fixture = createEntityPickerFixture()
    const pointWorld = fixture.worldPointAtScreen(107, 100)
    fixture.entities.add({
      id: 'outlined-point',
      position: [pointWorld.x, pointWorld.y, pointWorld.z],
      point: { pixelSize: 10, outlineWidth: 2 }
    })

    expect(fixture.picker.pick({ x: 100, y: 100 })?.entity.id).toBe('outlined-point')
  })

  it('picks a polyline within half line width plus screen-space tolerance', () => {
    const fixture = createEntityPickerFixture()
    const start = fixture.worldPointAtScreen(80, 100)
    const end = fixture.worldPointAtScreen(120, 100)
    fixture.entities.add({
      id: 'line',
      polyline: {
        positions: [
          [start.x, start.y, start.z],
          [end.x, end.y, end.z]
        ],
        width: 2
      }
    })

    expect(fixture.picker.pick({ x: 100, y: 105 })).toBeNull()
    expect(fixture.picker.pick({ x: 100, y: 105 }, { tolerance: 5 })?.entity.id).toBe('line')
    expect(fixture.picker.pick({ x: 100, y: 107 }, { tolerance: 5 })).toBeNull()
  })

  it('keeps polygon raycaster picking independent from point and line tolerance', () => {
    const fixture = createEntityPickerFixture()
    const entity = fixture.entities.add({ id: 'polygon' })
    entity.object3D.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial()
    ))

    expect(fixture.picker.pick({ x: 100, y: 100 })?.entity.id).toBe('polygon')
    expect(fixture.picker.pick({ x: 140, y: 100 }, { tolerance: 100 })).toBeNull()
  })
})

describe('ViewerInteractionManager entity picking tolerance', () => {
  it('uses default click and mousemove tolerances for entity picking', () => {
    const domElement = createFakeDomElement()
    const pickedEntity = { entity: { id: 'entity-1' }, point: new THREE.Vector3(), distance: 1 } as never
    const pickEntities = vi.fn(() => [pickedEntity])
    const events: Array<{ entities: unknown[] }> = []
    const manager = new ViewerInteractionManager({
      viewer: {} as never,
      camera: { cancelFlight: vi.fn() } as never,
      controls: { adjustHeight: false } as never,
      domElement: domElement as never,
      pickCartographic: () => null,
      pick3DTilesFeature: () => null,
      pickEntities
    })

    manager.on('click', (event) => events.push({ entities: event.entities }))
    manager.on('mousemove', (event) => events.push({ entities: event.entities }))

    domElement.dispatch('click', { clientX: 12, clientY: 14 })
    domElement.dispatch('mousemove', { clientX: 20, clientY: 22 })

    expect(pickEntities).toHaveBeenNthCalledWith(1, { x: 12, y: 14 }, { tolerance: 6 })
    expect(pickEntities).toHaveBeenNthCalledWith(2, { x: 20, y: 22 }, { tolerance: 4 })
    expect(events).toEqual([
      { entities: [pickedEntity] },
      { entities: [pickedEntity] }
    ])

    manager.dispose()
  })
})

function createEntityPickerFixture() {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()

  const canvas = {
    clientWidth: CANVAS_SIZE,
    clientHeight: CANVAS_SIZE
  } as HTMLCanvasElement
  const entities = new EntityManager({
    scene,
    toVector3: (input: CartographicInput, target: THREE.Vector3) => {
      if (!Array.isArray(input)) {
        return target.set(input.longitude, input.latitude, input.height)
      }
      return target.set(input[0], input[1], input[2] ?? 0)
    },
    ellipsoid: () => ({
      getCartographicToPosition: (_lat, _lon, _height, target) => target.set(0, 0, 0),
      getCartographicToNormal: (_lat, _lon, target) => target.set(0, 0, 1)
    }),
    groundClamp: null
  })

  return {
    camera,
    entities,
    picker: new EntityPicker(canvas, camera, entities),
    worldPointAtScreen: (x: number, y: number, z = 0) => worldPointAtScreen(camera, x, y, z)
  }
}

function worldPointAtScreen(camera: THREE.PerspectiveCamera, x: number, y: number, z = 0) {
  const coords = new THREE.Vector2((x / CANVAS_SIZE) * 2 - 1, -(y / CANVAS_SIZE) * 2 + 1)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(coords, camera)
  const point = new THREE.Vector3()
  raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), point)
  return point
}

function createFakeDomElement() {
  const listeners = new Map<string, Set<(event: MouseEvent) => void>>()
  return {
    addEventListener: (type: string, listener: (event: MouseEvent) => void) => {
      let set = listeners.get(type)
      if (!set) {
        set = new Set()
        listeners.set(type, set)
      }
      set.add(listener)
    },
    removeEventListener: (type: string, listener: (event: MouseEvent) => void) => {
      listeners.get(type)?.delete(listener)
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    dispatch: (type: string, event: { clientX: number, clientY: number }) => {
      listeners.get(type)?.forEach((listener) => listener(event as MouseEvent))
    }
  }
}
