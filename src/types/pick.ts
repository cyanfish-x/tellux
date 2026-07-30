import type { Object3D } from 'three'
import type { PickedEntity } from './entities'
import type { HismPickResult } from './hism'
import type { Picked3DTilesFeature, PickedObject } from './spatial'

/**
 * 对象拾取图层（不含地表经纬高查询）。
 *
 * Object pick layers (excludes cartographic surface queries).
 */
export type ViewerPickLayer =
  | 'entity'
  | 'tilesFeature'
  | 'hismInstance'
  | 'object'

/**
 * 统一对象拾取选项。
 *
 * Unified object pick options.
 */
export interface ViewerPickOptions {
  /**
   * 参与拾取的图层。默认 `['entity', 'hismInstance', 'tilesFeature']`。
   * 传入 `root` 且未显式指定 `layers` 时，默认为 `['object']`。
   *
   * Layers to test. Defaults to `['entity', 'hismInstance', 'tilesFeature']`.
   * When `root` is set and `layers` is omitted, defaults to `['object']`.
   */
  layers?: ViewerPickLayer[]
  /**
   * Object 图层的拾取根节点；缺省为整棵 `threeScene`。
   *
   * Root for the object layer; defaults to the whole `threeScene`.
   */
  root?: Object3D
  /**
   * Object 图层是否递归子节点，默认 `true`。
   *
   * Whether the object layer traverses children. Defaults to `true`.
   */
  recursive?: boolean
  /**
   * 点 / 线实体的屏幕空间容差（CSS 像素）。
   *
   * Screen-space tolerance for point / polyline entities in CSS pixels.
   */
  tolerance?: number
  /**
   * `pickAll` 最多返回的命中数。先完成全局距离排序，再截取结果；默认不限制。
   *
   * Maximum number of hits returned by `pickAll`. Applied after global distance
   * sorting. Unlimited by default.
   */
  limit?: number
}

/**
 * 统一对象拾取结果（按距离可比）。
 *
 * Unified object pick hit (comparable by distance).
 */
export type ViewerPickResult =
  | {
      type: 'entity'
      distance: number
      entity: PickedEntity
    }
  | {
      type: 'tilesFeature'
      distance: number
      feature: Picked3DTilesFeature
    }
  | {
      type: 'hismInstance'
      distance: number
      instance: HismPickResult
    }
  | {
      type: 'object'
      distance: number
      object: PickedObject
    }
