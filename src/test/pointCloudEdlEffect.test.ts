import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { PointCloudEdlPass } from '../rendering/PointCloudEdlEffect'

describe('PointCloudEdlPass', () => {
  it('keeps non-point geometry as depth occluders while writing a zero mask', () => {
    const pass = new PointCloudEdlPass(new THREE.Scene(), new THREE.PerspectiveCamera())
    const fragmentShader = (
      pass as unknown as { maskMaterial: THREE.ShaderMaterial }
    ).maskMaterial.fragmentShader

    expect(fragmentShader).not.toContain('discard')
    expect(fragmentShader).toContain('#include <logdepthbuf_fragment>')
    expect(fragmentShader).toContain(
      'gl_FragColor = vTelluxPoint > 0.5 ? vec4(1.0) : vec4(0.0);'
    )

    pass.dispose()
  })

  it('applies EDL as a depth-only shade multiplier without normal lighting', () => {
    const pass = new PointCloudEdlPass(new THREE.Scene(), new THREE.PerspectiveCamera())
    const fragmentShader = (
      pass as unknown as { edlMaterial: THREE.ShaderMaterial }
    ).edlMaterial.fragmentShader

    expect(fragmentShader).toContain('color.rgb * shade')
    expect(fragmentShader).not.toContain('normal')

    pass.dispose()
  })
})
