import test from 'node:test';
import assert from 'node:assert/strict';
import {batchDraftIssue,prepareBatchOrders} from '../public/batch-orders.js';
import {normalizeBatchOutput,extractOrder} from '../lib/deepseek.mjs';
const menu=[{id:'a',name:'宫保鸡丁',minutes:15}];
const draft={items:[{name:'宫保鸡丁',quantity:2}],customer:'A',location:'Fictional A',contact:'Test A',scheduledAt:'2026-10-23T12:30'};
const now=new Date('2026-10-22T04:00:00Z');
test('batch keeps distinct customers, items, dates, missing fields and exact source evidence',()=>{
 const source='A 宫保鸡丁两份\n\nB 宫爆鸡丁一份';
 const result=normalizeBatchOutput({orders:[{...draft,sourceText:'A 宫保鸡丁两份'},{...draft,customer:'B',contact:'',location:'',scheduledAt:'',sourceText:'B 宫爆鸡丁一份',items:[{name:'宫保鸡丁',originalName:'宫爆鸡丁',quantity:1,matchType:'guessed'}]}]},menu,source);
 assert.equal(result.orders.length,2);assert.equal(result.orders[0].items[0].matchType,'exact');assert.equal(result.orders[1].items[0].matchType,'similar');assert.equal(result.orders[1].contact,'');assert.equal(result.orders[1].location,'');assert.equal(result.orders[1].scheduledAt,'');assert.equal(result.orders[1].sourceText,'B 宫爆鸡丁一份');
});
test('unverified per-order evidence cannot borrow an exact match from another order',()=>{
 const r=normalizeBatchOutput({orders:[{...draft,sourceText:'made-up evidence'}]},menu,'A 宫保鸡丁两份; B unknown');
 assert.equal(r.orders[0].items[0].matchType,'guessed');assert.equal(r.orders[0].warnings.length,1);
});
test('overflow, empty extraction and malformed entries reject the whole batch',()=>{
 for(const value of [{orders:[],overflow:true},{orders:Array(21).fill(draft)}])assert.throws(()=>normalizeBatchOutput(value,menu,''),e=>e.code==='AI_BATCH_TOO_LARGE');
 assert.throws(()=>normalizeBatchOutput({orders:[]},menu,''),e=>e.code==='AI_NO_ORDERS');
 for(const value of [{items:[]},{orders:[draft,{items:[{name:'x',quantity:0}]}]}])assert.throws(()=>normalizeBatchOutput(value,menu,''),e=>e.code==='AI_INVALID_RESPONSE');
});
test('batch extraction requests separate orders and sufficient output capacity',async()=>{
 const input={batch:true,text:'A 宫保鸡丁两份',menu,localNow:'2026-10-22T12:00',timeZone:'Asia/Shanghai'};
 const r=await extractOrder(input,{DEEPSEEK_API_KEY:'test-only'},async(url,options)=>{
   const body=JSON.parse(options.body);assert.equal(body.max_tokens,16000);assert.ok(body.messages[0].content.includes('orders'));assert.ok(!body.messages[0].content.includes('一次仅导入一笔订单'));
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({orders:[{...draft,sourceText:input.text}]})}}]});
 });assert.equal(r.orders.length,1);
});
test('no batch can be prepared until every order and uncertain dish is reviewed',()=>{
 const uncertain={...draft,items:[{...draft.items[0],matchType:'guessed'}]};
 assert.equal(batchDraftIssue(uncertain,menu),'match');
 for(const entries of [[{draft,reviewed:false}],[{draft,reviewed:true},{draft:{...draft,contact:''},reviewed:true}],[{draft:uncertain,reviewed:true}],[{draft:{...draft,items:[{name:'unlisted',quantity:1}]},reviewed:true}]])assert.throws(()=>prepareBatchOrders(entries,menu,[],now),/BATCH_REVIEW_REQUIRED/);
});
test('one prepared batch gets unique numbers and independent records without mutating input',()=>{
 const entries=[{draft,reviewed:true},{draft:{...draft,customer:'B'},reviewed:true}],snapshot=structuredClone(entries);let seq=0;
 const existing=[{number:'20261022-002'}];const result=prepareBatchOrders(entries,menu,existing,now,()=>String(++seq));
 assert.deepEqual(result.map(o=>o.number),['20261022-003','20261022-004']);assert.deepEqual(result.map(o=>o.id),['1','2']);assert.equal(result[0].requiresMerchantConfirmation,false);assert.ok(result[0].merchantConfirmedAt);assert.equal(result[0].items[0].dishId,'a');assert.deepEqual(entries,snapshot);assert.equal(existing.length,1);result[0].items[0].quantity=9;assert.equal(result[1].items[0].quantity,2);
});
