import * as THREE from 'three'
import type { TelluxWebGPURenderer, Viewer, ViewerPreRenderEvent } from '../../src'
import { LocalGridShoreSolver } from './LocalGridShoreSolver'
import { OceanSurface } from './OceanSurface'
import type { OceanParameters } from './parameters'
import { RIYUE_BAY_PRESET } from './RiyueBayPreset'
import { TerrainCoastAdapter } from './TerrainCoastAdapter'
import { TerrainFieldTextures } from './TerrainFieldTextures'
import { TerrainOceanMaskAdapter } from './TerrainOceanMaskAdapter'

export interface OceanManagerOptions {
  viewer: Viewer
  calibratedSeaLevel: number
  parameters: OceanParameters
  onStatus?: (message: string) => void
}

export class OceanManager {
  readonly root = new THREE.Group()
  readonly parameters: OceanParameters
  private fieldTextures!: TerrainFieldTextures
  private shoreSolver!: LocalGridShoreSolver
  private coastAdapter!: TerrainCoastAdapter
  private terrainMask!: TerrainOceanMaskAdapter
  private surface!: OceanSurface
  private readonly sun = new THREE.DirectionalLight(0xfff3d6, 4.5)
  private readonly ambient = new THREE.HemisphereLight(0xbde8ff, 0x253642, 1.35)
  private readonly previousBackground: THREE.Color | THREE.Texture | null
  /** 进入海洋前的 highPrecision，dispose 时还原。 */
  private readonly previousHighPrecision: boolean
  private readonly handlePreRender = (event: ViewerPreRenderEvent) => {
    this.update(event.deltaTime, event.time / 1000)
  }
  private isDisposed = false

  constructor(private readonly options: OceanManagerOptions) {
    if (options.viewer.rendererType !== 'webgpu') {
      throw new Error('Riyue Bay Ocean requires the Tellux WebGPU renderer.')
    }
    this.parameters = options.parameters
    const renderer = options.viewer.renderer as TelluxWebGPURenderer
    // ECEF 大坐标下 GPU float32 modelView 会抖；CPU 64-bit MV 缓解海面抖动。
    // 与 InstancedMesh / SkinnedMesh 不兼容，故仅在海洋生命周期内开启。
    this.previousHighPrecision = renderer.highPrecision
    renderer.highPrecision = true
    this.previousBackground = options.viewer.scene.threeScene.background
    options.viewer.scene.threeScene.background = new THREE.Color(0x8ec9df)
    this.root.name = 'RiyueBayOceanRoot'
    this.root.matrixAutoUpdate = false
    this.root.matrix.copy(options.viewer.cartographicToMatrix4({
      ...RIYUE_BAY_PRESET.center,
      height: options.calibratedSeaLevel
    }, {
      heading: RIYUE_BAY_PRESET.alongshoreHeading
    }))
    options.viewer.scene.threeScene.add(this.root)
    this.root.add(this.sun, this.sun.target, this.ambient)
    this.rebuildRuntime()
    options.viewer.on('preRender', this.handlePreRender)
  }

  setParameters(patch: Partial<OceanParameters>) {
    const previousQuality = this.parameters.quality
    Object.assign(this.parameters, patch)
    if (patch.quality && patch.quality !== previousQuality) {
      this.rebuildRuntime()
      this.options.onStatus?.(`Quality changed to ${patch.quality}; shore state and foam history reset.`)
      return
    }
    this.coastAdapter.updateSettings(this.parameters)
    this.shoreSolver.updateParameters(this.parameters)
    this.surface.updateParameters(this.parameters)
  }

  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
    this.options.viewer.off('preRender', this.handlePreRender)
    this.disposeRuntime()
    this.options.viewer.scene.threeScene.remove(this.root)
    this.options.viewer.scene.threeScene.background = this.previousBackground
    ;(this.options.viewer.renderer as TelluxWebGPURenderer).highPrecision =
      this.previousHighPrecision
    this.root.remove(this.sun, this.sun.target, this.ambient)
  }

  private update(deltaSeconds: number, nowSeconds: number) {
    if (this.isDisposed) return
    this.coastAdapter.update(nowSeconds)
    this.shoreSolver.update(deltaSeconds, this.parameters)
    this.surface.update(deltaSeconds, this.parameters)
    this.updateSun()
  }

  private rebuildRuntime() {
    if (this.fieldTextures) this.disposeRuntime()
    const quality = RIYUE_BAY_PRESET.quality[this.parameters.quality]
    const extent = RIYUE_BAY_PRESET.extent
    const cellSize = (extent.crossShoreMax - extent.crossShoreMin) / quality.fieldWidth
    this.fieldTextures = new TerrainFieldTextures(quality.fieldWidth, quality.fieldHeight)
    this.shoreSolver = new LocalGridShoreSolver({
      renderer: this.options.viewer.renderer as TelluxWebGPURenderer,
      width: quality.fieldWidth,
      height: quality.fieldHeight,
      cellSize,
      parameters: this.parameters
    })
    this.surface = new OceanSurface({
      root: this.root,
      parameters: this.parameters,
      field: this.fieldTextures,
      solver: this.shoreSolver
    })
    this.terrainMask = new TerrainOceanMaskAdapter(
      this.options.viewer,
      this.root,
      this.fieldTextures
    )
    this.coastAdapter = new TerrainCoastAdapter({
      viewer: this.options.viewer,
      oceanRoot: this.root,
      parameters: this.parameters,
      onField: (field) => {
        if (this.isDisposed) return
        this.fieldTextures.update(field)
        this.shoreSolver.applyTerrainField(field)
        this.surface.setWorkerMilliseconds(field.composeMilliseconds)
        const validCells = countValid(field.validity)
        this.options.onStatus?.(
          validCells === 0
            ? `Terrain r${field.revision}: waiting for complete Riyue Bay coverage…`
            : `Terrain r${field.revision}: ${validCells.toLocaleString()} cells, ` +
              `${field.pageCount} pages, ${(field.cacheBytes / 1024 / 1024).toFixed(1)} MiB cache, ` +
              `${field.composeMilliseconds.toFixed(1)} ms worker`
        )
      },
      onStatus: this.options.onStatus
    })
    this.updateSun()
  }

  private disposeRuntime() {
    this.coastAdapter?.dispose()
    this.terrainMask?.dispose()
    this.surface?.dispose()
    this.shoreSolver?.dispose()
    this.fieldTextures?.dispose()
  }

  private updateSun() {
    const elevation = THREE.MathUtils.degToRad(this.parameters.sun)
    this.sun.position.set(
      -Math.cos(elevation) * 800,
      Math.sin(elevation) * 800,
      -350
    )
    this.sun.intensity = 1.6 + this.parameters.sss * 0.35
    this.sun.target.position.set(150, 0, 0)
  }
}

function countValid(validity: Uint8Array) {
  let count = 0
  for (const value of validity) count += value > 0 ? 1 : 0
  return count
}
