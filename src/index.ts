import {
  Camera,
  Clock,
  ImageryLayer,
  LayerManager,
  Scene,
  DebugSettingsPanel,
  SpringControl,
  telluxConfig,
  Viewer
} from './Viewer'

export {
  Camera,
  Clock,
  ImageryLayer,
  LayerManager,
  Scene,
  DebugSettingsPanel,
  SpringControl,
  Viewer,
  type AtmosphereLightingMode,
  type CameraFlyToDestination,
  type CameraFlyToOptions,
  type CameraFlightEasingFunction,
  type CameraOrientation,
  type CameraSetViewOptions,
  type AddModelOptions,
  type DebugSettingsPanelOptions,
  type CartographicCoordinateTuple,
  type CartographicCoordinates,
  type CartographicFrameOptions,
  type CartographicInput,
  type CesiumIon3DTilesetOptions,
  type CesiumIonImagerySourceOptions,
  type FlyToTargetOffset,
  type FlyToTargetOptions,
  type FlyToTargetTarget,
  type GeoJSONData,
  type GeoJSONFeature,
  type GeoJSONFeatureCollection,
  type GeoJSONFeatureProperties,
  type GeoJSONFeatureStyle,
  type GeoJSONGeometry,
  type GeoJSONGetStyleCallback,
  type GeoJSONImagerySourceOptions,
  type GltfModelOptions,
  type ImageryLayerOptions,
  type ImageryLayerSourceOptions,
  type ImageryLayerStyleOptions,
  type Load3DTilesetOptions,
  type ModelLayer,
  type MVTImagerySourceOptions,
  type MVTFeatureProperties,
  type MVTFeatureStyle,
  type MVTGetStyleCallback,
  type ScreenPosition,
  type SampleHeightMostDetailedOptions,
  type SampleHeightMostDetailedResult,
  type SampleHeightOptions,
  type SpringControlOptions,
  type TerrainOptions,
  type TerrainTileLoadingOptions,
  type TelluxConfig,
  type TilesetLayer,
  type Url3DTilesetOptions,
  type ViewerClickEvent,
  type ViewerEvent,
  type ViewerEventListener,
  type ViewerEventMap,
  type ViewerMouseEvent,
  type ViewerMouseMoveEvent,
  type ViewerWidgetOptions,
  type ViewerOptions,
  type WMSImagerySourceOptions,
  type XYZImagerySourceOptions
} from './Viewer'

/**
 * Tellux 库入口对象。
 *
 * Tellux library entry object.
 */
const tellux = {
  Viewer,
  Scene,
  Camera,
  Clock,
  ImageryLayer,
  LayerManager,
  DebugSettingsPanel,
  SpringControl,

  /**
   * Tellux 静态资源父级目录。
   *
   * Parent directory for Tellux static assets.
   */
  get baseUrl() {
    return telluxConfig.baseUrl
  },

  set baseUrl(value: string) {
    telluxConfig.baseUrl = value
  }
}

export { tellux }
export default tellux
