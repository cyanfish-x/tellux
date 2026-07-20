import { describe, expect, it } from 'vitest'
import { PositionPipeline } from '../../hism/pipeline/PositionPipeline'

describe('PositionPipeline', () => {
  it('composes stages in ascending order', () => {
    const pipeline = new PositionPipeline()
      .register({
        name: 'wind',
        order: 20,
        transform: (mvPosition) => `${mvPosition}.x += 0.1;`
      })
      .register({
        name: 'rtc',
        order: 10,
        declarations: 'uniform vec3 u_cameraHigh;',
        transform: (mvPosition) =>
          `${mvPosition} = u_viewMatrixRTE * ${mvPosition};`
      })

    const glsl = pipeline.composeProjectVertex()

    expect(glsl.indexOf('u_viewMatrixRTE')).toBeLessThan(glsl.indexOf('.x += 0.1'))
    expect(glsl).toContain('instanceMatrix * mvPosition')
    expect(pipeline.composeDeclarations()).toContain('uniform vec3 u_cameraHigh;')
  })

  it('can disable instancing block for tests', () => {
    const pipeline = new PositionPipeline().register({
      name: 'noop',
      order: 0,
      transform: () => ''
    })

    expect(pipeline.composeProjectVertex({ useInstancing: false })).not.toContain(
      'instanceMatrix'
    )
  })

  it('deduplicates stage registration by name', () => {
    const pipeline = new PositionPipeline()
    pipeline.register({
      name: 'rtc',
      order: 0,
      transform: () => ''
    })

    expect(() =>
      pipeline.register({
        name: 'rtc',
        order: 1,
        transform: () => ''
      })
    ).toThrow(/already registered/)
  })
})
