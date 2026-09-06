import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Matrix4, Object3D, PerspectiveCamera, Scene, Vector3, Vector4 } from 'three'

// Execute the installed plugin's real camera/rebase code; replace only GPU generation.
function rendererClass() {
  const source = readFileSync(new URL('../../node_modules/3d-tiles-rendererjs-3dgs-plugin/dist/index.js', import.meta.url), 'utf8')
  const code = source.slice(source.indexOf('var _cameraInverseWorldMatrix'), source.indexOf('// src/SharedSparkRendererManager.ts', source.indexOf('var _cameraInverseWorldMatrix')))
  class Spark extends Object3D {
    current = { viewToWorld: new Matrix4() }
    display = this.current
    renderedCamera = new PerspectiveCamera()
    updateInternal = vi.fn(async () => {
      this.current = { viewToWorld: new Matrix4() }
      // A pending sort can leave display pointing at the previous accumulator.
    })
    onBeforeRender(_renderer: unknown, _scene: unknown, camera: PerspectiveCamera) {
      this.renderedCamera.copy(camera)
      this.renderedCamera.matrixWorld.copy(camera.matrixWorld)
      this.renderedCamera.matrixWorldInverse.copy(camera.matrixWorldInverse)
    }
  }
  class Splat extends Object3D {}
  const constructor = new Function('SparkRenderer', 'SplatMesh', 'SplatEdit', 'Matrix42', 'Vector4', 'isGaussianSplat',
    code + '\nreturn CameraRelativeSparkRenderer;')(Spark, Splat, class extends Object3D {}, Matrix4, Vector4,
    (node: Object3D) => Boolean(node.userData.gaussianSplat))
  return { constructor, Splat }
}

describe('Gaussian cached render frame', () => {
  it('retains the cached camera-relative frame while no splat roots are visible', () => {
    const { constructor } = rendererClass()
    const spark = new constructor()
    const frame = new PerspectiveCamera()
    frame.position.set(-3978391.84, 3016004.15, -3956191.43)
    frame.rotation.set(.2, -.4, .1)
    frame.updateMatrixWorld(true)
    spark.display.viewToWorld.copy(frame.matrixWorld)
    const camera = frame.clone()
    camera.position.add(new Vector3(.1, .2, -.3))
    camera.updateMatrixWorld(true)
    const originalCamera = camera.matrixWorld.clone()
    spark.onBeforeRender({ xr: { isPresenting: false }, info: { render: { frame: 1 } } }, new Scene(), camera)
    const expected = frame.matrixWorld.clone().invert().multiply(camera.matrixWorld)
    expect(spark.renderedCamera.position.length()).toBeLessThan(1)
    expect(spark.renderedCamera.matrixWorld.elements).toEqual(expected.elements)
    expect(camera.matrixWorld.elements).toEqual(originalCamera.elements)
  })

  it('restores ECEF roots and preserves the display frame while a new sort is pending', () => {
    const { constructor, Splat } = rendererClass()
    const spark = new constructor()
    const camera = new PerspectiveCamera()
    camera.position.set(-3978400, 3016000, -3956200)
    camera.updateMatrixWorld(true)
    spark.display.viewToWorld.copy(camera.matrixWorld)
    const scene = new Scene()
    const splat = new Splat()
    splat.position.copy(camera.position).add(new Vector3(1, 2, 3))
    scene.add(splat)
    scene.updateMatrixWorld(true)
    const world = splat.matrixWorld.clone()
    const renderer = { xr: { isPresenting: false }, info: { render: { frame: 1 } },
      getCurrentViewport: (v: Vector4) => v.set(0, 0, 800, 600), state: { viewport() {} } }
    spark.onBeforeRender(renderer, scene, camera)
    expect(splat.matrixWorld.elements).toEqual(world.elements)
    expect(spark.current.viewToWorld.elements).toEqual(camera.matrixWorld.elements)
    splat.visible = false
    camera.position.x += .25
    camera.updateMatrixWorld(true)
    spark.onBeforeRender(renderer, scene, camera)
    expect(spark.renderedCamera.position.length()).toBeCloseTo(.25, 6)
    expect(splat.matrixWorld.elements).toEqual(world.elements)
  })
})
