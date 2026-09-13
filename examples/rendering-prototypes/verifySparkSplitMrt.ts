import * as THREE from 'three'
import {getSparkRendererForScene} from '3d-tiles-rendererjs-3dgs-plugin'
import type {Viewer} from '../../src/Viewer'
import type {SceneSubmission} from '../../src/rendering/SceneSubmission'
import type {TransparentAtmosphere} from '../../src/rendering/TransparentAtmosphere'
import type {RenderItem} from 'three/src/renderers/webgl/WebGLRenderLists.js'

/** 真实高斯单次绘制输出两段的颜色／成本实验，不接入生产管线。 Tests two Spark depth slices in one MRT draw on real data, outside the production pipeline. */
export async function verifySparkSplitMrt(viewer:Viewer) {
 const r=viewer.renderer.raw as THREE.WebGLRenderer,scene=viewer.scene.raw,camera=viewer.camera.raw
 const spark=getSparkRendererForScene(scene)
 if(!spark)throw Error('No real Spark renderer in this entry')
 const manager=(viewer as unknown as {postProcessing:{sceneSubmission:SceneSubmission;transparentAtmosphere:TransparentAtmosphere}}).postProcessing
 const submission=manager.sceneSubmission,internal=submission as unknown as {transparentItems:RenderItem[];sceneTarget:THREE.WebGLRenderTarget|null}
 const pass=submission.transparent,originalRender=pass.render,atmosphere=manager.transparentAtmosphere
 const auto=spark.autoUpdate;spark.autoUpdate=false
 scene.updateMatrixWorld();camera.updateMatrixWorld();await spark.update({scene,camera})
 const center=new THREE.Vector3(),bounds=new THREE.Box3()
 scene.traverseVisible(object=>{const splat=object as THREE.Object3D&{getBoundingBox?:()=>THREE.Box3};if(splat.userData.gaussianSplat&&splat.getBoundingBox)bounds.union(splat.getBoundingBox().clone().applyMatrix4(splat.matrixWorld))})
 if(bounds.isEmpty())throw Error('No loaded Gaussian bounds')
 bounds.getCenter(center)
 const splitEnabled={value:false},boundary={value:0}
 const material=spark.material,compile=material.onBeforeCompile,key=material.customProgramCacheKey
 const gl=r.getContext() as WebGL2RenderingContext,timer=gl.getExtension('EXT_disjoint_timer_query_webgl2')
 const glErrors:Array<{phase:string;code:number}>=[]
 const check=(phase:string)=>{const code=gl.getError();if(code&&glErrors.length<20)glErrors.push({phase,code})}
 const width=r.domElement.width,height=r.domElement.height
 const mrt=new THREE.WebGLRenderTarget(width,height,{count:2,type:THREE.HalfFloatType,depthBuffer:true})
 const compositeMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,transparent:true,premultipliedAlpha:true,toneMapped:false,
  uniforms:{front:{value:mrt.textures[0]},back:{value:mrt.textures[1]}},
  vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:'varying vec2 v;uniform sampler2D front;uniform sampler2D back;void main(){vec4 f=texture2D(front,v);vec4 b=texture2D(back,v);gl_FragColor=f+b*(1.-f.a);}'})
 const composite=new THREE.Mesh(new THREE.PlaneGeometry(2,2),compositeMaterial),quadCamera=new THREE.Camera()
 let mode='original'
 const read=()=>{
  const pixels=new Uint8Array(width*height*4);check('before read')
  // An asynchronous readback can leave a pack buffer bound; typed-array readPixels
  // requires no PIXEL_PACK_BUFFER. Preserve the caller's binding around this diagnostic.
  const pack=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING)
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null)
  try{gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels)}finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,pack)}
  check('read');return pixels
 }
 const queries:WebGLQuery[]=[],blocks=[]
 const difference=(a:Uint8Array,b:Uint8Array)=>{let max=0,over2=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);if(d>2)over2++}return {max,over2}}
 try {
  for(let i=0;i<30;i++)viewer.render()
  const unmodified=read()
  // Ensure the shared aerial adapter owns the material before chaining the experimental hook.
  atmosphere.attach(material)
  const aerialCompile=material.onBeforeCompile,aerialKey=material.customProgramCacheKey
  material.onBeforeCompile=function(shader,renderer){
   aerialCompile.call(this,shader,renderer)
   shader.uniforms.telluxSplitEnabled=splitEnabled;shader.uniforms.telluxSplitBoundary=boundary
   const declaration='out vec4 fragColor;'
   if(!shader.fragmentShader.includes(declaration))throw Error('Spark output declaration changed')
   shader.fragmentShader=shader.fragmentShader.replace(declaration,`layout(location=0) out vec4 fragColor;layout(location=1) out vec4 telluxBack;
uniform bool telluxSplitEnabled;uniform float telluxSplitBoundary;`)
   // Spark's main is the final function in this upstream fragment shader.
   shader.fragmentShader=shader.fragmentShader.replace(/}\s*$/,`telluxBack=vec4(0.0);
if(telluxSplitEnabled&&gl_FragCoord.z>telluxSplitBoundary){telluxBack=fragColor;fragColor=vec4(0.0);}\n}`)
  }
  material.customProgramCacheKey=()=>`${aerialKey.call(material)}:two-slice-mrt-experiment`;material.needsUpdate=true
  pass.render=(renderer,write,readBuffer,delta,mask)=>{
   splitEnabled.value=false
   if(mode==='original'){originalRender.call(pass,renderer,write,readBuffer,delta,mask);return}
   const items=internal.transparentItems
   internal.transparentItems=items.filter(item=>item.object!==spark)
   try{originalRender.call(pass,renderer,write,readBuffer,delta,mask)}finally{internal.transparentItems=items}
   const destination=internal.sceneTarget
   if(!destination?.depthTexture)throw Error('Missing borrowed opaque depth')
   const oldTarget=renderer.getRenderTarget(),oldAuto=renderer.autoClear,oldTone=renderer.toneMapping,oldAlpha=renderer.getClearAlpha(),oldColor=renderer.getClearColor(new THREE.Color())
   try {
    mrt.depthTexture=destination.depthTexture;mrt.stencilBuffer=destination.stencilBuffer
    renderer.autoClear=false;renderer.toneMapping=THREE.NoToneMapping
    renderer.setRenderTarget(mrt);renderer.setClearColor(0,0);renderer.clear(true,false,false)
    boundary.value=(center.clone().project(camera).z+1)/2;splitEnabled.value=true
    atmosphere.update(camera,width,height);renderer.render(spark,camera);atmosphere.active.value=false;check('spark mrt')
    renderer.setRenderTarget(destination);renderer.render(composite,quadCamera);check('composite')
   }finally{splitEnabled.value=false;atmosphere.active.value=false;renderer.setRenderTarget(oldTarget);renderer.autoClear=oldAuto;renderer.toneMapping=oldTone;renderer.setClearColor(oldColor,oldAlpha)}
  }
  const images:Uint8Array[]=[]
  for(const next of ['original','mrt','mrt','original']) {
   mode=next
   for(let i=0;i<30;i++)viewer.render()
   const samples:Array<{cpu:number;gpu:number|null;draws:number}>=[],qs:Array<WebGLQuery|null>=[]
   for(let i=0;i<30;i++){
    r.info.autoReset=false;r.info.reset();const q=timer?gl.createQuery():null
    if(q){queries.push(q);gl.beginQuery(timer!.TIME_ELAPSED_EXT,q)}
    const start=performance.now();viewer.render();const cpu=performance.now()-start
    if(q)gl.endQuery(timer!.TIME_ELAPSED_EXT)
    samples.push({cpu,gpu:null,draws:r.info.render.calls});qs.push(q)
   }
   images.push(read())
   for(let i=0;i<qs.length;i++){const q=qs[i];if(!q)continue;while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))await new Promise(resolve=>setTimeout(resolve,5));samples[i].gpu=gl.getParameter(timer!.GPU_DISJOINT_EXT)?null:gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6}
   const values=samples.map(s=>s.gpu).filter((v):v is number=>v!==null).sort((a,b)=>a-b)
   blocks.push({mode,p50:values[15]??null,p95:values[28]??null,samples})
  }
  return {width,height,blocks,shaderOnly:difference(unmodified,images[0]),split:difference(images[0],images[1]),originalRepeat:difference(images[0],images[3]),splitRepeat:difference(images[1],images[2]),glErrors,glError:gl.getError(),extraColorBytes:width*height*16,borrowedOpaqueDepth:true,scope:'Two Gaussian depth slices recombined without a separator surface; real data, fixed camera. Excludes separator depth rendering and cloud queries.'}
 }finally{
  pass.render=originalRender;material.onBeforeCompile=compile;material.customProgramCacheKey=key;material.needsUpdate=true
  spark.autoUpdate=auto;mrt.depthTexture=null;mrt.dispose();composite.geometry.dispose();compositeMaterial.dispose();r.info.autoReset=true
  for(const q of queries)gl.deleteQuery(q)
 }
}
