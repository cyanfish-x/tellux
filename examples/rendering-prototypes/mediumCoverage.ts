/** 有限介质深度边界，单位米。 Finite medium interval boundaries in meters. */
export const coverageBoundaries = [0, 2000, 5000, 8000, 16000] as const

/** 双线性查询会读取该单元的全分辨率足迹，含保守边界。 Full-resolution footprint that can read a cell through bilinear filtering, including conservative borders. */
export function coverageFootprint(cell: number, fullSize: number, lowSize: number): [number, number] {
  if (!Number.isInteger(cell) || cell < 0 || cell >= lowSize || fullSize < 1 || lowSize < 1) throw new Error('Invalid coverage dimensions')
  const ratio = fullSize / lowSize
  return [Math.max(0, Math.floor((cell - 0.5) * ratio) - 1), Math.min(fullSize - 1, Math.ceil((cell + 1.5) * ratio) + 1)]
}

/** 截断区间内的查询比例；超出有效域显式拒绝。 Fraction within a truncated interval; reject queries outside the valid domain. */
export function partialCoverageFraction(start: number, end: number, validEnd: number, query: number): number | null {
  if (query > validEnd || validEnd < start) return null
  const length = Math.min(end, validEnd) - start
  return length > 0 ? Math.max(0, Math.min(1, (query - start) / length)) : 0
}
