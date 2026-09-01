import { describe, expect, it } from 'vitest'

import {
  VALVE_WATER_FLOW_CYCLE,
  VALVE_WATER_FLOW_HALF_CYCLE,
  VALVE_WATER_FLOW_SPEED,
  advanceValveWaterFlowPhase,
  evaluateValveWaterFlow
} from './WaterAreaFlow'

describe('evaluateValveWaterFlow', () => {
  it('keeps the two normal-map phases exactly half a cycle apart', () => {
    for (const elapsedSeconds of [0, 0.5, 1.25, 4.9, 17]) {
      const { phase0, phase1 } = evaluateValveWaterFlow(
        elapsedSeconds,
        1
      )
      const separation =
        (phase1 - phase0 + VALVE_WATER_FLOW_CYCLE) %
        VALVE_WATER_FLOW_CYCLE

      expect(separation).toBeCloseTo(VALVE_WATER_FLOW_HALF_CYCLE, 8)
    }
  })

  it('crossfades back to the same normal-map phase at cycle reset', () => {
    const halfCycleTime =
      VALVE_WATER_FLOW_HALF_CYCLE / VALVE_WATER_FLOW_SPEED
    const cycleTime = VALVE_WATER_FLOW_CYCLE / VALVE_WATER_FLOW_SPEED

    const start = evaluateValveWaterFlow(0, 1)
    const midpoint = evaluateValveWaterFlow(halfCycleTime, 1)
    const reset = evaluateValveWaterFlow(cycleTime, 1)

    expect(start.phase0).toBeCloseTo(0, 8)
    expect(start.phase1).toBeCloseTo(VALVE_WATER_FLOW_HALF_CYCLE, 8)
    expect(start.blend).toBeCloseTo(1, 8)
    expect(midpoint.phase0).toBeCloseTo(
      VALVE_WATER_FLOW_HALF_CYCLE,
      8
    )
    expect(midpoint.phase1).toBeCloseTo(0, 8)
    expect(midpoint.blend).toBeCloseTo(0, 8)
    expect(reset.phase0).toBeCloseTo(0, 8)
    expect(reset.phase1).toBeCloseTo(VALVE_WATER_FLOW_HALF_CYCLE, 8)
    expect(reset.blend).toBeCloseTo(1, 8)
  })

  it('scales phase velocity without changing the cycle or blend range', () => {
    const normalSpeed = evaluateValveWaterFlow(1, 1)
    const doubleSpeed = evaluateValveWaterFlow(0.5, 2)

    expect(doubleSpeed).toEqual(normalSpeed)
    expect(doubleSpeed.phase0).toBeGreaterThanOrEqual(0)
    expect(doubleSpeed.phase0).toBeLessThan(VALVE_WATER_FLOW_CYCLE)
    expect(doubleSpeed.phase1).toBeGreaterThanOrEqual(0)
    expect(doubleSpeed.phase1).toBeLessThan(VALVE_WATER_FLOW_CYCLE)
    expect(doubleSpeed.blend).toBeGreaterThanOrEqual(0)
    expect(doubleSpeed.blend).toBeLessThanOrEqual(1)
  })

  it('advances from the current phase so runtime speed changes stay continuous', () => {
    const beforeSpeedChange = advanceValveWaterFlowPhase(0, 1, 1)
    const afterSpeedChange = advanceValveWaterFlowPhase(
      beforeSpeedChange,
      0.5,
      2
    )

    expect(beforeSpeedChange).toBeCloseTo(0.03, 8)
    expect(afterSpeedChange).toBeCloseTo(0.06, 8)
    expect(advanceValveWaterFlowPhase(0.14, 1, 1)).toBeCloseTo(0.02, 8)
  })
})
