import {
  Camera,
  CesiumIonResource,
  Clock,
  Scene,
  telluxConfig,
  Viewer
} from './Viewer'

export {
  Camera,
  CesiumIonResource,
  Clock,
  Scene,
  Viewer,
  type CesiumIonResourceOptions,
  type TelluxConfig,
  type ViewerClickEvent,
  type ViewerEvent,
  type ViewerEventListener,
  type ViewerEventMap,
  type ViewerOptions
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
