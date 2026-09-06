import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
// Test the actual Three.js state cache, without a browser or GPU.
// @ts-expect-error Internal Three.js module has no declaration file.
import { WebGLState } from 'three/src/renderers/webgl/WebGLState.js'
// @ts-expect-error Internal upstream module has no declaration file.
import { XYZImageSource } from '3d-tiles-renderer/src/three/plugins/images/sources/XYZImageSource.js'
import { ARCGIS_WORLD_IMAGERY_URL } from '../map-sources.config'

function context() {
  let flip = false
  const gl: any = new Proxy({
    pixelStorei: (name: string, value: boolean) => { if (name === 'UNPACK_FLIP_Y_WEBGL') flip = value },
    getParameter: (name: string) => name === 'VERSION' ? 'WebGL 2.0' : name === 'UNPACK_FLIP_Y_WEBGL' ? flip : [0, 0, 1, 1],
  } as Record<string, any>, {
    get: (target, key: string) => key in target ? target[key] : /^[A-Z_0-9]+$/.test(key) ? key : () => {},
  })
  return { gl, state: WebGLState(gl, { has: () => false }) }
}

describe('Spark texture upload / Three.js cache compatibility', () => {
  it('uses ArcGIS level/row/column order and north-origin XYZ tile rows', async () => {
    const source = new XYZImageSource({ url: ARCGIS_WORLD_IMAGERY_URL })
    await source.init()
    expect(source.getUrl(3, 5, 4)).toBe('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/5/3')
    expect(source.tiling.flipY).toBe(true)
  })
  it('demonstrates stale flip state after a raw Spark upload', () => {
    const { gl, state } = context()
    state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    expect(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL)).toBe(false)
  })

  it('keeps subsequent image upload orientation after each patched upload site', () => {
    const source = readFileSync(createRequire(import.meta.url).resolve('@sparkjsdev/spark').replace('spark.cjs.js', 'spark.module.js'), 'utf8')
    const writes = source.match(/(?:renderer\.state|gl)\.pixelStorei\(gl\.UNPACK_FLIP_Y_WEBGL, false\);/g) ?? []
    expect(writes).toHaveLength(3)
    for (const write of writes) {
      const { gl, state } = context()
      state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      new Function('renderer', 'gl', write)({ state }, gl)
      state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      expect(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL)).toBe(true)
    }
  })
})
