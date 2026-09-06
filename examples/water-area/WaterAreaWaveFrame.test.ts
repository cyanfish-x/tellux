import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import { Camera } from '../../src/Camera'
import ts from 'typescript'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createWaterAreaWaveFrame,
  resolveWaterAreaWaveOrigin
} from './WaterAreaWaveFrame'

describe('createWaterAreaWaveFrame', () => {
  it('accepts the current CameraState destination and produces finite coordinates', () => {
    const state = new Camera(new PerspectiveCamera()).getState()
    const origin = resolveWaterAreaWaveOrigin(undefined, state.destination)
    const frame = createWaterAreaWaveFrame(origin.longitude, origin.latitude)
    expect(frame.originECEF.toArray().every(Number.isFinite)).toBe(true)
    expect(origin).toEqual({ longitude: state.destination.longitude, latitude: state.destination.latitude })
  })

  it('type-checks the actual demo camera-state call site', () => {
    const file = fileURLToPath(new URL('./createWaterAreaDemo.ts', import.meta.url))
    const root = resolve(file, '../../..')
    const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile)
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
    const program = ts.createProgram([file], { ...parsed.options, types: ['vite/client'] })
    const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => d.file && resolve(d.file.fileName) === resolve(file))
    expect(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([])
  })
  it('creates an orthonormal ECEF frame from degree coordinates', () => {
    const frame = createWaterAreaWaveFrame(-112.2525, 69.3782)

    expect(frame.originECEF.length()).toBeGreaterThan(6_300_000)
    expect(frame.eastECEF.length()).toBeCloseTo(1)
    expect(frame.northECEF.length()).toBeCloseTo(1)
    expect(frame.upECEF.length()).toBeCloseTo(1)
    expect(frame.eastECEF.dot(frame.northECEF)).toBeCloseTo(0)
    expect(frame.eastECEF.dot(frame.upECEF)).toBeCloseTo(0)
    expect(frame.northECEF.dot(frame.upECEF)).toBeCloseTo(0)
  })

  it('uses the current camera location when no explicit wave origin is provided', () => {
    expect(
      resolveWaterAreaWaveOrigin(undefined, {
        longitude: -132.91669016841638,
        latitude: 57.01944780700264
      })
    ).toEqual({
      longitude: -132.91669016841638,
      latitude: 57.01944780700264
    })

    expect(
      resolveWaterAreaWaveOrigin(
        { longitude: 108.92, latitude: 34.22 },
        { longitude: -132.91, latitude: 57.01 }
      )
    ).toEqual({ longitude: 108.92, latitude: 34.22 })
  })
})
