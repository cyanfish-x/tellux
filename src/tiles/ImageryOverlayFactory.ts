import * as THREE from 'three'
import * as TilesRendererPlugins from '3d-tiles-renderer/plugins'
import {
  CesiumIonOverlay,
  GeoJSONOverlay,
  ImageOverlayPlugin,
  WMSTilesOverlay,
  type ImageOverlay,
  XYZTilesOverlay
} from '3d-tiles-renderer/plugins'
import type { ImageryLayer } from '../LayerManager'
import type {
  GeoJSONGetStyleCallback,
  GeoJSONImagerySourceOptions,
  ImageryLayerSourceOptions,
  ImageryLayerStyleOptions,
  MVTGetStyleCallback,
  MVTImagerySourceOptions,
  WMSImagerySourceOptions
} from '../types'
import type { ThreeRendererWithEffects } from '../effects'

type MVTOverlayOptions = {
  url: string
  levels?: number
  projection?: string
  resolution?: number
  opacity?: number
  color?: THREE.ColorRepresentation
  getStyle?: MVTGetStyleCallback
}

type MVTOverlayInstance = ImageOverlay & {
  fetchOptions: RequestInit
  getTexture(range: number[]): THREE.Texture | null
  lockTexture(range: number[]): Promise<THREE.Texture | null>
}

type MVTOverlayConstructor = new (options: MVTOverlayOptions) => MVTOverlayInstance

type GeoJSONOverlayOptions = {
  geojson?: GeoJSONImagerySourceOptions['geojson']
  url?: string
  resolution?: number
  pointRadius?: number
  strokeStyle?: string
  strokeWidth?: number
  fillStyle?: string
  opacity?: number
  color?: THREE.ColorRepresentation
  getStyle?: GeoJSONGetStyleCallback
  preprocessURL?: (url: string) => string | null
}

type FetchableImageSource = {
  fetchData(url: string, options?: RequestInit): Promise<Response>
}

type GeoJSONOverlayInstance = ImageOverlay & {
  imageSource?: FetchableImageSource
  getTexture(range: number[]): THREE.Texture | null
  lockTexture(range: number[]): Promise<THREE.Texture | null>
  fetch(url: string, options?: RequestInit): Promise<Response>
}

type GeoJSONOverlayConstructor = new (options: GeoJSONOverlayOptions) => GeoJSONOverlayInstance

type ReleasableImageSource = {
  release(...args: number[]): void
}

type WMSOverlayInstance = InstanceType<typeof WMSTilesOverlay> & {
  imageSource?: ReleasableImageSource
  getTexture(range: number[], level?: number | null): THREE.Texture | null
  lockTexture(range: number[], level?: number | null): Promise<THREE.Texture | null>
}

type RegionVisibleOverlayInstance = ImageOverlay & {
  setRegionVisible(range: number[], visible: boolean): void
}

export type ImageryOverlayContextOptions = {
  resolution?: number
  enableTileSplitting?: boolean
}

export type ImageryOverlayContext = {
  plugin: ImageOverlayPlugin
  overlays: Map<string, ImageOverlay>
}

export type ImageryOverlayFactoryOptions = {
  renderer: ThreeRendererWithEffects
  transparentOverlayTexture: THREE.Texture
}

const { MVTOverlay } = TilesRendererPlugins as unknown as {
  MVTOverlay: MVTOverlayConstructor
}

const TelluxGeoJSONOverlay = GeoJSONOverlay as unknown as GeoJSONOverlayConstructor

export class ImageryOverlayFactory {
  constructor(private readonly options: ImageryOverlayFactoryOptions) {}

  createContext(
    layers: ImageryLayer[],
    getLayerOrder: (layer: ImageryLayer) => number,
    options: ImageryOverlayContextOptions = {}
  ): ImageryOverlayContext {
    const plugin = new ImageOverlayPlugin({
      renderer: this.options.renderer,
      overlays: [],
      resolution: options.resolution,
      enableTileSplitting: options.enableTileSplitting ?? true
    })
    const overlays = new Map<string, ImageOverlay>()

    layers.forEach((layer) => {
      if (!layer.isVisible()) return

      const overlay = this.createOverlay(layer.source, layer.getStyle())
      if (overlay) {
        this.applyLayerStyleToOverlay(layer, overlay)
        overlays.set(layer.id, overlay)
        plugin.addOverlay(overlay, getLayerOrder(layer))
      }
    })

    return { plugin, overlays }
  }

  createOverlay(source: ImageryLayerSourceOptions, style: ImageryLayerStyleOptions = {}): ImageOverlay | null {
    let overlay: ImageOverlay

    switch (source.type) {
      case 'xyz':
        overlay = new XYZTilesOverlay({
          url: source.url,
          levels: source.levels,
          tileDimension: source.tileDimension,
          projection: source.projection,
          opacity: style.opacity,
          color: style.color === undefined ? undefined : new THREE.Color(style.color)
        })
        break
      case 'cesium-ion':
        overlay = new CesiumIonOverlay({
          apiToken: source.apiToken,
          assetId: source.assetId,
          autoRefreshToken: source.autoRefreshToken ?? true,
          opacity: style.opacity,
          color: style.color === undefined ? undefined : new THREE.Color(style.color)
        })
        break
      case 'geojson':
        overlay = this.createGeoJSONOverlay(source, style)
        break
      case 'mvt':
        overlay = this.createMVTOverlay(source, style)
        break
      case 'wms':
        overlay = this.createWMSOverlay(source, style)
        break
    }

    this.patchRegionVisibilityGuard(overlay)
    return overlay
  }

  applyLayerStyleToOverlay(layer: ImageryLayer, overlay: ImageOverlay) {
    const style = layer.getStyle()
    overlay.opacity = style.opacity ?? 1
    if (style.color !== undefined) {
      overlay.color = new THREE.Color(style.color)
    } else if (overlay.color instanceof THREE.Color) {
      overlay.color.set(0xffffff)
    } else {
      overlay.color = new THREE.Color(0xffffff)
    }
  }

  private createGeoJSONOverlay(resource: GeoJSONImagerySourceOptions, style: ImageryLayerStyleOptions = {}) {
    const overlay = new TelluxGeoJSONOverlay({
      geojson: resource.geojson,
      url: resource.url ? this.normalizeResourceUrl(resource.url) : undefined,
      resolution: resource.resolution,
      pointRadius: style.pointRadius,
      strokeStyle: style.stroke,
      strokeWidth: style.strokeWidth,
      fillStyle: style.fill,
      opacity: style.opacity,
      color: style.color,
      getStyle: this.createGeoJSONGetStyle(style),
      preprocessURL: resource.preprocessURL
    })

    if (resource.fetchOptions || resource.preprocessURL) {
      const fetchOptions = resource.fetchOptions
      const fetchGeoJSON = (url: string, options: RequestInit = {}) => {
        const normalizedUrl = resource.preprocessURL ? resource.preprocessURL(url) : url
        if (normalizedUrl === null) {
          return Promise.reject(new Error('TilesetManager: GeoJSON URL preprocessing returned null.'))
        }

        return fetch(normalizedUrl, this.mergeFetchOptions(fetchOptions, options))
      }

      overlay.fetch = fetchGeoJSON
      if (overlay.imageSource) {
        overlay.imageSource.fetchData = fetchGeoJSON
      }
    }

    this.patchMissingTextureFallback(overlay)
    return overlay
  }

  private createGeoJSONGetStyle(style: ImageryLayerStyleOptions): GeoJSONGetStyleCallback | undefined {
    const getStyle = style.getStyle as GeoJSONGetStyleCallback | undefined
    if (!getStyle) return undefined

    const defaultStyle = {
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      radius: style.pointRadius
    }

    return (feature, properties) => {
      const featureStyle = getStyle(feature, properties)
      return featureStyle === null ? null : {
        ...defaultStyle,
        ...featureStyle
      }
    }
  }

  private createMVTOverlay(resource: MVTImagerySourceOptions, style: ImageryLayerStyleOptions = {}) {
    const getStyle = (style.getStyle as MVTGetStyleCallback | undefined) ?? (() => ({}))
    const overlay = new MVTOverlay({
      url: resource.url,
      levels: resource.levels,
      projection: resource.projection,
      resolution: resource.resolution,
      opacity: style.opacity,
      color: style.color,
      getStyle
    })

    if (resource.fetchOptions) {
      overlay.fetchOptions = resource.fetchOptions
    }

    this.patchMissingTextureFallback(overlay)
    return overlay
  }

  private createWMSOverlay(resource: WMSImagerySourceOptions, style: ImageryLayerStyleOptions = {}) {
    const overlay = new WMSTilesOverlay({
      url: this.normalizeResourceUrl(resource.url),
      layer: resource.layer,
      crs: resource.crs,
      format: resource.format,
      tileDimension: resource.tileDimension,
      styles: resource.styles,
      version: resource.version,
      levels: resource.levels,
      transparent: resource.transparent,
      contentBoundingBox: this.normalizeWMSContentBoundingBox(resource),
      opacity: style.opacity,
      color: style.color === undefined ? undefined : new THREE.Color(style.color),
      preprocessURL: this.createWMSPreprocessURL(resource)
    }) as WMSOverlayInstance

    if (resource.fetchOptions) {
      overlay.fetchOptions = resource.fetchOptions
    }

    this.patchMissingWMSReleaseGuard(overlay)
    this.patchMissingTextureFallback(overlay)

    return overlay
  }

  private patchMissingWMSReleaseGuard(overlay: WMSOverlayInstance) {
    const imageSource = overlay.imageSource
    if (!imageSource) return

    const release = imageSource.release.bind(imageSource)
    imageSource.release = (...args: number[]) => {
      try {
        release(...args)
      } catch (error) {
        if (this.isMissingDataCacheReleaseError(error)) return
        throw error
      }
    }
  }

  private patchMissingTextureFallback(overlay: Pick<GeoJSONOverlayInstance | MVTOverlayInstance | WMSOverlayInstance, 'getTexture' | 'lockTexture'>) {
    const getTexture = overlay.getTexture.bind(overlay)
    overlay.getTexture = (range: number[], level?: number | null) => {
      return getTexture(range, level) ?? this.options.transparentOverlayTexture
    }

    const lockTexture = overlay.lockTexture.bind(overlay)
    overlay.lockTexture = async (range: number[], level?: number | null) => {
      return (await lockTexture(range, level)) ?? this.options.transparentOverlayTexture
    }
  }

  private patchRegionVisibilityGuard(overlay: ImageOverlay) {
    const regionOverlay = overlay as Partial<RegionVisibleOverlayInstance>
    if (typeof regionOverlay.setRegionVisible !== 'function') return

    const setRegionVisible = regionOverlay.setRegionVisible.bind(overlay)
    const visibleRegionCounts = new Map<string, number>()

    regionOverlay.setRegionVisible = (range: number[], visible: boolean) => {
      const key = range.join('_')
      const count = visibleRegionCounts.get(key) ?? 0

      if (!visible && count === 0) return

      if (visible) {
        visibleRegionCounts.set(key, count + 1)
      } else if (count === 1) {
        visibleRegionCounts.delete(key)
      } else {
        visibleRegionCounts.set(key, count - 1)
      }

      setRegionVisible(range, visible)
    }
  }

  private isMissingDataCacheReleaseError(error: unknown) {
    return error instanceof Error &&
      error.message === 'DataCache: Attempting to release key that does not exist'
  }

  private mergeFetchOptions(base: RequestInit | undefined, override: RequestInit = {}): RequestInit {
    if (!base) return override

    const headers = new Headers(base.headers)
    new Headers(override.headers).forEach((value, key) => {
      headers.set(key, value)
    })

    return {
      ...base,
      ...override,
      headers
    }
  }

  private normalizeWMSContentBoundingBox(resource: WMSImagerySourceOptions) {
    const bbox = resource.contentBoundingBox
    if (!bbox) return undefined

    const crs = (resource.crs ?? 'EPSG:4326').toUpperCase()
    if (crs === 'EPSG:3857' || crs === 'EPSG:900913') {
      const [minX, minY, maxX, maxY] = bbox
      return [
        this.webMercatorXToLongitude(minX),
        this.webMercatorYToLatitude(minY),
        this.webMercatorXToLongitude(maxX),
        this.webMercatorYToLatitude(maxY)
      ] as [number, number, number, number]
    }

    return bbox.map((value) => value * THREE.MathUtils.DEG2RAD) as [number, number, number, number]
  }

  private webMercatorXToLongitude(x: number) {
    return x / 6378137
  }

  private webMercatorYToLatitude(y: number) {
    return 2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2
  }

  private createWMSPreprocessURL(resource: WMSImagerySourceOptions) {
    const preprocessURL = resource.preprocessURL
    if (!this.isWMS11Version(resource.version)) return preprocessURL

    return (url: string) => {
      const normalizedUrl = this.normalizeWMS11URL(url)
      return preprocessURL ? preprocessURL(normalizedUrl) : normalizedUrl
    }
  }

  private isWMS11Version(version: string | undefined) {
    return version ? /^1\.1\./.test(version) : false
  }

  private normalizeWMS11URL(url: string) {
    const nextUrl = new URL(url, location.href)
    const crs = nextUrl.searchParams.get('CRS')
    if (!crs) return url

    nextUrl.searchParams.delete('CRS')
    nextUrl.searchParams.set('SRS', crs)

    if (crs.toUpperCase() === 'EPSG:4326') {
      const bbox = nextUrl.searchParams.get('BBOX')?.split(',').map(Number)
      if (bbox?.length === 4 && bbox.every(Number.isFinite)) {
        nextUrl.searchParams.set('BBOX', [bbox[1], bbox[0], bbox[3], bbox[2]].join(','))
      }
    }

    return nextUrl.toString()
  }

  private normalizeResourceUrl(url: string) {
    return new URL(url, location.href).toString()
  }
}
