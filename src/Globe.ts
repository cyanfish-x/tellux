import type { TilesRenderer } from '3d-tiles-renderer'
import type { TilesetManager } from './tiles/TilesetManager'
import { SurfaceMaterialSettings, clamp01 } from './scene/SurfaceSettings'

export let createGlobe: (manager: TilesetManager, onMaterialChange?: () => void) => Globe

const DEFAULT_GLOBE_MATERIAL = {
  roughness: 1,
  metalness: 0,
  useRoughnessMap: false
} as const

/**
 * 地球表面门面：裸球或当前地形，不含场景 3D Tiles。
 *
 * Globe surface facade: the base ellipsoid or current terrain, not scene 3D Tiles.
 */
export class Globe {
  static {
    createGlobe = (manager, onMaterialChange = () => {}) => new Globe(manager, onMaterialChange)
  }

  private userShow = true
  private userOpacity = 1
  /**
   * 地球皮肤着色。不是 Three.js `Material`，没有 `color` / `map`。
   *
   * Globe skin shading. This is not a Three.js `Material` and has no
   * `color` / `map`.
   */
  readonly material: SurfaceMaterialSettings

  private constructor(
    private readonly tilesetManager: TilesetManager,
    onMaterialChange: () => void
  ) {
    this.material = new SurfaceMaterialSettings(
      { ...DEFAULT_GLOBE_MATERIAL },
      'auto',
      onMaterialChange
    )
    this.tilesetManager.applyGlobeShow(this.userShow)
    this.tilesetManager.applyGlobeOpacity(this.userOpacity)
  }

  /**
   * 地球表面是否显示。切换地形后仍保持该意图。
   *
   * 不要直接写 {@link Globe.raw}`.group.visible`：地形重建会覆盖该值。
   *
   * Whether the globe surface is shown. The intent survives terrain switches.
   *
   * Do not write {@link Globe.raw}`.group.visible` directly; terrain rebuilds
   * overwrite that field.
   */
  get show() {
    return this.userShow
  }

  set show(value: boolean) {
    if (this.userShow === value) return
    this.userShow = value
    this.tilesetManager.applyGlobeShow(value)
  }

  /**
   * 地球皮肤整体透明度，范围 `0` 到 `1`，默认 `1`。
   *
   * `opacity === 0` 仍加载瓦片且可拾取 / 采样，不等于 {@link Globe.show}` = false`。
   *
   * Globe skin opacity from `0` to `1`. Defaults to `1`.
   *
   * `opacity === 0` still loads tiles and remains pickable / sampleable; it is
   * not the same as {@link Globe.show}` = false`.
   */
  get opacity() {
    return this.userOpacity
  }

  set opacity(value: number) {
    const nextValue = clamp01(value, 1)
    if (this.userOpacity === nextValue) return
    this.userOpacity = nextValue
    this.tilesetManager.applyGlobeOpacity(nextValue)
  }

  /**
   * 当前地球椭球，用于经纬高换算。
   *
   * Active globe ellipsoid for cartographic conversion.
   */
  get ellipsoid() {
    return this.tilesetManager.tileset.ellipsoid
  }

  /**
   * 底层 3D Tiles renderer（启用地形时为地形，否则为裸球）。
   *
   * 托管属性：`group.visible` 请改用 {@link Globe.show}。直接改可见性会在
   * 切换地形后丢失，并与内部「有地形时隐藏裸球」规则互相覆盖。
   *
   * Underlying 3D Tiles renderer (terrain when enabled, otherwise the base globe).
   *
   * Hosted property: use {@link Globe.show} instead of `group.visible`. Writing
   * visibility on this object is lost after a terrain switch and fights the
   * internal rule that hides the base globe while terrain is present.
   */
  get raw(): TilesRenderer {
    return this.tilesetManager.tileset
  }
}
