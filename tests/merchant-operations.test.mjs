import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalWorkspace,DEMO_KEY} from '../public/local-workspace.js';
import {acceptingOrders,validateReceivingHours,kitchenSummary,sortOrders,isActiveOrder} from '../public/merchant-operations.js';
import {aggregateMaterials,materialOrders} from '../public/materials.js';
import {operationsMessages} from '../public/operations-i18n.js';
class Storage{values=new Map();fail=false;getItem(k){return this.values.get(k)??null;}setItem(k,v){if(this.fail)throw Error('QuotaExceededError');this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}}
const now=()=>new Date('2026-10-24T12:00:00Z');
const owner={action:'create',shop:'Fictional operations shop',username:'ops-owner',operatorName:'Ops owner',password:'test-only-merchant',repeatPassword:'test-only-merchant'};
const dish={id:'d',name:'Rice bowl',description:'Fictional dish',minutes:10,image:'data:image/png;base64,YQ==',priceCents:1000,ingredients:[{name:'Rice',quantity:150,unit:'g'}]};
const order={id:'manual',number:'QA-1',status:'pending',items:[{dishId:'d',name:dish.name,quantity:2,minutes:10}],scheduledAt:'2026-10-25T12:00',scheduledEndAt:'2026-10-25T12:30',customer:'Test customer',contact:'Test contact',location:'Block 2'};
async function fixture(){const storage=new Storage(),api=()=>createLocalWorkspace({storage,sessionStorage:new Storage(),now}),merchant=api(),first=await merchant.request(owner);await merchant.request({action:'save',merchantId:first.id,expectedRevision:0,menu:[dish],orders:[]});return {storage,api,merchant,id:first.id};}
async function op(f,action,extra={}){const state=await f.merchant.request({},'?merchantId='+f.id);return f.merchant.request({action,merchantId:f.id,expectedRevision:state.revision,...extra});}
async function buyerFixture(f){const buyer=f.api();await buyer.request({action:'buyer_login',phone:'+60111110000',password:'test-only-buyer'});await buyer.request({action:'buyer_cart_add',storeId:f.id,dishId:dish.id,quantity:2,selections:{}});await buyer.request({action:'buyer_address',name:'Test buyer',phone:'+60111110000',location:'Fictional block 2'});const state=await buyer.request({action:'buyer_state'}),quote=await buyer.request({action:'buyer_quote'});return {buyer,input:{action:'buyer_checkout',requestId:'qa-checkout',addressId:state.profile.addresses[0].id,quoteToken:quote.quoteToken,scheduledAt:'2026-10-25T12:00',scheduledEndAt:'2026-10-25T12:30',paymentMethod:'local_wallet'}};}
test('receiving hours honor inclusive opening/exclusive closing, overnight and explicit time zones',()=>{
  const h={enabled:true,start:'11:00',end:'13:00',timeZone:'UTC'};assert.equal(acceptingOrders(h,now()),true);assert.equal(acceptingOrders(h,new Date('2026-10-24T13:00Z')),false);assert.equal(acceptingOrders(h,new Date('2026-10-24T11:00Z')),true);
  const night={...h,start:'22:00',end:'02:00'};for(const hour of ['22:00','23:59','01:59'])assert.equal(acceptingOrders(night,new Date('2026-10-24T'+hour+'Z')),true);assert.equal(acceptingOrders(night,new Date('2026-10-24T02:00Z')),false);
  assert.equal(acceptingOrders({...h,timeZone:'Asia/Kuala_Lumpur'},now()),false);assert.equal(acceptingOrders(null,now()),true);
  for(const invalid of [{...h,start:'24:00'},{...h,end:'11:00'},{...h,timeZone:'invalid/zone'}])assert.throws(()=>validateReceivingHours(invalid),/HOURS_INVALID/);
});
test('receiving settings persist and reject out-of-hours checkout without consuming the cart',async()=>{
  const f=await fixture(),b=await buyerFixture(f),h={enabled:true,start:'21:00',end:'22:00',timeZone:'UTC'};await op(f,'receiving_hours',{hours:h});const before=f.storage.getItem(DEMO_KEY);
  await assert.rejects(b.buyer.request(b.input),/STORE_CLOSED/);assert.equal(f.storage.getItem(DEMO_KEY),before);assert.equal((await b.buyer.request({action:'buyer_state'})).cart.lines.length,1);
  assert.deepEqual((await f.merchant.request({},'?merchantId='+f.id)).receivingHours,h);await op(f,'receiving_hours',{hours:{...h,enabled:false}});assert.equal((await b.buyer.request(b.input)).order.status,'awaiting_acceptance');
});
test('buyer orders require a merchant decision, stay out of production, and accept exactly once',async()=>{
  const f=await fixture(),b=await buyerFixture(f),result=await b.buyer.request(b.input);let state=await f.merchant.request({},'?merchantId='+f.id);assert.equal(result.order.status,'awaiting_acceptance');assert.equal(materialOrders(state.orders,'current').length,0);assert.equal(aggregateMaterials(state.orders,state.menu).totals.length,0);assert.equal(kitchenSummary(state.orders).totalServings,0);
  await assert.rejects(op(f,'save',{menu:state.menu,orders:[{...result.order,status:'preparing'}]}),/ORDER_NEEDS_DECISION/);
  const request={action:'buyer_decide',merchantId:f.id,expectedRevision:state.revision,id:result.order.id,decision:'accept'};const attempts=await Promise.allSettled([f.merchant.request(request),f.merchant.request(request)]);assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
  state=await f.merchant.request({},'?merchantId='+f.id);assert.equal(kitchenSummary(state.orders).totalServings,2);assert.equal(aggregateMaterials(state.orders,state.menu).totals[0].quantity,300);assert.equal(state.orders[0].merchantDecision.actorId,state.operator.id);assert.equal((await b.buyer.request({action:'buyer_state'})).orders[0].status,'pending');
  await assert.rejects(op(f,'buyer_decide',{id:result.order.id,decision:'reject',reason:'too late'}),/ORDER_ALREADY_DECIDED/);
  const logs=await f.merchant.request({},'?merchantId='+f.id+'&logs=1');assert.equal(logs.entries.filter(x=>x.action==='order_accept').length,1);
});
test('rejection requires a reason and quota failure rolls back both decision and log',async()=>{
  const f=await fixture(),b=await buyerFixture(f),{order:o}=await b.buyer.request(b.input);await assert.rejects(op(f,'buyer_decide',{id:o.id,decision:'reject',reason:''}),/REJECTION_REQUIRED/);
  const before=f.storage.getItem(DEMO_KEY);f.storage.fail=true;await assert.rejects(op(f,'buyer_decide',{id:o.id,decision:'reject',reason:'Kitchen full'}),/LOCAL_STORAGE_FULL/);assert.equal(f.storage.getItem(DEMO_KEY),before);f.storage.fail=false;
  const state=await op(f,'buyer_decide',{id:o.id,decision:'reject',reason:'Kitchen full'});assert.equal(state.orders[0].status,'rejected');assert.equal(materialOrders(state.orders,'current').length,0);assert.equal(kitchenSummary(state.orders).groups.length,0);assert.equal(state.orders[0].payment.amountCents,o.payment.amountCents);
  await assert.rejects(op(f,'save',{menu:state.menu,orders:[{...state.orders[0],status:'pending'}]}),/ORDER_NEEDS_DECISION/);assert.equal((await b.buyer.request(b.input)).order.id,o.id);assert.equal((await b.buyer.request({action:'buyer_state'})).orders[0].merchantDecision.reason,'Kitchen full');
});
test('order batch operations and final records share a persistent ID and atomically attributed logs',async()=>{
  const f=await fixture();let state=await op(f,'batch_begin',{kind:'orders',method:'ai',entryIds:['a','b']}),batch=state.batches.at(-1);await op(f,'batch_event',{batchId:batch.id,event:'edit',entryId:'a'});await op(f,'batch_event',{batchId:batch.id,event:'remove',entryId:'b'});
  const tracked={...order,batchId:batch.id,batchEntryId:'a'};state=await op(f,'save',{menu:[dish],orders:[tracked],batchId:batch.id});assert.equal(state.batches[0].status,'confirmed');assert.deepEqual(state.batches[0].recordIds,[order.id]);assert.equal(state.orders[0].batchId,batch.id);
  const logs=await f.merchant.request({},'?merchantId='+f.id+'&logs=1');for(const action of ['batch_create','batch_edit','batch_remove','batch_confirm']){const row=logs.entries.find(x=>x.action===action);assert.equal(row.actor_id,state.operator.id);assert.equal(row.details.batchId,batch.id);assert.ok(row.at);}
  await assert.rejects(op(f,'batch_event',{batchId:batch.id,event:'discard'}),/BATCH_CLOSED/);
});
test('failed batch confirmation, discard, menu batches and record link immutability are enforced',async()=>{
  const f=await fixture();let state=await op(f,'batch_begin',{kind:'orders',method:'rules',entryIds:['a']}),id=state.batches.at(-1).id;const before=f.storage.getItem(DEMO_KEY);
  await assert.rejects(op(f,'save',{menu:[dish],orders:[{...order,batchId:id,batchEntryId:'wrong'}],batchId:id}),/BATCH_INVALID/);assert.equal(f.storage.getItem(DEMO_KEY),before);
  f.storage.fail=true;await assert.rejects(op(f,'batch_event',{batchId:id,event:'discard'}),/LOCAL_STORAGE_FULL/);assert.equal(f.storage.getItem(DEMO_KEY),before);f.storage.fail=false;
  state=await op(f,'batch_event',{batchId:id,event:'discard'});assert.equal(state.batches[0].status,'discarded');assert.equal(state.orders.length,0);
  state=await op(f,'batch_begin',{kind:'menu',method:'ai',entryIds:['new-dish']});id=state.batches.at(-1).id;const newDish={...dish,id:'d2',name:'Tea',batchId:id,batchEntryId:'new-dish'};state=await op(f,'save',{menu:[dish,newDish],orders:[],batchId:id});assert.equal(state.batches.at(-1).kind,'menu');assert.equal(state.batches.at(-1).status,'confirmed');
  await assert.rejects(op(f,'save',{menu:[dish,{...newDish,batchId:'fake'}],orders:[]}),/BATCH_INVALID/);
});
test('kitchen groups preserve differing options/preferences, time windows and order notes',()=>{
  const a={...order,notes:'Call first'},b={...order,id:'b',number:'QA-2',notes:'No peanuts'},spicy={...order,id:'s',number:'QA-3',preference:'Spicy'},otherTime={...order,id:'later',number:'QA-4',scheduledAt:'2026-10-25T13:00',scheduledEndAt:'2026-10-25T13:30'};
  const snapshot=structuredClone([a,b,spicy,otherTime]),result=kitchenSummary([...snapshot,{...a,id:'same-note',number:'QA-5'},{...order,status:'awaiting_acceptance'},{...order,status:'rejected'},{...order,status:'delivering'},{...order,status:'delivered'}]);assert.equal(result.orderCount,5);assert.equal(result.totalServings,10);assert.equal(result.groups.length,4);assert.deepEqual(result.groups[0].notes,['Call first']);assert.deepEqual(result.groups[0].orders,['QA-1','QA-5']);assert.ok(result.groups.some(g=>g.notes.includes('No peanuts')&&g.quantity===2));assert.equal(kitchenSummary(snapshot,{day:'2026-10-25',slot:'13:00'}).orderCount,1);assert.deepEqual(snapshot,[a,b,spicy,otherTime]);assert.equal(isActiveOrder({status:'awaiting_acceptance'}),false);
});
test('sorting supports natural location, creation, scheduled/actual delivery and keeps missing values last',()=>{
  const rows=[{...order,id:'2',location:'Block 10',createdAt:'2026-10-23T12:00',deliveredAt:''},{...order,id:'1',location:'Block 2',createdAt:'2026-10-24T12:00',deliveredAt:'2026-10-24T12:30'}],snapshot=structuredClone(rows);
  assert.deepEqual(sortOrders(rows,'location').map(o=>o.id),['1','2']);assert.deepEqual(sortOrders(rows,'createdAt','asc').map(o=>o.id),['2','1']);assert.deepEqual(sortOrders(rows,'createdAt','desc').map(o=>o.id),['1','2']);assert.deepEqual(sortOrders(rows,'deliveredAt','desc').map(o=>o.id),['1','2']);assert.deepEqual(rows,snapshot);
  assert.deepEqual(Object.keys(operationsMessages.zh).sort(),Object.keys(operationsMessages.en).sort());assert.deepEqual(Object.keys(operationsMessages.en).sort(),Object.keys(operationsMessages.ms).sort());
});
