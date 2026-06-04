import type { CesiumIonResourceOptions } from './types'

/**
 * 创建 Cesium Ion 资源配置的辅助类。
 *
 * Helper for creating Cesium Ion resource options.
 */
export class CesiumIonResource {
  /**
   * 根据 Cesium Ion 资源 id 和 token 配置创建资源选项。
   *
   * Creates a resource option object from a Cesium Ion asset id and token options.
   */
  static fromAssetId(assetId: string | number, options: Omit<CesiumIonResourceOptions, 'type' | 'assetId'>): CesiumIonResourceOptions {
    return {
      type: 'cesium-ion',
      assetId,
      ...options
    }
  }
}
