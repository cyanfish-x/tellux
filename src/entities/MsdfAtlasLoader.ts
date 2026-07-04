import * as THREE from 'three'

/**
 * MSDF atlas 字形元数据
 */
export interface MsdfGlyphMetrics {
  /** 字符Unicode码点 */
  char: string
  /** Atlas中的像素坐标 */
  x: number
  y: number
  width: number
  height: number
  /** 字形度量（相对于fontSize） */
  xoffset: number
  yoffset: number
  xadvance: number
}

/**
 * MSDF atlas 元数据格式（msdf-bmfont-xml生成的JSON）
 */
export interface MsdfAtlasData {
  info: {
    face: string
    size: number
  }
  common: {
    scaleW: number
    scaleH: number
    base: number
  }
  chars: MsdfGlyphMetrics[]
  distanceRange?: number  // MSDF距离场半径
}

/**
 * 已加载的MSDF atlas
 */
export interface MsdfAtlas {
  texture: THREE.Texture
  data: MsdfAtlasData
  glyphMap: Map<string, MsdfGlyphMetrics>
  distanceRange: number
}

/**
 * 加载MSDF atlas（JSON + PNG）
 * @param basePath - atlas文件的基础路径（不含扩展名），如 '/fonts/arial-regular'
 * @returns Promise<MsdfAtlas>
 */
export async function loadMsdfAtlas(basePath: string): Promise<MsdfAtlas> {
  const jsonPath = `${basePath}.json`
  const pngPath = `${basePath}.png`

  // 并行加载JSON和PNG
  const [dataResponse, texture] = await Promise.all([
    fetch(jsonPath).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${jsonPath}: ${res.statusText}`)
      return res.json()
    }),
    new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        pngPath,
        (tex) => {
          // MSDF 三通道存的是有符号距离，边角靠 shader 的 median(r,g,b) 重建。mipmap 会
          // 对相邻纹素的距离做盒式平均、再跨 mip 线性插值——距离场被平均后 median 失去
          // 意义，尖角被抹圆、边缘发灰。这正是小字号（缩小采样落在 mip level ~1.5）时
          // 文字发糊的主因。MSDF 的抗锯齿必须靠 fragment shader 的解析 AA
          // （screenPxRange 公式），绝不能靠 mipmap。故关闭 mipmap，min/mag 都用 Linear。
          // colorSpace 保持 NoColorSpace（这是数据纹理，不是 sRGB 颜色）。
          tex.generateMipmaps = false
          tex.minFilter = THREE.LinearFilter
          tex.magFilter = THREE.LinearFilter
          tex.colorSpace = THREE.NoColorSpace
          resolve(tex)
        },
        undefined,
        (err) => reject(new Error(`Failed to load ${pngPath}: ${(err as Error).message}`))
      )
    })
  ])

  const data = dataResponse as MsdfAtlasData

  // 构建字符到字形的映射
  const glyphMap = new Map<string, MsdfGlyphMetrics>()
  for (const glyph of data.chars) {
    glyphMap.set(glyph.char, glyph)
  }

  // 距离场半径（默认8，对齐TinySDF的TINY_RADIUS）
  const distanceRange = data.distanceRange ?? 8

  return {
    texture,
    data,
    glyphMap,
    distanceRange
  }
}

/**
 * 预加载多个MSDF atlas
 */
export async function loadMsdfAtlases(
  configs: Array<{ name: string; path: string }>
): Promise<Map<string, MsdfAtlas>> {
  const results = await Promise.all(
    configs.map(async (config) => {
      try {
        const atlas = await loadMsdfAtlas(config.path)
        return { name: config.name, atlas }
      } catch (error) {
        console.warn(`[tellux] Failed to load MSDF atlas: ${config.name}`, error)
        return null
      }
    })
  )

  const atlasMap = new Map<string, MsdfAtlas>()
  for (const result of results) {
    if (result) {
      atlasMap.set(result.name, result.atlas)
    }
  }

  return atlasMap
}

/**
 * 释放MSDF atlas资源
 */
export function disposeMsdfAtlas(atlas: MsdfAtlas) {
  atlas.texture.dispose()
  atlas.glyphMap.clear()
}
