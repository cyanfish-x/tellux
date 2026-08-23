/**
 * Valve / Three.js Water2 使用的单次流动周期。
 * Flow phase cycle used by Valve's technique and Three.js Water2.
 *
 * Source: https://github.com/mrdoob/three.js/blob/r184/examples/jsm/objects/Water2Mesh.js
 */
export const VALVE_WATER_FLOW_CYCLE = 0.15
export const VALVE_WATER_FLOW_HALF_CYCLE =
  VALVE_WATER_FLOW_CYCLE * 0.5
export const VALVE_WATER_FLOW_SPEED = 0.03

export interface ValveWaterFlowState {
  phase0: number
  phase1: number
  blend: number
}

function wrapFlowPhase(value: number): number {
  const wrapped =
    ((value % VALVE_WATER_FLOW_CYCLE) + VALVE_WATER_FLOW_CYCLE) %
    VALVE_WATER_FLOW_CYCLE
  return Math.abs(wrapped - VALVE_WATER_FLOW_CYCLE) < Number.EPSILON
    ? 0
    : wrapped
}

/**
 * 从当前相位按帧时间推进，保持运行时修改速度时的相位连续性。
 * Advances the current phase without jumping when speed changes at runtime.
 */
export function advanceValveWaterFlowPhase(
  currentPhase: number,
  deltaSeconds: number,
  speedMultiplier: number
): number {
  return wrapFlowPhase(
    currentPhase +
      deltaSeconds * speedMultiplier * VALVE_WATER_FLOW_SPEED
  )
}

/**
 * 计算与 Water2 shader 等价的双相位和交叉淡入权重，供测试和调试使用。
 * Evaluates the dual phases and crossfade weight used by the Water2 shader.
 */
export function evaluateValveWaterFlow(
  elapsedSeconds: number,
  speedMultiplier: number
): ValveWaterFlowState {
  const phase0 = wrapFlowPhase(
    elapsedSeconds * speedMultiplier * VALVE_WATER_FLOW_SPEED
  )
  const phase1 = wrapFlowPhase(
    phase0 + VALVE_WATER_FLOW_HALF_CYCLE
  )
  const blend =
    Math.abs(VALVE_WATER_FLOW_HALF_CYCLE - phase0) /
    VALVE_WATER_FLOW_HALF_CYCLE

  return { phase0, phase1, blend }
}
