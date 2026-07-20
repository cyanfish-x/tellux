import { describe, expect, it } from 'vitest'
import { createInstancedVegetationPipeline } from '../../hism/pipeline/vegetationPipeline'
import { createWindSwayStage } from '../../hism/pipeline/stages/windSwayStage'

describe('windSwayStage', () => {
  it('runs before instancing in the composed project vertex', () => {
    const pipeline = createInstancedVegetationPipeline()
    const glsl = pipeline.composeProjectVertex()

    expect(glsl.indexOf('windSway')).toBeLessThan(glsl.indexOf('instanceMatrix * mvPosition'))
    expect(glsl.indexOf('instanceMatrix * mvPosition')).toBeLessThan(
      glsl.indexOf('u_viewMatrixRTE')
    )
  })

  it('includes simplex noise and wind uniforms', () => {
    const stage = createWindSwayStage()
    expect(stage.declarations).toContain('uniform float uTime;')
    expect(stage.declarations).toContain('float simplex3(vec3 v)')
    expect(stage.transform('mvPosition', { useInstancing: true })).toContain('windSway')
  })
})
