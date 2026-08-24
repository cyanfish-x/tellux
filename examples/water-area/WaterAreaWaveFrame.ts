import { Vector3 } from 'three'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'

export interface WaterAreaWaveFrame {
  originECEF: Vector3
  eastECEF: Vector3
  northECEF: Vector3
  upECEF: Vector3
}

export interface WaterAreaWaveOrigin {
  longitude: number
  latitude: number
}

export const DEFAULT_WATER_AREA_WAVE_ORIGIN = Object.freeze({
  longitude: -111.98797078872424,
  latitude: 70.33265443539143
})

export function resolveWaterAreaWaveOrigin(
  waveOrigin: WaterAreaWaveOrigin | undefined,
  cameraOrigin: WaterAreaWaveOrigin
): WaterAreaWaveOrigin {
  const origin = waveOrigin ?? cameraOrigin
  return {
    longitude: origin.longitude,
    latitude: origin.latitude
  }
}

/**
 * 从经纬度建立固定的 ECEF/ENU 波纹坐标框架。
 * Creates a fixed ECEF/ENU wave frame from longitude and latitude in degrees.
 */
export function createWaterAreaWaveFrame(
  longitude: number,
  latitude: number
): WaterAreaWaveFrame {
  const originECEF = new Geodetic(
    radians(longitude),
    radians(latitude),
    0
  ).toECEF()
  const eastECEF = new Vector3()
  const northECEF = new Vector3()
  const upECEF = new Vector3()
  Ellipsoid.WGS84.getEastNorthUpVectors(
    originECEF,
    eastECEF,
    northECEF,
    upECEF
  )
  return { originECEF, eastECEF, northECEF, upECEF }
}
