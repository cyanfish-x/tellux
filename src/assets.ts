/**
 * Tellux 内置静态资源名称。
 *
 * Built-in Tellux static asset names.
 */
export type TelluxAssetName =
  | 'localWeather'
  | 'turbulence'
  | 'shape'
  | 'shapeDetail'
  | 'stbn'
  | 'stars'

/**
 * Tellux 内置静态资源文件名。
 *
 * Built-in Tellux static asset file names.
 */
export const telluxAssetFileNames: Record<TelluxAssetName, string> = {
  localWeather: 'local_weather.png',
  turbulence: 'turbulence.png',
  shape: 'shape.bin',
  shapeDetail: 'shape_detail.bin',
  stbn: 'stbn.bin',
  stars: 'stars.bin'
}

/**
 * Tellux 内置静态资源 URL。
 *
 * 在现代打包器中，这些 URL 会被解析为应用构建产物中的静态资源地址。
 *
 * Built-in Tellux static asset URLs.
 *
 * In modern bundlers, these URLs are resolved to static asset URLs in the app build output.
 */
export const telluxAssetUrls: Record<TelluxAssetName, string> = {
  localWeather: new URL('./assets/tellux/local_weather.png', import.meta.url).href,
  turbulence: new URL('./assets/tellux/turbulence.png', import.meta.url).href,
  shape: new URL('./assets/tellux/shape.bin', import.meta.url).href,
  shapeDetail: new URL('./assets/tellux/shape_detail.bin', import.meta.url).href,
  stbn: new URL('./assets/tellux/stbn.bin', import.meta.url).href,
  stars: new URL('./assets/tellux/stars.bin', import.meta.url).href
}
