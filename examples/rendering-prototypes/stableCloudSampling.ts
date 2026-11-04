/** 稳定的球面到立方体面逆变换，避免面中心附近相消。 Stable inverse spherified-cube mapping without cancellation near face centers. */
export const stableCubeFaceGLSL = `
vec2 a1StableCubeFace(vec2 m) {
  vec2 m2 = m * m;
  float a = 1.5 + m2.x - m2.y;
  float denominator = a + sqrt(max(0.0, a * a - 6.0 * m2.x));
  float u = m.x * sqrt(6.0 / denominator);
  return vec2(u, m.y * sqrt(6.0 / (3.0 - u * u)));
}
`

/** 限定上游接缝；失败时明确报错，避免升级后静默失效。 Guard the upstream seam rather than silently missing a shader change. */
export function stabilizeCloudSampling(shader: string, explicitLod = true): string {
  const replacements: Array<[string, string]> = [
    ['vec2 getCubeSphereUv(const vec3 position) {', `${stableCubeFaceGLSL}\nvec2 getCubeSphereUv(const vec3 position) {`],
    ['uv.x = sqrt(1.5 + m2.x - m2.y - 0.5 * sqrt(-24.0 * m2.x + q2)) * (m.x > 0.0 ? 1.0 : -1.0);', 'uv.x = a1StableCubeFace(m).x;'],
  ]
  if (explicitLod) replacements.push(
    ['texture(shapeTexture, shapePosition).r', 'textureLod(shapeTexture, shapePosition, 0.0).r'],
    ['texture(shapeDetailTexture, detailPosition).r', 'textureLod(shapeDetailTexture, detailPosition, 0.0).r'],
    ['texture(turbulenceTexture, turbulenceUv).rgb', 'textureLod(turbulenceTexture, turbulenceUv, 0.0).rgb'],
  )
  for (const [before, after] of replacements) {
    if (shader.split(before).length !== 2) throw new Error(`Unsupported A1 cloud sampling shader: ${before}`)
    shader = shader.replace(before, after)
  }
  return shader
}

/** 从立方体面正向映射生成独立参考，包含近轴、符号与角点。 Independent forward-map fixtures including near-axis, signed and corner samples. */
export const cubeFaceFixtures = [-0.99, -0.1, -0.001, -0.0001, -0.00001, 0, 0.00001, 0.0001, 0.001, 0.1, 0.99]
  .flatMap(u => [-0.9, -0.0001, 0, 0.0001, 0.9].map(v => ({
    sphere: [u * Math.sqrt(0.5 - v * v / 6), v * Math.sqrt(0.5 - u * u / 6)], cube: [u, v],
  })))
