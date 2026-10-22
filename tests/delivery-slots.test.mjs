import test from 'node:test';
import assert from 'node:assert/strict';
import {slotForTime,slotForRequest,deliveryWindow,withDeliveryWindow,deliverySlotOptions,deliveryWindowLabel,parseDeliverySchedule} from '../public/delivery-slots.js';
import {parseOrderText,validateOrder} from '../public/core.js';
import {normalizeOutput,normalizeBatchOutput} from '../lib/deepseek.mjs';
import {prepareBatchOrders} from '../public/batch-orders.js';
const menu=[{id:'rice',name:'米饭',minutes:5}];
const now=new Date(2026,9,22,9);
test('point times use containing half-hours, with exact boundaries starting the next slot',()=>{
 for(const [input,start,end] of [['12:00','12:00','12:30'],['12:20','12:00','12:30'],['12:29','12:00','12:30'],['12:30','12:30','13:00'],['12:59','12:30','13:00']])assert.deepEqual(slotForTime('2026-10-22T'+input),{scheduledAt:'2026-10-22T'+start,scheduledEndAt:'2026-10-22T'+end});
});
test('midnight windows roll into the correct day, month, leap day and year',()=>{
 for(const [input,end] of [['2026-10-31T23:59','2026-11-01T00:00'],['2026-12-31T23:45','2027-01-01T00:00'],['2028-02-28T23:30','2028-02-29T00:00']])assert.equal(slotForTime(input).scheduledEndAt,end);
 assert.match(deliveryWindowLabel({scheduledAt:'2026-12-31T23:45'},'en-GB','next day'),/23:30–00:00 \(next day\)/);
});
test('impossible dates, timezone suffixes and invalid clocks cannot become slots',()=>{
 for(const input of ['',null,'2026-02-30T12:20','2026-10-22T24:00','2026-10-22T12:60','2026-10-22T12:20Z','2026-10-22T12:20:00'])assert.equal(slotForTime(input),null);
});
test('all 48 manual options are unique and the final one ends the following day',()=>{
 assert.equal(deliverySlotOptions.length,48);assert.equal(new Set(deliverySlotOptions.map(x=>x.value)).size,48);
 assert.deepEqual(deliverySlotOptions[0],{value:'00:00',end:'00:30',nextDay:false});assert.deepEqual(deliverySlotOptions[47],{value:'23:30',end:'00:00',nextDay:true});
});
test('explicit ranges must fit in one slot; wider, zero and reversed ranges need review',()=>{
 assert.equal(slotForRequest('2026-10-22T12:05','2026-10-22T12:20').scheduledAt,'2026-10-22T12:00');
 assert.equal(slotForRequest('2026-10-22T12:00','2026-10-22T12:30').scheduledEndAt,'2026-10-22T12:30');
 for(const end of ['2026-10-22T12:45','2026-10-22T13:00','2026-10-22T12:15','2026-10-22T12:00'])assert.equal(slotForRequest('2026-10-22T12:15',end),null);
});
test('legacy point records normalize without mutation, while malformed stored ranges are rejected',()=>{
 const old={scheduledAt:'2026-10-22T12:20'},snapshot=structuredClone(old);assert.equal(deliveryWindow(old).scheduledAt,'2026-10-22T12:00');assert.deepEqual(old,snapshot);
 assert.deepEqual(withDeliveryWindow(old),{scheduledAt:'2026-10-22T12:00',scheduledEndAt:'2026-10-22T12:30',originalScheduledAt:'2026-10-22T12:20'});
 for(const o of [{scheduledAt:'2026-10-22T12:00',scheduledEndAt:'2026-10-22T13:00'},{scheduledAt:'2026-10-22T12:20',scheduledEndAt:'2026-10-22T12:30'}])assert.equal(deliveryWindow(o),null);
});
test('basic rules handle point times, Chinese half past, English PM and Malay relative days',()=>{
 assert.equal(parseDeliverySchedule('明天12:20送达',now).scheduledAt,'2026-10-23T12:00');
 assert.equal(parseDeliverySchedule('明天12点半送达',now).scheduledAt,'2026-10-23T12:30');
 assert.equal(parseDeliverySchedule('tomorrow 3:15 pm',now).scheduledAt,'2026-10-23T15:00');
 assert.equal(parseDeliverySchedule('esok 12:20',now).scheduledAt,'2026-10-23T12:00');
 assert.equal(parseDeliverySchedule('lusa 12:30',now).scheduledAt,'2026-10-24T12:30');
});
test('basic rules retain valid ranges and block crossing/wide ranges or impossible dates',()=>{
 assert.equal(parseDeliverySchedule('明天12:30–13:00',now).scheduledEndAt,'2026-10-23T13:00');
 assert.equal(parseDeliverySchedule('2026-12-31 23:30–00:00',now).scheduledEndAt,'2027-01-01T00:00');
 assert.equal(parseDeliverySchedule('2026-12-31 23:30–24:00',now).scheduledEndAt,'2027-01-01T00:00');
 for(const text of ['明天12:15–12:45','tomorrow 12:00 to 13:00','2026-02-30 12:20']){const r=parseDeliverySchedule(text,now);assert.equal(r.scheduledAt,'');assert.equal(r.warnings.length,1);}
});
test('AI output is normalized using actual start/end values and preserves original requests',()=>{
 const base={items:[{name:'米饭',quantity:2}],scheduledAt:'2026-10-23T12:20'};
 const r=normalizeOutput(base,menu,'米饭2份12:20');assert.equal(r.scheduledAt,'2026-10-23T12:00');assert.equal(r.scheduledEndAt,'2026-10-23T12:30');assert.equal(r.originalScheduledAt,base.scheduledAt);
 const wide=normalizeOutput({...base,scheduledEndAt:'2026-10-23T13:00'},menu);assert.equal(wide.scheduledAt,'');assert.equal(wide.scheduledEndAt,'');assert.equal(wide.originalScheduledEndAt,'2026-10-23T13:00');assert.equal(wide.warnings.length,1);
});
test('batch orders keep independent windows and persist ranges atomically without mutating drafts',()=>{
 const a={items:[{name:'米饭',quantity:2}],scheduledAt:'2026-10-23T12:20',location:'Fictional A',contact:'Test A',sourceText:'A 米饭12:20'};
 const b={...a,scheduledAt:'2026-10-23T23:50',sourceText:'B 米饭23:50'};const batch=normalizeBatchOutput({orders:[a,b]},menu,a.sourceText+'\n'+b.sourceText);
 assert.equal(batch.orders[0].scheduledAt,'2026-10-23T12:00');assert.equal(batch.orders[1].scheduledEndAt,'2026-10-24T00:00');
 const entries=batch.orders.map(draft=>({draft,reviewed:true})),snapshot=structuredClone(entries),result=prepareBatchOrders(entries,menu,[],new Date('2026-10-22T12:00Z'),()=>crypto.randomUUID());
 assert.equal(result[0].scheduledEndAt,'2026-10-23T12:30');assert.equal(result[1].originalScheduledAt,'2026-10-23T23:50');assert.deepEqual(entries,snapshot);
});
test('validation accepts half-hour orders and rejects malformed end fields',()=>{
 const order=parseOrderText('米饭2份\n时间：明天12:20\n地址：测试地址\n电话：演示联系',menu,now);assert.equal(validateOrder(order),null);assert.equal(order.scheduledEndAt,'2026-10-23T12:30');
 assert.equal(validateOrder({...order,scheduledEndAt:'2026-10-23T13:00'}),'scheduledAt');
});
