import * as THREE from "three"
import { describe, expect, it } from "vitest"
import {
  createMeadowRtc,
  injectMeadowRtcShader,
} from "./applyMeadowRtc"

function compile(vertexShader: string) {
  const camera = new THREE.PerspectiveCamera()
  const state = createMeadowRtc(camera)
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader,
    fragmentShader: "void main() {}",
  }
  injectMeadowRtcShader(shader, state)
  return shader
}

describe("meadow object RTC", () => {
  it("projects Three.js materials after overlay-safe local world reconstruction", () => {
    const shader = compile(`
void main() {
  vec3 transformed = position;
  #include <project_vertex>
}
`)
    expect(shader.vertexShader).toContain("telluxProjectRtc")
    expect(shader.vertexShader).toContain("u_telluxObjectHigh")
    expect(shader.vertexShader).not.toContain("#include <project_vertex>")
    expect(shader.uniforms.u_telluxObjectHigh).toBeDefined()
    expect(shader.uniforms.u_cameraHigh).toBeDefined()
  })

  it("projects three-stylized grass after overlay mix would have used ECEF matrices", () => {
    const shader = compile(`
void main() {
  mat4 instanceWorldMatrix = modelMatrix * instanceMatrix;
  vWorldPosition = (instanceWorldMatrix * vec4(transformed, 1.0)).xyz;
  vec4 worldPosition = vec4(vWorldPosition, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`)
    expect(shader.vertexShader).toContain("telluxLocalWorld")
    expect(shader.vertexShader).toContain("telluxProjectRtc(telluxLocalWorld)")
    expect(shader.vertexShader).not.toContain(
      "gl_Position = projectionMatrix * viewMatrix * worldPosition;"
    )
  })

  it("projects wildflower shaders that only have a worldPosition clip path", () => {
    const shader = compile(`
void main() {
  vec4 worldPosition = instanceWorldMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`)
    expect(shader.vertexShader).toContain("telluxProjectRtc(worldPosition.xyz)")
  })
})
