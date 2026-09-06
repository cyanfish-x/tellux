import type { TilesRenderer } from '3d-tiles-renderer'
import type { TilesetManager } from './tiles/TilesetManager'

export let createGlobe: (manager: TilesetManager) => Globe

/**
 * 地球表面门面：裸球或当前地形，不含场景 3D Tiles。
 *
 * Globe surface facade: the base ellipsoid or current terrain, not scene 3D Tiles.
 */
export class Globe {
  static {
    createGlobe = manager => new Globe(manager)
  }

  private userShow = true

  private constructor(private readonly tilesetManager: TilesetManager) {
    this.tilesetManager.applyGlobeShow(this.userShow)
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
