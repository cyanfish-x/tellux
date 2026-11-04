// Full Viewer frame cost and presentation cadence. Keep streaming, update and render work enabled.
import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const base=process.argv[2]??'http://127.0.0.1:5176',out=resolve(process.argv[3]??'artifacts/pipeline-fps')
const id=process.argv.find(arg=>arg.startsWith('--id='))?.slice(5)??'gaussian-splat-3d-tiles'
const clouds=process.argv.includes('--clouds'),hosted=process.argv.includes('--sandcastle')
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),errors=[],resources=[]
 page.on('pageerror',error=>errors.push(String(error)))
 page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404'))errors.push(message.text())})
 page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))resources.push({url:response.url().split('?')[0],status:response.status()})})
 await page.goto(hosted?`${base}/sandcastle.html?example=${id}`:`${base}/${id}.html`)
 let frame=page.mainFrame()
 if(hosted){await page.waitForSelector('iframe[src*="runner.html"]');frame=await(await page.$('iframe[src*="runner.html"]')).contentFrame()}
 await frame.waitForFunction(()=>!!window.viewer?.atmosphere?.aerialPerspectiveEffect.scatteringTexture,null,{timeout:90000})
 if(await frame.$('#prototype-mode'))await frame.selectOption('#prototype-mode','baseline')
 await frame.evaluate(({clouds,id})=>{const v=window.viewer;v.clock.shouldAnimate=false;v.clock.currentTime=new Date(id.startsWith('rendering-')?'2026-09-12T12:00:00Z':'2026-09-12T02:00:00Z');v.scene.clouds.show=clouds},{clouds,id})
 if(id==='gaussian-splat-3d-tiles')await frame.waitForFunction(()=>/可见瓦片：[1-9]\d*|Visible tiles: [1-9]\d*/.test(document.body.innerText)&&!window.viewer.camera.isFlying,null,{timeout:90000})
 const mixedFixture=process.argv.includes('--mixed')?await frame.evaluate(async()=>{
  const {installMixedTransparencyFixture}=await import('/rendering-prototypes/installMixedTransparencyFixture.ts')
  return installMixedTransparencyFixture(window.viewer)
 }):null
 const horizonFixture=process.argv.includes('--horizon')?await frame.evaluate(async()=>{
  const {installHorizonFixture}=await import('/rendering-prototypes/installMixedTransparencyFixture.ts')
  return installHorizonFixture(window.viewer)
 }):null
 await page.waitForTimeout(8000)
 const report=await frame.evaluate(async()=>{
  const v=window.viewer,r=v.renderer.raw,gl=r.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const debug=gl.getExtension('WEBGL_debug_renderer_info'),original=v.renderFrame,samples=[]
  let resolveDone;const done=new Promise(resolve=>resolveDone=resolve)
  v.renderFrame=function(delta,time){
   const query=timer?gl.createQuery():null
   if(query)gl.beginQuery(timer.TIME_ELAPSED_EXT,query)
   const start=performance.now()
   try{return original.call(this,delta,time)}finally{
    if(query)gl.endQuery(timer.TIME_ELAPSED_EXT)
    samples.push({time,cpu:performance.now()-start,query})
    if(samples.length===600){v.renderFrame=original;resolveDone()}
   }
  }
  try{
   await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('600 full frames timed out')),60000))])
   for(const sample of samples)if(sample.query){
    while(!gl.getQueryParameter(sample.query,gl.QUERY_RESULT_AVAILABLE))await new Promise(requestAnimationFrame)
    sample.gpu=gl.getParameter(timer.GPU_DISJOINT_EXT)?null:gl.getQueryParameter(sample.query,gl.QUERY_RESULT)/1e6
    gl.deleteQuery(sample.query);delete sample.query
   }
   const summarize=values=>{const sorted=values.filter(x=>x!=null).sort((a,b)=>a-b);return {p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)}}
   const intervals=samples.slice(1).map((sample,i)=>sample.time-samples[i].time)
   return {frames:samples.length,width:r.domElement.width,height:r.domElement.height,dpr:devicePixelRatio,
    renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
    fps:1000*(samples.length-1)/(samples.at(-1).time-samples[0].time),cadence:summarize(intervals),
    cpu:summarize(samples.map(s=>s.cpu)),gpu:summarize(samples.map(s=>s.gpu)),samples,
    cloudsQuality:v.scene.clouds.quality,glError:gl.getError(),camera:v.camera.getState(),
    mixedLayers:v.postProcessing.sceneSubmission.mixed.layers.length,
    text:document.body.innerText.slice(-1400)}
  }finally{v.renderFrame=original;for(const sample of samples)if(sample.query)gl.deleteQuery(sample.query)}
 })
 await page.screenshot({path:resolve(out,'scene.png')})
 await writeFile(resolve(out,'fps.json'),JSON.stringify({id,hosted,clouds,mixedFixture,horizonFixture,...report,errors,resources},null,2))
 const {samples,...summary}=report;console.log(JSON.stringify({id,hosted,clouds,...summary,errors,resources}))
 if(errors.length||resources.length||report.glError)process.exitCode=1
}finally{await browser.close()}
