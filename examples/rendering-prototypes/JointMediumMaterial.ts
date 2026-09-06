import * as THREE from 'three'
import type { CloudsEffect } from '@takram/three-clouds'
import { mediumIntegralGLSL } from './mediumIntegral'

/** 克隆上游已解析云 shader，只用于 A1 源项与积分实验。 Clone resolved upstream cloud shader for A1 source/integration experiments only. */
export function createJointMediumMaterial(clouds: CloudsEffect) {
  const source = clouds.cloudsPass.currentMaterial
  const start = source.fragmentShader.indexOf('      vec3 skyIrradiance;', source.fragmentShader.indexOf('vec4 marchClouds('))
  const end = source.fragmentShader.indexOf('      // Energy-conserving analytical integration', start)
  if (start < 0 || end < start || !source.fragmentShader.includes('void main() {')) throw new Error('Unsupported Takram Clouds 0.7.6 source layout')
  // Keep actual cloud density, sun self-shadowing, and the upstream lighting closure.
  // Return radiance AFTER multiplication by media.scattering, BEFORE integration.
  const cloudSource = source.fragmentShader.slice(start, end)
  const fragment = source.fragmentShader
    .replace('vUv * targetUvScale + temporalJitter', 'vUv')
    .replace('layout(location = 1) out vec3 outputDepthVelocity;', 'vec3 outputDepthVelocity;')
    .replace('layout(location = 2) out float outputShadowLength;', 'float outputShadowLength;')
    .replace('void main() {', 'void a1UnusedUpstreamMain() {')
  const uniforms = {
    ...source.uniforms,
    a1Scene: { value: null as THREE.Texture | null },
    a1Distance: { value: 12000 }, a1Steps: { value: 64 }, a1Mode: { value: 0 },
    a1Air: { value: true }, a1Cloud: { value: true }, a1Output: { value: 0 },
  }
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: source.vertexShader,
    fragmentShader: fragment + `
uniform sampler2D a1Scene;
uniform float a1Distance;
uniform int a1Steps, a1Mode, a1Output;
uniform bool a1Air, a1Cloud;
${mediumIntegralGLSL}
float a1Density(DensityProfile profile, float heightKm) {
  DensityProfileLayer layer = profile.layers[1];
  if (heightKm < profile.layers[0].width) layer = profile.layers[0];
  return clamp(layer.exp_term * exp(layer.exp_scale * heightKm) + layer.linear_term * heightKm + layer.constant_term, 0.0, 1.0);
}
void a1AirSource(vec3 position, float cosTheta, out vec3 sigma, out vec3 j) {
  vec3 p = position * METER_TO_LENGTH_UNIT;
  float r = length(p);
  float h = max(0.0, r - ATMOSPHERE.bottom_radius);
  vec3 rayleigh = ATMOSPHERE.rayleigh_scattering * a1Density(ATMOSPHERE.rayleigh_density, h) * METER_TO_LENGTH_UNIT;
  float mieDensity = a1Density(ATMOSPHERE.mie_density, h) * METER_TO_LENGTH_UNIT;
  sigma = rayleigh + ATMOSPHERE.mie_extinction * mieDensity
    + ATMOSPHERE.absorption_extinction * a1Density(ATMOSPHERE.absorption_density, h) * METER_TO_LENGTH_UNIT;
  vec3 sun = ATMOSPHERE.solar_irradiance * GetTransmittanceToSun(ATMOSPHERE, transmittance_texture, r, dot(p / r, sunDirection)) * SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
  j = sun * (rayleigh * RayleighPhaseFunction(cosTheta) + ATMOSPHERE.mie_scattering * mieDensity * MiePhaseFunction(ATMOSPHERE.mie_phase_function_g, cosTheta));
}
vec3 a1CloudSource(MediaSample media, WeatherSample weather, vec3 position, float height, float cosTheta, vec3 rayDirection) {
  float mipLevel = 0.0, jitter = 0.5;
  ivec3 sampleCount = ivec3(0);
${cloudSource}
  return radiance;
}
void main() {
  vec3 origin = vCameraPosition + altitudeCorrection;
  vec3 direction = normalize(vRayDirection);
  float sceneViewZ;
  float sceneDistance = getRayDistanceToScene(direction, sceneViewZ);
  float distance = min(a1Distance, sceneDistance > 0.0 ? sceneDistance : a1Distance);
  if (a1Output == 3 || a1Output == 4) {
    vec3 lutT;
    vec3 lutS = GetSkyRadianceToPoint(origin * METER_TO_LENGTH_UNIT, (origin + direction * distance) * METER_TO_LENGTH_UNIT, 0.0, sunDirection, lutT);
    outputColor = vec4(a1Output == 3 ? lutT : lutS, 1.0);
    return;
  }
  float ds = distance / float(a1Steps);
  vec3 T = vec3(1.0), S = vec3(0.0);
  vec3 airT = vec3(1.0), airS = vec3(0.0), cloudT = vec3(1.0), cloudS = vec3(0.0);
  float cosTheta = dot(direction, sunDirection);
  for (int i = 0; i < 512; ++i) {
    if (i >= a1Steps) break;
    vec3 position = origin + direction * ((float(i) + 0.5) * ds);
    float height = length(position) - bottomRadius;
    vec3 sigmaAir = vec3(0.0), sourceAir = vec3(0.0), sigmaCloud = vec3(0.0), sourceCloud = vec3(0.0);
    if (a1Air) a1AirSource(position, cosTheta, sigmaAir, sourceAir);
    if (a1Cloud && height >= minHeight && height <= maxHeight) {
      vec2 uv = getGlobeUv(position);
      WeatherSample weather = sampleWeather(uv, height, 0.0);
      ivec3 sampleCount = ivec3(0);
      MediaSample media = sampleMedia(weather, position, uv, 0.0, 0.5, sampleCount);
      if (media.extinction > 0.0) {
        sigmaCloud = vec3(media.extinction);
        sourceCloud = a1CloudSource(media, weather, position, height, cosTheta, direction);
      }
    }
    a1Accumulate(sigmaAir + sigmaCloud, sourceAir + sourceCloud, ds, T, S);
    a1Accumulate(sigmaAir, sourceAir, ds, airT, airS);
    a1Accumulate(sigmaCloud, sourceCloud, ds, cloudT, cloudS);
  }
  if (a1Mode == 1) { T = airT * cloudT; S = airS + airT * cloudS; }
  if (a1Mode == 2) { T = airT * cloudT; S = cloudS + cloudT * airS; }
  if (a1Output == 1) { outputColor = vec4(T, 1.0); return; }
  if (a1Output == 2) { outputColor = vec4(S, 1.0); return; }
  vec3 background;
  if (sceneDistance > 0.0) background = texture(a1Scene, vUv).rgb;
  else {
    vec3 unusedT;
    // Boundary radiance beyond the finite experiment domain, not camera sky re-fogged.
    background = GetSkyRadiance((origin + direction * distance) * METER_TO_LENGTH_UNIT, direction, 0.0, sunDirection, unusedT);
  }
  outputColor = vec4(S + T * background, 1.0);
}
`, uniforms, defines: { ...source.defines }, depthWrite: false, depthTest: false, toneMapped: false,
  })
  return { material, uniforms, sync() { material.defines = { ...source.defines } } }
}
