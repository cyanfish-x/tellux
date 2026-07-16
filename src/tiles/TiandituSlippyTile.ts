const GZIP_ID1 = 0x1f
const GZIP_ID2 = 0x8b

/** 将弧度制经纬度转为天地图 img_w / elv_c 使用的 Web Mercator 瓦片坐标。 */
export function lonLatToTiandituTileXY(
  longitudeRad: number,
  latitudeRad: number,
  zoom: number
) {
  const scale = 2 ** zoom
  const lonDeg = (longitudeRad * 180) / Math.PI
  const latDeg = (latitudeRad * 180) / Math.PI
  const x = Math.floor(((lonDeg + 180) / 360) * scale)
  const latRad = (latDeg * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale
  )

  return {
    x: Math.max(0, Math.min(scale - 1, x)),
    y: Math.max(0, Math.min(scale - 1, y))
  }
}

export function parseTiandituServiceError(buffer: ArrayBuffer) {
  if (buffer.byteLength === 0 || buffer.byteLength > 2048) {
    return null
  }

  if (isGzip(buffer)) {
    return null
  }

  try {
    const text = new TextDecoder().decode(buffer).trim()
    if (!text.startsWith('{')) {
      return null
    }

    const payload = JSON.parse(text) as {
      msg?: string
      resolve?: string
      code?: number
    }
    const parts = [payload.msg, payload.resolve].filter(Boolean)
    if (parts.length === 0) {
      return null
    }

    return payload.code ? `[${payload.code}] ${parts.join('：')}` : parts.join('：')
  } catch {
    return null
  }
}

function isGzip(buffer: ArrayBuffer) {
  if (buffer.byteLength < 2) return false

  const bytes = new Uint8Array(buffer, 0, 2)
  return bytes[0] === GZIP_ID1 && bytes[1] === GZIP_ID2
}
