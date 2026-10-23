import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';

const source=await readFile(new URL('../lib/deepseek.mjs',import.meta.url),'utf8');
const input={text:'明天中午十二点半送两份宫保鸡丁，少辣',menu:[{id:'chicken',name:'宫保鸡丁',minutes:15}],localNow:'2026-10-22T00:00',timeZone:'Asia/Shanghai'};
const expected={items:[{dishId:'chicken',name:'宫保鸡丁',quantity:2}],scheduledAt:'2026-10-23T12:30',location:'Fictional address',contact:'Test contact',preference:'少辣'};
const entry=`
export default {async fetch(request,env){try{const input=await request.json();return Response.json(await(input.kind==='menu'?extractMenu(input,env):extractOrder(input,env)));}catch(error){return Response.json({error:error.code},{status:error.status||500});}}};`;

async function runInWorker(outboundService,requestInput=input){
 const runtime=new Miniflare({compatibilityDate:'2026-05-15',modules:[
  {type:'ESModule',path:resolve('tests/worker-fixture/entry.mjs'),contents:`import {extractOrder} from '../../lib/deepseek.mjs';import {extractMenu} from '../../lib/menu-extraction.mjs';`+entry},
  ...await Promise.all(['lib/menu-extraction.mjs','public/menu-import.js','public/materials.js','public/commerce.js'].map(async path=>({type:'ESModule',path:resolve(path),contents:await readFile(resolve(path),'utf8')}))),
  {type:'ESModule',path:resolve('lib/deepseek.mjs'),contents:source},
  {type:'ESModule',path:resolve('public/menu-matching.js'),contents:await readFile(new URL('../public/menu-matching.js',import.meta.url),'utf8')},
  {type:'ESModule',path:resolve('public/delivery-slots.js'),contents:await readFile(new URL('../public/delivery-slots.js',import.meta.url),'utf8')}
 ],bindings:{DEEPSEEK_API_KEY:'test-only-not-a-real-key'},outboundService});
 try{const response=await runtime.dispatchFetch('http://worker.test/parse',{method:'POST',body:JSON.stringify(requestInput)});return {status:response.status,body:await response.json()};}finally{await runtime.dispose();}
}
test('actual workerd batch transport preserves two independent orders',async()=>{
 const batch={...input,batch:true,text:'A 宫保鸡丁两份12:20\n\nB 宫爆鸡丁一份23:50'};
 const result=await runInWorker(async request=>{
  const body=await request.json();assert.equal(body.max_tokens,16000);
  assert.ok(body.messages[0].content.includes('scheduledEndAt'));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({orders:[{...expected,customer:'A',scheduledAt:'2026-10-23T12:20',sourceText:'A 宫保鸡丁两份12:20'},{...expected,customer:'B',scheduledAt:'2026-10-23T23:50',location:'Other fictional address',contact:'Other test contact',sourceText:'B 宫爆鸡丁一份23:50',items:[{name:'宫保鸡丁',originalName:'宫爆鸡丁',quantity:1,matchType:'guessed'}]}]})}}]});
 },batch);
 assert.equal(result.status,200);assert.equal(result.body.orders.length,2);assert.equal(result.body.orders[0].customer,'A');assert.equal(result.body.orders[1].customer,'B');assert.equal(result.body.orders[1].items[0].matchType,'similar');assert.equal(result.body.orders[1].contact,'Other test contact');
 assert.equal(result.body.orders[0].scheduledAt,'2026-10-23T12:00');assert.equal(result.body.orders[0].scheduledEndAt,'2026-10-23T12:30');assert.equal(result.body.orders[1].scheduledAt,'2026-10-23T23:30');assert.equal(result.body.orders[1].scheduledEndAt,'2026-10-24T00:00');
});
test('actual workerd fetch reaches the provider stub and parses its result',async()=>{
 let calls=0,observed;
 const result=await runInWorker(async request=>{
  calls++;observed={url:request.url,authorization:request.headers.get('Authorization'),body:await request.json()};
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(expected)}}]});
 });
 assert.equal(calls,1);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(observed.url,'https://api.deepseek.com/chat/completions');assert.equal(observed.authorization,'Bearer test-only-not-a-real-key');assert.deepEqual(observed.body.response_format,{type:'json_object'});assert.equal(result.body.items[0].name,'宫保鸡丁');assert.equal(result.body.items[0].quantity,2);assert.equal(result.body.items[0].minutes,15);assert.equal(result.body.scheduledAt,'2026-10-23T12:30');
});
test('actual workerd fetch does not follow an upstream redirect',async()=>{
 let calls=0;const result=await runInWorker(async()=>{calls++;return new Response(null,{status:307,headers:{Location:'https://untrusted.example/'}});});
 assert.equal(calls,1);assert.equal(result.status,502);assert.equal(result.body.error,'AI_UPSTREAM_REDIRECT');
});
test('actual workerd menu transport requires source evidence and retains unknown price',async()=>{
 const text='红茶，5分钟';const result=await runInWorker(async request=>{
   const body=await request.json();assert.deepEqual(JSON.parse(body.messages[1].content),{text});
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({dishes:[{name:'红茶',minutes:5,sourceText:text}]})}}]});
 },{kind:'menu',text});
 assert.equal(result.status,200);assert.equal(result.body.dishes[0].name,'红茶');assert.equal(result.body.dishes[0].priceCents,null);assert.equal(result.body.requiresMerchantConfirmation,true);
});
