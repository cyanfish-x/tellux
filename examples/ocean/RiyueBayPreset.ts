export const RIYUE_BAY_PRESET = {
  center: { longitude: 110.2148756, latitude: 18.6296934 },
  alongshoreHeading: 68,
  seawardBearing: 158,
  extent: {
    crossShoreMin: -256,
    crossShoreMax: 768,
    alongshoreMin: -1024,
    alongshoreMax: 1024
  },
  camera: {
    longitude: 110.2163,
    latitude: 18.62635,
    height: 120,
    heading: -22,
    pitch: -12
  },
  shorelineSeeds: [
    [110.2114, 18.6280],
    [110.2130, 18.6288],
    [110.2148756, 18.6296934],
    [110.2170, 18.6307],
    [110.2192, 18.6317]
  ] as Array<[number, number]>,
  quality: {
    high: {
      fieldWidth: 1024,
      fieldHeight: 512,
      surfaceSegments: 512,
      foamSize: 512,
      noiseSize: 256
    },
    balanced: {
      fieldWidth: 512,
      fieldHeight: 256,
      surfaceSegments: 384,
      foamSize: 256,
      noiseSize: 256
    }
  }
} as const

export type RiyueBayQualityName = keyof typeof RIYUE_BAY_PRESET.quality

export function localToRiyueBayCartographic(x: number, z: number) {
  const center = RIYUE_BAY_PRESET.center
  const seaward = RIYUE_BAY_PRESET.seawardBearing * Math.PI / 180
  const alongshore = RIYUE_BAY_PRESET.alongshoreHeading * Math.PI / 180
  const east = x * Math.sin(seaward) + z * Math.sin(alongshore)
  const north = x * Math.cos(seaward) + z * Math.cos(alongshore)
  return {
    longitude: center.longitude + east / (111_320 * Math.cos(center.latitude * Math.PI / 180)),
    latitude: center.latitude + north / 110_540
  }
}
