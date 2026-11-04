import * as THREE from 'three'
import type { CloudsEffect } from '@takram/three-clouds'
import { stabilizeCloudSampling } from './stableCloudSampling'
import { correctCloudCentroid, integrateCloudAtmosphere, optimizeCloudSampling, syncCloudSamplingDefines } from './IntegratedCloudAtmosphere'

/** 固定稳定映射云样本，比较空气合成与等价采样优化。 Hold stabilized cloud samples fixed to compare aerial composition and equivalent sampling optimizations. */
export function verifyCloudComposition(renderer: THREE.WebGLRenderer, clouds: CloudsEffect, baseShader: string) {
  baseShader = stabilizeCloudSampling(baseShader, false)
  const target = new THREE.WebGLRenderTarget(128, 72, { count: 2, type: THREE.FloatType, depthBuffer: false })
  const material = clouds.cloudsPass.currentMaterial
  const savedShader = material.fragmentShader, savedTarget = renderer.getRenderTarget(), savedDefines = material.defines
  const u = material.uniforms
  const weather = u.weatherExponents.value, profile = u.densityProfile.value, detail = u.shapeDetailAmounts.value
  const savedFrame = u.frame.value
  const savedWeather = weather.clone(), savedTerms = profile.expTerms.clone(), savedExponents = profile.exponents.clone(), savedDetail = detail.clone()
  material.defines = { ...savedDefines }; delete material.defines.SHADOW_LENGTH
  const read = (shader: string) => {
    material.fragmentShader = shader; syncCloudSamplingDefines(material); material.needsUpdate = true
    clouds.cloudsPass.currentPass.render(renderer, null, target)
    const pixels = new Float32Array(128 * 72 * 4)
    renderer.readRenderTargetPixels(target, 0, 0, 128, 72, pixels)
    const error = renderer.getContext().getError()
    if (error !== renderer.getContext().NO_ERROR) throw new Error(`Cloud composition GL error: ${error}`)
    return pixels
  }
  const difference = (actual: Float32Array, expected: Float32Array) => {
    const errors: number[] = []
    let nonFinite = 0, alphaMax = 0, coveredPixels = 0, referenceEnergy = 0
    for (let i = 0; i < actual.length; ++i) {
      const error = Math.abs(actual[i] - expected[i])
      if (!Number.isFinite(error)) nonFinite++
      else if (i % 4 === 3) { alphaMax = Math.max(alphaMax, error); if (expected[i] > 1e-5) coveredPixels++ }
      else { errors.push(error); referenceEnergy += Math.abs(expected[i]) }
    }
    if (!Number.isFinite(referenceEnergy) || referenceEnergy === 0) throw new Error('Cloud composition reference is empty or non-finite')
    errors.sort((a, b) => a - b)
    return { p95: errors[Math.floor(errors.length * 0.95)], max: errors[errors.length - 1], alphaMax, nonFinite, coveredPixels, referenceEnergy,
      scope: 'Fixed stabilized cloud samples; shadow length disabled in all comparisons' }
  }
  try {
    const reference = read(integrateCloudAtmosphere(baseShader, 0)), original = read(baseShader)
    const optimized = optimizeCloudSampling(baseShader)
    const optimizedReference = read(optimized)
    const rows = Object.fromEntries([
      ['upstream', baseShader], ['prefix500', integrateCloudAtmosphere(baseShader, 500)],
      ['homogeneous', integrateCloudAtmosphere(baseShader, -1)], ['sampleOptimization', optimized],
      ['centroid', correctCloudCentroid(optimized)],
    ].map(([name, shader]) => {
      const actual = read(shader)
      return [name, { ...difference(actual, name === 'sampleOptimization' ? original : reference),
        alphaFromOptimized: name === 'centroid' ? difference(actual, optimizedReference).alphaMax : 0 }]
    }))
    // Scan fixed phases rather than depending on the frame when assets happened to become ready.
    const variants = {
      optimized,
      erosion: optimized.replace('#ifdef A1_LINEAR_PROFILE', '#if 0'),
      profile: optimized.replace('if (!any(greaterThan(density', 'if (false && !any(greaterThan(density'),
    }
    for (let phase = 0; phase < 16; phase++) {
      u.frame.value = phase
      const expected = read(baseShader)
      for (const [name, shader] of Object.entries(variants)) rows[`phase${phase}-${name}`] = { ...difference(read(shader), expected), alphaFromOptimized: 0 }
    }
    u.frame.value = savedFrame
    // Exercise runtime fallbacks with nonidentity powers, exponential profiles and negative detail amounts.
    weather.set(0.75, 1.1, 2, 1); profile.expTerms.set(0.1, 0.2, 0, 0.3); profile.exponents.set(-1, -2, -0.5, -4)
    detail.set(-0.1, 0.5, 0, 1)
    const fallbackReference = read(baseShader)
    rows.parameterFallback = { ...difference(read(optimized), fallbackReference), alphaFromOptimized: 0 }
    if ('A1_LINEAR_PROFILE' in material.defines) throw new Error('Cloud specialization did not restore general path')
    return rows
  } finally {
    u.frame.value = savedFrame;weather.copy(savedWeather); profile.expTerms.copy(savedTerms); profile.exponents.copy(savedExponents); detail.copy(savedDetail)
    material.defines = savedDefines; material.fragmentShader = savedShader; material.needsUpdate = true
    renderer.setRenderTarget(savedTarget); target.dispose()
  }
}
