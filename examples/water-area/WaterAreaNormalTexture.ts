import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  TextureLoader,
  type Texture,
  UnsignedByteType
} from 'three'

export const WATER_AREA_NORMAL_MAP_URLS = [
  new URL('./assets/Water_1_M_Normal.jpg', import.meta.url).href,
  new URL('./assets/Water_2_M_Normal.jpg', import.meta.url).href
] as const

export type WaterAreaNormalTextures = readonly [Texture, Texture]

type WaterAreaTextureLoader = Pick<TextureLoader, 'load'>

const TAU = Math.PI * 2

interface WaveComponent {
  x: number
  y: number
  amplitude: number
  phase: number
}

// Integer frequencies make the generated height field periodic at every edge.
const WAVE_COMPONENTS: readonly WaveComponent[] = [
  { x: 1, y: 2, amplitude: 0.2, phase: 0.3 },
  { x: -3, y: 1, amplitude: 0.12, phase: 1.7 },
  { x: 4, y: 5, amplitude: 0.055, phase: 2.8 },
  { x: -7, y: 3, amplitude: 0.035, phase: 4.1 }
]

function encodeNormalComponent(value: number): number {
  return Math.round((value * 0.5 + 0.5) * 255)
}

/**
 * 创建确定性、无缝且无需外部许可资源的水面法线纹理。
 * Creates a deterministic seamless water normal texture without external assets.
 */
export function createWaterAreaNormalTexture(size = 128): DataTexture {
  const width = Math.max(4, Math.floor(size))
  const data = new Uint8Array(width * width * 4)

  for (let y = 0; y < width; y += 1) {
    const v = y / width
    for (let x = 0; x < width; x += 1) {
      const u = x / width
      let derivativeU = 0
      let derivativeV = 0

      for (const wave of WAVE_COMPONENTS) {
        const phase = TAU * (wave.x * u + wave.y * v) + wave.phase
        const slope = Math.cos(phase) * wave.amplitude * TAU
        derivativeU += slope * wave.x
        derivativeV += slope * wave.y
      }

      const inverseLength =
        1 / Math.hypot(derivativeU, derivativeV, 1)
      const offset = (y * width + x) * 4
      data[offset] = encodeNormalComponent(-derivativeU * inverseLength)
      data[offset + 1] = encodeNormalComponent(-derivativeV * inverseLength)
      data[offset + 2] = encodeNormalComponent(inverseLength)
      data[offset + 3] = 255
    }
  }

  const texture = new DataTexture(
    data,
    width,
    width,
    RGBAFormat,
    UnsignedByteType
  )
  texture.name = 'WaterAreaNormalTexture'
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

function configureWaterAreaNormalTexture(
  texture: Texture,
  index: number
): Texture {
  texture.name = `WaterAreaNormalTexture${index + 1}`
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = true
  texture.anisotropy = 8
  return texture
}

/**
 * 加载并配置 Three.js Water2 案例使用的两张水面法线贴图。
 * Loads and configures the two water normal maps used by the Three.js Water2 example.
 */
export function createWaterAreaNormalTextures(
  loader: WaterAreaTextureLoader = new TextureLoader()
): WaterAreaNormalTextures {
  return [
    configureWaterAreaNormalTexture(
      loader.load(WATER_AREA_NORMAL_MAP_URLS[0]),
      0
    ),
    configureWaterAreaNormalTexture(
      loader.load(WATER_AREA_NORMAL_MAP_URLS[1]),
      1
    )
  ]
}
