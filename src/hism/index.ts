export { HismManager, type HismManagerOptions } from './core/HismManager'
export { HismCluster } from './core/HismCluster'
export {
  cloneGeometryForHismInstancing,
  disposeHismInstancedMesh
} from './core/instancingResources'
export { validateHismLayerOptions } from './core/validateHismLayerOptions'

export * from './spatial/clusterGrid'
export * from './spatial/frustumCull'

export * from './lod/archetypeLod'
export * from './lod/resolveLodLevel'

export {
  PositionPipeline,
  type PositionPipelineStage,
  type PositionPipelineStageContext,
  type PositionPipelineStagePhase,
  type PositionPipelineApplyOptions,
  type PositionPipelineComposeOptions
} from './pipeline/PositionPipeline'
export {
  createInstancedVegetationPipeline,
  TELLUX_POSITION_PIPELINE_KEY
} from './pipeline/vegetationPipeline'
export {
  createRTCPositionPipeline,
  createRTCPositionStage,
  RTC_POSITION_STAGE_NAME,
  RTC_POSITION_STAGE_ORDER
} from './pipeline/stages/rtcPositionStage'
export {
  createWindSwayStage,
  createWindSwayUniforms,
  WIND_SWAY_STAGE_NAME,
  WIND_SWAY_STAGE_ORDER,
  type WindSwayUniformValues
} from './pipeline/stages/windSwayStage'

export {
  createWindSwayLeavesMaterial,
  hasTelluxPositionPipeline,
  type WindSwayLeavesMaterialOptions
} from './materials/windSwayLeavesMaterial'

export {
  ensureGeometryBvh,
  disposeGeometryBvh,
  hasGeometryBvh
} from './picking/geometryBvhCache'
export {
  pickHismLayers,
  intersectRtcInstancedMesh,
  ensureAcceleratedRaycast,
  type PickHismLayersOptions
} from './picking/HismPicker'
export { HismPickMarker } from './picking/HismPickMarker'

export {
  collectHismRuntimeStats,
  createEmptyHismRuntimeStats
} from './runtime/HismRuntimeStats'
