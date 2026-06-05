import type { ImageryLayerOptions, ImageryLayerSourceOptions, ImageryLayerStyleOptions } from './types'

export type ImageryLayerChange =
  | { type: 'structure' }
  | { type: 'visibility'; layer: ImageryLayer }
  | { type: 'style'; layer: ImageryLayer }
  | { type: 'metadata'; layer: ImageryLayer }

type LayersChangedCallback = (layers: ImageryLayer[], change: ImageryLayerChange) => void
type ImageryLayerOwner = {
  remove(id: string): boolean
  move(id: string, index: number): boolean
  update(change: Omit<ImageryLayerChange, 'layer'>): void
}

/**
 * 影像图层控制句柄。
 *
 * Imagery layer control handle.
 */
export class ImageryLayer {
  /** 图层 id。Layer id. */
  readonly id: string
  /** 图层数据源。Layer data source. */
  readonly source: ImageryLayerSourceOptions
  private currentName: string | undefined
  private currentVisible: boolean
  private currentStyle: ImageryLayerStyleOptions

  constructor(
    options: Required<Pick<ImageryLayerOptions, 'id' | 'source'>> & Omit<ImageryLayerOptions, 'id' | 'source'>,
    private readonly owner: ImageryLayerOwner
  ) {
    this.id = options.id
    this.source = options.source
    this.currentName = options.name
    this.currentVisible = options.visible ?? true
    this.currentStyle = {
      opacity: 1,
      ...options.style
    }
  }

  /** 获取图层名称。Gets the layer name. */
  getName() {
    return this.currentName
  }

  /** 设置图层名称。Sets the layer name. */
  setName(name: string | undefined) {
    if (this.currentName === name) return this

    this.currentName = name
    this.owner.update({ type: 'metadata' })
    return this
  }

  /** 获取图层是否可见。Gets whether the layer is visible. */
  isVisible() {
    return this.currentVisible
  }

  /**
   * 获取或设置图层是否显示。
   *
   * Gets or sets whether the layer is shown.
   */
  get show() {
    return this.currentVisible
  }

  set show(visible: boolean) {
    this.setVisible(visible)
  }

  /** 设置图层是否可见，并立即应用到 Viewer。Sets whether the layer is visible and applies it to Viewer. */
  setVisible(visible: boolean) {
    if (this.currentVisible === visible) return this

    this.currentVisible = visible
    this.owner.update({ type: 'visibility' })
    return this
  }

  /** 获取图层样式。Gets the layer style. */
  getStyle(): ImageryLayerStyleOptions {
    return { ...this.currentStyle }
  }

  /** 设置图层样式，并立即应用到 Viewer。Sets the layer style and applies it to Viewer. */
  setStyle(style: ImageryLayerStyleOptions) {
    this.currentStyle = {
      ...this.currentStyle,
      ...style
    }
    this.owner.update({ type: 'style' })
    return this
  }

  /** 移动图层到指定顺序。Moves the layer to a target order. */
  moveTo(index: number) {
    this.owner.move(this.id, index)
    return this
  }

  /** 从 Viewer 中移除图层。Removes the layer from Viewer. */
  remove() {
    return this.owner.remove(this.id)
  }
}

/**
 * 影像图层管理器。
 *
 * Imagery layer manager.
 */
export class LayerManager {
  private readonly layers: ImageryLayer[] = []
  private nextLayerId = 0

  constructor(
    initialLayers: ImageryLayerOptions[] = [],
    private readonly onLayersChanged: LayersChangedCallback
  ) {
    initialLayers.forEach((layer) => {
      this.layers.push(this.createLayer(layer))
    })
    if (this.layers.length > 0) {
      this.notifyLayersChanged({ type: 'structure' })
    }
  }

  /** 添加影像图层。Adds an imagery layer. */
  add(options: ImageryLayerOptions) {
    const id = options.id ?? this.createLayerId()
    if (this.layers.some((layer) => layer.id === id)) {
      throw new Error(`LayerManager: imagery layer "${id}" already exists.`)
    }

    const layer = this.createLayer({ ...options, id })
    this.layers.push(layer)
    this.notifyLayersChanged({ type: 'structure' })
    return layer
  }

  /** 根据 id 移除影像图层。Removes an imagery layer by id. */
  remove(id: string) {
    const index = this.layers.findIndex((layer) => layer.id === id)
    if (index === -1) return false

    this.layers.splice(index, 1)
    this.notifyLayersChanged({ type: 'structure' })
    return true
  }

  /** 移除全部影像图层。Removes all imagery layers. */
  removeAll() {
    if (this.layers.length === 0) return

    this.layers.length = 0
    this.notifyLayersChanged({ type: 'structure' })
  }

  /** 移动影像图层到指定顺序。Moves an imagery layer to a target order. */
  move(id: string, index: number) {
    const currentIndex = this.layers.findIndex((layer) => layer.id === id)
    if (currentIndex === -1) return false

    const [layer] = this.layers.splice(currentIndex, 1)
    this.layers.splice(this.clampLayerIndex(index), 0, layer)
    this.notifyLayersChanged({ type: 'structure' })
    return true
  }

  /** 根据 id 获取影像图层。Gets an imagery layer by id. */
  get(id: string) {
    return this.layers.find((layer) => layer.id === id) ?? null
  }

  /** 获取全部影像图层。Gets all imagery layers. */
  getAll() {
    return [...this.layers]
  }

  private createLayer(options: ImageryLayerOptions & { id?: string }) {
    const id = options.id ?? this.createLayerId()
    if (this.layers.some((layer) => layer.id === id)) {
      throw new Error(`LayerManager: imagery layer "${id}" already exists.`)
    }

    let layer: ImageryLayer
    layer = new ImageryLayer({
      ...options,
      id
    }, {
      remove: (layerId) => this.remove(layerId),
      move: (layerId, index) => this.move(layerId, index),
      update: (change) => this.notifyLayersChanged({ ...change, layer })
    })

    return layer
  }

  private notifyLayersChanged(change: ImageryLayerChange) {
    this.onLayersChanged(this.getAll(), change)
  }

  private createLayerId() {
    do {
      this.nextLayerId += 1
    } while (this.layers.some((layer) => layer.id === `imagery-layer-${this.nextLayerId}`))

    return `imagery-layer-${this.nextLayerId}`
  }

  private clampLayerIndex(index: number) {
    return Math.min(Math.max(0, index), this.layers.length)
  }
}
