import { telluxAssetFileNames, telluxAssetUrls, type TelluxAssetName } from './assets'

/**
 * Tellux 全局配置。
 *
 * Global Tellux configuration.
 */
export interface TelluxConfig {
  /**
   * Tellux 静态资源父级目录。
   *
   * 现代打包器默认会自动打包 Tellux 内置资源。设置后，内置云、STBN 和星空资源会改从该目录加载
   * `local_weather.png`、`turbulence.png`、`shape.bin`、`shape_detail.bin`、`stbn.bin` 和 `stars.bin`。
   * 留空时使用 Tellux 包内置资源。
   *
   * Parent directory for Tellux static assets.
   *
   * Modern bundlers automatically bundle Tellux built-in assets by default. When set, built-in cloud,
   * STBN, and star field assets are loaded from this directory:
   * `local_weather.png`, `turbulence.png`, `shape.bin`, `shape_detail.bin`, `stbn.bin`, and `stars.bin`.
   * Leave it empty to use Tellux packaged assets.
   */
  baseUrl: string
}

export const telluxConfig: TelluxConfig = {
  baseUrl: ''
}

export function getTelluxAssetUrl(assetName: TelluxAssetName): string {
  const baseUrl = telluxConfig.baseUrl.trim()
  if (baseUrl.length === 0) return telluxAssetUrls[assetName]

  const fileName = telluxAssetFileNames[assetName]
  const separator = baseUrl.endsWith('/') ? '' : '/'
  return `${baseUrl}${separator}${fileName}`
}
