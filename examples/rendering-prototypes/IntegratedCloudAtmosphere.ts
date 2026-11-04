import type { RawShaderMaterial } from 'three'

/** 用吸收权重计算空气透视深度，保留薄雾、阴影和历史深度。 Use absorption-weighted aerial depth while preserving haze, shadow and history depth. */
export function correctCloudCentroid(shader: string): string {
  const replacements: Array<[string, string]> = [
    ['vec4 marchClouds(', 'float a1AbsorptionDepth = 0.0;\nvec4 marchClouds('],
    ['float weightedDistanceSum = 0.0;', 'float weightedDistanceSum = 0.0;\n  float a1AbsorptionMoment = 0.0, a1AbsorptionSum = 0.0;'],
    ['transmittanceIntegral *= transmittance;', 'float a1Absorbed = transmittanceIntegral * (1.0 - transmittance);\n      a1AbsorptionMoment += rayDistance * a1Absorbed;\n      a1AbsorptionSum += a1Absorbed;\n      transmittanceIntegral *= transmittance;'],
    ['  // The final product of 5.9.1', '  a1AbsorptionDepth = rayNearFar.x + a1AbsorptionMoment / max(a1AbsorptionSum, 1e-30);\n  // The final product of 5.9.1'],
    ['applyAerialPerspective(cameraPosition, frontPosition, shadowLength, color);', 'applyAerialPerspective(cameraPosition, cameraPosition + a1AbsorptionDepth * rayDirection, shadowLength, color);'],
  ]
  for (const [before, after] of replacements) {
    if (shader.split(before).length !== 2) throw new Error('Unsupported cloud centroid shader layout')
    shader = shader.replace(before, after)
  }
  return shader
}

/** 在原云步进中累计空气透视，保留原采样、历史和输出资源。 Accumulate aerial perspective inside the existing cloud march, retaining sampling/history/resources. */
export function integrateCloudAtmosphere(shader: string, prefixSpacing = 500): string {
  if (!Number.isFinite(prefixSpacing) || prefixSpacing < -1) throw new Error('Invalid prefix spacing')
  const accumulation = 'radianceIntegral += transmittanceIntegral * scatteringIntegral;'
  const aerial = 'applyAerialPerspective(cameraPosition, frontPosition, shadowLength, color);'
  if (shader.split(accumulation).length !== 2 || shader.split(aerial).length !== 2) throw new Error('Unsupported integrated cloud-atmosphere shader layout')
  const initialization = 'vec3 radianceIntegral = vec3(0.0);'
  if (shader.split(initialization).length !== 2) throw new Error('Unsupported cloud integral layout')
  return shader.replace(initialization, `${initialization}
  float a1PrefixNear = -1.0, a1PrefixFar = -1.0;
  vec3 a1NearT, a1NearS, a1FarT, a1FarS;
  `).replace(accumulation, `
      // Integration by parts: overlay = integral(Tair*jcloud - Sair*dTcloud).
      // Compositing this over the air-only scene gives the joint medium result.
      vec3 a1AirT;
      vec3 a1AirS;
      ${prefixSpacing === -1 ? `
      vec3 a1Origin = vCameraPosition + altitudeCorrection;
      float a1Distance = max(0.001, dot(position - a1Origin, rayDirection));
      if (a1PrefixNear < 0.0) {
        a1PrefixNear = a1Distance;
        a1NearS = GetSkyRadianceToPoint(a1Origin * METER_TO_LENGTH_UNIT,
          position * METER_TO_LENGTH_UNIT, 0.0, sunDirection, a1NearT);
      }
      float a1Ratio = a1Distance / a1PrefixNear;
      a1AirT = pow(clamp(a1NearT, vec3(1e-30), vec3(1.0)), vec3(a1Ratio));
      vec3 a1Weight = (vec3(1.0) - a1AirT) / max(vec3(1e-6), vec3(1.0) - a1NearT);
      a1Weight = mix(a1Weight, vec3(a1Ratio), greaterThan(a1NearT, vec3(0.99999)));
      a1AirS = a1NearS * a1Weight;
      ` : prefixSpacing === 0 ? `a1AirS = GetSkyRadianceToPoint(
        (vCameraPosition + altitudeCorrection) * METER_TO_LENGTH_UNIT,
        position * METER_TO_LENGTH_UNIT, 0.0, sunDirection, a1AirT);` : `
      vec3 a1Origin = vCameraPosition + altitudeCorrection;
      float a1Distance = dot(position - a1Origin, rayDirection);
      if (a1Distance > a1PrefixFar || a1PrefixNear < 0.0) {
        a1PrefixNear = floor(a1Distance / ${prefixSpacing.toFixed(1)}) * ${prefixSpacing.toFixed(1)};
        a1PrefixFar = max(a1PrefixNear + 0.001, min(a1PrefixNear + ${prefixSpacing.toFixed(1)}, rayNearFar.y));
        if (a1PrefixNear == 0.0) { a1NearT = vec3(1.0); a1NearS = vec3(0.0); }
        else a1NearS = GetSkyRadianceToPoint(a1Origin * METER_TO_LENGTH_UNIT,
          (a1Origin + rayDirection * a1PrefixNear) * METER_TO_LENGTH_UNIT, 0.0, sunDirection, a1NearT);
        a1FarS = GetSkyRadianceToPoint(a1Origin * METER_TO_LENGTH_UNIT,
          (a1Origin + rayDirection * a1PrefixFar) * METER_TO_LENGTH_UNIT, 0.0, sunDirection, a1FarT);
      }
      float a1Fraction = clamp((a1Distance - a1PrefixNear) / (a1PrefixFar - a1PrefixNear), 0.0, 1.0);
      a1AirT = mix(a1NearT, a1FarT, a1Fraction); a1AirS = mix(a1NearS, a1FarS, a1Fraction);
      `}
      radianceIntegral += transmittanceIntegral *
        (a1AirT * scatteringIntegral + a1AirS * telluxCloudsDayLightFactor * (1.0 - transmittance));
  `).replace(aerial, '// Aerial perspective was accumulated at cloud samples.')
}


/** 跳过形状侵蚀后已确定为零的细节查询。 Skip detail queries after shape erosion has made density zero. */
export function skipErodedCloudSamples(shader: string): string {
  const seam = 'density = remapClamped(density, vec4(1.0 - shape) * shapeAmounts, vec4(1.0));'
  if (shader.split(seam).length !== 2) throw new Error('Unsupported cloud erosion shader layout')
  return shader.replace(seam, `${seam}
  if (!any(greaterThan(density, vec4(0.0))) && all(greaterThanEqual(shapeDetailAmounts, vec4(0.0)))) {
    MediaSample empty;
    empty.density = 0.0; empty.weight = vec4(0.0);
    empty.scattering = 0.0; empty.extinction = 0.0;
    return empty;
  }
  `)
}

/** 特化无指数密度剖面，天气幂保留原浮点计算。 Specialize linear profiles while preserving upstream weather-power arithmetic. */
export function optimizeCloudSampling(shader: string): string {
  shader = skipErodedCloudSamples(shader)
  const replacements: Array<[string, string]> = [
    ['vec4 getLayerDensity(const vec4 heightFraction) {', 'vec4 getLayerDensity(const vec4 heightFraction) {\n#ifdef A1_LINEAR_PROFILE\n  return densityProfile.linearTerms * heightFraction + densityProfile.constantTerms;\n#endif'],
  ]
  for (const [before, after] of replacements) {
    if (shader.split(before).length !== 2) throw new Error('Unsupported cloud profile shader layout')
    shader = shader.replace(before, after)
  }
  return shader
}

/** 按当前 uniforms 选择等价编译分支，参数变化时自动退回通用分支。 Select equivalent compiled branches from current uniforms and restore general paths when parameters change. */
export function syncCloudSamplingDefines(material: RawShaderMaterial) {
  const optimized = material.fragmentShader.includes('A1_LINEAR_PROFILE')
  const profile = material.uniforms.densityProfile.value.expTerms
  updateSamplingDefine(material, 'A1_LINEAR_PROFILE', optimized && profile.x === 0 && profile.y === 0 && profile.z === 0 && profile.w === 0)

}

function updateSamplingDefine(material: RawShaderMaterial, key: string, enabled: boolean) {
  if (enabled === (key in material.defines)) return
  if (enabled) material.defines[key] = '1'
  else delete material.defines[key]
  material.needsUpdate = true
}
