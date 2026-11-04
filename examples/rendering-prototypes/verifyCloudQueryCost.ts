import * as THREE from 'three'
import type {Viewer} from '../../src/Viewer'
import type {AtmosphereManager} from '../../src/rendering/AtmosphereManager'

/** 测量原云材质局部重复查询的真实成本；不实现新的透明合成。 Measures unchanged cloud shader region-query cost, without implementing transparent composition. */
export async function verifyCloudQueryCost(viewer:Viewer) {
 const r=viewer.renderer.raw as THREE.WebGLRenderer
 const cloud=(viewer as unknown as {atmosphere:AtmosphereManager}).atmosphere.cloudsEffect
 const p=(cloud as unknown as {cloudsPass:{currentMaterial:THREE.ShaderMaterial;currentRenderTarget:THREE.WebGLRenderTarget;currentPass:{render(r:THREE.WebGLRenderer,input:null,out:THREE.WebGLRenderTarget):void}}}).cloudsPass
 const target=p.currentRenderTarget.clone(),material=p.currentMaterial
 const depthData=new Float32Array([1])
 const depth=new THREE.DataTexture(depthData,1,1,THREE.RedFormat,THREE.FloatType);depth.needsUpdate=true
 const shader=material.fragmentShader,gl=r.getContext() as WebGL2RenderingContext,timer=gl.getExtension('EXT_disjoint_timer_query_webgl2')
 const queries:WebGLQuery[]=[],blocks=[]
 const query=(fraction:number)=>{
  if(!fraction)return
  const oldDepth=material.uniforms.depthBuffer.value,oldTarget=r.getRenderTarget()
  const near=material.uniforms.cameraNear.value,far=material.uniforms.cameraFar.value
  const distance=4000
  depthData[0]=r.capabilities.logarithmicDepthBuffer?Math.log2(distance+1)/Math.log2(far+1):far*(distance-near)/((far-near)*distance)
  depth.needsUpdate=true;material.uniforms.depthBuffer.value=depth
  const side=Math.sqrt(fraction),w=Math.max(1,Math.floor(target.width*side)),h=Math.max(1,Math.floor(target.height*side))
  target.scissor.set(Math.floor((target.width-w)/2),Math.floor((target.height-h)/2),w,h);target.scissorTest=true
  try{p.currentPass.render(r,null,target)}finally{material.uniforms.depthBuffer.value=oldDepth;r.setRenderTarget(oldTarget)}
 }
 try {
  for(const fraction of [0,1/16,1/4,1,1,1/4,1/16,0]) {
   for(let i=0;i<30;i++){viewer.render();query(fraction)}
   const samples:Array<{cpu:number;gpu:number|null;draws:number}>=[],qs:Array<WebGLQuery|null>=[]
   for(let i=0;i<30;i++) {
    r.info.autoReset=false;r.info.reset()
    const q=timer?gl.createQuery():null
    if(q){queries.push(q);gl.beginQuery(timer!.TIME_ELAPSED_EXT,q)}
    const start=performance.now();viewer.render();query(fraction)
    const cpu=performance.now()-start
    if(q)gl.endQuery(timer!.TIME_ELAPSED_EXT)
    qs.push(q);samples.push({cpu,gpu:null,draws:r.info.render.calls})
   }
   for(let i=0;i<qs.length;i++){const q=qs[i];if(!q)continue;while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))await new Promise(resolve=>setTimeout(resolve,5));samples[i].gpu=gl.getParameter(timer!.GPU_DISJOINT_EXT)?null:gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6}
   const values=samples.map(s=>s.gpu).filter((v):v is number=>v!==null).sort((a,b)=>a-b)
   blocks.push({fraction,p50:values[15]??null,p95:values[28]??null,samples})
  }
  return {width:r.domElement.width,height:r.domElement.height,queryWidth:target.width,queryHeight:target.height,queryDepth:4000,warmup:30,samples:30,blocks,shaderUnchanged:shader===material.fragmentShader,queryTargetBytes:target.width*target.height*target.textures.length*8,glError:gl.getError(),scope:'Extra unchanged currentPass only; no prefix history, transparent-depth draw, or composition included.'}
 }finally{r.info.autoReset=true;for(const q of queries)gl.deleteQuery(q);target.dispose();depth.dispose()}
}
