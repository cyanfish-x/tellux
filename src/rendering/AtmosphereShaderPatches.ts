import * as THREE from 'three'
import type { CloudsEffect } from '@takram/three-clouds'
import type { AerialPerspectiveEffect, StarsMaterial } from '@takram/three-atmosphere'

export const INSCATTER_INTENSITY_UNIFORM = 'telluxInscatterIntensity'
export const INSCATTER_HORIZON_BLEND_UNIFORM = 'telluxInscatterHorizonBlend'
export const INSCATTER_HORIZON_RANGE_UNIFORM = 'telluxInscatterHorizonRange'
export const POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM = 'telluxPostProcessNightMoonIntensity'
export const POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM = 'telluxPostProcessNightAmbientIntensity'
export const POST_PROCESS_NIGHT_COLOR_UNIFORM = 'telluxPostProcessNightColor'
export const POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM = 'telluxPostProcessNightSkyIntensity'
export const POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM = 'telluxPostProcessNightMoonGlowIntensity'
export const POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM = 'telluxPostProcessDayLightFactor'
export const CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM = 'telluxCloudsNightMoonIntensity'
export const CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM = 'telluxCloudsNightAmbientIntensity'
export const CLOUDS_NIGHT_COLOR_UNIFORM = 'telluxCloudsNightColor'
export const CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM = 'telluxCloudsNightMoonDirection'
export const CLOUDS_DAY_LIGHT_FACTOR_UNIFORM = 'telluxCloudsDayLightFactor'
export const STARS_DAY_LIGHT_FACTOR_UNIFORM = 'telluxStarsDayLightFactor'

interface PatchableEffectShader {
  getFragmentShader(): string
  setFragmentShader(fragmentShader: string): void
  setChanged(): void
}

interface PatchableShaderMaterial {
  fragmentShader: string
  uniforms: Record<string, THREE.Uniform>
  needsUpdate: boolean
}

type DynamicUniforms = Map<string, THREE.Uniform>

export function getEffectUniform<T>(effect: AerialPerspectiveEffect, name: string) {
  return ((effect.uniforms as unknown as DynamicUniforms).get(name) ?? null) as THREE.Uniform<T> | null
}

export function getCloudsMaterialUniform(cloudsEffect: CloudsEffect, name: string) {
  const material = cloudsEffect.cloudsPass.currentMaterial as unknown as PatchableShaderMaterial
  return material.uniforms[name] ?? null
}

export function getStarsMaterialUniform(starsMaterial: StarsMaterial, name: string) {
  const material = starsMaterial as unknown as PatchableShaderMaterial
  return material.uniforms[name] ?? null
}

export function patchStarsRendering(starsMaterial: StarsMaterial) {
  const material = starsMaterial as unknown as PatchableShaderMaterial
  material.uniforms[STARS_DAY_LIGHT_FACTOR_UNIFORM] = new THREE.Uniform(1)

  if (material.fragmentShader.includes(STARS_DAY_LIGHT_FACTOR_UNIFORM)) return

  const withUniform = material.fragmentShader.replace(
    'uniform vec3 sunDirection;',
    [
      'uniform vec3 sunDirection;',
      `uniform float ${STARS_DAY_LIGHT_FACTOR_UNIFORM};`
    ].join('\n')
  )
  if (withUniform === material.fragmentShader) {
    console.warn('Tellux stars shader patch failed: uniform hook was not found.')
    material.needsUpdate = true
    return
  }

  const withPointMask = withUniform.replace(
    'in vec3 vColor;\n\nvoid main() {',
    [
      'in vec3 vColor;',
      '',
      'void main() {',
      '  vec2 telluxStarPoint = gl_PointCoord * 2.0 - 1.0;',
      '  float telluxStarPointRadius = dot(telluxStarPoint, telluxStarPoint);',
      '  if (telluxStarPointRadius > 1.0) {',
      '    discard;',
      '  }',
      '  float telluxStarSoftMask = 1.0 - smoothstep(0.18, 1.0, telluxStarPointRadius);',
      '  float telluxStarBrightness = max(max(vColor.r, vColor.g), vColor.b);',
      '  float telluxStarVisibility = smoothstep(0.006, 0.035, telluxStarBrightness);',
      '  if (telluxStarVisibility <= 0.0) {',
      '    discard;',
      '  }',
      '  vec3 telluxStarColor = vec3(1.0) * telluxStarSoftMask * (0.75 + 0.75 * telluxStarVisibility);'
    ].join('\n')
  )
  if (withPointMask === withUniform) {
    console.warn('Tellux stars shader patch failed: point mask hook was not found.')
    material.needsUpdate = true
    return
  }

  const withBackgroundStarColor = withPointMask.replace(
    '  radiance += transmittance * vColor;',
    [
      `  radiance *= ${STARS_DAY_LIGHT_FACTOR_UNIFORM};`,
      `  radiance += mix(vec3(1.0), transmittance, ${STARS_DAY_LIGHT_FACTOR_UNIFORM}) * telluxStarColor;`
    ].join('\n')
  )
  if (withBackgroundStarColor === withPointMask) {
    console.warn('Tellux stars shader patch failed: background color hook was not found.')
    material.needsUpdate = true
    return
  }

  const patchedShader = withBackgroundStarColor.replace(
    '  outputColor = vec4(vColor, 1.0);',
    '  outputColor = vec4(telluxStarColor, 1.0);'
  )

  material.fragmentShader = patchedShader
  material.needsUpdate = true
}

export function patchAerialPerspectiveShader(effect: AerialPerspectiveEffect, nightColor: THREE.Color) {
  const uniforms = effect.uniforms as unknown as DynamicUniforms
  uniforms.set(INSCATTER_INTENSITY_UNIFORM, new THREE.Uniform(1))
  uniforms.set(INSCATTER_HORIZON_BLEND_UNIFORM, new THREE.Uniform(1))
  uniforms.set(INSCATTER_HORIZON_RANGE_UNIFORM, new THREE.Uniform(new THREE.Vector2(0, 0.6)))
  uniforms.set(POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM, new THREE.Uniform(0))
  uniforms.set(POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM, new THREE.Uniform(0))
  uniforms.set(POST_PROCESS_NIGHT_COLOR_UNIFORM, new THREE.Uniform(nightColor.clone()))
  uniforms.set(POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM, new THREE.Uniform(0))
  uniforms.set(POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM, new THREE.Uniform(0))
  uniforms.set(POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM, new THREE.Uniform(1))

  const shaderEffect = effect as unknown as PatchableEffectShader
  const fragmentShader = shaderEffect.getFragmentShader()
  if (fragmentShader.includes(INSCATTER_INTENSITY_UNIFORM)) return

  const withUniform = fragmentShader.replace(
    'uniform float albedoScale;',
    [
      'uniform float albedoScale;',
      `uniform float ${INSCATTER_INTENSITY_UNIFORM};`,
      `uniform float ${INSCATTER_HORIZON_BLEND_UNIFORM};`,
      `uniform vec2 ${INSCATTER_HORIZON_RANGE_UNIFORM};`,
      `uniform float ${POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM};`,
      `uniform float ${POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM};`,
      `uniform vec3 ${POST_PROCESS_NIGHT_COLOR_UNIFORM};`,
      `uniform float ${POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM};`,
      `uniform float ${POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM};`,
      `uniform float ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM};`
    ].join('\n')
  )
  if (withUniform === fragmentShader) {
    console.warn('Tellux atmosphere shader patch failed: uniform hook was not found.')
    shaderEffect.setChanged()
    return
  }

  const withDaySky = withUniform.replace(
    '    outputColor.rgb = getSkyRadiance(\n      vCameraPosition,\n      rayDirection,\n      shadowLength,\n      sunDirection,\n      moonDirection,\n      moonAngularRadius,\n      lunarRadianceScale,\n      fragmentAngle\n    );',
    [
      '    outputColor.rgb = getSkyRadiance(',
      '      vCameraPosition,',
      '      rayDirection,',
      '      shadowLength,',
      '      sunDirection,',
      '      moonDirection,',
      '      moonAngularRadius,',
      '      lunarRadianceScale,',
      '      fragmentAngle',
      '    );',
      `    outputColor.rgb *= ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM};`
    ].join('\n')
  )
  if (withDaySky === withUniform) {
    console.warn('Tellux atmosphere shader patch failed: day sky hook was not found.')
  }

  const shaderWithDaySky = withDaySky === withUniform ? withUniform : withDaySky
  const withNightSky = shaderWithDaySky.replace(
    '    outputColor.a = 1.0;\n    #else // SKY',
    [
      `    if (${POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM} > 0.0 || ${POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM} > 0.0) {`,
      '      vec3 telluxSkyNormal = normalize(vCameraPosition / vEllipsoidRadiiSquared);',
      '      float telluxRayUp = clamp(dot(rayDirection, telluxSkyNormal), 0.0, 1.0);',
      '      float telluxHorizonGlow = pow(1.0 - telluxRayUp, 1.7);',
      '      float telluxZenithGlow = pow(telluxRayUp, 0.35);',
      '      float telluxMoonViewDot = max(dot(rayDirection, moonDirection), 0.0);',
      '      float telluxMoonHalo = pow(telluxMoonViewDot, 64.0) * 0.55 + pow(telluxMoonViewDot, 512.0) * 2.2;',
      '      float telluxMoonDiscRadius = max(moonAngularRadius * 1.35, fragmentAngle);',
      '      float telluxMoonDisc = smoothstep(cos(telluxMoonDiscRadius + fragmentAngle), cos(max(0.0, moonAngularRadius - fragmentAngle)), telluxMoonViewDot);',
      `      vec3 telluxNightSkyRadiance = ${POST_PROCESS_NIGHT_COLOR_UNIFORM} * ${POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM} * (0.18 + 0.62 * telluxHorizonGlow + 0.28 * telluxZenithGlow);`,
      `      telluxNightSkyRadiance += ${POST_PROCESS_NIGHT_COLOR_UNIFORM} * ${POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM} * telluxMoonHalo;`,
      `      telluxNightSkyRadiance += vec3(1.0, 0.96, 0.86) * ${POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM} * telluxMoonDisc * 2.0;`,
      '      outputColor.rgb += telluxNightSkyRadiance;',
      '    }',
      '    outputColor.a = 1.0;',
      '    #else // SKY'
    ].join('\n')
  )
  if (withNightSky === shaderWithDaySky) {
    console.warn('Tellux atmosphere shader patch failed: night sky hook was not found.')
  }

  const shaderWithNightSky = withNightSky === shaderWithDaySky ? shaderWithDaySky : withNightSky
  const withPostProcessNightLighting = shaderWithNightSky.replace(
    '#endif // defined(SUN_LIGHT) || defined(SKY_LIGHT)\n\n  #if defined(TRANSMITTANCE) || defined(INSCATTER)',
    [
      '#endif // defined(SUN_LIGHT) || defined(SKY_LIGHT)',
      '',
      `  if (!degenerateNormal) {`,
      `    radiance *= ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM};`,
      `  }`,
      `  if (!degenerateNormal && (${POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM} > 0.0 || ${POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM} > 0.0)) {`,
      '    vec3 telluxNightDiffuse = inputColor.rgb * albedoScale * RECIPROCAL_PI;',
      '    float telluxNightMoonDiffuse = max(dot(normalize(normalECEF), moonDirection), 0.0);',
      `    vec3 telluxNightRadiance = telluxNightDiffuse * ${POST_PROCESS_NIGHT_COLOR_UNIFORM} * (${POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM} + ${POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM} * telluxNightMoonDiffuse);`,
      '    #ifdef HAS_LIGHTING_MASK',
      '    telluxNightRadiance *= texture(lightingMaskBuffer, uv).LIGHTING_MASK_CHANNEL_;',
      '    #endif // HAS_LIGHTING_MASK',
      '    radiance += telluxNightRadiance;',
      '  }',
      '',
      '  #if defined(TRANSMITTANCE) || defined(INSCATTER)'
    ].join('\n')
  )
  if (withPostProcessNightLighting === shaderWithNightSky) {
    console.warn('Tellux atmosphere shader patch failed: post-process night lighting hook was not found.')
  }

  const shaderWithNightLighting =
    withPostProcessNightLighting === shaderWithNightSky ? shaderWithNightSky : withPostProcessNightLighting
  const patchedShader = shaderWithNightLighting.replace(
    'radiance = radiance + inscatter;',
    [
      'vec3 telluxGlobeNormal = normalize(positionECEF / vEllipsoidRadiiSquared);',
      'float telluxViewNormalCos = clamp(dot(telluxGlobeNormal, normalize(vCameraPosition - positionECEF)), 0.0, 1.0);',
      `float telluxHorizonMask = 1.0 - smoothstep(${INSCATTER_HORIZON_RANGE_UNIFORM}.x, ${INSCATTER_HORIZON_RANGE_UNIFORM}.y, telluxViewNormalCos);`,
      `float telluxInscatterMask = mix(1.0, telluxHorizonMask, ${INSCATTER_HORIZON_BLEND_UNIFORM});`,
      `radiance = radiance + inscatter * ${INSCATTER_INTENSITY_UNIFORM} * telluxInscatterMask * ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM};`
    ].join('\n  ')
  )

  if (patchedShader === shaderWithNightLighting) {
    console.warn('Tellux atmosphere shader patch failed: inscatter intensity hook was not found.')
    shaderEffect.setChanged()
    return
  }

  shaderEffect.setFragmentShader(patchedShader)
}

export function patchCloudsNightLighting(cloudsEffect: CloudsEffect, nightColor: THREE.Color) {
  const material = cloudsEffect.cloudsPass.currentMaterial as unknown as PatchableShaderMaterial
  material.uniforms[CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM] = new THREE.Uniform(0)
  material.uniforms[CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM] = new THREE.Uniform(0)
  material.uniforms[CLOUDS_NIGHT_COLOR_UNIFORM] = new THREE.Uniform(nightColor.clone())
  material.uniforms[CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM] = new THREE.Uniform(new THREE.Vector3())
  material.uniforms[CLOUDS_DAY_LIGHT_FACTOR_UNIFORM] = new THREE.Uniform(1)

  if (material.fragmentShader.includes(CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM)) return

  const withUniform = material.fragmentShader.replace(
    'uniform float powderExponent;',
    [
      'uniform float powderExponent;',
      `uniform float ${CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM};`,
      `uniform float ${CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM};`,
      `uniform vec3 ${CLOUDS_NIGHT_COLOR_UNIFORM};`,
      `uniform vec3 ${CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM};`,
      `uniform float ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`
    ].join('\n')
  )
  if (withUniform === material.fragmentShader) {
    console.warn('Tellux clouds shader patch failed: uniform hook was not found.')
    material.needsUpdate = true
    return
  }

  const withGroundDayLight = withUniform.replace(
    '  vec3 skyIrradiance;\n  vec3 sunIrradiance = getGroundSunSkyIrradiance(position, surfaceNormal, height, skyIrradiance);',
    [
      '  vec3 skyIrradiance;',
      '  vec3 sunIrradiance = getGroundSunSkyIrradiance(position, surfaceNormal, height, skyIrradiance);',
      `  sunIrradiance *= ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`,
      `  skyIrradiance *= ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`
    ].join('\n')
  )
  if (withGroundDayLight === withUniform) {
    console.warn('Tellux clouds shader patch failed: ground day lighting hook was not found.')
  }

  const shaderWithGroundDayLight =
    withGroundDayLight === withUniform ? withUniform : withGroundDayLight
  const withCloudDayLight = shaderWithGroundDayLight.replace(
    '      vec3 skyIrradiance;\n      vec3 sunIrradiance = getCloudsSunSkyIrradiance(position, height, skyIrradiance);',
    [
      '      vec3 skyIrradiance;',
      '      vec3 sunIrradiance = getCloudsSunSkyIrradiance(position, height, skyIrradiance);',
      `      sunIrradiance *= ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`,
      `      skyIrradiance *= ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`
    ].join('\n')
  )
  if (withCloudDayLight === shaderWithGroundDayLight) {
    console.warn('Tellux clouds shader patch failed: cloud day lighting hook was not found.')
  }

  const shaderWithCloudDayLight =
    withCloudDayLight === shaderWithGroundDayLight ? shaderWithGroundDayLight : withCloudDayLight
  const withHazeDayLight = shaderWithCloudDayLight.replace(
    '  vec3 skyIrradiance = vGroundIrradiance.sky;\n  vec3 sunIrradiance = vGroundIrradiance.sun;',
    [
      `  vec3 skyIrradiance = vGroundIrradiance.sky * ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`,
      `  vec3 sunIrradiance = vGroundIrradiance.sun * ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`
    ].join('\n')
  )
  if (withHazeDayLight === shaderWithCloudDayLight) {
    console.warn('Tellux clouds shader patch failed: haze day lighting hook was not found.')
  }

  const shaderWithHazeDayLight =
    withHazeDayLight === shaderWithCloudDayLight ? shaderWithCloudDayLight : withHazeDayLight
  const withAerialPerspectiveDayLight = shaderWithHazeDayLight.replace(
    '  color.rgb = color.rgb * transmittance + inscatter * color.a;',
    `  color.rgb = color.rgb * transmittance + inscatter * color.a * ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`
  )
  if (withAerialPerspectiveDayLight === shaderWithHazeDayLight) {
    console.warn('Tellux clouds shader patch failed: aerial perspective day lighting hook was not found.')
  }

  const shaderWithDayLighting =
    withAerialPerspectiveDayLight === shaderWithHazeDayLight ? shaderWithHazeDayLight : withAerialPerspectiveDayLight
  const patchedShader = shaderWithDayLighting.replace(
    'radiance += skyIrradiance * RECIPROCAL_PI4 * skyGradient * skyLightScale;',
    [
      'radiance += skyIrradiance * RECIPROCAL_PI4 * skyGradient * skyLightScale;',
      `if (${CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM} > 0.0 || ${CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM} > 0.0) {`,
      `  float telluxCloudMoonDiffuse = max(dot(surfaceNormal, ${CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM}), 0.0);`,
      `  float telluxCloudMoonPhase = approximateMultipleScattering(opticalDepth * 0.35, dot(${CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM}, rayDirection));`,
      `  vec3 telluxCloudNightRadiance = ${CLOUDS_NIGHT_COLOR_UNIFORM} * ${CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM} * (0.35 + 0.85 * skyGradient);`,
      `  telluxCloudNightRadiance += ${CLOUDS_NIGHT_COLOR_UNIFORM} * ${CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM} * (0.25 + 0.75 * telluxCloudMoonDiffuse) * telluxCloudMoonPhase;`,
      '  radiance += telluxCloudNightRadiance;',
      '}'
    ].join('\n      ')
  )
  if (patchedShader === shaderWithDayLighting) {
    console.warn('Tellux clouds shader patch failed: night lighting hook was not found.')
    material.needsUpdate = true
    return
  }

  material.fragmentShader = patchedShader
  material.needsUpdate = true
}
