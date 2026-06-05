import type { TemplateUrlResourceOptions } from '../types'

/**
 * 创建模板 URL 资源配置的辅助类。
 *
 * Helper for creating template URL resource options.
 */
export class TemplateUrlResource {
  /** 资源类型。Resource type. */
  readonly type = 'template-url'
  /** 瓦片 URL 模板。Tile URL template. */
  readonly url: string
  /** 瓦片级别数量。Number of tile levels. */
  readonly levels?: number
  /** 瓦片像素尺寸。Tile pixel size. */
  readonly tileDimension?: number
  /** 投影标识。Projection identifier. */
  readonly projection?: string

  /**
   * 根据瓦片 URL 模板创建资源配置。
   *
   * Creates resource options from a tile URL template.
   */
  static fromUrl(url: string, options: Omit<TemplateUrlResourceOptions, 'type' | 'url'> = {}): TemplateUrlResourceOptions {
    return new TemplateUrlResource({
      url,
      ...options
    })
  }

  /**
   * 创建模板 URL 资源配置。
   *
   * Creates template URL resource options.
   */
  constructor(options: Omit<TemplateUrlResourceOptions, 'type'>) {
    this.url = options.url
    this.levels = options.levels
    this.tileDimension = options.tileDimension
    this.projection = options.projection
  }
}
