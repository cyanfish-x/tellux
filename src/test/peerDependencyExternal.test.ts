import { describe, expect, it } from 'vitest'

import {
  isBundledExternalModule,
  isPeerDependencyExternal
} from '../build/peerDependencyExternal'

describe('peerDependencyExternal', () => {
  it.each([
    'three',
    'three/webgpu',
    'three/tsl',
    'three/addons/loaders/GLTFLoader.js',
    '3d-tiles-renderer',
    '3d-tiles-renderer/plugins',
    '3d-tiles-renderer/core/plugins',
    '3d-tiles-renderer/three',
    '@takram/three-atmosphere',
    '@takram/three-atmosphere/webgpu',
    '@takram/three-clouds',
    '@takram/three-geospatial',
    '@takram/three-geospatial-effects',
    'postprocessing'
  ])('keeps %s external', (specifier) => {
    expect(isPeerDependencyExternal(specifier)).toBe(true)
  })

  it.each([
    '@mapbox/vector-tile',
    'pbf',
    'three-mesh-bvh',
    '@mapbox/tiny-sdf',
    './local-module'
  ])('allows %s to be bundled', (specifier) => {
    expect(isPeerDependencyExternal(specifier)).toBe(false)
  })

  it('recognizes external peer code accidentally included from node_modules', () => {
    expect(
      isBundledExternalModule(
        'D:/repo/node_modules/.pnpm/three@0.184.0/node_modules/three/build/three.module.js'
      )
    ).toBe(true)
    expect(
      isBundledExternalModule(
        'D:/repo/node_modules/3d-tiles-renderer/build/index.core-plugins.js'
      )
    ).toBe(true)
    expect(
      isBundledExternalModule(
        'D:/repo/node_modules/three-mesh-bvh/src/index.js'
      )
    ).toBe(false)
  })
})
