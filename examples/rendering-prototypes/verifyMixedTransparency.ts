import * as THREE from 'three'
import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark'
import {EntityRenderManager} from '../../src/entities/EntityRenderManager'
import {TransparentDepthSlice} from '../../src/rendering/TransparentDepthSlice'
import {SceneSubmission} from '../../src/rendering/SceneSubmission'

/** 隔离三类透明对象的前后排序；逐对象截图构造已知分离深度的 alpha 参考。 Isolates mixed transparency against per-object alpha references at separated depths. */
export async function verifyMixedTransparency(options:{depthSplit?:boolean;traceGL?:boolean;depthTexture?:boolean;crossing?:boolean;production?:boolean;multi?:boolean;logDepth?:boolean;cutout?:boolean;shells?:boolean;implicitEntity?:boolean}={}) {
 const r=new THREE.WebGLRenderer({antialias:false,logarithmicDepthBuffer:options.logDepth}),size=128
 const glErrors:Array<{phase:string;code:number;stack?:string}>=[]
 if(options.traceGL){
  const gl=r.getContext() as WebGL2RenderingContext,getError=gl.getError.bind(gl)
  for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','texImage2D','texImage3D','texSubImage2D','texSubImage3D','copyTexSubImage2D','readPixels','bufferSubData'] as const){
   const fn=gl[name].bind(gl) as (...args:unknown[])=>unknown
   ;(gl as unknown as Record<string,unknown>)[name]=(...args:unknown[])=>{const result=fn(...args),code=getError();if(code)glErrors.push({phase:name,code,stack:new Error().stack});return result}
  }
 }
 r.setSize(size,size);r.toneMapping=THREE.NoToneMapping;r.outputColorSpace=THREE.LinearSRGBColorSpace
 const target=new THREE.WebGLRenderTarget(size,size,{depthTexture:new THREE.DepthTexture(size,size)})
 const separatorTarget=new THREE.WebGLRenderTarget(size,size,{depthTexture:new THREE.DepthTexture(size,size)})
 const camera=new THREE.PerspectiveCamera(40,1,.1,50);camera.position.z=9
 const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root)
 const geometry:THREE.BufferGeometry=new THREE.PlaneGeometry(3,3)
 const shellGeometry=new THREE.SphereGeometry(1.5,48,32)
 const ordinary=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xff0000,transparent:true,opacity:.5,depthWrite:false}))
 const entity=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x0000ff,transparent:true,opacity:.5,depthWrite:false}))
 scene.add(ordinary);root.add(entity)
 const ordinary2=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xffff00,transparent:true,opacity:.3,depthWrite:false}))
 const entity2=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x00ffff,transparent:true,opacity:.3,depthWrite:false}))
 scene.add(ordinary2);root.add(entity2)
 const coverage=new THREE.DataTexture(new Uint8Array([255,0,255,255,255,255,255,255,255,255,255,255,255,0,255,255]),2,2)
 coverage.needsUpdate=true
 if(options.cutout){ordinary.material.alphaMap=coverage;ordinary2.material.alphaMap=coverage;ordinary2.material.alphaTest=.1}
 const occluder=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({colorWrite:false,alphaMap:coverage,alphaTest:.5}))
 occluder.position.set(.5,0,0);occluder.scale.set(.6,.6,1);occluder.visible=!!options.cutout;scene.add(occluder)
 const splat=new SplatMesh({constructSplats:s=>s.pushSplat(new THREE.Vector3(),new THREE.Vector3(.8,.8,.02),new THREE.Quaternion(),.5,new THREE.Color(0,1,0))})
 await splat.initialized
 scene.add(splat)
 const spark=new SparkRenderer({renderer:r,encodeLinear:true,depthTest:true,depthWrite:false,autoUpdate:false});scene.add(spark)
 const slice={value:0},boundary={value:0},productionSlice=new TransparentDepthSlice()
 const sliceHeader=`uniform float telluxSlice;uniform float telluxBoundary;uniform sampler2D telluxSeparator;uniform vec2 telluxSize;
 void telluxSliceDiscard(){
 float boundary=${options.depthTexture?'texture2D(telluxSeparator,gl_FragCoord.xy/telluxSize).r':'telluxBoundary'};
 if(telluxSlice<0.0&&gl_FragCoord.z<=boundary)discard;
 if(telluxSlice>0.0&&gl_FragCoord.z>boundary)discard;
 }`
 const attachSlice=(shader:THREE.WebGLProgramParametersWithUniforms)=>{
  shader.uniforms.telluxSlice=slice;shader.uniforms.telluxBoundary=boundary
  shader.uniforms.telluxSeparator={value:separatorTarget.depthTexture};shader.uniforms.telluxSize={value:new THREE.Vector2(size,size)}
  shader.fragmentShader=shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/,`${sliceHeader}\nvoid main() {telluxSliceDiscard();`)
 }
 const originalCompile=spark.material.onBeforeCompile
 spark.material.onBeforeCompile=function(shader,renderer){
  originalCompile.call(this,shader,renderer)
  if(options.depthSplit){
   if(!options.depthTexture)attachSlice(shader)
  }
 }
 const oit=new EntityRenderManager({root,camera,requestedMode:'weighted-oit',supportsWeightedOit:true})
 const submission=new SceneSubmission(scene,camera,undefined,oit)
 const objects={ordinary,entity,spark:splat,ordinary2,entity2}
 const check=(phase:string)=>{const code=r.getContext().getError();if(code)glErrors.push({phase,code})}
 const select=(names:string[])=>{for(const [name,object] of Object.entries(objects))object.visible=names.includes(name);spark.visible=names.includes('spark')}
 const draw=(useOit:boolean)=>{
  r.setRenderTarget(target);r.setClearColor(0,0);r.autoClear=true
  if(useOit)oit.beginFrame()
  r.render(scene,camera)
  check('scene')
  if(useOit)oit.render(r,target,target)
  check('oit')
  const pixels=new Uint8Array(size*size*4);r.readRenderTargetPixels(target,0,0,size,size,pixels);return pixels
 }
 const settle=async()=>{scene.updateMatrixWorld();camera.updateMatrixWorld();await spark.update({scene,camera});for(let i=0;i<12;i++){draw(false);await new Promise(resolve=>setTimeout(resolve,10))}}
 const splitDraw=(near:string,far:string)=>{
  const separator=near==='ordinary'||far==='ordinary'?'ordinary':'entity'
  const layer=near==='spark'||far==='spark'?'spark':'entity'
  const z=objects[separator].position.z
  boundary.value=(new THREE.Vector3(0,0,z).project(camera).z+1)/2
  if(options.depthTexture){
   productionSlice.attach(spark.material)
   const object=objects[separator],original=object.material,depthMaterial=original.clone()
   depthMaterial.transparent=false;depthMaterial.depthWrite=true;depthMaterial.colorWrite=false
   object.material=depthMaterial;object.visible=true;r.setRenderTarget(separatorTarget);r.autoClear=true
   try{r.render(object,camera)}finally{object.material=original;depthMaterial.dispose()}
   check('separator depth')
  }
  r.setRenderTarget(target);r.setClearColor(0,0);r.clear();r.autoClear=false;spark.autoUpdate=false
  for(const region of [-1,0,1]) {
   if(options.depthTexture)productionSlice.setRange(region===-1?separatorTarget.depthTexture:null,region===1?separatorTarget.depthTexture:null,size,size)
   if(region===0){
    slice.value=0;r.clippingPlanes=[];select([separator])
    if(separator==='entity') {
     if(options.depthTexture)oit.renderDepthRange(r,target,target.depthTexture!,null,null);else oit.render(r,target,target)
    }else r.render(scene,camera)
   }else{
    select([layer])
    if(layer==='spark'){slice.value=region;r.render(scene,camera)}
    else{
     if(options.depthTexture)oit.renderDepthRange(r,target,target.depthTexture!,region===-1?separatorTarget.depthTexture:null,region===1?separatorTarget.depthTexture:null)
     else{r.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,0,region===-1?-1:1),region===-1?z:-z)];oit.render(r,target,target)}
    }
   }
   check('split:'+region)
  }
  slice.value=0;r.clippingPlanes=[]
  productionSlice.setRange(null,null,size,size)
  const pixels=new Uint8Array(size*size*4);r.readRenderTargetPixels(target,0,0,size,size,pixels);return pixels
 }
 const rows=[]
 const productionDraw=()=>{
  if(options.implicitEntity){entity.material.transparent=false;entity2.material.transparent=false}
  scene.updateMatrixWorld();camera.updateMatrixWorld();oit.beginFrame()
  r.setRenderTarget(target);r.setClearColor(0,0);r.autoClear=true
  submission.opaque.render(r,target,target,0,false)
  submission.transparent.render(r,target,target,0,false)
  oit.render(r,target,target)
  check('production scene submission')
  const pixels=new Uint8Array(size*size*4);r.readRenderTargetPixels(target,0,0,size,size,pixels)
  entity.material.transparent=true;entity2.material.transparent=true
  return pixels
 }
 const depthAt=(name:string,x:number,y:number)=>{
  const object=objects[name as keyof typeof objects]
  if(name==='spark')return object.getWorldPosition(new THREE.Vector3()).project(camera).z
  const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0,0,1).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())),object.getWorldPosition(new THREE.Vector3()))
  const origin=camera.getWorldPosition(new THREE.Vector3()),direction=new THREE.Vector3((x+.5)/size*2-1,(y+.5)/size*2-1,.5).unproject(camera).sub(origin).normalize()
  const position=new THREE.Ray(origin,direction).intersectPlane(plane,new THREE.Vector3())
  return position?position.project(camera).z:1
 }
 try {
  for(const [a,b] of [['ordinary','entity'],['ordinary','spark'],['entity','spark']])for(const reversed of [false,true]) {
   const near=reversed?b:a,far=reversed?a:b
   objects[near as keyof typeof objects].position.z=-1;objects[far as keyof typeof objects].position.z=-3
   if(options.crossing){ordinary.position.z=-2.003;entity.position.z=-1.997;splat.position.z=-2;ordinary.rotation.y=.7;entity.rotation.y=-.7}
   select([far]);await settle();const back=draw(false)
   select([near]);await settle();const front=draw(false)
   select([near,far]);await settle();const actual=options.production?productionDraw():options.depthSplit?splitDraw(near,far):draw(true)
   const expectedPixels=new Uint8Array(actual.length)
   let max=0,over2=0,overlap=0,ties=0
   for(let i=0;i<actual.length;i+=4){
    if(front[i+3]>20&&back[i+3]>20)overlap++
    const depthDifference=options.crossing?depthAt(near,i/4%size,Math.floor(i/4/size))-depthAt(far,i/4%size,Math.floor(i/4/size)):-1
    if(options.crossing&&Math.abs(depthDifference)<1e-6){ties++;continue}
    const f=depthDifference<=0?front:back,b=depthDifference<=0?back:front
    for(let c=0;c<3;c++){const expected=f[i+c]+b[i+c]*(1-f[i+3]/255),d=Math.abs(actual[i+c]-expected);expectedPixels[i+c]=Math.round(expected);max=Math.max(max,d);if(d>2)over2++}
   }
   const center=(size/2*size+size/2)*4
   const canvas=document.createElement('canvas');canvas.width=size*2;canvas.height=size
   const pixels=new Uint8ClampedArray(size*size*8)
   for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let side=0;side<2;side++){
    const from=(y*size+x)*4,to=((size-1-y)*size*2+x+side*size)*4,source=side===0?expectedPixels:actual
    for(let c=0;c<3;c++)pixels[to+c]=source[from+c];pixels[to+3]=255
   }
   canvas.getContext('2d')!.putImageData(new ImageData(pixels,size*2,size),0,0)
   rows.push({near,far,max,over2,overlap,ties,centerActual:Array.from(actual.slice(center,center+3)),centerExpected:options.crossing?null:[0,1,2].map(c=>front[center+c]+back[center+c]*(1-front[center+3]/255)),preview:canvas.toDataURL()})
  }
  if(options.multi) for(const names of [
   ['ordinary','entity','spark'],['ordinary','spark','entity'],['entity','ordinary','spark'],
   ['entity','spark','ordinary'],['spark','ordinary','entity'],['spark','entity','ordinary'],
   ['ordinary','ordinary2','spark'],['entity','entity2','spark'],
   ['ordinary','ordinary2','entity'],['ordinary','entity','ordinary2','entity2','spark'],
  ]) {
   names.forEach((name,i)=>{const object=objects[name as keyof typeof objects];object.position.z=options.crossing?-2+(i-2)*.003:-i-1;object.rotation.y=name==='spark'?0:options.crossing?(i%2?-.7:.7):0})
   const captures:Uint8Array[]=[]
   for(const name of names){select([name]);await settle();captures.push(draw(false))}
   select(names);await settle();const actual=productionDraw(),expectedPixels=new Uint8Array(actual.length)
   let max=0,over2=0,ties=0
   for(let pixel=0;pixel<size*size;pixel++){
    const order=names.map((name,index)=>({index,depth:depthAt(name,pixel%size,Math.floor(pixel/size))})).sort((a,b)=>a.depth-b.depth)
    if(order.some((item,i)=>i>0&&Math.abs(item.depth-order[i-1].depth)<1e-6)){ties++;continue}
    const color=[0,0,0];let transmission=1
    for(const {index} of order){const source=captures[index];for(let c=0;c<3;c++)color[c]+=transmission*source[pixel*4+c];transmission*=1-source[pixel*4+3]/255}
    for(let c=0;c<3;c++){const diff=Math.abs(actual[pixel*4+c]-color[c]);max=Math.max(max,diff);if(diff>2)over2++;expectedPixels[pixel*4+c]=Math.round(color[c])}
   }
   const canvas=document.createElement('canvas');canvas.width=size*2;canvas.height=size
   const pixels=new Uint8ClampedArray(size*size*8)
   for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let side=0;side<2;side++){
    const from=(y*size+x)*4,to=((size-1-y)*size*2+x+side*size)*4,source=side===0?expectedPixels:actual
    for(let c=0;c<3;c++)pixels[to+c]=source[from+c];pixels[to+3]=255
   }
   canvas.getContext('2d')!.putImageData(new ImageData(pixels,size*2,size),0,0)
   rows.push({near:names.join('-'),far:'multi',max,over2,overlap:0,ties,centerActual:[],centerExpected:null,preview:canvas.toDataURL()})
  }
  if(options.shells)for(const owner of ['ordinary','entity'] as const)for(const cameraX of [-1,0,1]) {
   const object=objects[owner],material=object.material
   object.geometry=shellGeometry;object.position.set(0,0,-2);object.rotation.set(0,0,0);material.alphaMap=null
   camera.position.x=cameraX;camera.lookAt(0,0,-2);splat.position.set(0,0,-2);occluder.visible=false
   select([owner]);material.side=THREE.BackSide;material.needsUpdate=true;await settle();const back=draw(false)
   material.side=THREE.FrontSide;material.needsUpdate=true;await settle();const front=draw(false)
   select(['spark']);await settle();const gaussian=draw(false)
   material.side=THREE.DoubleSide;material.needsUpdate=true;select([owner,'spark']);await settle();const actual=productionDraw()
   const references=[back,front,gaussian],expectedPixels=new Uint8Array(actual.length),raycaster=new THREE.Raycaster()
   let max=0,over2=0,ties=0
   for(let pixel=0;pixel<size*size;pixel++){
    raycaster.setFromCamera(new THREE.Vector2((pixel%size+.5)/size*2-1,(Math.floor(pixel/size)+.5)/size*2-1),camera)
    // Intersect the actual triangulated shell rather than treating its tessellation as an analytic sphere.
    const hits=raycaster.intersectObject(object,false)
    if(hits.length<2&&(front[pixel*4+3]||back[pixel*4+3])){ties++;continue}
    const order=[{index:0,depth:hits.at(-1)?.point.clone().project(camera).z??1},{index:1,depth:hits[0]?.point.clone().project(camera).z??1},
     {index:2,depth:depthAt('spark',pixel%size,Math.floor(pixel/size))}].sort((a,b)=>a.depth-b.depth)
    if(hits.length>=2&&order.some((item,i)=>i>0&&Math.abs(item.depth-order[i-1].depth)<1e-6)){ties++;continue}
    let transmission=1;const color=[0,0,0]
    for(const {index} of order){const source=references[index];for(let c=0;c<3;c++)color[c]+=transmission*source[pixel*4+c];transmission*=1-source[pixel*4+3]/255}
    for(let c=0;c<3;c++){const difference=Math.abs(actual[pixel*4+c]-color[c]);max=Math.max(max,difference);if(difference>2)over2++;expectedPixels[pixel*4+c]=Math.round(color[c])}
   }
   const canvas=document.createElement('canvas');canvas.width=size*2;canvas.height=size
   const pixels=new Uint8ClampedArray(size*size*8)
   for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let side=0;side<2;side++){
    const from=(y*size+x)*4,to=((size-1-y)*size*2+x+side*size)*4,source=side===0?expectedPixels:actual
    for(let c=0;c<3;c++)pixels[to+c]=source[from+c];pixels[to+3]=255
   }
   canvas.getContext('2d')!.putImageData(new ImageData(pixels,size*2,size),0,0)
   rows.push({near:`${owner}-shell-${cameraX}`,far:'spark',max,over2,overlap:0,ties,centerActual:[],centerExpected:null,preview:canvas.toDataURL()})
   object.geometry=geometry;material.side=THREE.FrontSide;material.needsUpdate=true
  }
  return {size,production:!!options.production,multi:!!options.multi,shells:!!options.shells,implicitEntity:!!options.implicitEntity,logDepth:!!options.logDepth,cutout:!!options.cutout,depthSplit:!!options.depthSplit,depthTexture:!!options.depthTexture,crossing:!!options.crossing,rows,glErrors,glError:r.getContext().getError(),scope:'Up to four flat surfaces and one real Spark Gaussian; optional log depth, opaque cutout occluder and double-sided triangulated shells. No clouds, atmosphere or performance claims. Crossing excludes NDC depth ties within 1e-6.'}
 }finally{submission.dispose();productionSlice.endFrame();oit.dispose();spark.dispose();splat.dispose();ordinary.material.dispose();entity.material.dispose();ordinary2.material.dispose();entity2.material.dispose();occluder.material.dispose();coverage.dispose();geometry.dispose();shellGeometry.dispose();target.dispose();separatorTarget.dispose();r.dispose()}
}
