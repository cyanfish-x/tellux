/**
 * CesiumSunSky / Unreal 正午太阳照度语义锚（lux）。
 * 只映射到 Takram `SunDirectionalLight.intensity` 的缩放，禁止直接写成 111000，
 * 也不要把 111000/10 写进点光或 `emissiveIntensity`。
 *
 * CesiumSunSky / Unreal noon sun illuminance anchor in lux.
 * Maps only to a Takram `SunDirectionalLight.intensity` scale; never assign
 * 111000 onto the GPU light, and never apply 111000/10 to local lights.
 */
export const PHOTOMETRIC_NOON_SUN_ILLUMINANCE = 111000

export interface PhotometricLightingState {
  enabled: boolean
  sunIlluminance: number
}

/**
 * 把正午 lux 锚换成 Takram 太阳强度缩放。未启用时返回 1。
 *
 * Converts the noon lux anchor into a Takram sun intensity scale. Returns 1
 * when photometric lighting is disabled.
 */
export function photometricSunScale(photometric: PhotometricLightingState) {
  if (!photometric.enabled) return 1
  return Math.max(0, photometric.sunIlluminance) / PHOTOMETRIC_NOON_SUN_ILLUMINANCE
}

/**
 * `sunLightIntensity` 仍是用户倍率；启用光度后乘上 lux 锚缩放。
 *
 * `sunLightIntensity` remains a user scale; photometric mode multiplies it by
 * the lux-anchor scale.
 */
export function scaleSunLightIntensity(
  sunLightIntensity: number,
  photometric: PhotometricLightingState
) {
  return Math.max(0, sunLightIntensity) * photometricSunScale(photometric)
}
