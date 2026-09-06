import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ExtSplats, SplatMesh } from '@sparkjsdev/spark'
import { EnvironmentControls } from '3d-tiles-renderer'
import { Color, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector3 } from 'three'
import { stabilizeSplatRaycast } from './stabilizeSplatRaycast'

const meshes: SplatMesh[] = []
beforeAll(async () => { await SplatMesh.staticInitialized })
afterEach(() => { meshes.splice(0).forEach(mesh => mesh.dispose()) })

async function makeMesh(format: 'packed' | 'ext') {
  const construct = (splats: { pushSplat: SplatMesh['pushSplat'] }) => {
    splats.pushSplat(new Vector3(), new Vector3(1, 1, 1), new Quaternion(), 1, new Color(1, 1, 1))
  }
  const extSplats = format === 'ext' ? new ExtSplats({ construct }) : undefined
  if (extSplats) await extSplats.initialized
  const mesh = new SplatMesh(extSplats ? { extSplats } : { constructSplats: construct })
  meshes.push(mesh)
  await mesh.initialized
  // Renderer normally supplies this count on its first frame; no GPU is needed for raycast.
  mesh.context.numSplats.value = mesh.numSplats
  mesh.updateMatrixWorld(true)
  return mesh
}

describe.each(['packed', 'ext'] as const)('Spark %s long-ray stability', format => {
  it('reproduces the actual WASM height error and restores the close-ray intersection', async () => {
    const mesh = await makeMesh(format)
    const close = new Raycaster(new Vector3(0.5, 0, 10), new Vector3(0, 0, -1))
    const far = new Raycaster(new Vector3(0.5, 0, 100000), new Vector3(0, 0, -1))
    const expected = close.intersectObject(mesh)[0].point
    expect(far.intersectObject(mesh)[0].point.distanceTo(expected)).toBeGreaterThan(0.1)
    stabilizeSplatRaycast(mesh)
    expect(far.intersectObject(mesh)[0].point.distanceTo(expected)).toBeLessThan(0.001)
    expect(close.intersectObject(mesh)[0].point.distanceTo(expected)).toBeLessThan(0.001)
  })

  it('preserves world distances under Earth-scale translation, rotation and nonuniform scale', async () => {
    const mesh = await makeMesh(format)
    mesh.position.set(-3978400, 3016000, -3956200)
    mesh.rotation.set(0.3, -0.7, 0.2)
    mesh.scale.set(3, 2, 4)
    mesh.updateMatrixWorld(true)
    const nearOrigin = new Vector3(0.5, 0, 10).applyMatrix4(mesh.matrixWorld)
    const direction = new Vector3(0, 0, -1).transformDirection(mesh.matrixWorld)
    const expected = new Raycaster(nearOrigin, direction).intersectObject(mesh)[0].point
    stabilizeSplatRaycast(mesh)
    const origin = nearOrigin.clone().addScaledVector(direction, -100000)
    const raycaster = new Raycaster(origin, direction)
    const hit = raycaster.intersectObject(mesh)[0]
    expect(hit.point.distanceTo(expected)).toBeLessThan(0.001)
    expect(hit.distance).toBeCloseTo(origin.distanceTo(hit.point), 6)
    expect(raycaster.ray.origin.equals(origin)).toBe(true)
    expect(raycaster.near).toBe(0)
    expect(raycaster.far).toBe(Infinity)
    raycaster.far = hit.distance - 0.1
    expect(raycaster.intersectObject(mesh)).toHaveLength(0)
    raycaster.far = Infinity
    raycaster.near = hit.distance + 0.1
    expect(raycaster.intersectObject(mesh)).toHaveLength(0)
  })

  it('keeps ground clearance enforcement without pushing a camera above a distant false hit', async () => {
    const mesh = await makeMesh(format)
    stabilizeSplatRaycast(mesh)
    const scene = new Scene()
    scene.add(mesh)
    const camera = new PerspectiveCamera()
    const controls = new EnvironmentControls(scene, camera)
    controls.up.set(0, 0, 1)
    controls.adjustHeight = true
    controls.cameraRadius = 5
    camera.position.set(0.5, 0, 10)
    controls.adjustCamera(camera)
    expect(camera.position.z).toBe(10)
    camera.position.z = 3
    controls.adjustCamera(camera)
    expect(camera.position.z).toBeGreaterThan(5)
    expect(camera.position.z).toBeLessThan(6)
    const corrected = camera.position.z
    for (let i = 0; i < 10; i++) controls.adjustCamera(camera)
    expect(camera.position.z).toBeCloseTo(corrected, 4)
    controls.dispose()
  })

  it('rejects long-ray false hits outside bounds and preserves inside/away-facing ray semantics', async () => {
    const mesh = await makeMesh(format)
    stabilizeSplatRaycast(mesh)
    const once = mesh.raycast
    stabilizeSplatRaycast(mesh)
    expect(mesh.raycast).toBe(once)
    expect(new Raycaster(new Vector3(3, 0, 100000), new Vector3(0, 0, -1)).intersectObject(mesh)).toHaveLength(0)
    expect(new Raycaster(new Vector3(0, 0, 100000), new Vector3(0, 0, 1)).intersectObject(mesh)).toHaveLength(0)
    // Spark reports only the entry surface, so origins inside the splat still have no forward hit.
    expect(new Raycaster(new Vector3(), new Vector3(0, 0, 1)).intersectObject(mesh)).toHaveLength(0)
  })
})

describe('anisotropic splat orbit regression', () => {
  async function fromSplats(construct: (source: ExtSplats) => void) {
    const source = new ExtSplats({ construct })
    await source.initialized
    const mesh = new SplatMesh({ extSplats: source })
    meshes.push(mesh)
    await mesh.initialized
    mesh.context.numSplats.value = mesh.numSplats
    mesh.updateMatrixWorld(true)
    return mesh
  }

  it('keeps microradian direction changes continuous inside a large tile bounding box', async () => {
    const mesh = await fromSplats(source => {
      source.pushSplat(new Vector3(), new Vector3(.003, .1, .004), new Quaternion(), 1, new Color())
      source.pushSplat(new Vector3(.5, 0, 200), new Vector3(.1, .1, .1), new Quaternion(), 1, new Color())
    })
    // This origin is already inside the whole-tile box: the previous rebase cannot help.
    const rays = Array.from({ length: 11 }, (_, i) => new Raycaster(
      new Vector3(.001, .01, 100), new Vector3((i - 5) * 1e-8, 0, -1).normalize(),
    ))
    expect(rays.some(ray => ray.intersectObject(mesh).length === 0)).toBe(true)
    stabilizeSplatRaycast(mesh)
    const heights = rays.map(ray => {
      const hits = ray.intersectObject(mesh)
      expect(hits).toHaveLength(1)
      return hits[0].point.z
    })
    expect(Math.min(...heights)).toBeGreaterThan(.003)
    expect(Math.max(...heights)).toBeLessThan(.004)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(.00001)
  })

  it('preserves thin disks, opacity filtering and raycastable without mutating decoded splats', async () => {
    const mesh = await fromSplats(source => {
      source.pushSplat(new Vector3(), new Vector3(1, 1, .0001), new Quaternion(), .5, new Color())
    })
    stabilizeSplatRaycast(mesh)
    const ray = new Raycaster(new Vector3(.5, 0, 100000), new Vector3(0, 0, -1))
    expect(ray.intersectObject(mesh)[0].point.z).toBeCloseTo(0, 6)
    expect(ray.intersectObject(mesh)[0].point.z).toBeCloseTo(0, 6)
    mesh.minRaycastOpacity = .8
    expect(ray.intersectObject(mesh)).toHaveLength(0)
    mesh.minRaycastOpacity = .1
    mesh.raycastable = false
    expect(ray.intersectObject(mesh)).toHaveLength(0)
  })

  it('intersects rotated anisotropic splats along their known principal axis', async () => {
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.2)
    const mesh = await fromSplats(source => {
      source.pushSplat(new Vector3(3, 4, 5), new Vector3(.2, .4, .3), rotation, 1, new Color())
    })
    const decoded = mesh.extSplats!.getSplat(0)
    const axis = new Vector3(0, 0, 1).applyQuaternion(decoded.quaternion)
    const expected = decoded.center.clone().addScaledVector(axis, decoded.scales.z)
    stabilizeSplatRaycast(mesh)
    const ray = new Raycaster(decoded.center.clone().addScaledVector(axis, 100000), axis.clone().negate())
    expect(ray.intersectObject(mesh)[0].point.distanceTo(expected)).toBeLessThan(1e-6)
  })

  it('prunes unrelated splats and restores upstream methods when disposed', async () => {
    const mesh = await fromSplats(source => {
      // Reverse order forces the BVH to reorder proxies; center column has a known hit.
      for (let i = 9999; i >= 0; i--) source.pushSplat(
        new Vector3(i % 100, Math.floor(i / 100), 0), new Vector3(.1, .1, .1), new Quaternion(), 1, new Color(),
      )
    })
    const original = mesh.raycast
    stabilizeSplatRaycast(mesh)
    const getSplat = vi.spyOn(mesh.extSplats!, 'getSplat')
    const hit = new Raycaster(new Vector3(50, 50, 100000), new Vector3(0, 0, -1)).intersectObject(mesh)[0]
    expect(hit.point.x).toBe(50)
    expect(hit.point.y).toBe(50)
    expect(hit.point.z).toBeCloseTo(.1, 3)
    expect(getSplat.mock.calls.length).toBeLessThan(100)
    mesh.dispose()
    expect(mesh.raycast).toBe(original)
    meshes.splice(meshes.indexOf(mesh), 1)
  })
})
