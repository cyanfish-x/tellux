import type { MVTResourceOptions } from './types'

/**
 * 创建 Mapbox Vector Tile 资源配置的辅助类。
 *
 * Helper for creating Mapbox Vector Tile resource options.
 */
export class MVTResource {
  /** 资源类型。Resource type. */
  readonly type = 'mvt'
  /** 矢量瓦片 URL 模板。Vector tile URL template. */
  readonly url: string
  /** 瓦片级别数量。Number of tile levels. */
  readonly levels?: number
  /** 投影标识。Projection identifier. */
  readonly projection?: string
  /** 生成纹理的画布分辨率。Canvas resolution used to rasterize vector tiles. */
  readonly resolution?: number
  /** 图层透明度。Layer opacity. */
  readonly opacity?: number
  /** 图层颜色乘色。Layer color tint. */
  readonly color?: number | string
  /** 是否把 alpha 通道作为遮罩。Whether the alpha channel is used as a mask. */
  readonly alphaMask?: boolean
  /** 是否反转 alpha 遮罩。Whether the alpha mask is inverted. */
  readonly alphaInvert?: boolean
  /** 请求配置。Request options. */
  readonly fetchOptions?: RequestInit
  /** 要应用到 MVT feature 的样式回调。Style callback applied to MVT features. */
  readonly getStyle?: MVTResourceOptions['getStyle']

  /**
   * 根据 MVT 瓦片 URL 模板创建资源配置。
   *
   * Creates resource options from an MVT tile URL template.
   */
  static fromUrl(url: string, options: Omit<MVTResourceOptions, 'type' | 'url'> = {}): MVTResourceOptions {
    return new MVTResource({
      url,
      ...options
    })
  }

  /**
   * 创建 MVT 资源配置。
   *
   * Creates MVT resource options.
   */
  constructor(options: Omit<MVTResourceOptions, 'type'>) {
    this.url = options.url
    this.levels = options.levels
    this.projection = options.projection
    this.resolution = options.resolution
    this.opacity = options.opacity
    this.color = options.color
    this.alphaMask = options.alphaMask
    this.alphaInvert = options.alphaInvert
    this.fetchOptions = options.fetchOptions
    this.getStyle = options.getStyle
  }
}
