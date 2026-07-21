import type { Object3D } from 'three'
import type { EntityPicker } from './EntityPicker'
import type { ObjectPicker } from './ObjectPicker'
import type { TilesetFeaturePicker } from './TilesetFeaturePicker'
import type { HismManager } from '../hism/core/HismManager'
import type {
  ScreenPosition,
  ViewerPickLayer,
  ViewerPickOptions,
  ViewerPickResult
} from '../types'

const DEFAULT_LAYERS: ViewerPickLayer[] = [
  'entity',
  'hismInstance',
  'tilesFeature'
]

export interface ScenePickerOptions {
  entityPicker: EntityPicker
  tilesetFeaturePicker: TilesetFeaturePicker
  objectPicker: ObjectPicker
  hismManager: HismManager
  getObjectRoot: () => Object3D
}

/**
 * 合并各子系统拾取结果，按距离排序。
 *
 * Merges subsystem pick hits and sorts by distance.
 */
export class ScenePicker {
  constructor(private readonly options: ScenePickerOptions) {}

  /**
   * 每层只取最近命中，再取全局最近。
   *
   * Takes the nearest hit per layer, then the global nearest.
   */
  pick(
    position: ScreenPosition,
    pickOptions: ViewerPickOptions = {}
  ): ViewerPickResult | null {
    const layers = this.resolveActiveLayers(pickOptions)
    let nearest: ViewerPickResult | null = null

    if (layers.includes('entity')) {
      const entity = this.options.entityPicker.pick(position, {
        tolerance: pickOptions.tolerance
      })
      if (entity) {
        nearest = keepNearest(nearest, {
          type: 'entity',
          distance: entity.distance,
          entity
        })
      }
    }

    if (layers.includes('hismInstance')) {
      const instance = this.options.hismManager.pick(position)
      if (instance) {
        nearest = keepNearest(nearest, {
          type: 'hismInstance',
          distance: instance.distance,
          instance
        })
      }
    }

    if (layers.includes('tilesFeature')) {
      const feature = this.options.tilesetFeaturePicker.pick(position)
      if (feature) {
        nearest = keepNearest(nearest, {
          type: 'tilesFeature',
          distance: feature.distance,
          feature
        })
      }
    }

    if (layers.includes('object')) {
      const root = pickOptions.root ?? this.options.getObjectRoot()
      const object = this.options.objectPicker.pick(position, root, {
        recursive: pickOptions.recursive
      })
      if (object) {
        nearest = keepNearest(nearest, {
          type: 'object',
          distance: object.distance,
          object
        })
      }
    }

    return nearest
  }

  /**
   * 合并各层全部命中，由近到远。
   *
   * Merges all hits from each layer, nearest first.
   */
  pickAll(
    position: ScreenPosition,
    pickOptions: ViewerPickOptions = {}
  ): ViewerPickResult[] {
    const layers = this.resolveActiveLayers(pickOptions)
    const hits: ViewerPickResult[] = []

    if (layers.includes('entity')) {
      const entities = this.options.entityPicker.pickEntities(position, {
        tolerance: pickOptions.tolerance
      })
      for (const entity of entities) {
        hits.push({
          type: 'entity',
          distance: entity.distance,
          entity
        })
      }
    }

    if (layers.includes('hismInstance')) {
      const instance = this.options.hismManager.pick(position)
      if (instance) {
        hits.push({
          type: 'hismInstance',
          distance: instance.distance,
          instance
        })
      }
    }

    if (layers.includes('tilesFeature')) {
      const feature = this.options.tilesetFeaturePicker.pick(position)
      if (feature) {
        hits.push({
          type: 'tilesFeature',
          distance: feature.distance,
          feature
        })
      }
    }

    if (layers.includes('object')) {
      const root = pickOptions.root ?? this.options.getObjectRoot()
      const objects = this.options.objectPicker.pickObjects(position, root, {
        recursive: pickOptions.recursive
      })
      for (const object of objects) {
        hits.push({
          type: 'object',
          distance: object.distance,
          object
        })
      }
    }

    hits.sort((a, b) => a.distance - b.distance)
    return hits
  }

  private resolveActiveLayers(options: ViewerPickOptions): ViewerPickLayer[] {
    const layers = resolveLayers(options)
    if (
      layers.includes('hismInstance') &&
      this.options.hismManager.list().length === 0
    ) {
      return layers.filter((layer) => layer !== 'hismInstance')
    }
    return layers
  }
}

function resolveLayers(options: ViewerPickOptions): ViewerPickLayer[] {
  if (options.layers && options.layers.length > 0) {
    return options.layers
  }
  if (options.root) {
    return ['object']
  }
  return DEFAULT_LAYERS
}

function keepNearest(
  current: ViewerPickResult | null,
  next: ViewerPickResult
): ViewerPickResult {
  if (!current || next.distance < current.distance) return next
  return current
}
