import { PositionPipeline } from './PositionPipeline'
import { createRTCPositionStage } from './stages/rtcPositionStage'
import { createWindSwayStage } from './stages/windSwayStage'

/** 标记材质已由 Tellux PositionPipeline 接管 project_vertex。 */
export const TELLUX_POSITION_PIPELINE_KEY = 'telluxPositionPipeline'

/**
 * 创建 vegetation 实例化材质使用的 pipeline：风摆 + RTC。
 *
 * Creates the pipeline used by instanced vegetation materials: wind sway + RTC.
 */
export function createInstancedVegetationPipeline() {
  return new PositionPipeline()
    .register(createWindSwayStage())
    .register(createRTCPositionStage())
}
