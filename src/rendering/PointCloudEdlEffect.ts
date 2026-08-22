import * as THREE from 'three'
import type { ThreeEffectPass } from '../effects'

const MASK_VERTEX = /* glsl */ `
attribute float aPointSize;
varying float vTelluxPoint;

#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vTelluxPoint = aPointSize > 0.0 ? 1.0 : 0.0;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = max(aPointSize, 1.0);
  #include <logdepthbuf_vertex>
}
`

const MASK_FRAGMENT = /* glsl */ `
varying float vTelluxPoint;

#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vTelluxPoint > 0.5 ? vec4(1.0) : vec4(0.0);
}
`

const COPY_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
}
`

const EDL_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tMask;
uniform float cameraNear;
uniform float cameraFar;
uniform float edlStrength;
uniform float edlRadius;
uniform vec2 texelSize;

varying vec2 vUv;

#include <packing>

float telluxViewZ(const in vec2 uv) {
  float fragCoordZ = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
}

float telluxEdlNeighbor(const in vec2 uv, const in vec2 offset, const in float centerZ) {
  float neighborZ = telluxViewZ(uv + offset);
  return max(0.0, neighborZ - centerZ);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  float mask = texture2D(tMask, vUv).r;
  if (mask < 0.5) {
    gl_FragColor = color;
    return;
  }

  float centerZ = telluxViewZ(vUv);
  vec2 step = texelSize * max(edlRadius, 0.01);
  float response = 0.0;
  response += telluxEdlNeighbor(vUv, vec2(-step.x, 0.0), centerZ);
  response += telluxEdlNeighbor(vUv, vec2(step.x, 0.0), centerZ);
  response += telluxEdlNeighbor(vUv, vec2(0.0, -step.y), centerZ);
  response += telluxEdlNeighbor(vUv, vec2(0.0, step.y), centerZ);
  response += telluxEdlNeighbor(vUv, vec2(-step.x, -step.y), centerZ);
  response += telluxEdlNeighbor(vUv, vec2(step.x, -step.y), centerZ);
  response += telluxEdlNeighbor(vUv, vec2(-step.x, step.y), centerZ);
  response += telluxEdlNeighbor(vUv, vec2(step.x, step.y), centerZ);
  response *= 0.125;

  // 相对眼空间深度差；系数略低于早期 8.0，避免整片轮廓发黑发闷
  float relative = response / max(centerZ * 0.02, 0.5);
  float shade = exp(-relative * 5.0 * max(edlStrength, 0.0));
  gl_FragColor = vec4(color.rgb * shade, color.a);
}
`

/**
 * 点云 EDL pass（独立 mask + 成图加深）。
 *
 * 关键：挂在大气之后时 readBuffer 常是无深度的 targetB；旧 `Effect` 路径只绑
 * `readBuffer.depthTexture`，EDL 静默失效。本 pass 两侧探测深度、`needsSwap=false`、
 * 眼空间线性深度算轮廓（对标 Cesium 黑边观感，非像素级公式复刻）。
 */
export class PointCloudEdlPass implements ThreeEffectPass {
  enabled = true
  needsSwap = false

  private readonly maskTarget: THREE.WebGLRenderTarget
  private readonly colorTemp: THREE.WebGLRenderTarget
  private readonly maskMaterial: THREE.ShaderMaterial
  private readonly copyMaterial: THREE.ShaderMaterial
  private readonly edlMaterial: THREE.ShaderMaterial
  private readonly fullscreenScene = new THREE.Scene()
  private readonly fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly fullscreenMesh: THREE.Mesh
  private width = 1
  private height = 1
  private strength = 1
  private radius = 1

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera
  ) {
    this.maskTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    })
    this.maskTarget.texture.name = 'TelluxPointCloudEdlMask'

    this.colorTemp = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false
    })
    this.colorTemp.texture.name = 'TelluxPointCloudEdlColorTemp'

    this.maskMaterial = new THREE.ShaderMaterial({
      name: 'TelluxPointCloudEdlMask',
      vertexShader: MASK_VERTEX,
      fragmentShader: MASK_FRAGMENT,
      depthTest: true,
      depthWrite: true
    })

    this.copyMaterial = new THREE.ShaderMaterial({
      name: 'TelluxPointCloudEdlCopy',
      uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: COPY_FRAGMENT,
      depthTest: false,
      depthWrite: false
    })

    this.edlMaterial = new THREE.ShaderMaterial({
      name: 'TelluxPointCloudEdl',
      uniforms: {
        tDiffuse: { value: null as THREE.Texture | null },
        tDepth: { value: null as THREE.Texture | null },
        tMask: { value: this.maskTarget.texture },
        cameraNear: { value: 1 },
        cameraFar: { value: 1e8 },
        edlStrength: { value: 1 },
        edlRadius: { value: 1 },
        texelSize: { value: new THREE.Vector2(1, 1) }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: EDL_FRAGMENT,
      depthTest: false,
      depthWrite: false
    })

    this.fullscreenMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial)
    this.fullscreenMesh.frustumCulled = false
    this.fullscreenScene.add(this.fullscreenMesh)
  }

  setStrength(value: number) {
    this.strength = value
    this.edlMaterial.uniforms.edlStrength.value = value
  }

  setRadius(value: number) {
    this.radius = value
    this.edlMaterial.uniforms.edlRadius.value = value
  }

  setSize(width: number, height: number) {
    const nextWidth = Math.max(1, Math.floor(width))
    const nextHeight = Math.max(1, Math.floor(height))
    if (nextWidth === this.width && nextHeight === this.height) return
    this.width = nextWidth
    this.height = nextHeight
    this.maskTarget.setSize(nextWidth, nextHeight)
    this.colorTemp.setSize(nextWidth, nextHeight)
    this.edlMaterial.uniforms.texelSize.value.set(1 / nextWidth, 1 / nextHeight)
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ) {
    if (!this.enabled) {
      this.needsSwap = false
      return
    }

    const depth = readBuffer.depthTexture ?? writeBuffer.depthTexture ?? null
    if (!depth) {
      this.needsSwap = false
      return
    }

    this.setSize(readBuffer.width, readBuffer.height)
    this.renderMask(renderer)

    const previousTarget = renderer.getRenderTarget()
    const previousAutoClear = renderer.autoClear
    const previousClearColor = renderer.getClearColor(new THREE.Color())
    const previousClearAlpha = renderer.getClearAlpha()

    try {
      renderer.autoClear = false

      this.fullscreenMesh.material = this.copyMaterial
      this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture
      renderer.setRenderTarget(this.colorTemp)
      renderer.setClearColor(0x000000, 0)
      renderer.clear(true, false, false)
      renderer.render(this.fullscreenScene, this.fullscreenCamera)

      this.edlMaterial.uniforms.tDiffuse.value = this.colorTemp.texture
      this.edlMaterial.uniforms.tDepth.value = depth
      this.edlMaterial.uniforms.tMask.value = this.maskTarget.texture
      this.edlMaterial.uniforms.cameraNear.value = this.camera.near
      this.edlMaterial.uniforms.cameraFar.value = this.camera.far
      this.edlMaterial.uniforms.edlStrength.value = this.strength
      this.edlMaterial.uniforms.edlRadius.value = this.radius

      this.fullscreenMesh.material = this.edlMaterial
      renderer.setRenderTarget(readBuffer)
      renderer.render(this.fullscreenScene, this.fullscreenCamera)
    } finally {
      renderer.autoClear = previousAutoClear
      renderer.setClearColor(previousClearColor, previousClearAlpha)
      renderer.setRenderTarget(previousTarget)
    }

    this.needsSwap = false
  }

  dispose() {
    this.maskTarget.dispose()
    this.colorTemp.dispose()
    this.maskMaterial.dispose()
    this.copyMaterial.dispose()
    this.edlMaterial.dispose()
    this.fullscreenMesh.geometry.dispose()
  }

  private renderMask(renderer: THREE.WebGLRenderer) {
    const previousTarget = renderer.getRenderTarget()
    const previousOverride = this.scene.overrideMaterial
    const previousAutoClear = renderer.autoClear
    const previousClearColor = renderer.getClearColor(new THREE.Color())
    const previousClearAlpha = renderer.getClearAlpha()

    renderer.setRenderTarget(this.maskTarget)
    renderer.setClearColor(0x000000, 0)
    renderer.autoClear = true
    this.scene.overrideMaterial = this.maskMaterial
    try {
      renderer.render(this.scene, this.camera)
    } finally {
      this.scene.overrideMaterial = previousOverride
      renderer.autoClear = previousAutoClear
      renderer.setClearColor(previousClearColor, previousClearAlpha)
      renderer.setRenderTarget(previousTarget)
    }
  }
}
