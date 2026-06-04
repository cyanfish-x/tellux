import type { ImageryProviderOptions, ImageryProviderResourceOptions } from './types'

/**
 * 影像提供器配置，承载当前使用的影像资源。
 *
 * Imagery provider options that hold the active imagery resource.
 */
export class ImageryProvider {
  /** 影像资源配置。Imagery resource options. */
  readonly resource: ImageryProviderResourceOptions

  /**
   * 根据影像资源创建影像提供器配置。
   *
   * Creates imagery provider options from an imagery resource.
   */
  static fromResource(resource: ImageryProviderResourceOptions): ImageryProviderOptions {
    return new ImageryProvider({ resource })
  }

  /**
   * 创建影像提供器配置。
   *
   * Creates imagery provider options.
   */
  constructor(options: ImageryProviderOptions) {
    this.resource = options.resource
  }
}
