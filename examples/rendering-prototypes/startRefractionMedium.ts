import * as THREE from 'three'
import { mediumIntegralGLSL } from './mediumIntegral'

// World units are meters. Exact homogeneous slabs isolate path composition from lighting.
const medium = `
uniform bool a2Medium, a2Occluder, a2Pattern;
uniform int a2Mode;
uniform float a2Roughness;
uniform mat4 a2InverseProjection, a2CameraWorld;
${mediumIntegralGLSL}
void a2Integrate(vec3 origin, vec3 direction, float distance, out vec3 T, out vec3 S) {
 T=vec3(1);S=vec3(0);if(!a2Medium)return;
 float cuts[6];cuts[0]=0.0;cuts[1]=distance;
 cuts[2]=clamp((-4.0-origin.z)/direction.z,0.0,distance);cuts[3]=clamp((-7.0-origin.z)/direction.z,0.0,distance);
 cuts[4]=clamp((-18.0-origin.z)/direction.z,0.0,distance);cuts[5]=clamp((-25.0-origin.z)/direction.z,0.0,distance);
 for(int i=1;i<6;i++)for(int j=0;j<5;j++){if(cuts[j]>cuts[j+1]){float v=cuts[j];cuts[j]=cuts[j+1];cuts[j+1]=v;}}
 for(int i=0;i<5;i++){
  float z=origin.z+direction.z*(cuts[i]+cuts[i+1])*0.5;
  float cloud=(z<-4.0&&z>-7.0)?0.16:(z<-18.0&&z>-25.0)?0.09:0.0;
  a1Accumulate(vec3(0.009,0.015,0.025)+cloud,vec3(0.006,0.011,0.021)+cloud*vec3(0.72,0.76,0.82),cuts[i+1]-cuts[i],T,S);
 }
}
float a2Hit(vec3 origin,vec3 direction,out vec3 surface){
 float distance=(-30.0-origin.z)/direction.z;vec3 p=origin+direction*distance;
 surface=mix(vec3(0.055,0.13,0.27),vec3(0.9,0.55,0.12),mod(floor(p.x)+floor(p.y),2.0));
 if(!a2Pattern)surface=vec3(0.3,0.45,0.65);
 if(a2Occluder){float wall=(-13.0-origin.z)/direction.z;vec3 w=origin+direction*wall;
  if(wall>0.0&&wall<distance&&w.x>-2.5&&w.x<0.5&&abs(w.y)<2.5){distance=wall;surface=vec3(0.58,0.10,0.045);}}
 return distance;
}
vec3 a2Background(vec3 origin,vec3 direction){vec3 surface,T,S;float distance=a2Hit(origin,direction,surface);a2Integrate(origin,direction,distance,T,S);return S+T*surface;}
`
const transmission=THREE.ShaderChunk.transmission_pars_fragment.replace('vec4 getIBLVolumeRefraction(', 'vec4 a2OriginalRefraction(')
const refraction=`
${medium}
#ifdef USE_TRANSMISSION
vec4 getIBLVolumeRefraction(const in vec3 n,const in vec3 v,const in float roughness,const in vec3 diffuseColor,
 const in vec3 specularColor,const in float specularF90,const in vec3 position,const in mat4 modelMatrix,
 const in mat4 viewMatrix,const in mat4 projMatrix,const in float dispersion,const in float ior,const in float thickness,
 const in vec3 attenuationColor,const in float attenuationDistance){
 vec3 ray=getVolumeTransmissionRay(n,v,thickness,ior,modelMatrix),exitPoint=position+ray;
 vec4 clip=projMatrix*viewMatrix*vec4(exitPoint,1);vec2 uv=clip.xy/clip.w*0.5+0.5;
 vec3 ignored;float snapshotDepth=a2Hit(cameraPosition,normalize(exitPoint-cameraPosition),ignored);
 bool outside=clip.w<=0.0||any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1)));
 bool occluded=snapshotDepth<length(exitPoint-cameraPosition)-0.001;
 bool unsupported=a2Roughness>0.001||dispersion>0.0||exitPoint.z<=-30.0;
 if(a2Mode==3)return vec4(outside?vec3(1,0,1):occluded?vec3(1,0.2,0):unsupported?vec3(1,1,0):vec3(0,0.7,0.2),1);
 if(a2Mode==0||a2Mode==2){
  vec4 result=a2OriginalRefraction(n,v,roughness,diffuseColor,specularColor,specularF90,position,modelMatrix,viewMatrix,projMatrix,dispersion,ior,thickness,attenuationColor,attenuationDistance);
  if(a2Mode==2){vec3 T,S;a2Integrate(cameraPosition,-v,length(position-cameraPosition),T,S);result.rgb=S+T*result.rgb;}
  return result;
 }
 if(unsupported)return vec4(1,1,0,1);
 vec3 frontT,frontS,backT,backS,surface;
 a2Integrate(cameraPosition,-v,length(position-cameraPosition),frontT,frontS);
 float distance=a2Hit(exitPoint,-v,surface);a2Integrate(exitPoint,-v,distance,backT,backS);
 vec3 F=EnvironmentBRDF(n,v,specularColor,specularF90,roughness);
 vec3 absorption=volumeAttenuation(length(ray),attenuationColor,attenuationDistance);
 return vec4(frontS+frontT*(1.0-F)*diffuseColor*absorption*(backS+backT*surface),1);
}
#endif
`

/** A2 原生 transmission 与解析路径对照；不代表真实云验收。 A2 native transmission versus analytic paths, not real-cloud acceptance. */
export function startRefractionMedium(container:HTMLElement){
 const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false});renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;container.append(renderer.domElement)
 const camera=new THREE.PerspectiveCamera(55,1,0.1,100)
 const uniforms={a2Medium:{value:true},a2Pattern:{value:true},a2Occluder:{value:false},a2Mode:{value:0},a2Roughness:{value:0},a2InverseProjection:{value:camera.projectionMatrixInverse},a2CameraWorld:{value:camera.matrixWorld}}
 const scene=new THREE.Scene(),geometry=new THREE.PlaneGeometry(2,2)
 const backdrop=new THREE.Mesh(geometry,new THREE.ShaderMaterial({vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.9999,1);}',fragmentShader:`varying vec2 vUv;${medium}void main(){vec4 p=a2InverseProjection*vec4(vUv*2.0-1.0,1,1);vec3 direction=normalize(mat3(a2CameraWorld)*p.xyz);gl_FragColor=vec4(a2Background(cameraPosition,direction),1);}`,uniforms,depthTest:false,depthWrite:false,toneMapped:false}))
 backdrop.frustumCulled=false;backdrop.renderOrder=-10;scene.add(backdrop)
 const glass=new THREE.MeshPhysicalMaterial({color:0xffffff,transmission:1,thickness:2,ior:1.5,roughness:0,metalness:0,specularIntensity:0,attenuationColor:new THREE.Color(0.9,0.98,0.96),attenuationDistance:20})
 glass.onBeforeCompile=shader=>{Object.assign(shader.uniforms,uniforms);shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_pars_fragment>',transmission+refraction)};glass.customProgramCacheKey=()=> 'a2-native-path-1'
 const pane=new THREE.Mesh(new THREE.PlaneGeometry(8,6),glass);pane.position.z=-8;scene.add(pane)
 let disposed=false,shaderError:string|null=null,validation:unknown=null
 renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{shaderError=[gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].join('\n')}
 const panel=document.createElement('aside');panel.style.cssText='position:absolute;right:12px;top:12px;width:min(340px,42vw);max-height:90vh;overflow:auto;background:#102335ed;color:white;padding:16px;z-index:20;font:13px/1.6 sans-serif'
 panel.innerHTML=`<strong>A2 · 折射与介质路径</strong><p>真实 Three.js transmission，两个解析云层。玻璃使用原生光学厚度，平行界面路径；不代表真实云照明。</p><select id="a2-mode"><option value="0">原生屏幕空间近似</option><option value="1">平滑折射路径参考</option><option value="2">错误：重复施加前段介质</option><option value="3">有效性：绿有效 / 紫离屏 / 红遮挡 / 黄不支持</option></select><p><label>厚度 <input id="a2-thickness" type="range" min="0" max="24" step="0.25" value="2"></label></p><p><label>IOR <input id="a2-ior" type="range" min="1" max="2.4" step="0.1" value="1.5"></label></p><p><label>粗糙度 <input id="a2-roughness" type="range" min="0" max="0.8" step="0.1" value="0"></label></p><p><label>玻璃倾角 <input id="a2-angle" type="range" min="0" max="85" step="5" value="0"></label></p><p><label>相机横移 <input id="a2-camera" type="range" min="-7" max="7" step="0.25" value="0"></label></p><p><label><input id="a2-medium" type="checkbox" checked>介质</label> <label><input id="a2-wall" type="checkbox">近处遮挡</label></p><button id="a2-verify">运行对照</button><pre id="a2-status" style="white-space:pre-wrap"></pre>`;container.append(panel)
 const control=<T extends HTMLElement>(name:string)=>panel.querySelector<T>(`#a2-${name}`)!
 function report(){return {ready:!disposed&&!shaderError,shaderError,mode:uniforms.a2Mode.value,medium:uniforms.a2Medium.value,occluder:uniforms.a2Occluder.value,thickness:glass.thickness,ior:glass.ior,roughness:glass.roughness,camera:camera.position.toArray(),angle:THREE.MathUtils.radToDeg(pane.rotation.y),resolution:renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),validation,scope:'Actual Three.js transmission; analytic cloud slabs; smooth parallel-interface reference only; no real-cloud or performance acceptance'}}
 function render(target:THREE.WebGLRenderTarget|null=null){camera.updateMatrixWorld();uniforms.a2Roughness.value=glass.roughness;renderer.setRenderTarget(target);renderer.render(scene,camera);const gl=renderer.getContext(),error=gl.getError();if(shaderError||error!==gl.NO_ERROR)throw Error(shaderError??`A2 GL error ${error}`)}
 function draw(){if(disposed)return;render();control('status').textContent=JSON.stringify(report(),null,2)}
 function resize(){renderer.setPixelRatio(window.devicePixelRatio);renderer.setSize(Math.max(1,container.clientWidth),Math.max(1,container.clientHeight));camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();draw()}
 function verify(){
  const saved={pattern:uniforms.a2Pattern.value,medium:uniforms.a2Medium.value,wall:uniforms.a2Occluder.value,mode:uniforms.a2Mode.value,thickness:glass.thickness,roughness:glass.roughness,ior:glass.ior,x:camera.position.x,angle:pane.rotation.y,aspect:camera.aspect}
  const width=192,height=128,target=new THREE.WebGLRenderTarget(width,height,{type:THREE.FloatType})
  const read=(mode:number)=>{uniforms.a2Mode.value=mode;render(target);const pixels=new Float32Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);const gl=renderer.getContext();if(gl.getError()!==gl.NO_ERROR)throw Error('A2 float readback failed');return pixels}
  const compare=(a:Float32Array,b:Float32Array)=>{const values:number[]=[];let nonFinite=0;for(let i=0;i<a.length;i++){if(i%4===3)continue;const d=Math.abs(a[i]-b[i]);if(Number.isFinite(d))values.push(d);else nonFinite++}values.sort((a,b)=>a-b);return {max:values[values.length-1],p95:values[Math.floor(values.length*.95)],nonFinite,scope:'Whole framebuffer RGB, including unchanged background'}}
  try{
   camera.aspect=width/height;camera.updateProjectionMatrix();glass.ior=1.5;glass.roughness=0
   const rows=[]
   for(const fixture of [{name:'vacuum',pattern:false,fog:false,t:0,x:0,wall:false},{name:'zero-thickness',pattern:false,fog:true,t:0,x:0,wall:false},{name:'thick',fog:true,t:4,x:0,wall:false},{name:'occluder',fog:true,t:8,x:0,wall:true},{name:'camera',fog:true,t:4,x:5,wall:false},{name:'rough',fog:true,t:4,x:0,wall:false,rough:0.5},{name:'offscreen',fog:true,t:18,x:0,wall:false,angle:85,ior:2.4},{name:'thick-flat',pattern:false,fog:true,t:4,x:0,wall:false}]){
    uniforms.a2Pattern.value=fixture.pattern??true;uniforms.a2Medium.value=fixture.fog;uniforms.a2Occluder.value=fixture.wall;glass.thickness=fixture.t;camera.position.x=fixture.x;glass.roughness=fixture.rough??0;glass.ior=fixture.ior??1.5;pane.rotation.y=THREE.MathUtils.degToRad(fixture.angle??0)
    const native=read(0),path=read(1),double=read(2),validity=read(3);let outside=0,occluded=0,unsupported=0,valid=0
    for(let i=0;i<validity.length;i+=4){const r=validity[i],g=validity[i+1],b=validity[i+2];if(r>.9&&b>.9&&g<.05)outside++;else if(r>.9&&g>.9&&b<.05)unsupported++;else if(r>.9&&g>.1&&g<.3&&b<.05)occluded++;else if(r<.05&&g>.6&&b<.3)valid++}
    rows.push({...fixture,comparisonKind:fixture.rough?'Unsupported marker, not a radiance reference':'Smooth path versus native',nativeToPath:compare(native,path),duplicateToNative:compare(double,native),outside,occluded,unsupported,valid})
   }
   validation={rows,passed:rows.every(r=>r.nativeToPath.nonFinite===0&&r.duplicateToNative.nonFinite===0)&&rows[0].duplicateToNative.max<1e-6&&rows[0].nativeToPath.max<0.002&&rows[1].nativeToPath.max<0.002&&rows[1].duplicateToNative.max>0.02&&rows[3].occluded>0&&rows[5].unsupported>0&&rows.slice(0,3).every(r=>r.valid>0&&r.unsupported===0)&&rows[6].outside>0&&rows[7].nativeToPath.max>0.005,scope:'Execution and negative controls; differences measured, not accepted'};return validation
  }finally{target.dispose();uniforms.a2Pattern.value=saved.pattern;uniforms.a2Medium.value=saved.medium;uniforms.a2Occluder.value=saved.wall;uniforms.a2Mode.value=saved.mode;glass.thickness=saved.thickness;glass.roughness=saved.roughness;glass.ior=saved.ior;camera.position.x=saved.x;pane.rotation.y=saved.angle;camera.aspect=saved.aspect;camera.updateProjectionMatrix();draw()}
 }
 control<HTMLSelectElement>('mode').onchange=e=>{uniforms.a2Mode.value=Number((e.target as HTMLSelectElement).value);draw()}
 for(const property of ['thickness','ior','roughness'] as const)control<HTMLInputElement>(property).oninput=e=>{glass[property]=Number((e.target as HTMLInputElement).value);draw()}
 control<HTMLInputElement>('angle').oninput=e=>{pane.rotation.y=THREE.MathUtils.degToRad(Number((e.target as HTMLInputElement).value));draw()}
 control<HTMLInputElement>('camera').oninput=e=>{camera.position.x=Number((e.target as HTMLInputElement).value);draw()}
 control<HTMLInputElement>('medium').onchange=e=>{uniforms.a2Medium.value=(e.target as HTMLInputElement).checked;draw()};control<HTMLInputElement>('wall').onchange=e=>{uniforms.a2Occluder.value=(e.target as HTMLInputElement).checked;draw()};control('verify').onclick=()=>{verify()}
 // Fixture cost only: the reference still pays for Three.js native snapshot generation.
 async function benchmark(samples=32){
  const gl=renderer.getContext() as WebGL2RenderingContext,extension=gl.getExtension('EXT_disjoint_timer_query_webgl2')
  if(!extension)return {available:false,reason:'GPU timer unavailable'}
  const originalMaterial=glass.clone(),savedMode=uniforms.a2Mode.value
  const blocks:Array<{mode:string,cpuMs:number[],gpuMs:number[],draws:number}>=[]
  panel.style.pointerEvents='none'
  const tick=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
  try{
   for(const mode of ['baseline','path','path','baseline','path','baseline','baseline','path']){
    pane.material=mode==='baseline'?originalMaterial:glass;uniforms.a2Mode.value=mode==='baseline'?0:1
    for(let i=0;i<16;i++){render();await tick()}
    const cpuMs:number[]=[],gpuMs:number[]=[]
    for(let i=0;i<samples;i++){
     const query=gl.createQuery()!;gl.beginQuery(extension.TIME_ELAPSED_EXT,query)
     const start=performance.now();render();cpuMs.push(performance.now()-start);gl.endQuery(extension.TIME_ELAPSED_EXT)
     try{while(!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){await tick();if(disposed)throw Error('Disposed during benchmark')}
      if(gl.getParameter(extension.GPU_DISJOINT_EXT))throw Error('GPU timing disjoint')
      gpuMs.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6)
     }finally{gl.deleteQuery(query)}
    }
    blocks.push({mode,cpuMs,gpuMs,draws:renderer.info.render.calls})
   }
   const debug=gl.getExtension('WEBGL_debug_renderer_info')
   return {available:true,blocks,environment:{gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),browser:navigator.userAgent},state:report(),scope:'Analytic slabs, native snapshot retained in both paths; not real-cloud performance acceptance'}
  }finally{pane.material=glass;originalMaterial.dispose();uniforms.a2Mode.value=savedMode;panel.style.pointerEvents='';draw()}
 }
 const dispose=()=>{if(disposed)return;disposed=true;window.removeEventListener('resize',resize);window.removeEventListener('pagehide',dispose);geometry.dispose();backdrop.material.dispose();pane.geometry.dispose();glass.dispose();renderer.dispose();renderer.domElement.remove();panel.remove()}
 window.addEventListener('resize',resize);window.addEventListener('pagehide',dispose,{once:true});Object.assign(window,{refractionMedium:{report,verify,benchmark,dispose}});resize()
}
