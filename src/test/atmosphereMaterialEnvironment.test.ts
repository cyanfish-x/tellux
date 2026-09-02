import { describe, expect, it } from 'vitest'

import { shouldUsePostProcessMaterialEnvironment } from '../rendering/AtmosphereManager'

describe('AtmosphereManager material environment', () => {
  it('only enables the shared PBR environment for preserved models in post-process lighting', () => {
    expect(shouldUsePostProcessMaterialEnvironment('post-process', true)).toBe(true)
    expect(shouldUsePostProcessMaterialEnvironment('post-process', false)).toBe(false)
    expect(shouldUsePostProcessMaterialEnvironment('light-source', true)).toBe(false)
  })
})
