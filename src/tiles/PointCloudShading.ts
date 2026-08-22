import type {
  PointCloudShadingOptions,
  ResolvedPointCloudShading
} from '../types/pointCloudShading'

/**
 * 图层级点云着色运行时控制（Cesium 形字段）。
 *
 * Runtime point-cloud shading controls on a tileset layer (Cesium-shaped fields).
 */
export class PointCloudShading {
  constructor(
    private readonly state: ResolvedPointCloudShading,
    private readonly onChange: () => void
  ) {}

  /** @see PointCloudShadingOptions.attenuation */
  get attenuation() {
    return this.state.attenuation
  }

  set attenuation(value: boolean) {
    if (this.state.attenuation === value) return
    this.state.attenuation = value
    this.onChange()
  }

  /** @see PointCloudShadingOptions.geometricErrorScale */
  get geometricErrorScale() {
    return this.state.geometricErrorScale
  }

  set geometricErrorScale(value: number) {
    if (this.state.geometricErrorScale === value) return
    this.state.geometricErrorScale = value
    this.onChange()
  }

  /** @see PointCloudShadingOptions.maximumAttenuation */
  get maximumAttenuation() {
    return this.state.maximumAttenuation
  }

  set maximumAttenuation(value: number | undefined) {
    if (this.state.maximumAttenuation === value) return
    this.state.maximumAttenuation = value
    this.onChange()
  }

  /**
   * 瓦片缺少有效 geometricError 时的 attenuation 回退值。
   *
   * Attenuation fallback for tiles without a valid geometricError.
   */
  get baseResolution() {
    return this.state.baseResolution
  }

  set baseResolution(value: number | undefined) {
    if (this.state.baseResolution === value) return
    this.state.baseResolution = value
    this.onChange()
  }

  /** @see PointCloudShadingOptions.eyeDomeLighting */
  get eyeDomeLighting() {
    return this.state.eyeDomeLighting
  }

  set eyeDomeLighting(value: boolean) {
    if (this.state.eyeDomeLighting === value) return
    this.state.eyeDomeLighting = value
    this.onChange()
  }

  /** @see PointCloudShadingOptions.eyeDomeLightingStrength */
  get eyeDomeLightingStrength() {
    return this.state.eyeDomeLightingStrength
  }

  set eyeDomeLightingStrength(value: number) {
    if (this.state.eyeDomeLightingStrength === value) return
    this.state.eyeDomeLightingStrength = value
    this.onChange()
  }

  /** @see PointCloudShadingOptions.eyeDomeLightingRadius */
  get eyeDomeLightingRadius() {
    return this.state.eyeDomeLightingRadius
  }

  set eyeDomeLightingRadius(value: number) {
    if (this.state.eyeDomeLightingRadius === value) return
    this.state.eyeDomeLightingRadius = value
    this.onChange()
  }

  /** @see PointCloudShadingOptions.normalShading */
  get normalShading() {
    return this.state.normalShading
  }

  set normalShading(value: boolean) {
    if (this.state.normalShading === value) return
    this.state.normalShading = value
    this.onChange()
  }

  /**
   * 类型预留，当前 no-op。
   *
   * Reserved; currently a no-op.
   */
  get backFaceCulling() {
    return this.state.backFaceCulling
  }

  set backFaceCulling(value: boolean) {
    if (this.state.backFaceCulling === value) return
    this.state.backFaceCulling = value
    this.onChange()
  }

  /** 内部快照。Internal snapshot. */
  getResolved(): ResolvedPointCloudShading {
    return { ...this.state }
  }

  /** 批量应用选项。Applies a partial options object. */
  applyOptions(options: PointCloudShadingOptions) {
    let changed = false
    const assign = <K extends keyof ResolvedPointCloudShading>(
      key: K,
      value: ResolvedPointCloudShading[K] | undefined
    ) => {
      if (value === undefined || this.state[key] === value) return
      this.state[key] = value
      changed = true
    }

    assign('attenuation', options.attenuation)
    assign('geometricErrorScale', options.geometricErrorScale)
    if ('maximumAttenuation' in options) {
      assign('maximumAttenuation', options.maximumAttenuation)
    }
    if ('baseResolution' in options) {
      assign('baseResolution', options.baseResolution)
    }
    assign('eyeDomeLighting', options.eyeDomeLighting)
    assign('eyeDomeLightingStrength', options.eyeDomeLightingStrength)
    assign('eyeDomeLightingRadius', options.eyeDomeLightingRadius)
    assign('normalShading', options.normalShading)
    assign('backFaceCulling', options.backFaceCulling)

    if (changed) this.onChange()
  }
}
