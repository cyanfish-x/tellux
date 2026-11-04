// Existing supported backend, symbols and point-cloud entry checks, including production runner bindings.
import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const base=process.argv[2]??'http://127.0.0.1:5177',out=resolve(process.argv[3]??'artifacts/stage3-compat')
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const report=[]
try {
  const selected=process.argv.find(s=>s.startsWith('--id='))?.slice(5)
  for(const hosted of [false,true])for(const id of selected?selected.split(','):['webgpu-basic','symbol','point-cloud-3d-tiles']) {
    const page=await browser.newPage({viewport:{width:1100,height:720}}),errors=[],resources=[],name=`${hosted?'sandcastle':'standalone'}-${id}`
    page.on('pageerror',e=>errors.push(String(e)))
    page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())})
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))resources.push({url:r.url().split('?')[0],status:r.status()})})
    try {
      await page.goto(hosted?`${base}/sandcastle.html?example=${id}`:`${base}/${id}.html`)
      let frame=page.mainFrame()
      if(hosted){await page.waitForSelector('iframe[src*="runner.html"]',{timeout:60000});frame=await(await page.$('iframe[src*="runner.html"]')).contentFrame()}
      await frame.waitForFunction(()=>!!window.viewer?.renderer?.raw,null,{timeout:90000})
      await frame.evaluate(()=>{window.viewer.clock.shouldAnimate=false;window.viewer.scene.clouds.show=false;window.compatDeviceErrors=[];window.viewer.renderer.raw.backend?.device?.addEventListener('uncapturederror',e=>window.compatDeviceErrors.push(e.error.message))})
      await page.waitForTimeout(12000)
      if(id==='point-cloud-3d-tiles')await frame.waitForFunction(()=>{
        let loaded=false
        window.viewer.scene.raw.traverse(o=>{if(o.isPoints&&o.geometry.hasAttribute('aPointSize'))loaded=true})
        return loaded
      },null,{timeout:90000})
      const depthStates=[]
      if(process.argv.includes('--depth-states')) {
        for(const atmosphere of [false,true])for(const mode of ['sorted','weighted-oit']) {
          const state=await frame.evaluate(async({atmosphere,mode})=>{
            const v=window.viewer,r=v.renderer.raw
            v.scene.atmosphere.show=atmosphere
            v.entityRenderManager.setRequestedMode(mode)
            for(let i=0;i<4;i++)await new Promise(requestAnimationFrame)
            return {atmosphere,mode,glError:r.getContext().getError()}
          },{atmosphere,mode})
          depthStates.push(state)
          if(mode==='weighted-oit')await page.screenshot({path:resolve(out,`${name}-atmosphere-${atmosphere}.png`)})
        }
      }
      const state=await frame.evaluate(()=>{
        const v=window.viewer,r=v.renderer.raw,objects={meshes:0,points:0,styledPoints:0,transparent:0}
        v.scene.raw.traverse(o=>{if(o.isMesh)objects.meshes++;if(o.isPoints){objects.points++;if(o.geometry.hasAttribute('aPointSize'))objects.styledPoints++}if(o.material?.transparent)objects.transparent++})
        return {objects,backend:r.isWebGPURenderer?'webgpu':'webgl',glError:r.isWebGLRenderer?r.getContext().getError():null,deviceErrors:window.compatDeviceErrors,text:document.body.innerText.slice(-1200),width:r.domElement.width,height:r.domElement.height}
      })
      await page.screenshot({path:resolve(out,`${name}.png`)})
      report.push({name,...state,depthStates,errors,resources})
      console.log(JSON.stringify({name,...state,depthStates,errors,resources}))
    }catch(e){report.push({name,error:String(e),errors,resources});console.error(name,e)}
    await page.close();await writeFile(resolve(out,'compat.json'),JSON.stringify(report,null,2))
  }
}finally{await browser.close()}
if(report.some(r=>r.error||r.errors.length||r.deviceErrors?.length||r.glError||r.depthStates?.some(s=>s.glError)||r.resources.length))process.exitCode=1
