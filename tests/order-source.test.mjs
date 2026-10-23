import test from 'node:test';
import assert from 'node:assert/strict';
import {locateOrderSource,warningOrderNumbers,routeBatchWarnings} from '../public/order-source.js';
import {orderEvidenceHtml,fullSourceHtml,batchWarningSummaryHtml} from '../public/order-evidence.js';
import {normalizeBatchOutput,extractOrder} from '../lib/deepseek.mjs';
const source='1. Alex 米饭 x1\r\n地址 A\r\n\r\n2. Bea 米饭 x2\r\n地址 B\r\n\r\n3. 陈 米饭 x?\r\n地址 C';
const quotes=['1. Alex 米饭 x1\r\n地址 A','2. Bea 米饭 x2\r\n地址 B','3. 陈 米饭 x?\r\n地址 C'];
const menu=[{id:'rice',name:'米饭',minutes:5}];
const order=q=>({sourceText:q,items:[{name:'米饭',quantity:1}],scheduledAt:'2026-10-24T12:00',location:'Test',contact:'Test'});
test('batch-level uncertainty about the third order also appears on that order only',()=>{
 for(const warning of ['第3单数量不确定','第三个订单需要核对数量','Order #3: quantity unclear',{message:'Quantity unclear',orderNumbers:[3]}]){
  const batch=normalizeBatchOutput({orders:quotes.map(order),warnings:[warning]},menu,source);
  assert.equal(batch.warnings.length,1);assert.deepEqual(batch.orders.map(o=>o.warnings.length),[0,0,1]);
  assert.equal(batch.orders[2].sourceVerified,true);assert.equal(locateOrderSource(source,batch.orders[2].sourceText).startLine,7);
 }
});
test('warning quote ownership must be exact, unique and cannot leak between orders',()=>{
 const batch=normalizeBatchOutput({orders:quotes.map(order),warnings:[{message:'Check quantity',sourceText:'米饭 x?'},{message:'No fabricated owner',sourceText:'invented'},{message:'No invalid index',orderNumbers:[0,9]}]},menu,source);
 assert.deepEqual(batch.orders.map(o=>o.warnings),[[],[],['Check quantity']]);assert.equal(batch.warnings.length,3);
 const orders=quotes.map(sourceText=>({sourceText,warnings:[]}));routeBatchWarnings(orders,['第3单数量不确定','第3单数量不确定'],source);assert.equal(orders[2].warnings.length,1);
 assert.deepEqual(warningOrderNumbers('送达 12:30，电话 123456',3),[]);
 assert.doesNotThrow(()=>routeBatchWarnings(orders,[null,{},42,{message:42}],source));
});
test('source locations use original CRLF positions, refuse invented or repeated evidence',()=>{
 const position=locateOrderSource(source,quotes[2]);assert.deepEqual(position,{start:source.indexOf(quotes[2]),end:source.length,startLine:7,endLine:8});
 assert.equal(source.slice(position.start,position.end),quotes[2]);assert.equal(locateOrderSource('same same','same'),null);assert.equal(locateOrderSource(source,'made up'),null);assert.equal(locateOrderSource(source,''),null);
 const fallback=normalizeBatchOutput({orders:[order('invented')]},menu,source).orders[0];assert.equal(fallback.sourceVerified,false);
 const html=orderEvidenceHtml(fallback,source,x=>x);assert.match(html,/sourceNotLocated/);assert.doesNotMatch(html,/data-locate-source/);
});
test('evidence presentation escapes text and links only verified offsets',()=>{
 const text='<img src=x onerror=alert(1)>\norder 3';
 const html=orderEvidenceHtml({sourceText:text,sourceVerified:true},'header\n'+text,x=>x);assert.match(html,/sourceLines 2–3/);assert.match(html,/data-source-start="7"/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
 assert.match(fullSourceHtml('</textarea><script>bad</script>',x=>x),/&lt;\/textarea&gt;/);
});
test('top warning summary links to the affected order and deduplicates routed messages',()=>{
 const entries=[{id:'a',draft:{warnings:[]}},{id:'b',draft:{warnings:[]}},{id:'c',draft:{warnings:['Check quantity <3>']}}];
 const html=batchWarningSummaryHtml(entries,['Check quantity <3>','Whole batch'],x=>x);
 assert.match(html,/data-go-order="c"/);assert.match(html,/batchOrder 3/);assert.equal(html.split('Check quantity').length-1,1);assert.match(html,/&lt;3&gt;/);assert.match(html,/Whole batch/);
});
test('batch prompt requires uncertainty in the affected orders rather than only the header',async()=>{
 await extractOrder({batch:true,text:source,menu,localNow:'2026-10-24T10:00',timeZone:'Asia/Shanghai'},{DEEPSEEK_API_KEY:'test-only'},async(url,options)=>{
  const prompt=JSON.parse(options.body).messages[0].content;assert.match(prompt,/该订单自己的warnings/);assert.match(prompt,/orderNumbers/);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({orders:quotes.map(order)})}}]});
 });
});
