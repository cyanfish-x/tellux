import {
  Camera,
  Clock,
  ImageryLayer,
  LayerManager,
  Scene,
  AtmosphereLightingMode,
  DebugSettingsPanel,
  Timeline,
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
  AtmosphereLightingMode,
  DebugSettingsPanel,
  Timeline,
  SpringControl,
  Viewer,
  type CameraFlyToDestination,
  type CameraFlyToOptions,
  type CameraFlightEasingFunction,
  type CameraOrientation,
  type CameraSetViewOptions,
  type AddModelOptions,
  type CloudQualityPreset,
  type DebugSettingsPanelOptions,
  type TimelineOptions,
  type CartographicCoordinateTuple,
  type CartographicCoordinates,
  type CartographicFrameOptions,
  type CartographicInput,
  type CesiumIon3DTilesetOptions,
  type CesiumIonImagerySourceOptions,
  type CesiumIonTerrainOptions,
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
  type Picked3DTilesFeature,
  type ScreenPosition,
  type SampleHeightMostDetailedOptions,
  type SampleHeightMostDetailedResult,
  type SampleHeightOptions,
  type SurfaceMaterialMode,
  type SpringControlOptions,
  type TerrainRenderOptions,
  type TerrainOptions,
  type TerrainTileLoadingOptions,
  type ThreeDTilesRenderOptions,
  type TelluxConfig,
  type TilesetFeatureProperties,
  type TilesetLayer,
  type Url3DTilesetOptions,
  type UrlTerrainOptions,
  type ViewerClickEvent,
  type ViewerEvent,
  type ViewerEventListener,
  type ViewerEventMap,
  type ViewerMouseEvent,
  type ViewerMouseMoveEvent,
  type ViewerAtmosphereLightingOptions,
  type ViewerAtmosphereNightOptions,
  type ViewerAtmosphereOptions,
  type ViewerAtmosphereScatteringOptions,
  type ViewerAtmosphereShadowOptions,
  type ViewerAtmosphereSkyOptions,
  type ViewerCloudLayerOptions,
  type ViewerCloudOptions,
  type ViewerFallbackAmbientLightOptions,
  type ViewerPostProcessOptions,
  type ViewerSceneOptions,
  type ViewerSurfaceOptions,
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
  AtmosphereLightingMode,
  Camera,
  Clock,
  ImageryLayer,
  LayerManager,
  DebugSettingsPanel,
  Timeline,
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
