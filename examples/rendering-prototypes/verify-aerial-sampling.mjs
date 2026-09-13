// Compare only the new aerial-perspective sampling choice. The fixed display tolerance is
// two 8-bit levels per channel; failures retain the per-fragment path rather than relaxing it.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const out = resolve(process.argv[3] ?? 'artifacts/stage1-sampling')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const rows = []
try {
  for(const id of ['rendering-stages','entities','gaussian-splat-3d-tiles']) {
    const page = await browser.newPage({ viewport:{width:1100,height:720} })
    const errors=[]
    page.on('pageerror', e=>errors.push(String(e)))
    page.on('console', m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())})
    await page.addInitScript(()=>{
      const native=requestAnimationFrame.bind(window)
      window.samplingFrame=()=>new Promise(native)
      window.requestAnimationFrame=callback=>native(time=>{if(!window.samplingPaused)callback(time)})
    })
    await page.goto(`${base}/${id}.html`)
    await page.waitForFunction(()=>!!window.viewer?.atmosphere?.aerialPerspectiveEffect.scatteringTexture,null,{timeout:90000})
    if(id==='rendering-stages')await page.selectOption('#prototype-mode','baseline')
    await page.evaluate(()=>{window.viewer.scene.clouds.show=false;window.viewer.clock.shouldAnimate=false})
    if(id==='gaussian-splat-3d-tiles')await page.waitForFunction(()=>/可见瓦片：[1-9]\d*|Visible tiles: [1-9]\d*/.test(document.body.innerText)&&!window.viewer.camera.isFlying,null,{timeout:90000})
    await page.waitForTimeout(7000)
    const result=await page.evaluate(async()=>{
      const viewer=window.viewer, manager=viewer.postProcessing, renderer=viewer.renderer.raw
      window.samplingPaused=true;viewer.useDefaultRenderLoop=false
      viewer.camera.cancelFlight();viewer.controls.adjustHeight=false;viewer.controls.enableDamping=false
      const sparks=[]
      viewer.scene.raw.traverse(o=>{
        if(o.material?.uniforms?.renderToViewQuat && o.display) {o.autoUpdate=false;sparks.push(o)}
      })
      // Pin only the already displayed splats for this shader-image comparison. This is NOT
      // the performance harness: normal motion/LOD/update costs remain enabled there.
      for(let i=0;i<30;i++)await window.samplingFrame()
      const gl=renderer.getContext()
      const render=()=>viewer.render(performance.now())
      const capture=()=>{
        render()
        const pixels=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4)
        gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels)
        return {pixels,image:renderer.domElement.toDataURL(),camera:viewer.camera.raw.matrixWorld.toArray(),splats:sparks.map(s=>s.activeSplats)}
      }
      const frames=[]
      for(const vertex of [false,true,false]) {
        manager.transparentAtmosphere.setSplatCenterSampling(vertex)
        for(let i=0;i<8;i++){await window.samplingFrame();render()}
        frames.push(capture())
      }
      const compare=(a,b)=>{
        let max=0,over=0,changed=0
        for(let i=0;i<a.length;i+=4){
          let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(a[i+c]-b[i+c]))
          max=Math.max(max,d);if(d>0)changed++;if(d>2)over++
        }
        return {max,over,changed}
      }
      const difference=compare(frames[0].pixels,frames[1].pixels)
      const repeat=compare(frames[0].pixels,frames[2].pixels)
      manager.transparentAtmosphere.setSplatCenterSampling(true)
      const normalRender=manager.opaqueNormalAdapter.render
      manager.opaqueNormalAdapter.render=(...args)=>{
        manager.sceneSubmission.hasPointNormalMask=true
        return normalRender(...args)
      }
      let normalReference
      try {
        for(let i=0;i<8;i++){await window.samplingFrame();render()}
        normalReference=capture()
      } finally {manager.opaqueNormalAdapter.render=normalRender}
      const normalDifference=compare(frames[1].pixels,normalReference.pixels)
      render()
      return {difference,repeat,normalDifference,states:frames.map(({camera,splats})=>({camera,splats})),images:frames.slice(0,2).map(f=>f.image),glError:gl.getError(),width:renderer.domElement.width,height:renderer.domElement.height}
    })
    for(const [i,img]of result.images.entries())await writeFile(resolve(out,`${id}-${i?'vertex':'fragment'}.png`),Buffer.from(img.split(',')[1],'base64'))
    delete result.images
    rows.push({id,...result,errors})
    console.log(JSON.stringify(rows.at(-1)))
    await page.close()
  }
}finally{await browser.close()}
await writeFile(resolve(out,'sampling.json'),JSON.stringify(rows,null,2))
if(rows.some(r=>r.glError||r.errors.length||r.difference.over||r.repeat.over||r.normalDifference.over))process.exitCode=1
