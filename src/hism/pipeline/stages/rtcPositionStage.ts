import { PositionPipeline } from '../PositionPipeline'
import type { PositionPipelineStage } from '../PositionPipeline'

/** RTC position stage 名称。RTC position stage name. */
export const RTC_POSITION_STAGE_NAME = 'rtc'

/** RTC position stage 执行顺序。RTC position stage execution order. */
export const RTC_POSITION_STAGE_ORDER = 100

const RTC_DECLARATIONS = `
attribute vec3 positionHigh;
attribute vec3 positionLow;
uniform vec3 u_cameraHigh;
uniform vec3 u_cameraLow;
uniform mat4 u_viewMatrixRTE;
uniform mat4 u_projectionMatrix;
`.trim()

/**
 * 创建 globe-scale RTC position stage。
 *
 * Creates the globe-scale RTC position stage.
 */
export function createRTCPositionStage(): PositionPipelineStage {
  return {
    name: RTC_POSITION_STAGE_NAME,
    order: RTC_POSITION_STAGE_ORDER,
    declarations: RTC_DECLARATIONS,
    transform(mvPosition) {
      return `
vec3 rtcHighDiff = positionHigh - u_cameraHigh;
vec3 rtcLowDiff = positionLow - u_cameraLow;
vec3 worldPosRTE = rtcHighDiff + rtcLowDiff + ${mvPosition}.xyz;
${mvPosition} = u_viewMatrixRTE * vec4(worldPosRTE, 1.0);`.trim()
    }
  }
}

/**
 * 创建仅含 RTC stage 的 PositionPipeline。
 *
 * Creates a PositionPipeline containing only the RTC stage.
 */
export function createRTCPositionPipeline() {
  return new PositionPipeline().register(createRTCPositionStage())
}
