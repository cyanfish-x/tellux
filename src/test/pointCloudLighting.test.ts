import * as THREE from 'three'
import { AerialPerspectiveEffect } from '@takram/three-atmosphere'
import { describe, expect, it } from 'vitest'

import { patchAerialPerspectiveShader } from '../rendering/AtmosphereShaderPatches'

describe('patchAerialPerspectiveShader point-cloud lighting', () => {
  it('keeps degenerate normals unlit without injecting custom weak lighting', () => {
    const effect = new AerialPerspectiveEffect(new THREE.PerspectiveCamera())
    effect.sunLight = true
    effect.skyLight = true
    effect.normalBuffer = new THREE.Texture()

    patchAerialPerspectiveShader(effect, new THREE.Color())

    const fragmentShader = (
      effect as unknown as { getFragmentShader(): string }
    ).getFragmentShader()

    expect(fragmentShader).toContain(
      'if (!degenerateNormal) {\n    radiance = getSunSkyIrradiance'
    )
    expect(fragmentShader).toContain(
      '} else {\n    radiance = inputColor.rgb;\n  }'
    )
    expect(fragmentShader).not.toContain('telluxPointCloudEnvMix')
    expect(fragmentShader).not.toContain('telluxPointCloudToneMappingExposure')
    expect(fragmentShader).not.toContain('telluxPointColor')
    expect(fragmentShader).not.toContain('vec3 telluxGlobeN =')
    expect(fragmentShader).not.toContain('telluxNdotL')
    expect(fragmentShader).toContain(
      'bool telluxUnlitPointCloud = degenerateNormal && texture(normalBuffer, uv).a < 0.5;'
    )
    expect(fragmentShader).toContain(
      'if (!telluxUnlitPointCloud) {\n    applyTransmittanceInscatter'
    )
  })
})
