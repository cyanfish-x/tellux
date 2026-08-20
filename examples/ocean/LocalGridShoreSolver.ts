import type { TelluxWebGPURenderer } from '../../src'
import {
  Fn,
  abs,
  clamp,
  float,
  instanceIndex,
  instancedArray,
  max,
  min,
  mix,
  select,
  sqrt,
  uint,
  uniform,
  vec3,
  vec4
} from 'three/tsl'
import type StorageBufferNode from 'three/src/nodes/accessors/StorageBufferNode.js'
import type Node from 'three/src/nodes/core/Node.js'
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js'
import type { TerrainFieldRevision } from './terrainFieldMessages'
import type { OceanParameters } from './parameters'

export interface LocalGridShoreSolverOptions {
  renderer: TelluxWebGPURenderer
  width: number
  height: number
  cellSize: number
  parameters: OceanParameters
}

/**
 * WebGPU shallow-water state for the local coast grid. The update is a
 * conservative HLL/Rusanov finite-volume pass with hydrostatic interface
 * reconstruction. Ping-pong storage avoids same-dispatch data hazards.
 */
export class LocalGridShoreSolver {
  readonly state: StorageBufferNode<'vec4'>
  readonly bed: StorageBufferNode<'vec4'>
  readonly width: number
  readonly height: number
  readonly cellSize: number
  terrainCorrectionVolume = 0

  private readonly stateA: StorageBufferNode<'vec4'>
  private readonly stateB: StorageBufferNode<'vec4'>
  private readonly computeAB: ComputeNode
  private readonly computeBA: ComputeNode
  private readonly deltaTime = uniform(1 / 60)
  private readonly foamLife = uniform(4)
  private readonly foamAmount = uniform(0.6)
  private readonly waveAmplitude = uniform(0.2)
  private accumulator = 0
  private isDisposed = false

  constructor(private readonly options: LocalGridShoreSolverOptions) {
    this.width = options.width
    this.height = options.height
    this.cellSize = options.cellSize
    const count = this.width * this.height
    this.stateA = instancedArray(new Float32Array(count * 4), 'vec4')
    this.stateB = instancedArray(new Float32Array(count * 4), 'vec4')
    this.bed = instancedArray(new Float32Array(count * 4), 'vec4')
    this.state = this.stateA
    this.computeAB = this.createComputePass(this.stateA, this.stateB)
    this.computeBA = this.createComputePass(this.stateB, this.stateA)
    this.updateParameters(options.parameters)
  }

  updateParameters(parameters: OceanParameters) {
    this.foamLife.value = parameters.foamLife
    this.foamAmount.value = parameters.foam
    this.waveAmplitude.value = parameters.amplitude
  }

  applyTerrainField(field: TerrainFieldRevision) {
    if (field.width !== this.width || field.height !== this.height) {
      throw new Error('Terrain field dimensions do not match the shore solver grid.')
    }
    const stateA = this.stateA.value.array as Float32Array
    const stateB = this.stateB.value.array as Float32Array
    const bedBuffer = this.bed.value.array as Float32Array
    const cellArea = this.cellSize * this.cellSize
    let correction = 0

    for (let index = 0; index < field.bedHeight.length; index += 1) {
      const offset = index * 4
      const oldBed = bedBuffer[offset]
      const oldDepth = stateA[offset]
      const oldSurface = oldBed + oldDepth
      const nextBed = field.bedHeight[index]
      const valid = field.validity[index] > 0
      const wasWet = oldDepth > 1e-4
      const nextDepth = valid
        ? Math.max((wasWet ? oldSurface : this.options.parameters.seaLevel) - nextBed, 0)
        : 0
      correction += (nextDepth - oldDepth) * cellArea

      bedBuffer[offset] = nextBed
      bedBuffer[offset + 1] = valid ? 1 : 0
      bedBuffer[offset + 2] = field.shoreSdf[index]
      bedBuffer[offset + 3] = Math.max(this.options.parameters.seaLevel - nextBed, 0)
      stateA[offset] = stateB[offset] = nextDepth
      if (!valid || nextDepth <= 1e-4) {
        stateA[offset + 1] = stateA[offset + 2] = stateA[offset + 3] = 0
        stateB[offset + 1] = stateB[offset + 2] = stateB[offset + 3] = 0
      } else {
        stateB[offset + 1] = stateA[offset + 1]
        stateB[offset + 2] = stateA[offset + 2]
        stateB[offset + 3] = stateA[offset + 3]
      }
    }
    this.terrainCorrectionVolume += correction
    this.stateA.value.needsUpdate = true
    this.stateB.value.needsUpdate = true
    this.bed.value.needsUpdate = true
  }

  update(deltaSeconds: number, parameters: OceanParameters) {
    if (this.isDisposed || parameters.pause) return
    this.updateParameters(parameters)
    this.accumulator = Math.min(this.accumulator + Math.max(deltaSeconds, 0), 4 / 30)
    const stableStep = Math.min(1 / 30, 0.45 * this.cellSize / 10)
    let substeps = Math.min(Math.floor(this.accumulator / stableStep), 4)
    // Keep the externally sampled state in stateA by executing complete pairs.
    substeps -= substeps % 2
    if (substeps === 0) return
    this.deltaTime.value = stableStep
    for (let index = 0; index < substeps; index += 2) {
      this.options.renderer.compute([this.computeAB, this.computeBA])
    }
    this.accumulator -= substeps * stableStep
    if (this.accumulator > 4 / 30) this.accumulator = 0
  }

  resetSimulationTime() {
    this.accumulator = 0
  }

  dispose() {
    this.isDisposed = true
    this.accumulator = 0
  }

  private createComputePass(
    source: StorageBufferNode<'vec4'>,
    target: StorageBufferNode<'vec4'>
  ) {
    const width = uint(this.width)
    const height = uint(this.height)
    const gravity = float(9.81)
    const dryDepth = float(1e-4)
    const inverseCell = float(1 / this.cellSize)

    const pass = Fn(() => {
      const index = instanceIndex
      const x = index.mod(width)
      const y = index.div(width)
      const westIndex = select(x.equal(uint(0)), index, index.sub(uint(1)))
      const eastIndex = select(x.add(uint(1)).greaterThanEqual(width), index, index.add(uint(1)))
      const southIndex = select(y.equal(uint(0)), index, index.sub(width))
      const northIndex = select(y.add(uint(1)).greaterThanEqual(height), index, index.add(width))
      const center = source.element(index).toVar()
      const centerBed = this.bed.element(index).toVar()

      const hll = (leftIndex: Node<'uint'>, rightIndex: Node<'uint'>, axis: 'x' | 'y') => {
        const leftState = source.element(leftIndex)
        const rightState = source.element(rightIndex)
        const leftBed = this.bed.element(leftIndex).x
        const rightBed = this.bed.element(rightIndex).x
        const interfaceBed = max(leftBed, rightBed)
        const leftDepth = max(leftBed.add(leftState.x).sub(interfaceBed), 0)
        const rightDepth = max(rightBed.add(rightState.x).sub(interfaceBed), 0)
        const leftNormalMomentum = axis === 'x' ? leftState.y : leftState.z
        const rightNormalMomentum = axis === 'x' ? rightState.y : rightState.z
        const leftCrossMomentum = axis === 'x' ? leftState.z : leftState.y
        const rightCrossMomentum = axis === 'x' ? rightState.z : rightState.y
        const leftVelocity = select(leftState.x.greaterThan(dryDepth), leftNormalMomentum.div(max(leftState.x, dryDepth)), 0)
        const rightVelocity = select(rightState.x.greaterThan(dryDepth), rightNormalMomentum.div(max(rightState.x, dryDepth)), 0)
        const leftCross = select(leftState.x.greaterThan(dryDepth), leftCrossMomentum.div(max(leftState.x, dryDepth)), 0)
        const rightCross = select(rightState.x.greaterThan(dryDepth), rightCrossMomentum.div(max(rightState.x, dryDepth)), 0)
        const leftHu = leftDepth.mul(leftVelocity)
        const rightHu = rightDepth.mul(rightVelocity)
        const leftHv = leftDepth.mul(leftCross)
        const rightHv = rightDepth.mul(rightCross)
        const leftFlux = vec3(leftHu, leftHu.mul(leftVelocity).add(gravity.mul(leftDepth.mul(leftDepth)).mul(0.5)), leftHu.mul(leftCross))
        const rightFlux = vec3(rightHu, rightHu.mul(rightVelocity).add(gravity.mul(rightDepth.mul(rightDepth)).mul(0.5)), rightHu.mul(rightCross))
        const signal = max(
          abs(leftVelocity).add(sqrt(gravity.mul(leftDepth))),
          abs(rightVelocity).add(sqrt(gravity.mul(rightDepth)))
        )
        return leftFlux.add(rightFlux).mul(0.5).sub(
          vec3(rightDepth.sub(leftDepth), rightHu.sub(leftHu), rightHv.sub(leftHv)).mul(signal).mul(0.5)
        )
      }

      const eastFlux = hll(index, eastIndex, 'x')
      const westFlux = hll(westIndex, index, 'x')
      const northFlux = hll(index, northIndex, 'y')
      const southFlux = hll(southIndex, index, 'y')
      const delta = this.deltaTime.mul(inverseCell)
      const nextDepth = max(center.x.sub(delta.mul(eastFlux.x.sub(westFlux.x).add(northFlux.x.sub(southFlux.x)))), 0)
      const bedSlopeX = this.bed.element(eastIndex).x.sub(this.bed.element(westIndex).x).mul(0.5 * this.cellSize)
      const bedSlopeY = this.bed.element(northIndex).x.sub(this.bed.element(southIndex).x).mul(0.5 * this.cellSize)
      const nextHu = center.y
        .sub(delta.mul(eastFlux.y.sub(westFlux.y).add(northFlux.z.sub(southFlux.z))))
        .sub(this.deltaTime.mul(gravity).mul(center.x).mul(bedSlopeX))
      const nextHv = center.z
        .sub(delta.mul(northFlux.y.sub(southFlux.y).add(eastFlux.z.sub(westFlux.z))))
        .sub(this.deltaTime.mul(gravity).mul(center.x).mul(bedSlopeY))
      const speed = sqrt(nextHu.mul(nextHu).add(nextHv.mul(nextHv))).div(max(nextDepth, dryDepth))
      const froude = speed.div(max(sqrt(gravity.mul(nextDepth)), 0.01))
      const compression = abs(eastFlux.x.sub(westFlux.x).add(northFlux.x.sub(southFlux.x))).mul(inverseCell)
      const breaking = clamp(froude.sub(0.65).mul(2).add(compression.mul(0.04)), 0, 1)
      const coastWeight = clamp(float(1).sub(abs(centerBed.z).div(120)), 0, 1)
        .mul(clamp(float(1).sub(nextDepth.div(2.5)), 0, 1))
      const decayedFoam = center.w.mul(max(float(0), float(1).sub(this.deltaTime.div(this.foamLife))))
      const nextFoam = clamp(
        decayedFoam.add(
          breaking.mul(coastWeight).mul(this.foamAmount).mul(this.waveAmplitude.add(0.2))
        ),
        0,
        1
      )
      const wetAndValid = nextDepth.greaterThan(dryDepth).and(centerBed.y.greaterThan(0.5))
      const sponge = x.greaterThan(uint(Math.max(this.width - 24, 0)))
        .select(mix(1, 0.96, float(x.sub(uint(Math.max(this.width - 24, 0)))).div(24)), 1)
      target.element(index).assign(vec4(
        select(wetAndValid, nextDepth, 0),
        select(wetAndValid, nextHu.mul(sponge), 0),
        select(wetAndValid, nextHv.mul(sponge), 0),
        select(wetAndValid, nextFoam, 0)
      ))
    })().compute(this.width * this.height, [64])
    return pass
  }
}
