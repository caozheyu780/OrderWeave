import test from 'node:test';
import assert from 'node:assert/strict';
import {extractOrder,normalizeOutput,validateInput,validLocalDate,DEFAULT_MODEL} from '../lib/deepseek.mjs';
const menu=[{id:'chicken',name:'宫保鸡丁',minutes:15}];
const input={text:'明天中午十二点半送两份宫保鸡丁，少辣',menu,localNow:'2026-10-21T22:00',timeZone:'Asia/Shanghai'};
const order={items:[{dishId:'chicken',name:'宫保鸡丁',quantity:2}],scheduledAt:'2026-10-22T12:30',location:'测试地址',contact:'演示联系方式',warnings:['请核对']};
function upstream(data=order,finish_reason='stop'){return Response.json({choices:[{finish_reason,message:{content:JSON.stringify(data)}}]});}
test('only sends order text, menu names and local time to the official API',async()=>{
 const env={DEEPSEEK_API_KEY:'test-only-key'};
 const result=await extractOrder(input,env,async(url,options)=>{
  assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer test-only-key');
  const body=JSON.parse(options.body);assert.equal(body.model,DEFAULT_MODEL);assert.deepEqual(body.response_format,{type:'json_object'});assert.deepEqual(body.thinking,{type:'disabled'});assert.equal(body.stream,false);
  const data=JSON.parse(body.messages[1].content);assert.equal(data.localNow,input.localNow);assert.equal(data.timeZone,input.timeZone);assert.deepEqual(data.menu,menu);assert.ok(!options.body.includes('test-only-key'));return upstream();
 });
 assert.equal(result.items[0].minutes,15);assert.equal(result.scheduledAt,'2026-10-22T12:30');assert.deepEqual(result.warnings,['请核对']);
});
test('missing secret never makes a provider call',async()=>{await assert.rejects(extractOrder(input,{},()=>assert.fail('must not call')),err=>err.code==='AI_NOT_CONFIGURED'&&err.status===503);});
test('invalid input never makes a provider call',async()=>{
 for(const bad of [{...input,text:''},{...input,text:'x'.repeat(20001)},{...input,timeZone:'not/a-zone'},{...input,localNow:'2026-02-30T12:00'},{...input,menu:[{...menu[0],minutes:-1}]},{...input,menu:Array(501).fill(menu[0])}])await assert.rejects(extractOrder(bad,{DEEPSEEK_API_KEY:'test'},()=>assert.fail()),err=>err.code==='INVALID_REQUEST');
});
test('impossible dates, UTC suffixes and invalid hours are not accepted',()=>{for(const date of ['2026-02-30T12:30','2026-10-21T24:00','2026-13-01T00:00','2026-10-22T12:30Z'])assert.equal(validLocalDate(date),false);assert.equal(validLocalDate('2028-02-29T12:30'),true);});
test('corrects hallucinated menu IDs and prep durations, retains unknown dishes',()=>{
 const r=normalizeOutput({items:[{dishId:'wrong',name:'宫保鸡丁',quantity:2,minutes:999},{dishId:'chicken',name:'米饭',quantity:1,minutes:900}],scheduledAt:'bad'},menu);
 assert.deepEqual(r.items.map(({dishId,name,quantity,minutes})=>({dishId,name,quantity,minutes})),[{dishId:'chicken',name:'宫保鸡丁',quantity:2,minutes:15},{dishId:null,name:'米饭',quantity:1,minutes:0}]);assert.equal(r.items[0].matchType,'exact');assert.equal(r.items[1].matchType,'unmatched');assert.equal(r.scheduledAt,'');assert.equal(r.warnings.length,1);
});
test('rejects malformed and out-of-range model outputs',()=>{for(const value of [{},{items:'bad'},{items:[{name:'',quantity:1}]},{items:[{name:'米饭',quantity:0}]},{items:[{name:'米饭',quantity:1.5}]},{items:[{name:'米饭',quantity:1000}]}])assert.throws(()=>normalizeOutput(value,menu),err=>err.code==='AI_INVALID_RESPONSE');});
test('maps provider failures without forwarding secrets or provider response bodies',async()=>{
 for(const [status,code] of [[401,'AI_KEY_INVALID'],[403,'AI_KEY_INVALID'],[402,'AI_BALANCE_LOW'],[429,'AI_RATE_LIMIT'],[400,'AI_CONFIG_ERROR'],[500,'AI_UNAVAILABLE']])await assert.rejects(extractOrder(input,{DEEPSEEK_API_KEY:'hidden'},async()=>new Response('sensitive upstream diagnostics',{status})),err=>err.code===code&&!err.message.includes('sensitive')&&!err.message.includes('hidden'));
});
test('rejects truncated, empty and invalid JSON responses',async()=>{
 for(const response of [upstream(order,'length'),Response.json({choices:[{finish_reason:'stop',message:{content:''}}]}),Response.json({choices:[{finish_reason:'stop',message:{content:'```json\n{}\n```'}}]})])await assert.rejects(extractOrder(input,{DEEPSEEK_API_KEY:'test'},async()=>response),err=>err.code==='AI_INVALID_RESPONSE');
});
test('network and timeout failures get explicit error codes',async()=>{await assert.rejects(extractOrder(input,{DEEPSEEK_API_KEY:'test'},async()=>{throw new DOMException('timeout','TimeoutError')}),err=>err.code==='AI_TIMEOUT');await assert.rejects(extractOrder(input,{DEEPSEEK_API_KEY:'test'},async()=>{throw new Error('socket closed')}),err=>err.code==='AI_UNAVAILABLE');});
test('missing fields stay empty for merchant review',()=>{const r=normalizeOutput({items:[]},menu);assert.deepEqual(r,{items:[],scheduledAt:'',scheduledEndAt:'',customer:'',location:'',contact:'',preference:'',notes:'',warnings:[],requiresMerchantConfirmation:true});});
test('rejects redirects without following them or exposing their destination',async()=>{let calls=0;await assert.rejects(extractOrder(input,{DEEPSEEK_API_KEY:'test'},async()=>{calls++;return new Response('',{status:307,headers:{Location:'https://untrusted.example/'}});}),err=>err.code==='AI_UPSTREAM_REDIRECT'&&err.status===502&&!err.message.includes('untrusted'));assert.equal(calls,1);});
test('keeps typo evidence, classifies the suggestion and filters candidates to actual menu entries',()=>{
 const r=normalizeOutput({items:[{dishId:'chicken',name:'宫保鸡丁',originalName:'宫爆鸡丁',quantity:2,matchType:'guessed',matchReason:'同音字，可能指宫保鸡丁',candidateDishIds:['fake','chicken','chicken']}]},menu,'宫爆鸡丁两份');
 assert.equal(r.items[0].originalName,'宫爆鸡丁');assert.equal(r.items[0].matchType,'similar');assert.ok(r.items[0].matchReason.includes('无需额外勾选'));assert.deepEqual(r.items[0].candidates,[{dishId:'chicken',name:'宫保鸡丁'}]);assert.equal(r.requiresMerchantConfirmation,true);
});
test('never trusts an exact label when the original text does not contain the standard name',()=>{
 const r=normalizeOutput({items:[{dishId:'chicken',name:'宫保鸡丁',quantity:1,matchType:'exact'}]},menu,'宫爆鸡丁一份');assert.equal(r.items[0].matchType,'guessed');assert.ok(r.items[0].matchReason);
});
test('unrelated dishes are preserved for manual correction instead of being forced into the menu',()=>{
 const r=normalizeOutput({items:[{name:'披萨',originalName:'披萨',dishId:null,quantity:1,matchType:'unmatched',candidateDishIds:['invented']}]},menu,'披萨一份');assert.equal(r.items[0].name,'披萨');assert.equal(r.items[0].dishId,null);assert.equal(r.items[0].matchType,'unmatched');assert.deepEqual(r.items[0].candidates,[]);assert.equal(r.contact,'');assert.equal(r.location,'');
});
test('numeric or invented names are retained only as source text, never as a menu suggestion',()=>{
 for(const matchType of ['unmatched','guessed','exact']){const r=normalizeOutput({items:[{name:'1235',originalName:'1235',dishId:'invented',quantity:12,matchType,candidateDishIds:['invented']}]},menu,'1235 12份');assert.equal(r.items[0].suggestedName,'');assert.equal(r.items[0].dishId,null);assert.equal(r.items[0].originalName,'1235');assert.equal(r.items[0].matchType,'unmatched');}
});
