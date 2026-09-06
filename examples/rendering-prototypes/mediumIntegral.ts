/** RGB 消光/源项，单位分别为 1/m 与 radiance/m。 RGB extinction/source in 1/m and radiance/m. */
export type RGB = [number, number, number]
export interface Medium { extinction: RGB; source: RGB }
export interface Integral { transmittance: RGB; scattering: RGB }

/** 均匀区间解析解；不把源项当作已积分颜色。 Analytic homogeneous segment, with a local source term. */
export function homogeneous(medium: Medium, length: number): Integral {
  if (!Number.isFinite(length) || length < 0 || [...medium.extinction, ...medium.source].some(x => !Number.isFinite(x) || x < 0)) {
    throw new Error('Medium coefficients and length must be finite and nonnegative')
  }
  const transmittance = medium.extinction.map(sigma => Math.exp(-sigma * length)) as RGB
  const scattering = medium.extinction.map((sigma, i) => medium.source[i] * (sigma === 0 ? length : -Math.expm1(-sigma * length) / sigma)) as RGB
  return { transmittance, scattering }
}

/** 同一位置的介质系数相加，再积分。 Sum overlapping coefficients before integration. */
export function overlap(a: Medium, b: Medium): Medium {
  return { extinction: a.extinction.map((v, i) => v + b.extinction[i]) as RGB,
    source: a.source.map((v, i) => v + b.source[i]) as RGB }
}

/** 前后相邻区间的组合，near 位于相机侧。 Compose adjacent segments, near first. */
export function compose(near: Integral, far: Integral): Integral {
  return {
    transmittance: near.transmittance.map((v, i) => v * far.transmittance[i]) as RGB,
    scattering: near.scattering.map((v, i) => v + near.transmittance[i] * far.scattering[i]) as RGB,
  }
}

/** 固定中点步进参考；只用于实验，不提前终止。 Fixed midpoint marching, without early termination. */
export function march(sample: (distance: number) => Medium, length: number, steps: number): Integral {
  if (!Number.isInteger(steps) || steps < 1) throw new Error('steps must be a positive integer')
  let result: Integral = { transmittance: [1, 1, 1], scattering: [0, 0, 0] }
  const step = length / steps
  for (let i = 0; i < steps; ++i) result = compose(result, homogeneous(sample((i + 0.5) * step), step))
  return result
}

// Shared by analytic GPU checks and the real-cloud integration experiment.
// Small optical depths use a series to avoid float32 cancellation in 1-exp(-x).
export const mediumIntegralGLSL = `
float a1IntegralWeight(float sigma, float distance) {
  float x = sigma * distance;
  if (abs(x) < 0.001) return distance * (1.0 - x * 0.5 + x * x / 6.0);
  return (1.0 - exp(-x)) / sigma;
}
void a1Accumulate(vec3 sigma, vec3 source, float distance, inout vec3 T, inout vec3 S) {
  vec3 weight = vec3(a1IntegralWeight(sigma.r, distance), a1IntegralWeight(sigma.g, distance), a1IntegralWeight(sigma.b, distance));
  S += T * source * weight;
  T *= exp(-sigma * distance);
}
`

export const analyticCases: Array<{ name: string; a: Medium; b: Medium; length: number }> = [
  { name: 'vacuum', a: { extinction: [0, 0, 0], source: [0, 0, 0] }, b: { extinction: [0, 0, 0], source: [0, 0, 0] }, length: 500 },
  { name: 'zero-extinction-source', a: { extinction: [0, 0, 0], source: [0.001, 0.002, 0.003] }, b: { extinction: [0, 0, 0], source: [0, 0, 0] }, length: 100 },
  { name: 'air-only', a: { extinction: [0.00001, 0.00002, 0.00004], source: [0.00001, 0.00002, 0.00003] }, b: { extinction: [0, 0, 0], source: [0, 0, 0] }, length: 10000 },
  { name: 'cloud-only', a: { extinction: [0, 0, 0], source: [0, 0, 0] }, b: { extinction: [0.002, 0.002, 0.002], source: [0.001, 0.002, 0.003] }, length: 1000 },
  { name: 'overlap', a: { extinction: [0.0001, 0.0002, 0.0004], source: [0.0002, 0.0001, 0.0003] }, b: { extinction: [0.001, 0.002, 0.003], source: [0.003, 0.002, 0.001] }, length: 2000 },
  { name: 'dense', a: { extinction: [1, 2, 3], source: [0.5, 1, 1.5] }, b: { extinction: [3, 2, 1], source: [1.5, 1, 0.5] }, length: 1000 },
  { name: 'tiny-optical-depth', a: { extinction: [1e-12, 1e-10, 1e-8], source: [0.001, 0.002, 0.003] }, b: { extinction: [0, 0, 0], source: [0, 0, 0] }, length: 1 },
]
