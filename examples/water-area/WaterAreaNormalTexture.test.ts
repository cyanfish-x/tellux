import { describe, expect, it } from 'vitest'
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  Texture
} from 'three'

import {
  WATER_AREA_NORMAL_MAP_URLS,
  createWaterAreaNormalTexture,
  createWaterAreaNormalTextures
} from './WaterAreaNormalTexture'

describe('createWaterAreaNormalTexture', () => {
  it('creates one seamless linear-data normal texture suitable for repeated sampling', () => {
    const texture = createWaterAreaNormalTexture(64)

    expect(texture.image).toMatchObject({ width: 64, height: 64 })
    expect(texture.wrapS).toBe(RepeatWrapping)
    expect(texture.wrapT).toBe(RepeatWrapping)
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter)
    expect(texture.magFilter).toBe(LinearFilter)
    expect(texture.colorSpace).toBe(NoColorSpace)
    expect(texture.generateMipmaps).toBe(true)

    const data = texture.image.data as Uint8Array
    expect(data).toHaveLength(64 * 64 * 4)
    expect(data.some((value, index) => index % 4 !== 3 && value !== 128)).toBe(
      true
    )
  })

  it('loads and configures two independent authored normal maps', () => {
    const loadedUrls: string[] = []
    const loader = {
      load(url: string): Texture {
        loadedUrls.push(url)
        return new Texture()
      }
    }

    const textures = createWaterAreaNormalTextures(loader)

    expect(textures).toHaveLength(2)
    expect(textures[0]).not.toBe(textures[1])
    expect(loadedUrls).toEqual([...WATER_AREA_NORMAL_MAP_URLS])
    expect(loadedUrls[0]).toMatch(/Water_1_M_Normal\.jpg$/)
    expect(loadedUrls[1]).toMatch(/Water_2_M_Normal\.jpg$/)

    for (const texture of textures) {
      expect(texture.wrapS).toBe(RepeatWrapping)
      expect(texture.wrapT).toBe(RepeatWrapping)
      expect(texture.minFilter).toBe(LinearMipmapLinearFilter)
      expect(texture.magFilter).toBe(LinearFilter)
      expect(texture.colorSpace).toBe(NoColorSpace)
      expect(texture.generateMipmaps).toBe(true)
      expect(texture.anisotropy).toBe(8)
    }
  })
})
