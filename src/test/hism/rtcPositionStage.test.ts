import { describe, expect, it } from 'vitest'
import {
  createRTCPositionPipeline,
  createRTCPositionStage,
  RTC_POSITION_STAGE_NAME
} from '../../hism/pipeline/stages/rtcPositionStage'

describe('rtcPositionStage', () => {
  it('registers rtc declarations and rte transform', () => {
    const stage = createRTCPositionStage()
    expect(stage.name).toBe(RTC_POSITION_STAGE_NAME)
    expect(stage.declarations).toContain('attribute vec3 positionHigh;')
    expect(stage.transform('mvPosition', { useInstancing: true })).toContain(
      'u_viewMatrixRTE'
    )
  })

  it('uses u_projectionMatrix when rtc stage is present', () => {
    const pipeline = createRTCPositionPipeline()
    const glsl = pipeline.composeProjectVertex()

    expect(glsl).toContain('u_viewMatrixRTE * vec4(worldPosRTE, 1.0)')
    expect(glsl).toContain('gl_Position = u_projectionMatrix * mvPosition;')
    expect(glsl).not.toContain('gl_Position = projectionMatrix * mvPosition;')
  })

  it('composes inline finalization for custom project_vertex materials', () => {
    const pipeline = createRTCPositionPipeline()
    const inline = pipeline.composeInlineFinalization('mvPosition')

    expect(inline).toContain('worldPosRTE = rtcHighDiff + rtcLowDiff + mvPosition.xyz')
    expect(inline).toContain('gl_Position = u_projectionMatrix * mvPosition;')
    expect(inline).not.toContain('vec4( transformed, 1.0 )')
  })
})
