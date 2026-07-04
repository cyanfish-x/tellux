import TinySDF from '@mapbox/tiny-sdf'

/**
 * 优化版的 TinySDF，改进字形渲染质量
 *
 * 主要优化：
 * 1. 禁用 Canvas 的所有平滑插值
 * 2. 使用更精确的文字渲染设置
 * 3. 可选的字形质量参数
 */
export default class OptimizedTinySDF extends TinySDF {
  constructor(options: {
    fontSize?: number
    buffer?: number
    radius?: number
    cutoff?: number
    fontFamily?: string
    fontWeight?: string
    fontStyle?: string
    lang?: string
  } = {}) {
    // 过滤掉 undefined 的 lang
    const { lang, ...rest } = options
    super({
      ...rest,
      ...(lang !== undefined ? { lang } : {})
    })

    // 优化 Canvas Context 设置
    const ctx = (this as any).ctx as CanvasRenderingContext2D

    // 禁用所有平滑插值
    ctx.imageSmoothingEnabled = false

    // 使用更高质量的文字渲染（如果浏览器支持）
    // @ts-ignore - 非标准属性
    if ('textRendering' in ctx) {
      // @ts-ignore
      ctx.textRendering = 'geometricPrecision'
    }

    // @ts-ignore - 非标准属性
    if ('imageSmoothingQuality' in ctx) {
      // @ts-ignore
      ctx.imageSmoothingQuality = 'high'
    }
  }

  draw(char: string) {
    const ctx = (this as any).ctx as CanvasRenderingContext2D

    // 每次绘制前确保设置正确
    ctx.imageSmoothingEnabled = false

    // 调用父类方法
    return super.draw(char)
  }
}
