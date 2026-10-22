import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOrderText,validateOrder,escapeHtml} from '../public/core.js';
const menu=[{id:'a',name:'宫保鸡丁',minutes:15},{id:'b',name:'米饭',minutes:5},{id:'c',name:'炒米饭',minutes:8}];
test('extract Chinese order, quantities, labeled fields and tomorrow',()=>{
 const r=parseOrderText('宫保鸡丁 × 2\n米饭 3份\n时间：明天 12:30\n客户：张先生\n电话：13800138000\n地址：幸福路18号\n口味：微辣\n备注：到门口打电话',menu,new Date(2026,9,21,9));
 assert.deepEqual(r.items.map(x=>[x.name,x.quantity]),[['宫保鸡丁',2],['米饭',3]]);
 assert.equal(r.scheduledAt,'2026-10-22T12:30');assert.equal(r.contact,'13800138000');assert.equal(r.location,'幸福路18号');assert.equal(r.customer,'张先生');assert.equal(r.preference,'微辣');assert.equal(r.notes,'到门口打电话');assert.equal(validateOrder(r),null);
});
test('prefer longest dish name; count repeated dishes and Chinese numerals',()=>{
 const r=parseOrderText('两份宫保鸡丁；炒米饭3份；宫保鸡丁一份',menu);
 assert.deepEqual(r.items.map(x=>[x.name,x.quantity]),[['宫保鸡丁',3],['炒米饭',3]]);
});
test('extract English labels, date and PM',()=>{
 const r=parseOrderText('Rice x 2\nTime: 2026-11-02 3:30 pm\nAddress: 10 Main St\nPhone: +44 7700 900123\nPreference: no spicy\nNotes: call first',[{id:'r',name:'Rice',minutes:2}],new Date(2026,9,21));
 assert.equal(r.items[0].quantity,2);assert.equal(r.scheduledAt,'2026-11-02T15:30');assert.equal(r.contact,'+44 7700 900123');assert.equal(r.notes,'call first');assert.equal(validateOrder(r),null);
});
test('unknown dishes and missing fields stay blank for review',()=>{const r=parseOrderText('请送一份未知菜品',menu);assert.deepEqual(r.items,[]);assert.equal(r.scheduledAt,'');assert.equal(r.contact,'');assert.equal(r.location,'');assert.equal(validateOrder(r),'items');});
test('invalid clock is never accepted',()=>{assert.equal(parseOrderText('时间：29:99',menu).scheduledAt,'');});
test('reject invalid order data before saving',()=>{const valid={items:[{name:'米饭',quantity:2}],scheduledAt:'2026-10-22T12:30',location:'A',contact:'123'};assert.equal(validateOrder(valid),null);for(const quantity of [0,-1,1.5,1000,NaN])assert.equal(validateOrder({...valid,items:[{name:'米饭',quantity}]}),'quantity');assert.equal(validateOrder({...valid,location:' '}),'location');assert.equal(validateOrder({...valid,contact:''}),'contact');assert.equal(validateOrder({...valid,scheduledAt:'bad'}),'scheduledAt');});
test('escape imported text before rendering',()=>{assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');});
