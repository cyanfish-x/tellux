import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
const base=process.argv[2]??'http://localhost:5173',directory=resolve(process.argv[3]??'artifacts/a2-refraction');await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const reports=[];
try{for(const sandbox of [false,true]){
 const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${base}/${sandbox?'sandcastle.html?example=rendering-refraction-medium':'rendering-refraction-medium.html'}`);let surface=page;
 if(sandbox){for(let i=0;i<60;i++){surface=page.frames().find(f=>f.url().includes('/sandcastle/runner.html'));if(surface)break;await page.waitForTimeout(250)}}
 await surface.waitForFunction(()=>window.refractionMedium,undefined,{timeout:30000});
 let result;try{result=await surface.evaluate(()=>window.refractionMedium.verify())}catch(e){throw Error(`${e}\n${JSON.stringify(errors)}`)}
 const report=await surface.evaluate(()=>window.refractionMedium.report());reports.push({sandbox,report,errors});await writeFile(resolve(directory,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({sandbox,result}));
 for(const mode of ['0','1','2','3']){await surface.locator('#a2-mode').selectOption(mode);await page.screenshot({path:resolve(directory,`mode-${mode}-${sandbox}.png`)})}
 if(!result.passed||report.shaderError||errors.length)throw Error('A2 execution/negative-control check failed');await page.close();
}await writeFile(resolve(directory,'verification.json'),JSON.stringify({passed:true,entries:reports.length,scope:'Analytic media fixture, not full A2 acceptance'},null,2));}finally{await browser.close()}
