import {
  Camera,
  CesiumIonResource,
  Clock,
  ImageryLayer,
  LayerManager,
  MVTResource,
  Scene,
  TemplateUrlResource,
  WMSResource,
  telluxConfig,
  Viewer
} from './Viewer'

export {
  Camera,
  CesiumIonResource,
  Clock,
  ImageryLayer,
  LayerManager,
  MVTResource,
  Scene,
  TemplateUrlResource,
  WMSResource,
  Viewer,
  type AtmosphereLightingMode,
  type CameraFlyToDestination,
  type CameraFlyToOptions,
  type CameraFlightEasingFunction,
  type CameraOrientation,
  type CameraSetViewOptions,
  type CartographicCoordinates,
  type CesiumIon3DTilesetOptions,
  type CesiumIonResourceOptions,
  type FlyToTargetOffset,
  type FlyToTargetOptions,
  type FlyToTargetTarget,
  type ImageryLayerOptions,
  type ImageryLayerSourceOptions,
  type ImageryLayerStyleOptions,
  type Load3DTilesetOptions,
  type MVTFeatureProperties,
  type MVTFeatureStyle,
  type MVTGetStyleCallback,
  type MVTResourceOptions,
  type ScreenPosition,
  type TemplateUrlResourceOptions,
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
  type ViewerOptions,
  type WMSResourceOptions
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
  CesiumIonResource,
  ImageryLayer,
  LayerManager,
  MVTResource,
  TemplateUrlResource,
  WMSResource,

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
