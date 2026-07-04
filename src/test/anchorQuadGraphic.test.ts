import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { AnchorQuadGraphic } from '../entities/AnchorQuadGraphic'
import { isSymbolOcclusionObject } from '../entities/SymbolOcclusionPass'

describe('AnchorQuadGraphic', () => {
  it('uses transparent blending inside the symbol occlusion pipeline', () => {
    const quad = new AnchorQuadGraphic()
    const material = quad.object3D.material as THREE.ShaderMaterial

    expect(material.transparent).toBe(true)
    expect(material.blending).toBe(THREE.NormalBlending)
    expect(material.depthWrite).toBe(false)
    expect(material.depthTest).toBe(true)
    expect(isSymbolOcclusionObject(quad.object3D)).toBe(true)

    quad.dispose()
  })
})
