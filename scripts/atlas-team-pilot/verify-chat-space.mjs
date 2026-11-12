import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright');
const origin=`http://127.0.0.1:${process.env.ATLAS_UI_PORT||4363}`,output=new URL('../../.local/atlas-chat-space-20261028/',import.meta.url);
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.ATLAS_CHROME_PATH}),results=[],external=[],errors=[];
const layout=page=>page.evaluate(()=>{const box=document.querySelector('.atlas-team-box').getBoundingClientRect(),messages=document.querySelector('.atlas-team-messages').getBoundingClientRect();return {top:box.top,bottom:box.bottom,height:box.height,messages:messages.height,width:innerWidth,viewport:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};});
try{
 for(const [width,height] of [[1280,900],[390,844],[320,568]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(external.push(r.request().url()),r.abort()));
  await page.goto(origin+'/?queued=1&task-context=1');await page.getByRole('button',{name:'Oi, preciso de você',exact:false}).click();
  const input=page.getByLabel('Mensagem para o Atlas');await input.fill('Rascunho preservado.');const subject=page.locator('.atlas-team-subject'),summary=subject.locator('summary');
  assert.equal(await subject.getAttribute('open'),null);const normal=await layout(page);
  await summary.press('Enter');assert.notEqual(await subject.getAttribute('open'),null);await subject.getByText('Próxima revisão:',{exact:false}).waitFor();
  await summary.press('Enter');assert.equal(await subject.getAttribute('open'),null);
  await page.getByRole('button',{name:'Ampliar conversa',exact:true}).click();const expanded=await layout(page);
  assert.equal(expanded.top,12);assert.ok(expanded.bottom<=height-12+1);assert.ok(expanded.messages>normal.messages);assert.equal(expanded.overflow,false);assert.equal(await input.inputValue(),'Rascunho preservado.');
  await page.screenshot({path:new URL(`expanded-${width}.png`,output).pathname,fullPage:true});
  await page.setViewportSize({width,height:Math.max(360,height-200)});await page.waitForFunction(()=>document.querySelector('.atlas-team-box').getBoundingClientRect().bottom<=innerHeight-11);const resized=await layout(page);assert.ok(resized.bottom<=resized.viewport-12+1);assert.equal(resized.overflow,false);
  await page.getByRole('button',{name:'Reduzir conversa',exact:true}).click();assert.equal(await input.inputValue(),'Rascunho preservado.');await page.getByRole('button',{name:'Fechar conversa com Atlas'}).click();await page.getByRole('button',{name:'Conversar com Atlas',exact:false}).waitFor({state:'visible'});
  results.push({width,height,normal,expanded,resized});await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);writeFileSync(new URL('checks.json',output),JSON.stringify({results,errors,external},null,2));console.log(JSON.stringify({passed:true,viewports:results.length,results}));
}finally{await browser.close();}
