import * as THREE from 'three'
import type { ThreeEffectPass, ThreeRendererWithEffects } from '../../src/effects'
import { attachDepth, TransparentStage } from './TransparentStage'
import { withSubmissionState } from './withSubmissionState'
import { SceneSubmission } from '../../src/rendering/SceneSubmission'

type ContractPass = ThreeEffectPass & { needsSwap?: boolean; isRenderPass?: boolean }

/** 在独立小场景验证原生提交接缝；不替代 Viewer 性能与云遮挡验收。 Verify native submission seams in a small fixture, not Viewer/cloud acceptance. */
export function verifyStageSubmission(options: { dynamic?: boolean; transmission?: boolean } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, outputBufferType: THREE.HalfFloatType }) as ThreeRendererWithEffects
  renderer.setSize(320, 240)
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.info.autoReset = false
  const shaderErrors: string[] = []
  renderer.debug.onShaderError = gl => { shaderErrors.push('Shader compilation failed: ' + gl.getError()) }
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x15263b)
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 50)
  camera.position.z = 9
  const resources: Array<{ dispose(): void }> = []
  const material = (options: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(options); resources.push(m); return m
  }
  const opaque = material({ color: 0x20e080 })
  const alpha = material({ color: 0x20cfff, transparent: true, opacity: 0.6, depthWrite: false })
  const tex = new THREE.DataTexture(new Uint8Array([
    255,255,255,255, 255,255,255,0, 255,255,255,0, 255,255,255,255,
  ]), 2, 2)
  tex.needsUpdate = true; resources.push(tex)
  const cutout = material({ color: 0xff9050, map: tex, alphaTest: 0.5 })
  const hidden = material({ color: 0xff00ff, visible: false })
  const positions: number[] = [], normals: number[] = [], uvs: number[] = []
  const geometry = new THREE.BufferGeometry()
  for (const [i, x, y] of [[0,-1.3,0.6],[1,1.3,0.6],[2,0,-1.2],[3,0,1.8]]) {
    const start = positions.length / 3
    for (const [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]) {
      positions.push(x+(u-0.5)*1.8,y+(v-0.5)*1.5,0)
      normals.push(0,0,1); uvs.push(u,v)
    }
    geometry.addGroup(start, 6, i)
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals,3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2))
  resources.push(geometry)
  const mixed = new THREE.Mesh(geometry,[opaque,alpha,cutout,hidden])
  mixed.castShadow = true; mixed.name = 'mixed'; scene.add(mixed)
  const plane = new THREE.PlaneGeometry(1,1); resources.push(plane)
  const wallMaterial = material({ color: 0xffffff })
  const meshes: THREE.Mesh[] = [mixed]
  if (options.transmission) {
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 0.8, roughness: 0.15, thickness: 0.25, side: THREE.DoubleSide })
    const glassGeometry = new THREE.BoxGeometry(0.8, 2.5, 0.25)
    const mesh = new THREE.Mesh(glassGeometry, glass)
    mesh.position.set(2.4, 0, 0.5); mesh.name = 'transmission'
    resources.push(glass, glassGeometry); meshes.push(mesh); scene.add(mesh)
    alpha.side = THREE.DoubleSide
  }
  for (const x of [-1.3,1.3]) {
    const wall = new THREE.Mesh(plane,wallMaterial)
    wall.position.set(x,0.3,1); wall.scale.set(1,1,1); wall.castShadow=true
    wall.name = x<0?'wall-left':'wall-right'; scene.add(wall); meshes.push(wall)
  }
  const receiver = new THREE.Mesh(plane,material({ color:0x809080 }))
  receiver.position.z=-1.5; receiver.scale.set(7,5,1); receiver.receiveShadow=true
  receiver.name='receiver'; scene.add(receiver); meshes.push(receiver)
  const light = new THREE.DirectionalLight(0xffffff,3)
  light.position.set(3,4,7); light.castShadow=true
  light.shadow.mapSize.set(256,256)
  Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:0.1,far:30})
  light.shadow.camera.updateProjectionMatrix()
  light.layers.enable(30)
  const ambient = new THREE.AmbientLight(0xffffff,0.6); ambient.layers.enable(30)
  scene.add(light,light.target,ambient)
  const stage = new TransparentStage(scene,camera,()=>{})
  attachDepth(alpha,stage)
  const copyScene = new THREE.Scene(), copyCamera = new THREE.Camera()
  const copyMaterial = new THREE.ShaderMaterial({
    uniforms:{map:{value:null as THREE.Texture|null}},
    vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:'uniform sampler2D map;varying vec2 v;void main(){gl_FragColor=texture2D(map,v);}',
    depthTest:false,depthWrite:false,toneMapped:false,
  })
  const copyGeometry = new THREE.PlaneGeometry(2,2)
  copyScene.add(new THREE.Mesh(copyGeometry,copyMaterial))
  resources.push(copyGeometry,copyMaterial)
  let phase = 'native'
  const submission = new SceneSubmission(scene, camera)
  const submittedOpaque: ContractPass = {
    ...submission.opaque,
    render(r, write, read) {
      phase = 'opaque'
      submission.beginFrame()
      try { submission.opaque.render(r, write, read, 0, false) } finally { phase = 'native' }
    },
  }
  const submittedTransparent: ContractPass = {
    ...submission.transparent,
    render(r, write, read) {
      phase = 'transparent'
      try {
        submission.transparent.render(r, write, read, 0, false)
        this.needsSwap = submission.transparent.needsSwap
      } finally { submission.endFrame(); phase = 'native' }
    },
  }
  let before = 0, after = 0, shadows = 0
  let groups: Record<string,number> = {}
  let shadowGroups: Record<string,number> = {}
  scene.onBeforeRender=()=>{before++}; scene.onAfterRender=()=>{after++}
  for (const mesh of meshes) {
    mesh.onBeforeRender=(_r,_s,_c,_g,_m,group)=>{
      const key=mesh.name+':'+((group as unknown as { materialIndex?: number } | null)?.materialIndex??0)+':'+phase
      groups[key]=(groups[key]??0)+1
      if(options.dynamic && mesh===mixed && (group as unknown as {materialIndex:number})?.materialIndex===0) alpha.transparent=false
    }
    mesh.onBeforeShadow=()=>{
      shadows++
      const key=mesh.name+':'+phase
      shadowGroups[key]=(shadowGroups[key]??0)+1
    }
  }
  const identity: ContractPass = { needsSwap:false,setSize(){},dispose(){},render(){} }
  const copy: ContractPass = {
    setSize(){},dispose(){},
    render(r,write,read) {
      const auto=r.autoClear, target=r.getRenderTarget(), tone=r.toneMapping
      try {
        copyMaterial.uniforms.map.value=read.texture; r.autoClear=false; r.toneMapping=THREE.NoToneMapping
        r.setRenderTarget(write); r.render(copyScene,copyCamera)
      } finally {r.autoClear=auto;r.toneMapping=tone;r.setRenderTarget(target)}
    },
  }
  const first: ContractPass = {
    setSize(){},dispose(){},
    isRenderPass:true,needsSwap:false,
    render(r,_write,read) {
      const target=r.getRenderTarget(),tone=r.toneMapping
      try {
        phase='opaque'; r.setRenderTarget(read); r.toneMapping=THREE.NoToneMapping
        withSubmissionState(r,scene,camera,m=>!m.transparent,()=>r.render(scene,camera))
      } finally {phase='native';r.setRenderTarget(target);r.toneMapping=tone}
    },
  }
  const late: ContractPass = {
    setSize(){},dispose(){},
    needsSwap:false,
    render(r,write,read) {
      phase='transparent'
      try { withSubmissionState(r,scene,camera,m=>m.transparent,()=>stage.render(r,write,read)) }
      finally {phase='native'}
    },
  }
  const legacy: ContractPass = {
    setSize(){},dispose(){},
    needsSwap:false,
    render(r,write,read) {
      phase='transparent'
      try {stage.render(r,write,read)} finally {phase='native'}
    },
  }
  const gl=renderer.getContext()
  const results: Array<{
    mode:string; swap:boolean; before:number; after:number; shadows:number; groups:Record<string,number>;
    draws:number; pixels:Uint8Array; image:string; depthAvailable:boolean; restored:boolean; shadowGroups:Record<string,number>;
  }>=[]
  try {
    for(const swap of [false,true]) for(const mode of ['native','layer','groups','submission']) {
      // Even an inactive sampler must not keep the current framebuffer's depth attached.
      stage.depth.value=null
      stage.depthAvailable=false
      for(const mesh of meshes)mesh.layers.set(0)
      if(mode==='layer')mixed.layers.set(30)
      if(mode==='groups')for(const mesh of meshes)mesh.layers.enable(30)
      renderer.setEffects([
        mode==='submission'?submittedOpaque:mode==='groups'?first:identity,...(swap?[copy]:[]),
        ...(mode==='submission'?[submittedTransparent]:mode==='groups'?[late]:mode==='layer'?[legacy]:[]),
      ])
      alpha.transparent=true
      renderer.render(scene,camera)
      before=after=shadows=0;groups={};shadowGroups={};renderer.info.reset()
      alpha.transparent=true
      renderer.render(scene,camera)
      const pixels=new Uint8Array(320*240*4)
      gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,pixels)
      const glError=gl.getError()
      if(glError || shaderErrors.length)throw Error('Contract GPU failure: '+JSON.stringify({mode,swap,glError,shaderErrors}))
      results.push({
        mode,swap,before,after,shadows,groups:{...groups},shadowGroups:{...shadowGroups},draws:renderer.info.render.calls,pixels,
        image:renderer.domElement.toDataURL(),depthAvailable:stage.depthAvailable,
        restored:opaque.visible&&alpha.visible&&cutout.visible&&!hidden.visible&&scene.matrixWorldAutoUpdate&&camera.layers.mask===1&&renderer.shadowMap.autoUpdate,
      })
    }
    const comparisons=results.filter(r=>r.mode!=='native').map(row=>{
      const reference=results.find(r=>r.mode==='native'&&r.swap===row.swap)!
      let max=0,differentPixels=0
      for(let i=0;i<row.pixels.length;i+=4){
        let delta=0
        for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(row.pixels[i+c]-reference.pixels[i+c]))
        max=Math.max(max,delta);if(delta>1)differentPixels++
      }
      const colorCalls=Object.values(row.groups).reduce((sum,n)=>sum+n,0)
      const refColorCalls=Object.values(reference.groups).reduce((sum,n)=>sum+n,0)
      return {mode:row.mode,swap:row.swap,max,differentPixels,colorCalls,refColorCalls,
        callbacksMatch:row.before===reference.before&&row.after===reference.after,
        shadowsMatch:row.shadows===reference.shadows&&JSON.stringify(row.shadowGroups)===JSON.stringify(reference.shadowGroups),restored:row.restored}
    })
    const positive=comparisons.filter(r=>r.mode==='submission'||(!options.dynamic&&r.mode==='groups'))
    const negative=comparisons.filter(r=>r.mode==='layer')
    const passed=positive.every(r=>r.max<=1&&r.colorCalls===r.refColorCalls&&r.callbacksMatch&&r.shadowsMatch&&r.restored)
      &&negative.every(r=>r.differentPixels>100&&!r.callbacksMatch)
      &&(options.dynamic||options.transmission||results.filter(r=>r.mode==='groups').every(r=>r.depthAvailable&&r.groups['mixed:0:opaque']===1&&r.groups['mixed:1:transparent']===1))
    return {
      passed,width:320,height:240,comparisons,
      results:results.map(({pixels,...row})=>row),
      scope:'Small WebGL fixture: native material groups, alphaTest, opaque depth across swap, callbacks and shadows. Not Viewer performance, transmission or cloud acceptance.',
    }
  } finally {
    submission.dispose();stage.dispose();resources.forEach(r=>r.dispose());light.shadow.map?.dispose()
    renderer.dispose();renderer.forceContextLoss()
  }
}
