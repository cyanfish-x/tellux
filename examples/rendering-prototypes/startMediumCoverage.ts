import * as THREE from 'three'
import { mediumIntegralGLSL } from './mediumIntegral'
import { coverageBoundaries } from './mediumCoverage'

const vertexShader = 'in vec3 position; out vec2 vUv; void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,0.,1.);}'
const common = `
precision highp float;
precision highp int;
in vec2 vUv;
uniform vec2 fullSize, lowSize;
uniform int scenario;
uniform float generationShift, queryShift;
const float domainEnd = 16000.0;
const float edges[5] = float[5](0.0, 2000.0, 5000.0, 8000.0, 16000.0);
${mediumIntegralGLSL}
float sceneDepth(vec2 uv, float shift) {
  if (scenario == 4) return 20000.0;
  if (scenario == 0) {
    float pole = (floor(fullSize.x * 0.53 / 4.0) * 4.0 + 2.0) / fullSize.x + shift;
    return abs(uv.x - pole) < 1.0 / fullSize.x && uv.y < 0.85 ? 1800.0 : domainEnd;
  }
  if (scenario == 1 || scenario == 3) return uv.x < 0.43 + shift && uv.y < 0.82 ? 3200.0 : domainEnd;
  return uv.y < 0.47 + shift ? 3600.0 + 7000.0 * (0.47 + shift - uv.y) : domainEnd;
}
void coefficients(vec2 uv, int interval, out vec3 sigma, out vec3 source) {
  float cloud = interval == 1 || interval == 2 ? 0.00028 * (0.7 + 0.25 * sin(uv.x * 9.0) * cos(uv.y * 7.0)) : 0.0;
  sigma = vec3(0.000025, 0.00004, 0.000065) + cloud;
  source = vec3(0.000018, 0.00003, 0.000052) + cloud * vec3(0.72, 0.76, 0.83);
}
void exactMedium(vec2 uv, float depth, out vec3 T, out vec3 S) {
  T = vec3(1.0); S = vec3(0.0);
  for (int interval = 0; interval < 4; interval++) {
    float length = clamp(depth - edges[interval], 0.0, edges[interval + 1] - edges[interval]);
    vec3 sigma, source; coefficients(uv, interval, sigma, source);
    a1Accumulate(sigma, source, length, T, S);
  }
}
vec3 surfaceColor(vec2 uv, float depth) {
  if (depth >= domainEnd) return vec3(0.035, 0.09, 0.17);
  return mix(vec3(0.64, 0.22, 0.055), vec3(0.92, 0.78, 0.48), step(0.5, fract(uv.y * 16.0)));
}
`
const generationShader = common + `
uniform int clipping;
layout(location=0) out vec4 s0; layout(location=1) out vec4 t0;
layout(location=2) out vec4 s1; layout(location=3) out vec4 t1;
layout(location=4) out vec4 s2; layout(location=5) out vec4 t2;
layout(location=6) out vec4 s3; layout(location=7) out vec4 t3;
void main() {
  float limit = domainEnd;
  if (clipping == 1) limit = sceneDepth(vUv, generationShift);
  if (clipping == 2) {
    limit = 0.0;
    vec2 cell = floor(gl_FragCoord.xy);
    ivec2 first = max(ivec2(0), ivec2(floor((cell - 0.5) * fullSize / lowSize)) - 1);
    ivec2 last = min(ivec2(fullSize) - 1, ivec2(ceil((cell + 1.5) * fullSize / lowSize)) + 1);
    for (int y = 0; y < 12; y++) for (int x = 0; x < 12; x++) {
      ivec2 pixel = first + ivec2(x, y);
      if (any(greaterThan(pixel, last))) continue;
      limit = max(limit, sceneDepth((vec2(pixel) + 0.5) / fullSize, generationShift));
    }
  }
  vec4 scattering[4], transmittance[4];
  for (int interval = 0; interval < 4; interval++) {
    float length = clamp(limit - edges[interval], 0.0, edges[interval + 1] - edges[interval]);
    vec3 sigma, source, T = vec3(1.0), S = vec3(0.0); coefficients(vUv, interval, sigma, source);
    a1Accumulate(sigma, source, length, T, S);
    scattering[interval] = vec4(S, limit); transmittance[interval] = vec4(T, length);
  }
  s0=scattering[0];t0=transmittance[0];s1=scattering[1];t1=transmittance[1];
  s2=scattering[2];t2=transmittance[2];s3=scattering[3];t3=transmittance[3];
}
`
const resolveShader = common + `
uniform sampler2D s0, t0, s1, t1, s2, t2, s3, t3;
uniform int mode, display;
uniform bool diagnosticAlpha;
layout(location=0) out vec4 color;
vec4 getS(int interval, ivec2 pixel) { if(interval==0)return texelFetch(s0,pixel,0);if(interval==1)return texelFetch(s1,pixel,0);if(interval==2)return texelFetch(s2,pixel,0);return texelFetch(s3,pixel,0); }
vec4 getT(int interval, ivec2 pixel) { if(interval==0)return texelFetch(t0,pixel,0);if(interval==1)return texelFetch(t1,pixel,0);if(interval==2)return texelFetch(t2,pixel,0);return texelFetch(t3,pixel,0); }
void queryCell(ivec2 pixel, float depth, out vec3 T, out vec3 S) {
  T=vec3(1.0); S=vec3(0.0);
  for(int interval=0;interval<4;interval++) {
    vec4 storedS=getS(interval,pixel), storedT=getT(interval,pixel);
    float length=storedT.a;
    float fraction=length>0.0?clamp((depth-edges[interval])/length,0.0,1.0):0.0;
    vec3 partT=pow(clamp(storedT.rgb,vec3(1e-30),vec3(1.0)),vec3(fraction));
    vec3 ratio=(vec3(1.0)-partT)/max(vec3(1e-7),vec3(1.0)-storedT.rgb);
    ratio=mix(ratio,vec3(fraction),greaterThan(storedT.rgb,vec3(0.99999)));
    S+=T*storedS.rgb*ratio;T*=partT;
  }
}
void main() {
  float depth=sceneDepth(vUv,queryShift), invalid=0.0;
  if(depth>domainEnd || depth<0.0){color=vec4(1.0,0.0,1.0,1.0);return;}
  vec3 T,S;
  if(mode==0) exactMedium(vUv,depth,T,S);
  else {
    vec2 coordinate=vUv*lowSize-0.5, fraction=fract(coordinate);
    ivec2 first=ivec2(floor(coordinate));
    T=vec3(0.0);S=vec3(0.0);float weightSum=0.0;
    for(int y=0;y<2;y++)for(int x=0;x<2;x++) {
      ivec2 pixel=clamp(first+ivec2(x,y),ivec2(0),ivec2(lowSize)-1);
      float weight=(x==0?1.0-fraction.x:fraction.x)*(y==0?1.0-fraction.y:fraction.y);
      bool valid=depth<=getS(0,pixel).a+0.001;
      if(!valid) invalid+=weight;
      if(!valid && (mode==3 || mode==4)) continue;
      vec3 cellT,cellS;queryCell(pixel,depth,cellT,cellS);
      T+=weight*cellT;S+=weight*cellS;weightSum+=weight;
    }
    if(invalid>1e-6 && (mode==3 || mode==4)) exactMedium(vUv,depth,T,S);
    else if(weightSum>0.0){T/=weightSum;S/=weightSum;}
    else exactMedium(vUv,depth,T,S); // Explicit regeneration fallback; never assume vacuum.
  }
  vec3 result=S+T*surfaceColor(vUv,depth);
  if(display==1) result=mix(vec3(0.05,0.18,0.12),vec3(1.0,0.1,0.03),invalid);
  color=vec4(result,diagnosticAlpha ? invalid : 1.0);
}
`

/** A3 合成介质有效域实验；不代表真实云、透视重投影或折射已验收。 A3 synthetic medium validity experiment, not acceptance of real clouds, perspective reprojection or refraction. */
export function startMediumCoverage(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
  const gl = renderer.getContext() as WebGL2RenderingContext
  if (!renderer.extensions.has('EXT_color_buffer_float') || gl.getParameter(gl.MAX_DRAW_BUFFERS) < 8) { renderer.dispose(); throw new Error('A3 requires eight float MRT attachments') }
  renderer.setPixelRatio(window.devicePixelRatio); container.append(renderer.domElement)
  const shared = { fullSize: { value: new THREE.Vector2() }, lowSize: { value: new THREE.Vector2() }, scenario: { value: 0 }, generationShift: { value: 0 }, queryShift: { value: 0 } }
  const generation = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader: generationShader, uniforms: { ...shared, clipping: { value: 0 } }, depthTest: false, depthWrite: false })
  const resolved = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader: resolveShader, uniforms: { ...shared, mode: { value: 0 }, display: { value: 0 }, diagnosticAlpha: { value: false }, ...Object.fromEntries(['s0','t0','s1','t1','s2','t2','s3','t3'].map(name => [name, { value: null }])) }, depthTest: false, depthWrite: false })
  const geometry = new THREE.PlaneGeometry(2, 2), scene = new THREE.Scene(), camera = new THREE.Camera()
  const quad = new THREE.Mesh(geometry, generation); quad.frustumCulled = false; scene.add(quad)
  const low = new THREE.WebGLRenderTarget(1, 1, { count: 8, type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
  let shaderError: string | null = null, validation: unknown = null, disposed = false, currentMode = 3, scale = 4
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => { shaderError = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n') }
  const panel = document.createElement('aside')
  panel.style.cssText = 'position:absolute;right:12px;top:12px;width:min(340px,42vw);padding:16px;color:white;background:#102335ed;font:13px/1.6 sans-serif;z-index:20;max-height:90vh;overflow:auto'
  panel.innerHTML = `<strong>A3 · 低分辨率介质有效域</strong><p>四个解析介质区间 / 0–16 km。检查生成范围与查询足迹，不是真实云性能验收。</p><p><select id="a3-case"><option value="0">细柱 / Thin pole</option><option value="1">墙边 / Wall edge</option><option value="2">地平线 / Horizon</option><option value="3">遮挡显露 / Disocclusion</option><option value="4">域外查询 / Out of domain</option></select></p><p><select id="a3-mode"><option value="0">全分辨率解析参考</option><option value="1">低分辨率完整区间</option><option value="2">错误：代表深度截断</option><option value="3" selected>保守足迹 + 有效域</option><option value="4">历史检查 + 缺失重算</option><option value="5">错误：无效历史当真空</option></select></p><p><label>降采样 <select id="a3-scale"><option value="2">2×</option><option value="4" selected>4×</option></select></label> <label><input id="a3-valid" type="checkbox">无效查询</label></p><button id="a3-verify">运行 GPU 对照</button><pre id="a3-status" style="white-space:pre-wrap"></pre>`
  container.append(panel)
  const control = <T extends HTMLElement>(name: string) => panel.querySelector<T>(`#a3-${name}`)!
  function dimensions(width: number, height: number) {
    shared.fullSize.value.set(width,height); shared.lowSize.value.set(Math.ceil(width/scale),Math.ceil(height/scale))
    low.setSize(shared.lowSize.value.x,shared.lowSize.value.y)
    low.textures.forEach((texture,i)=> { resolved.uniforms[['s0','t0','s1','t1','s2','t2','s3','t3'][i]].value=texture })
  }
  function render(mode: number, target: THREE.WebGLRenderTarget | null) {
    generation.uniforms.clipping.value = mode===2 || mode===4 || mode===5 ? 1 : mode===3 ? 2 : 0
    shared.generationShift.value = 0
    shared.queryShift.value = shared.scenario.value===3 ? -0.14 : 0
    // Current conservative coverage follows the newly visible depth; history modes keep the old footprint.
    if(mode===3) shared.generationShift.value=shared.queryShift.value
    quad.material=generation;renderer.setRenderTarget(low);renderer.render(scene,camera)
    resolved.uniforms.diagnosticAlpha.value=target!==null;resolved.uniforms.mode.value=mode;quad.material=resolved;renderer.setRenderTarget(target);renderer.render(scene,camera)
    const gl=renderer.getContext();const error=gl.getError()
    if(shaderError || error!==gl.NO_ERROR) throw new Error(shaderError ?? `A3 GL error ${error}`)
  }
  function report() { return { ready: !shaderError && !disposed, shaderError, mode:currentMode, scenario:shared.scenario.value, scale, dpr:renderer.getPixelRatio(), framebuffer:shared.fullSize.value.toArray(), lowResolution:shared.lowSize.value.toArray(), intervals:coverageBoundaries, bytes:low.width*low.height*8*16, validation, scope:'Synthetic homogeneous intervals; camera-relative depth in meters; no shifted/refraction queries' } }
  function draw() { if(disposed)return; render(currentMode,null);control('status').textContent=JSON.stringify(report(),null,2) }
  function resize() { const width=Math.max(1,container.clientWidth),height=Math.max(1,container.clientHeight);renderer.setPixelRatio(window.devicePixelRatio);renderer.setSize(width,height);const physical=renderer.getDrawingBufferSize(new THREE.Vector2());dimensions(physical.x,physical.y);draw() }
  function verify(width = 256, height = 144) {
    const saved={ width:shared.fullSize.value.x,height:shared.fullSize.value.y,scenario:shared.scenario.value,display:resolved.uniforms.display.value }
    const target=new THREE.WebGLRenderTarget(width,height,{type:THREE.FloatType,depthBuffer:false})
    const read=(mode:number)=>{render(mode,target);const pixels=new Float32Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);const gl=renderer.getContext();if(gl.getError()!==gl.NO_ERROR)throw Error('A3 float readback failed');return pixels}
    const compare=(a:Float32Array,b:Float32Array)=>{const differences:number[]=[];let invalidPixels=0,nonFinite=0;for(let i=0;i<a.length;i++){if(i%4===3){if(!Number.isFinite(a[i]))nonFinite++;if(a[i]>1e-6)invalidPixels++;continue}const d=Math.abs(a[i]-b[i]);if(Number.isFinite(d))differences.push(d);else nonFinite++}differences.sort((a,b)=>a-b);return {max:differences[differences.length-1],p95:differences[Math.floor(differences.length*.95)],invalidPixels,nonFinite}}
    try {
      dimensions(width,height);resolved.uniforms.display.value=0
      const rows=[]
      for(let scenario=0;scenario<5;scenario++) { shared.scenario.value=scenario;const reference=read(0),complete=read(1)
        rows.push({scenario,complete:compare(complete,reference),naive:compare(read(2),complete),conservative:compare(read(3),complete),history:compare(read(4),complete),badHistory:compare(read(5),complete)})
      }
      validation={resolution:[width,height],rows,passed:rows.every(row=>Object.values(row).every(value=>typeof value==='number'||value.nonFinite===0)) && rows.slice(0,4).every(row=>row.complete.max<0.01 && row.conservative.max<0.001 && row.conservative.invalidPixels===0 && row.history.max<0.01 && row.history.nonFinite===0) && rows.some(row=>row.naive.max>0.05) && rows[3].badHistory.max>0.05 && rows[4].conservative.invalidPixels===width*height && rows[4].history.invalidPixels===width*height,scope:'Validity and partial-interval contract only; no real-cloud or performance acceptance'}
      return validation
    } finally { target.dispose();shared.scenario.value=saved.scenario;resolved.uniforms.display.value=saved.display;dimensions(saved.width,saved.height);draw() }
  }
  control<HTMLSelectElement>('case').onchange=e=>{shared.scenario.value=Number((e.target as HTMLSelectElement).value);draw()}
  control<HTMLSelectElement>('mode').onchange=e=>{currentMode=Number((e.target as HTMLSelectElement).value);draw()}
  control<HTMLSelectElement>('scale').onchange=e=>{scale=Number((e.target as HTMLSelectElement).value);resize()}
  control<HTMLInputElement>('valid').onchange=e=>{resolved.uniforms.display.value=(e.target as HTMLInputElement).checked?1:0;draw()}
  control('verify').onclick=()=>{try{verify()}catch(error){control('status').textContent=String(error)}}
  const dispose=()=>{if(disposed)return;disposed=true;window.removeEventListener('resize',resize);window.removeEventListener('pagehide',dispose);low.dispose();geometry.dispose();generation.dispose();resolved.dispose();renderer.dispose();renderer.domElement.remove();panel.remove()}
  window.addEventListener('resize',resize);window.addEventListener('pagehide',dispose,{once:true})
  Object.assign(window,{mediumCoverage:{report,verify,dispose}});resize()
}
