import type { WMSResourceOptions } from '../types'

/**
 * 创建 WMS 影像资源配置的辅助类。
 *
 * Helper for creating WMS imagery resource options.
 */
export class WMSResource {
  /** 资源类型。Resource type. */
  readonly type = 'wms'
  /** WMS 服务基础 URL。WMS service base URL. */
  readonly url: string
  /** WMS 图层名。WMS layer name. */
  readonly layer: string
  /** 坐标参考系。Coordinate reference system. */
  readonly crs?: string
  /** 图片格式。Image format. */
  readonly format?: string
  /** 瓦片像素尺寸。Tile pixel size. */
  readonly tileDimension?: number
  /** WMS 样式名。WMS style name. */
  readonly styles?: string
  /** WMS 版本。WMS version. */
  readonly version?: string
  /** 瓦片级别数量。Number of tile levels. */
  readonly levels?: number
  /** 是否请求透明背景。Whether to request a transparent background. */
  readonly transparent?: boolean
  /** 内容范围。Content bounds. */
  readonly contentBoundingBox?: [number, number, number, number]
  /** 请求 URL 预处理函数。Request URL preprocessing callback. */
  readonly preprocessURL?: (url: string) => string | null
  /** 请求配置。Request options. */
  readonly fetchOptions?: RequestInit

  /**
   * 根据 WMS 服务 URL 和图层名创建资源配置。
   *
   * Creates resource options from a WMS service URL and layer name.
   */
  static fromUrl(
    url: string,
    layer: string,
    options: Omit<WMSResourceOptions, 'type' | 'url' | 'layer'> = {}
  ): WMSResourceOptions {
    return new WMSResource({
      url,
      layer,
      ...options
    })
  }

  /**
   * 创建 WMS 资源配置。
   *
   * Creates WMS resource options.
   */
  constructor(options: Omit<WMSResourceOptions, 'type'>) {
    this.url = options.url
    this.layer = options.layer
    this.crs = options.crs
    this.format = options.format
    this.tileDimension = options.tileDimension
    this.styles = options.styles
    this.version = options.version
    this.levels = options.levels
    this.transparent = options.transparent
    this.contentBoundingBox = options.contentBoundingBox
    this.preprocessURL = options.preprocessURL
    this.fetchOptions = options.fetchOptions
  }
}
