// Real-entry camera movement and highlight smoke checks; screenshots require visual review.
import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const base=process.argv[2]??'http://127.0.0.1:5176',out=resolve(process.argv[3]??'artifacts/stage3-motion')
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[]
try {
 for(const hosted of (process.argv.includes('--sandcastle-only')?[true]:process.argv.includes('--standalone-only')?[false]:[false,true]))for(const id of (process.argv.includes('--gaussian-only')?['gaussian-splat-3d-tiles']:['rendering-stages','gaussian-splat-3d-tiles'])) {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[],name=`${hosted?'sandcastle':'standalone'}-${id}`
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())})
  try {
   await page.goto(hosted?`${base}/sandcastle.html?example=${id}`:`${base}/${id}.html`)
   let frame=page.mainFrame()
   if(hosted){await page.waitForSelector('iframe[src*="runner.html"]');frame=await(await page.$('iframe[src*="runner.html"]')).contentFrame()}
   await frame.waitForFunction(()=>!!window.viewer?.atmosphere?.aerialPerspectiveEffect.scatteringTexture,null,{timeout:90000})
   if(id==='rendering-stages')await frame.selectOption('#prototype-mode','baseline')
   await frame.evaluate(()=>{const v=window.viewer;v.clock.shouldAnimate=false;v.clock.currentTime=new Date('2026-09-12T02:00:00Z');v.scene.clouds.show=false;v.controls.adjustHeight=false;v.controls.enableDamping=false})
   if(id==='gaussian-splat-3d-tiles')await frame.waitForFunction(()=>/可见瓦片：[1-9]\d*|Visible tiles: [1-9]\d*/.test(document.body.innerText)&&!window.viewer.camera.isFlying,null,{timeout:90000})
   await page.waitForTimeout(4000)
   if(process.argv.includes('--mixed')&&id==='gaussian-splat-3d-tiles')await frame.evaluate(async()=>{
    const {installMixedTransparencyFixture}=await import('/rendering-prototypes/installMixedTransparencyFixture.ts')
    return installMixedTransparencyFixture(window.viewer)
   })
   if(process.argv.includes('--native'))await frame.evaluate(()=>{
    const v=window.viewer,m=v.postProcessing,r=v.renderer.raw,render=v.render
    const native=m.activeEffects.map(p=>p===m.sceneSubmission.opaque
     ?{needsSwap:false,setSize(){},render(_r,_w,read){m.frame.publish(read)}}
     :p===m.sceneSubmission.transparent
     ?{needsSwap:false,setSize(){},render(r,_w,read){m.entityRenderer?.renderTransparency(r,read,m.frame.require('native reference').depth)}}
     :p===m.opaqueNormalAdapter?m.normalAdapter:p)
    v.render=function(...args){r.setEffects(native);v.atmosphere.aerialPerspectiveEffect.normalBuffer=m.normalTexture;return render.apply(this,args)}
   })
   await frame.evaluate(()=>{window.motionStart=window.viewer.camera.getState()})
   const states=[]
   for(const [label,heading,pitch] of [['start',0,0],['left',-12,4],['right',12,-4],['return',0,0]]) {
    const state=await frame.evaluate(async({heading,pitch})=>{
     const v=window.viewer,start=v.camera.getState(),end=window.motionStart
     for(let i=1;i<=45;i++) {
      const t=i/45
      v.camera.setView({destination:end.destination,orientation:{heading:start.orientation.heading+(end.orientation.heading+heading-start.orientation.heading)*t,pitch:start.orientation.pitch+(end.orientation.pitch+pitch-start.orientation.pitch)*t,roll:end.orientation.roll}})
      await new Promise(requestAnimationFrame)
     }
     return {camera:v.camera.getState(),glError:v.renderer.raw.getContext().getError()}
    },{heading,pitch})
    await page.waitForTimeout(500)
    await page.screenshot({path:resolve(out,`${name}-${label}.png`)})
    states.push({label,...state})
   }
   let highlighted=false
   if(id==='rendering-stages') {
    highlighted=await frame.evaluate(()=>{let target;window.viewer.scene.raw.traverse(o=>{if(o.isMesh&&o.material?.transparent&&o.material.opacity===.65)target=o});if(target){window.viewer.highlighter.set(target);return true}return false})
    await page.waitForTimeout(500);await page.screenshot({path:resolve(out,`${name}-highlight.png`)})
    await frame.evaluate(()=>window.viewer.highlighter.clear())
   }
   const sizes=[]
   for(const size of [{width:1600,height:900},{width:1920,height:1080}]){
    await page.setViewportSize(size);await page.waitForTimeout(500)
    sizes.push(await frame.evaluate(()=>{const r=window.viewer.renderer.raw;return {width:r.domElement.width,height:r.domElement.height,glError:r.getContext().getError()}}))
   }
   report.push({name,mixed:process.argv.includes('--mixed')&&id==='gaussian-splat-3d-tiles',nativeControl:process.argv.includes('--native'),states,sizes,highlighted,errors});console.log(JSON.stringify(report.at(-1)))
  }catch(e){report.push({name,error:String(e),errors});console.error(name,e)}
  await page.close();await writeFile(resolve(out,'motion.json'),JSON.stringify(report,null,2))
 }
}finally{await browser.close()}
if(report.some(r=>r.error||r.errors.length||r.states.some(s=>s.glError)||r.sizes.some(s=>s.glError)))process.exitCode=1
