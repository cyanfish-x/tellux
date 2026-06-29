import * as THREE from 'three'

/**
 * 创建一个带抗锯齿描边的圆形纹理，供点图形使用。
 *
 * Creates an anti-aliased filled-circle texture with an optional outline for
 * point graphics.
 *
 * @param outlineRatio 描边占纹理半径的比例，`0` 表示无描边。
 *                     Outline ratio of the texture radius; `0` disables outline.
 */
export function createCircleTexture(outlineRatio = 0): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  const center = size / 2

  if (outlineRatio > 0) {
    context.beginPath()
    context.arc(center, center, center, 0, Math.PI * 2)
    context.closePath()
    context.fillStyle = '#ffffff'
    context.fill()
  }

  const innerRadius = center * (1 - outlineRatio)
  context.beginPath()
  context.arc(center, center, innerRadius, 0, Math.PI * 2)
  context.closePath()
  context.fillStyle = '#ffffff'
  context.fill()

  const texture = new THREE.CanvasTexture(canvas)
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
