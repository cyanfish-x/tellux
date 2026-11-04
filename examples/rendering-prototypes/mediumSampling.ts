/** 云层球面交点；方向须归一化。 Cloud-shell intersections for a normalized ray. */
export function shellIntersections(origin: readonly number[], direction: readonly number[], radius: number): number[] {
  const b = origin.reduce((sum, value, i) => sum + value * direction[i], 0)
  const r = Math.hypot(...origin)
  const c = (r - radius) * (r + radius)
  const discriminant = b * b - c
  if (discriminant < 0) return []
  const q = -b - (b >= 0 ? 1 : -1) * Math.sqrt(discriminant)
  return q === 0 ? [-b] : [q, c / q].sort((a, b) => a - b)
}

/** 保留均匀网格并插入边界，不跳过空区间。 Insert boundaries into a uniform grid without skipping intervals. */
export function samplingIntervals(length: number, steps: number, boundaries: readonly number[]): Array<[number, number]> {
  if (!Number.isFinite(length) || length < 0 || !Number.isInteger(steps) || steps < 1) throw new Error('Invalid sampling domain')
  const cuts = [...new Set([0, length, ...Array.from({ length: steps - 1 }, (_, i) => (i + 1) * length / steps),
    ...boundaries.filter(x => Number.isFinite(x) && x > 0 && x < length)])].sort((a, b) => a - b)
  return cuts.slice(1).map((end, i) => [cuts[i], end])
}

// Stable quadratic roots reduce cancellation for a nearby boundary at Earth scale.
// Eight layer surfaces have at most sixteen ray intersections.
export const mediumSamplingGLSL = `
void a1InsertShell(vec3 origin, vec3 direction, float radius, float limit, inout float cuts[18], inout int count) {
  float b = dot(origin, direction);
  float r = length(origin);
  float c = (r - radius) * (r + radius);
  float discriminant = b * b - c;
  if (discriminant < 0.0) return;
  float q = -b - (b >= 0.0 ? 1.0 : -1.0) * sqrt(discriminant);
  vec2 roots = q == 0.0 ? vec2(-b) : vec2(q, c / q);
  for (int j = 0; j < 2; ++j) {
    float t = roots[j];
    if (t > 0.0 && t < limit && count < 18) { cuts[count] = t; count++; }
  }
}
`
