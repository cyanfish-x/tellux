import * as THREE from 'three'
import type { Viewer } from '../../src/Viewer'
import type { AtmosphereManager } from '../../src/rendering/AtmosphereManager'
import { captureCloudPrefixShader } from './CloudPrefixCapture'

/**
 * 原云与单前缀插桩的完整原生 resolve/history 对照；不签收透明合成。
 * Compares original resolve/history with prefix instrumentation, without claiming transparent composition acceptance.
 */
export async function verifyCloudPrefixResolved(viewer: Viewer, options: { freshProgram?: boolean; baselineOnly?: boolean } = {}) {
  const renderer=viewer.renderer.raw as THREE.WebGLRenderer
  const clouds=(viewer as unknown as {atmosphere:AtmosphereManager}).atmosphere.cloudsEffect
  type CloudTarget=THREE.WebGLRenderTarget&{depthVelocity:THREE.Texture|null;shadowLength:THREE.Texture|null}
  const internal=clouds as unknown as {frame:number;cloudsPass:{currentMaterial:THREE.ShaderMaterial&{previousProjectionMatrix?:THREE.Matrix4;previousViewMatrix?:THREE.Matrix4};currentRenderTarget:CloudTarget;resolveMaterial:THREE.ShaderMaterial;historyRenderTarget:CloudTarget;resolveRenderTarget:CloudTarget}}
  const pass=internal.cloudsPass,material=pass.currentMaterial,original=pass.currentRenderTarget
  const originalShader=material.fragmentShader
  const candidate=original.clone() as CloudTarget
  const prefix=original.texture.clone();prefix.isRenderTargetTexture=true
  candidate.depthVelocity=candidate.textures[1]??null;candidate.shadowLength=original.shadowLength?candidate.textures[2]:null
  const attachment=candidate.textures.length;candidate.textures.push(prefix)
  const shader=captureCloudPrefixShader(originalShader,attachment)
  const query=new THREE.DataTexture(new Float32Array([1]),1,1,THREE.RedFormat,THREE.FloatType);query.needsUpdate=true
  material.uniforms.telluxQueryDepthBuffer=new THREE.Uniform(query)
  const gl=renderer.getContext() as WebGL2RenderingContext,timer=gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const savedTarget=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha()
  const originalDepth=material.uniforms.depthBuffer.value
  // Freeze the actual opaque depth for this shader comparison: globe LOD can otherwise
  // change clipping between blocks even with identical camera and cloud parameters.
  const depthSnapshot=new THREE.WebGLRenderTarget(renderer.domElement.width,renderer.domElement.height,{type:THREE.FloatType,format:THREE.RedFormat,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter})
  const copyMaterial=new THREE.ShaderMaterial({uniforms:{map:{value:originalDepth}},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 v;uniform sampler2D map;void main(){gl_FragColor=vec4(texture2D(map,v).r,0.,0.,1.);}',depthTest:false,depthWrite:false,toneMapped:false})
  const copy=new THREE.Mesh(new THREE.PlaneGeometry(2,2),copyMaterial)
  renderer.setRenderTarget(depthSnapshot);renderer.render(copy,new THREE.Camera());renderer.setRenderTarget(savedTarget)
  const camera=viewer.camera.raw as THREE.PerspectiveCamera,updateProjection=camera.updateProjectionMatrix
  const near=camera.near,far=camera.far
  camera.updateProjectionMatrix=function(){this.near=near;this.far=far;updateProjection.call(this)}
  const frames:Array<{mode:string;mean:Float32Array;gpu:Array<number|null>;state:object}> = []
  const queries:WebGLQuery[]=[]
  const select=(mode:string)=>{
    pass.currentRenderTarget=mode==='original'?original:candidate
    const current=pass.currentRenderTarget,uniforms=pass.resolveMaterial.uniforms
    uniforms.colorBuffer.value=current.texture;uniforms.depthVelocityBuffer.value=current.depthVelocity
    uniforms.shadowLengthBuffer.value=current.shadowLength
    material.fragmentShader=mode==='original'?originalShader:shader;material.needsUpdate=true
    if(options.freshProgram)material.dispose() // Diagnostic: release cached programs before warmup.
    material.uniforms.depthBuffer.value=depthSnapshot.texture
    internal.frame=0
    material.previousProjectionMatrix=undefined;material.previousViewMatrix=undefined
    renderer.setClearColor(0,0)
    for(const target of [pass.historyRenderTarget,pass.resolveRenderTarget]){renderer.setRenderTarget(target);renderer.clear(true,false,false)}
    renderer.setRenderTarget(savedTarget);renderer.setClearColor(color,alpha)
  }
  const read=()=>{
    const target=pass.historyRenderTarget,data=new Uint16Array(target.width*target.height*4)
    renderer.readRenderTargetPixels(target,0,0,target.width,target.height,data)
    return Float32Array.from(data,THREE.DataUtils.fromHalfFloat)
  }
  try {
    for(const mode of options.baselineOnly?['original','original','original','original']:['original','prefix','prefix','original']) {
      select(mode)
      for(let i=0;i<64;i++)viewer.render()
      let mean:Float32Array|undefined
      const blockQueries:Array<WebGLQuery|null>=[]
      for(let i=0;i<32;i++) {
        const q=timer?gl.createQuery():null
        if(q){queries.push(q);gl.beginQuery(timer!.TIME_ELAPSED_EXT,q)}
        viewer.render()
        if(q)gl.endQuery(timer!.TIME_ELAPSED_EXT)
        blockQueries.push(q)
        if(i%8===7) {
          const data=read();mean??=new Float32Array(data.length)
          for(let p=0;p<data.length;p++)mean[p]+=data[p]/4
        }
      }
      const gpu:Array<number|null>=[]
      for(const q of blockQueries) {
        if(!q){gpu.push(null);continue}
        while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))await new Promise(r=>setTimeout(r,5))
        gpu.push(gl.getParameter(timer!.GPU_DISJOINT_EXT)?null:gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6)
      }
      frames.push({mode,mean:mean!,gpu,state:{camera:viewer.camera.raw.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),clock:viewer.clock.currentTime.toISOString(),frame:material.uniforms.frame.value,
        weather:clouds.localWeatherOffset.toArray(),shape:clouds.shapeOffset.toArray(),detail:clouds.shapeDetailOffset.toArray(),
        textures:Object.fromEntries(Object.entries(material.uniforms).filter(([key])=>/Texture|_texture/.test(key)).map(([key,u])=>[key,u.value?.uuid??null]))}})
    }
    const difference=(a:Float32Array,b:Float32Array)=>{
      let max=0,mean=0,alphaMax=0,nonFinite=0
      for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(!Number.isFinite(d)){nonFinite++;continue}max=Math.max(max,d);mean+=d;if(i%4===3)alphaMax=Math.max(alphaMax,d)}
      return {max,mean:mean/a.length,alphaMax,nonFinite}
    }
    const width=pass.historyRenderTarget.width,height=pass.historyRenderTarget.height
    const images=frames.map(({mode,mean},index)=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
      const pixels=new Uint8ClampedArray(mean.length)
      // Grayscale alpha reveals cloud coverage without introducing a display-exposure choice.
      for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const from=(y*width+x)*4,to=((height-1-y)*width+x)*4
        for(let c=0;c<3;c++)pixels[to+c]=Math.round(255*mean[from+3]);pixels[to+3]=255
      }
      canvas.getContext('2d')!.putImageData(new ImageData(pixels,width,height),0,0)
      return {name:`${index}-${mode}`,image:canvas.toDataURL()}
    })
    return {width,height,trackingWidth:candidate.width,trackingHeight:candidate.height,warmup:64,samples:32,averagedFrames:[71,79,87,95],sequence:frames.map(f=>f.mode),freshProgram:!!options.freshProgram,
      originalRepeat:difference(frames[0].mean,frames[3].mean),prefixRepeat:difference(frames[1].mean,frames[2].mean),candidateDifference:difference(frames[0].mean,frames[1].mean),
      blocks:frames.map(({mode,gpu,state})=>({mode,gpu,state})),images,glError:gl.getError(),extraPrefixBytes:candidate.width*candidate.height*8,frozenOpaqueDepth:true,referenceDepthBytes:depthSnapshot.width*depthSnapshot.height*4}
  }finally{
    pass.currentRenderTarget=original
    const u=pass.resolveMaterial.uniforms;u.colorBuffer.value=original.texture;u.depthVelocityBuffer.value=original.depthVelocity;u.shadowLengthBuffer.value=original.shadowLength
    material.fragmentShader=originalShader;delete material.uniforms.telluxQueryDepthBuffer;material.needsUpdate=true
    material.uniforms.depthBuffer.value=originalDepth
    renderer.setRenderTarget(savedTarget);renderer.setClearColor(color,alpha)
    for(const q of queries)gl.deleteQuery(q)
    candidate.dispose();query.dispose()
    depthSnapshot.dispose();copy.geometry.dispose();copyMaterial.dispose()
    camera.updateProjectionMatrix=updateProjection
  }
}
