import { captureCloudPrefixShader } from './CloudPrefixCapture'
import * as THREE from 'three'
import type { Viewer } from '../../src/Viewer'
import type { AtmosphereManager } from '../../src/rendering/AtmosphereManager'

/**
 * 固定帧复用原云材质，测量视空间平面前方累计云贡献；仅用于阶段 2 选型。
 * Reuses the unchanged cloud material at a fixed frame to measure prefixes before view-space planes.
 * 不重复天气、阴影或历史更新；重复 raymarch 的成本属于参考，不是生产成本。
 * Repeated raymarching is a reference cost, without repeating weather, shadows or temporal history.
 */
export async function verifyCloudDepthQueries(viewer: Viewer, options: { capturePrefix?: boolean; stableUvControl?: boolean } = {}) {
  const renderer = viewer.renderer.raw as THREE.WebGLRenderer
  const clouds = (viewer as unknown as { atmosphere: AtmosphereManager }).atmosphere.cloudsEffect
  const pass = (clouds as unknown as { cloudsPass: {
    currentMaterial: THREE.ShaderMaterial
    currentRenderTarget: THREE.WebGLRenderTarget
    currentPass: { render(renderer: THREE.WebGLRenderer, input: null, output: THREE.WebGLRenderTarget): void }
  } }).cloudsPass
  const material = pass.currentMaterial
  const target = pass.currentRenderTarget.clone()
  const data = new Float32Array([1])
  const depth = new THREE.DataTexture(data, 1, 1, THREE.RedFormat, THREE.FloatType)
  depth.needsUpdate = true
  const previousDepth = material.uniforms.depthBuffer.value
  const originalFragment = material.fragmentShader
  const originalHaze = material.defines.HAZE
  let prefixTarget: THREE.WebGLRenderTarget | undefined
  const allDepth = new THREE.DataTexture(new Float32Array([1]), 1, 1, THREE.RedFormat, THREE.FloatType)
  allDepth.needsUpdate = true
  const previousTarget = renderer.getRenderTarget(), previousTone = renderer.toneMapping
  const gl = renderer.getContext() as WebGL2RenderingContext
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const queries: Array<WebGLQuery | null> = []
  const results: Array<{ distance: number | null; color: Float32Array }> = []
  const distances = [250, 500, 1000, 2000, 4000, 8000, 16000, 32000, null]
  const near = material.uniforms.cameraNear.value as number, far = material.uniforms.cameraFar.value as number
  const logarithmic = 'USE_LOGARITHMIC_DEPTH_BUFFER' in material.defines || renderer.capabilities.logarithmicDepthBuffer
  try {
    if(options.capturePrefix) {
      // Compare only the existing cloud integral; representative-depth aerial perspective
      // and separate haze are outside this narrow capture equivalence question.
      delete material.defines.HAZE
      material.fragmentShader = originalFragment.replace('applyAerialPerspective(cameraPosition, frontPosition, shadowLength, color);', '')
      if(material.fragmentShader===originalFragment)throw Error('Cloud aerial-perspective anchor changed')
      material.needsUpdate=true
    }
    if(options.stableUvControl) {
      // Algebraically equivalent rationalization: avoid subtracting nearly equal terms
      // before sqrt when cube-sphere m.x approaches zero (this fixture is at longitude 0).
      const expression='sqrt(1.5 + m2.x - m2.y - 0.5 * sqrt(-24.0 * m2.x + q2))'
      if(!material.fragmentShader.includes(expression))throw Error('Cube-sphere UV anchor changed')
      material.fragmentShader=material.fragmentShader.replace(expression,'sqrt(12.0 * m2.x / (-q + sqrt(max(0.0, q2 - 24.0 * m2.x))))')
      material.needsUpdate=true
    }
    renderer.toneMapping = THREE.NoToneMapping
    material.uniforms.depthBuffer.value = depth
    for (const distance of distances) {
      data[0] = distance === null ? 1 : logarithmic
        ? Math.log2(distance + 1) / Math.log2(far + 1)
        : far * (distance - near) / ((far - near) * distance)
      depth.needsUpdate = true
      const query = timer ? gl.createQuery() : null
      if (query) gl.beginQuery(timer!.TIME_ELAPSED_EXT, query)
      pass.currentPass.render(renderer, null, target)
      if (query) gl.endQuery(timer!.TIME_ELAPSED_EXT)
      queries.push(query)
      const packed = new Uint16Array(target.width * target.height * 4)
      renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, packed)
      results.push({ distance, color: Float32Array.from(packed, THREE.DataUtils.fromHalfFloat) })
    }
    const full = results[results.length - 1].color
    const prefixCapture: Array<object> = []
    if(options.capturePrefix) {
      const rawFragment=material.fragmentShader
      prefixTarget=target.clone()
      const prefixTexture=target.texture.clone();prefixTexture.isRenderTargetTexture=true
      const prefixIndex=prefixTarget.textures.length;prefixTarget.textures.push(prefixTexture)
      material.fragmentShader=captureCloudPrefixShader(material.fragmentShader,prefixIndex)
      material.uniforms.telluxQueryDepthBuffer = new THREE.Uniform(depth)
      material.uniforms.depthBuffer.value=allDepth
      material.needsUpdate=true
      for(const {distance,color} of results) {
        data[0] = distance === null ? 1 : logarithmic ? Math.log2(distance+1)/Math.log2(far+1) : far*(distance-near)/((far-near)*distance)
        depth.needsUpdate=true
        pass.currentPass.render(renderer,null,prefixTarget)
        const packed=new Uint16Array(target.width*target.height*4)
        renderer.readRenderTargetPixels(prefixTarget,0,0,target.width,target.height,packed,undefined,prefixIndex)
        const captured=packed.slice()
        let max=0,changed=0,overHalfFloat=0
        for(let i=0;i<packed.length;i++) {const d=Math.abs(THREE.DataUtils.fromHalfFloat(packed[i])-color[i]);max=Math.max(max,d);if(d>0)changed++;if(d>0.002)overHalfFloat++}
        renderer.readRenderTargetPixels(prefixTarget,0,0,target.width,target.height,packed)
        let fullMax=0,fullChanged=0,fullOver002=0
        for(let i=0;i<packed.length;i++){const d=Math.abs(THREE.DataUtils.fromHalfFloat(packed[i])-full[i]);fullMax=Math.max(fullMax,d);if(d>0)fullChanged++;if(d>0.002)fullOver002++}
        // Match the compiled shader too: changing loop live-outs can change floating-point
        // optimization in the adaptive upstream march. Keep original-program differences above.
        material.uniforms.depthBuffer.value=depth
        pass.currentPass.render(renderer,null,prefixTarget)
        renderer.readRenderTargetPixels(prefixTarget,0,0,target.width,target.height,packed)
        let sameProgramMax=0,sameProgramChanged=0
        for(let i=0;i<packed.length;i++){const d=Math.abs(THREE.DataUtils.fromHalfFloat(packed[i])-THREE.DataUtils.fromHalfFloat(captured[i]));sameProgramMax=Math.max(sameProgramMax,d);if(d>0)sameProgramChanged++}
        material.uniforms.depthBuffer.value=allDepth
        prefixCapture.push({distance,max,changed,overHalfFloat,fullMax,fullChanged,fullOver002,sameProgramMax,sameProgramChanged})
      }
      const instrumented=material.fragmentShader
      material.fragmentShader=instrumented.replace(/if \(!telluxRecorded && rayNearFar.x \+ rayDistance > telluxQueryDistance\) \{[\s\S]*?\}/,'')
        .replace(/if \(!telluxRecorded\) telluxCaptured = [^;]+;/,'')
      material.needsUpdate=true
      pass.currentPass.render(renderer,null,prefixTarget)
      const noWrite=new Uint16Array(target.width*target.height*4)
      renderer.readRenderTargetPixels(prefixTarget,0,0,target.width,target.height,noWrite)
      let noWriteMax=0
      for(let i=0;i<noWrite.length;i++)noWriteMax=Math.max(noWriteMax,Math.abs(THREE.DataUtils.fromHalfFloat(noWrite[i])-full[i]))
      prefixCapture.push({control:'additional MRT without loop capture',noWriteMax})
      material.fragmentShader=rawFragment;material.needsUpdate=true
      pass.currentPass.render(renderer,null,target)
      const repeat=new Uint16Array(target.width*target.height*4)
      renderer.readRenderTargetPixels(target,0,0,target.width,target.height,repeat)
      let repeatMax=0
      for(let i=0;i<repeat.length;i++)repeatMax=Math.max(repeatMax,Math.abs(THREE.DataUtils.fromHalfFloat(repeat[i])-full[i]))
      prefixCapture.push({control:'raw shader restored with allDepth',repeatMax})
    }
    // A constant-alpha plane is the smallest case where global before/after ordering can fail.
    // Reference = a*(C_front + T_front*F) + (1-a)*(C_all + T_all*B).
    // This preserves upstream cloud aerial-perspective approximation; it is not joint integration.
    const foreground = [0.1, 0.8, 1.5], background = [0.05, 0.1, 0.2], alpha = 0.65
    const observations = results.map(({ distance, color }) => {
      let partial = 0, cloudPixels = 0, maxAfterError = 0, maxBeforeError = 0
      const preview = new Uint8ClampedArray(target.width * target.height * 4)
      for (let i = 0; i < color.length; i += 4) {
        const frontAlpha = color[i + 3], allAlpha = full[i + 3]
        if (allAlpha > 0.05) cloudPixels++
        if (frontAlpha > 0.05 && allAlpha - frontAlpha > 0.05) partial++
        for (let c = 0; c < 3; c++) {
          const base = full[i+c] + (1-allAlpha)*background[c]
          const reference = alpha*(color[i+c] + (1-frontAlpha)*foreground[c]) + (1-alpha)*base
          const after = alpha*foreground[c] + (1-alpha)*base
          const before = full[i+c] + (1-allAlpha)*(alpha*foreground[c] + (1-alpha)*background[c])
          maxAfterError = Math.max(maxAfterError, Math.abs(after-reference))
          maxBeforeError = Math.max(maxBeforeError, Math.abs(before-reference))
          preview[i+c] = Math.round(255 * THREE.MathUtils.clamp(reference, 0, 1))
        }
        preview[i+3] = 255
      }
      const canvas = document.createElement('canvas'); canvas.width=target.width; canvas.height=target.height
      canvas.getContext('2d')!.putImageData(new ImageData(preview, target.width, target.height), 0, 0)
      return { distance, cloudPixels, partial, maxAfterError, maxBeforeError, preview: canvas.toDataURL() }
    })
    const gpu: Array<number | null> = []
    for (const q of queries) {
      if (!q) { gpu.push(null); continue }
      for (let i=0;i<300&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);i++) await new Promise(r=>setTimeout(r,10))
      gpu.push(gl.getParameter(timer!.GPU_DISJOINT_EXT) ? null : gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6)
    }
    return { width: target.width, height: target.height, near, far, logarithmic,
      camera: viewer.camera.raw.matrixWorld.toArray(), frame: material.uniforms.frame.value,
      extraReferenceDraws: options.capturePrefix ? distances.length*3+2 : distances.length,
      referenceTargetBytes: target.width*target.height*target.textures.length*8,
      prefixTargetBytes: prefixTarget ? prefixTarget.width*prefixTarget.height*prefixTarget.textures.length*8 : 0,
      capturePrefix:!!options.capturePrefix,prefixCapture,rawCloudIntegralOnly:!!options.capturePrefix,stableUvControl:!!options.stableUvControl,
      temporalHistoryReused: false, quality: { maxIterationCount: material.uniforms.maxIterationCount.value,
        minStepSize: material.uniforms.minStepSize.value, maxStepSize: material.uniforms.maxStepSize.value },
      observations, gpu, glError: gl.getError() }
  } finally {
    material.uniforms.depthBuffer.value = previousDepth
    material.fragmentShader=originalFragment
    if(originalHaze===undefined)delete material.defines.HAZE;else material.defines.HAZE=originalHaze
    delete material.uniforms.telluxQueryDepthBuffer
    if(options.capturePrefix||options.stableUvControl)material.needsUpdate=true
    renderer.setRenderTarget(previousTarget); renderer.toneMapping = previousTone
    for (const q of queries) if(q) gl.deleteQuery(q)
    target.dispose(); prefixTarget?.dispose();depth.dispose();allDepth.dispose()
  }
}
