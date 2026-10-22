import test from 'node:test';
import assert from 'node:assert/strict';
import {preparationEstimate,orderTiming} from '../public/order-timing.js';
const order={scheduledAt:'2026-10-22T12:00',scheduledEndAt:'2026-10-22T12:30',status:'pending'};
test('preparation estimates multiply servings and flag unknown custom dish durations',()=>{
 assert.deepEqual(preparationEstimate({items:[{minutes:15,quantity:2},{minutes:5,quantity:3}]}),{minutes:45,incomplete:false});
 assert.deepEqual(preparationEstimate({items:[{minutes:0,quantity:1},{minutes:10,quantity:1}]}),{minutes:10,incomplete:true});
});
test('urgency uses slot start, strictly less than twenty minutes and includes overdue',()=>{
 assert.equal(orderTiming(order,new Date('2026-10-22T11:40').getTime()).state,'normal');
 assert.equal(orderTiming(order,new Date('2026-10-22T11:40:01').getTime()).state,'urgent');
 assert.equal(orderTiming(order,new Date('2026-10-22T12:00').getTime()).state,'urgent');
 assert.equal(orderTiming(order,new Date('2026-10-22T12:00:01').getTime()).state,'overdue');
 assert.equal(orderTiming({...order,status:'delivered'}).state,'complete');
 assert.equal(orderTiming({...order,scheduledAt:''}).state,'unknown');
});
test('legacy point and midnight schedules use their containing local window',()=>{
 const at=new Date('2026-10-22T23:20').getTime();
 assert.equal(orderTiming({scheduledAt:'2026-10-22T23:50',status:'pending'},at).remainingMs,10*60000);
});
