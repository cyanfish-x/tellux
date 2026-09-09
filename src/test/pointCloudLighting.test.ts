import * as THREE from 'three'
import { AerialPerspectiveEffect } from '@takram/three-atmosphere'
import { describe, expect, it } from 'vitest'

import { patchAerialPerspectiveShader } from '../rendering/AtmosphereShaderPatches'

function patchedFragment(sunLight: boolean, skyLight: boolean) {
  const effect = new AerialPerspectiveEffect(new THREE.PerspectiveCamera())
  effect.sunLight = sunLight
  effect.skyLight = skyLight
  effect.normalBuffer = new THREE.Texture()
  patchAerialPerspectiveShader(effect, new THREE.Color())
  return (effect as unknown as { getFragmentShader(): string }).getFragmentShader()
}

describe('patchAerialPerspectiveShader point-cloud lighting', () => {
  it('keeps degenerate normals unlit without injecting custom weak lighting', () => {
    const fragmentShader = patchedFragment(true, true)

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
      'if (!telluxUnlitPointCloud) {\n    applyTransmittanceInscatter'
    )
  })

  it('does not guess self-lit pixels from luma', () => {
    const fragmentShader = patchedFragment(true, true)

    expect(fragmentShader).not.toContain('telluxSelfLitMask')
    expect(fragmentShader).not.toContain('telluxSelfLitRadiance')
    expect(fragmentShader).not.toContain('telluxSceneLuma')
  })

  it('does not scale already-lit light-source radiance by dayLightFactor', () => {
    const fragmentShader = patchedFragment(false, false)

    expect(fragmentShader).toContain('telluxGlobeLightingMask')
    expect(fragmentShader).toContain(
      'radiance = mix(inputColor.rgb, radiance, telluxGlobeLightingMask)'
    )
    expect(fragmentShader).not.toMatch(
      /#endif \/\/ defined\(SUN_LIGHT\) \|\| defined\(SKY_LIGHT\)\s+if \(!degenerateNormal\) \{\s+float telluxDayLightFactor/
    )
    expect(fragmentShader).toContain(
      '#if defined(SUN_LIGHT) || defined(SKY_LIGHT)\n  if (!degenerateNormal) {\n    radiance *= telluxPostProcessDayLightFactor;'
    )
  })

  it('keeps local lighting-mask pixels as inputColor after globe night lighting', () => {
    const fragmentShader = patchedFragment(true, true)

    expect(fragmentShader).toContain('uniform sampler2D telluxLightingMaskBuffer;')
    expect(fragmentShader).toContain(
      'float telluxGlobeLightingMask = texture(telluxLightingMaskBuffer, uv).r;'
    )
    expect(fragmentShader).toContain('telluxNightRadiance *= telluxGlobeLightingMask;')
  })
})

describe('patchAerialPerspectiveShader sky over unwritten depth', () => {
  it('composites scene color over sky on far-plane pixels instead of replacing it', () => {
    const fragmentShader = patchedFragment(false, false)

    expect(fragmentShader).toContain(
      'outputColor.rgb = inputColor.rgb + outputColor.rgb * (1.0 - inputColor.a);'
    )
    expect(fragmentShader).toContain('outputColor.rgb = getSkyRadiance(')
  })

  it('keeps empty far-plane pixels as sky by using coverage alpha rather than luma', () => {
    const fragmentShader = patchedFragment(false, false)

    expect(fragmentShader).not.toContain('telluxSceneLuma')
    expect(fragmentShader).not.toContain('telluxSelfLitMask')
    const skyBranch = fragmentShader.slice(
      fragmentShader.indexOf('if (depth >= 1.0 - 1e-8)'),
      fragmentShader.indexOf('depth = reverseLogDepth')
    )
    expect(skyBranch).toContain('inputColor.rgb + outputColor.rgb * (1.0 - inputColor.a)')
    expect(skyBranch).not.toContain('outputColor.rgb = inputColor.rgb;')
  })
})
