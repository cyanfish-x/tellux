/**
 * Tellux 全局配置。
 *
 * Global Tellux configuration.
 */
export interface TelluxConfig {
  /**
   * Tellux 静态资源父级目录。
   *
   * 设置后，内置云和 STBN 纹理会从该目录加载
   * `local_weather.png`、`turbulence.png`、`shape.bin`、`shape_detail.bin` 和 `stbn.bin`。
   * 留空时使用上游包默认资源地址。
   *
   * Parent directory for Tellux static assets.
   *
   * When set, built-in cloud and STBN textures are loaded from this directory:
   * `local_weather.png`, `turbulence.png`, `shape.bin`, `shape_detail.bin`, and `stbn.bin`.
   * Leave it empty to use the upstream package defaults.
   */
  baseUrl: string
}

export const telluxConfig: TelluxConfig = {
  baseUrl: ''
}

export function getTelluxAssetUrl(defaultUrl: string): string {
  const baseUrl = telluxConfig.baseUrl.trim()
  if (baseUrl.length === 0) return defaultUrl

  const assetName = getUrlFileName(defaultUrl)
  const separator = baseUrl.endsWith('/') ? '' : '/'
  return `${baseUrl}${separator}${assetName}`
}

function getUrlFileName(url: string): string {
  const path = url.split(/[?#]/, 1)[0]
  const index = path.lastIndexOf('/')
  return index >= 0 ? path.slice(index + 1) : path
}
