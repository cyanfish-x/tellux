export interface ShallowWaterModelOptions {
  width: number
  height: number
  cellSize: number
  bed: Float32Array | Float64Array
  seaLevel: number
  gravity?: number
  dryDepth?: number
}

type State = { h: number, hu: number, hv: number }
type Flux = { h: number, hu: number, hv: number, leftCorrection: number, rightCorrection: number }

/**
 * Small CPU reference for the GPU shore solver. It uses HLL fluxes with
 * hydrostatic reconstruction, so a lake at rest remains well balanced over a
 * non-flat bed while wet/dry cells stay positive.
 */
export class ShallowWaterModel {
  readonly width: number
  readonly height: number
  readonly cellSize: number
  readonly gravity: number
  readonly dryDepth: number
  readonly bed: Float64Array
  readonly depth: Float64Array
  readonly momentumX: Float64Array
  readonly momentumY: Float64Array
  terrainCorrectionVolume = 0

  private readonly deltaDepth: Float64Array
  private readonly deltaMomentumX: Float64Array
  private readonly deltaMomentumY: Float64Array

  constructor(options: ShallowWaterModelOptions) {
    this.width = options.width
    this.height = options.height
    this.cellSize = options.cellSize
    this.gravity = options.gravity ?? 9.81
    this.dryDepth = options.dryDepth ?? 1e-4
    const count = this.width * this.height
    if (options.bed.length !== count) throw new Error('ShallowWaterModel bed size does not match the grid.')
    this.bed = new Float64Array(options.bed)
    this.depth = new Float64Array(count)
    this.momentumX = new Float64Array(count)
    this.momentumY = new Float64Array(count)
    this.deltaDepth = new Float64Array(count)
    this.deltaMomentumX = new Float64Array(count)
    this.deltaMomentumY = new Float64Array(count)
    for (let index = 0; index < count; index += 1) {
      this.depth[index] = Math.max(options.seaLevel - this.bed[index], 0)
    }
  }

  get volume() {
    let sum = 0
    for (let index = 0; index < this.depth.length; index += 1) sum += this.depth[index]
    return sum * this.cellSize * this.cellSize
  }

  computeStableTimeStep(cfl = 0.45, maxTimeStep = Number.POSITIVE_INFINITY) {
    let maxSpeed = 0
    for (let index = 0; index < this.depth.length; index += 1) {
      const h = this.depth[index]
      if (h <= this.dryDepth) continue
      const u = this.momentumX[index] / h
      const v = this.momentumY[index] / h
      maxSpeed = Math.max(maxSpeed, Math.abs(u) + Math.sqrt(this.gravity * h), Math.abs(v) + Math.sqrt(this.gravity * h))
    }
    return maxSpeed === 0
      ? maxTimeStep
      : Math.min(maxTimeStep, cfl * this.cellSize / maxSpeed)
  }

  step(deltaTime: number) {
    if (!(deltaTime > 0)) return
    this.deltaDepth.fill(0)
    this.deltaMomentumX.fill(0)
    this.deltaMomentumY.fill(0)
    const factor = deltaTime / this.cellSize

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x + 1 < this.width; x += 1) {
        const left = y * this.width + x
        const right = left + 1
        const flux = this.interfaceFlux(left, right, 'x')
        this.deltaDepth[left] -= factor * flux.h
        this.deltaDepth[right] += factor * flux.h
        this.deltaMomentumX[left] -= factor * (flux.hu + flux.leftCorrection)
        this.deltaMomentumX[right] += factor * (flux.hu + flux.rightCorrection)
        this.deltaMomentumY[left] -= factor * flux.hv
        this.deltaMomentumY[right] += factor * flux.hv
      }
      const leftBoundary = y * this.width
      const rightBoundary = leftBoundary + this.width - 1
      this.deltaMomentumX[leftBoundary] += factor * 0.5 * this.gravity * this.depth[leftBoundary] ** 2
      this.deltaMomentumX[rightBoundary] -= factor * 0.5 * this.gravity * this.depth[rightBoundary] ** 2
    }

    for (let y = 0; y + 1 < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const bottom = y * this.width + x
        const top = bottom + this.width
        const flux = this.interfaceFlux(bottom, top, 'y')
        this.deltaDepth[bottom] -= factor * flux.h
        this.deltaDepth[top] += factor * flux.h
        this.deltaMomentumX[bottom] -= factor * flux.hv
        this.deltaMomentumX[top] += factor * flux.hv
        this.deltaMomentumY[bottom] -= factor * (flux.hu + flux.leftCorrection)
        this.deltaMomentumY[top] += factor * (flux.hu + flux.rightCorrection)
      }
    }
    for (let x = 0; x < this.width; x += 1) {
      const bottomBoundary = x
      const topBoundary = (this.height - 1) * this.width + x
      this.deltaMomentumY[bottomBoundary] += factor * 0.5 * this.gravity * this.depth[bottomBoundary] ** 2
      this.deltaMomentumY[topBoundary] -= factor * 0.5 * this.gravity * this.depth[topBoundary] ** 2
    }

    for (let index = 0; index < this.depth.length; index += 1) {
      const nextDepth = this.depth[index] + this.deltaDepth[index]
      if (!Number.isFinite(nextDepth) || nextDepth <= this.dryDepth) {
        this.depth[index] = 0
        this.momentumX[index] = 0
        this.momentumY[index] = 0
        continue
      }
      this.depth[index] = nextDepth
      this.momentumX[index] += this.deltaMomentumX[index]
      this.momentumY[index] += this.deltaMomentumY[index]
      if (!Number.isFinite(this.momentumX[index]) || !Number.isFinite(this.momentumY[index])) {
        this.momentumX[index] = 0
        this.momentumY[index] = 0
      }
    }
  }

  applyBedRevision(nextBed: Float32Array | Float64Array, seaLevel: number) {
    if (nextBed.length !== this.bed.length) throw new Error('ShallowWaterModel bed revision size does not match the grid.')
    let correctionVolume = 0
    const cellArea = this.cellSize * this.cellSize
    for (let index = 0; index < this.bed.length; index += 1) {
      const oldDepth = this.depth[index]
      const oldSurface = this.bed[index] + oldDepth
      const bed = nextBed[index]
      let nextDepth = oldDepth <= this.dryDepth
        ? Math.max(seaLevel - bed, 0)
        : Math.max(oldSurface - bed, 0)
      if (!Number.isFinite(nextDepth)) nextDepth = 0
      correctionVolume += (nextDepth - oldDepth) * cellArea
      this.bed[index] = bed
      this.depth[index] = nextDepth
      if (nextDepth <= this.dryDepth) {
        this.depth[index] = 0
        this.momentumX[index] = 0
        this.momentumY[index] = 0
      }
    }
    this.terrainCorrectionVolume += correctionVolume
    return correctionVolume
  }

  private interfaceFlux(leftIndex: number, rightIndex: number, axis: 'x' | 'y'): Flux {
    const leftOriginal = this.readState(leftIndex, axis)
    const rightOriginal = this.readState(rightIndex, axis)
    const leftSurface = this.bed[leftIndex] + leftOriginal.h
    const rightSurface = this.bed[rightIndex] + rightOriginal.h
    const interfaceBed = Math.max(this.bed[leftIndex], this.bed[rightIndex])
    const leftDepth = Math.max(leftSurface - interfaceBed, 0)
    const rightDepth = Math.max(rightSurface - interfaceBed, 0)
    const leftVelocity = leftOriginal.h > this.dryDepth ? leftOriginal.hu / leftOriginal.h : 0
    const leftTransverse = leftOriginal.h > this.dryDepth ? leftOriginal.hv / leftOriginal.h : 0
    const rightVelocity = rightOriginal.h > this.dryDepth ? rightOriginal.hu / rightOriginal.h : 0
    const rightTransverse = rightOriginal.h > this.dryDepth ? rightOriginal.hv / rightOriginal.h : 0
    const left: State = { h: leftDepth, hu: leftDepth * leftVelocity, hv: leftDepth * leftTransverse }
    const right: State = { h: rightDepth, hu: rightDepth * rightVelocity, hv: rightDepth * rightTransverse }
    const flux = hllFlux(left, right, this.gravity, this.dryDepth)
    return {
      ...flux,
      leftCorrection: 0.5 * this.gravity * (leftOriginal.h * leftOriginal.h - leftDepth * leftDepth),
      rightCorrection: 0.5 * this.gravity * (rightOriginal.h * rightOriginal.h - rightDepth * rightDepth)
    }
  }

  private readState(index: number, axis: 'x' | 'y'): State {
    return axis === 'x'
      ? { h: this.depth[index], hu: this.momentumX[index], hv: this.momentumY[index] }
      : { h: this.depth[index], hu: this.momentumY[index], hv: this.momentumX[index] }
  }
}

function hllFlux(left: State, right: State, gravity: number, dryDepth: number): Omit<Flux, 'leftCorrection' | 'rightCorrection'> {
  const leftVelocity = left.h > dryDepth ? left.hu / left.h : 0
  const rightVelocity = right.h > dryDepth ? right.hu / right.h : 0
  const leftWave = Math.sqrt(gravity * left.h)
  const rightWave = Math.sqrt(gravity * right.h)
  const speedLeft = Math.min(leftVelocity - leftWave, rightVelocity - rightWave)
  const speedRight = Math.max(leftVelocity + leftWave, rightVelocity + rightWave)
  const fluxLeft = physicalFlux(left, leftVelocity, gravity)
  const fluxRight = physicalFlux(right, rightVelocity, gravity)
  if (speedLeft >= 0) return fluxLeft
  if (speedRight <= 0) return fluxRight
  const inverseSpan = 1 / Math.max(speedRight - speedLeft, 1e-9)
  return {
    h: (speedRight * fluxLeft.h - speedLeft * fluxRight.h + speedLeft * speedRight * (right.h - left.h)) * inverseSpan,
    hu: (speedRight * fluxLeft.hu - speedLeft * fluxRight.hu + speedLeft * speedRight * (right.hu - left.hu)) * inverseSpan,
    hv: (speedRight * fluxLeft.hv - speedLeft * fluxRight.hv + speedLeft * speedRight * (right.hv - left.hv)) * inverseSpan
  }
}

function physicalFlux(state: State, velocity: number, gravity: number) {
  return {
    h: state.hu,
    hu: state.hu * velocity + 0.5 * gravity * state.h * state.h,
    hv: state.hv * velocity
  }
}
