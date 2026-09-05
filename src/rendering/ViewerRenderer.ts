import type { ViewerRendererType } from '../types'
import type { TelluxRenderer, TelluxRendererAdapter } from './RendererAdapter'

/**
 * Viewer 渲染器门面。原生 Three.js renderer 走 {@link ViewerRenderer.raw}。
 *
 * Viewer renderer facade. The native Three.js renderer is {@link ViewerRenderer.raw}.
 */
export class ViewerRenderer {
  constructor(
    private readonly adapter: TelluxRendererAdapter,
    private readonly host: {
      getResolutionScale: () => number
      setResolutionScale: (value: number) => void
    }
  ) {}

  /**
   * Renderer 类型。
   *
   * Renderer type.
   */
  get type(): ViewerRendererType {
    return this.adapter.type
  }

  /**
   * 渲染器像素比。
   *
   * 不要直接调用 {@link ViewerRenderer.raw}`.setPixelRatio()`：符号文字不会重排，
   * 3D Tiles LOD 分辨率也不会更新。
   *
   * Renderer pixel ratio.
   *
   * Do not call {@link ViewerRenderer.raw}`.setPixelRatio()` directly: glyph
   * layouts will not reflow and 3D Tiles LOD resolution will not update.
   */
  get resolutionScale() {
    return this.host.getResolutionScale()
  }

  set resolutionScale(value: number) {
    this.host.setResolutionScale(value)
  }

  /**
   * 底层 Three.js 渲染器。越过这条线后的修改由调用方自负。
   *
   * 下列属性由 Viewer 托管，请走对应入口，不要直接改原生对象：
   * - `setPixelRatio()` → {@link ViewerRenderer.resolutionScale}
   * - `toneMappingExposure` → `viewer.postProcess.toneMappingExposure`
   * - `toneMapping`：构造期固定为 AgX，改了会导致实体与高亮颜色失准
   * - `setSize()` → {@link Viewer.resize}（另有 ResizeObserver 自动维护）
   * - `setAnimationLoop()` → {@link Viewer.useDefaultRenderLoop}
   *
   * Underlying Three.js renderer. Changes past this line are the caller's
   * responsibility.
   *
   * Viewer hosts the following; use the matching entry instead of the native object:
   * - `setPixelRatio()` → {@link ViewerRenderer.resolutionScale}
   * - `toneMappingExposure` → `viewer.postProcess.toneMappingExposure`
   * - `toneMapping`: fixed to AgX at construction; changing it desyncs entity
   *   and highlight color compensation
   * - `setSize()` → {@link Viewer.resize} (also maintained by ResizeObserver)
   * - `setAnimationLoop()` → {@link Viewer.useDefaultRenderLoop}
   */
  get raw(): TelluxRenderer {
    return this.adapter.renderer
  }
}
