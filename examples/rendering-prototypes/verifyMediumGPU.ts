import * as THREE from 'three'
import { analyticCases, compose, homogeneous, mediumIntegralGLSL, overlap } from './mediumIntegral'

/** 读取真实 GPU 浮点结果，与 CPU 解析解比较。 Read GPU float results and compare to CPU analytic solutions. */
export function verifyMediumGPU(renderer: THREE.WebGLRenderer) {
  if (!renderer.extensions.has('EXT_color_buffer_float')) return { supported: false, reason: 'EXT_color_buffer_float unavailable' }
  const target = new THREE.WebGLRenderTarget(2, 1, { type: THREE.FloatType, depthBuffer: false })
  const material = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: { sigmaA: { value: new THREE.Vector3() }, sourceA: { value: new THREE.Vector3() }, sigmaB: { value: new THREE.Vector3() }, sourceB: { value: new THREE.Vector3() }, distance: { value: 1 }, adjacent: { value: false } },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform vec3 sigmaA, sourceA, sigmaB, sourceB; uniform float distance; uniform bool adjacent;
${mediumIntegralGLSL}
void main(){vec3 T=vec3(1.),S=vec3(0.); for(int i=0;i<64;i++) {
  if(adjacent) a1Accumulate(i<32?sigmaA:sigmaB,i<32?sourceA:sourceB,distance/32.,T,S);
  else a1Accumulate(sigmaA+sigmaB,sourceA+sourceB,distance/64.,T,S);
} gl_FragColor=vec4(gl_FragCoord.x<1.?T:S,1.);}`,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material))
  const camera = new THREE.Camera()
  const previous = renderer.getRenderTarget()
  const tone = renderer.toneMapping
  const autoClear = renderer.autoClear
  const results: Array<{ name: string; adjacent: boolean; maxError: number; passed: boolean }> = []
  try {
    renderer.toneMapping = THREE.NoToneMapping
    renderer.autoClear = false
    renderer.setRenderTarget(target)
    for (const fixture of analyticCases) for (const adjacent of [false, true]) {
      material.uniforms.sigmaA.value.fromArray(fixture.a.extinction)
      material.uniforms.sourceA.value.fromArray(fixture.a.source)
      material.uniforms.sigmaB.value.fromArray(fixture.b.extinction)
      material.uniforms.sourceB.value.fromArray(fixture.b.source)
      material.uniforms.distance.value = fixture.length
      material.uniforms.adjacent.value = adjacent
      renderer.render(scene, camera)
      const pixels = new Float32Array(8)
      renderer.readRenderTargetPixels(target, 0, 0, 2, 1, pixels)
      const expected = adjacent
        ? compose(homogeneous(fixture.a, fixture.length), homogeneous(fixture.b, fixture.length))
        : homogeneous(overlap(fixture.a, fixture.b), fixture.length)
      const error = Math.max(...expected.transmittance.map((v, i) => Math.abs(pixels[i] - v)), ...expected.scattering.map((v, i) => Math.abs(pixels[4 + i] - v)))
      results.push({ name: fixture.name, adjacent, maxError: error, passed: Number.isFinite(error) && error < 2e-5 })
    }
    return { supported: true, passed: results.every(result => result.passed), tolerance: 2e-5, results }
  } finally {
    renderer.setRenderTarget(previous); renderer.toneMapping = tone; renderer.autoClear = autoClear
    target.dispose(); material.dispose(); geometry.dispose()
  }
}
