import {deliveryWindow} from './delivery-slots.js';
import {optionText} from './commerce.js';

export const isActiveOrder=o=>['pending','preparing','delivering'].includes(o.status);
export const isWaitingOrder=o=>o.source==='buyer'&&o.status==='awaiting_acceptance';
export const isKitchenOrder=o=>['pending','preparing'].includes(o.status);
export function validateReceivingHours(value){
  if(!value||typeof value.enabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.end)||typeof value.timeZone!=='string'||value.timeZone.length>80||value.enabled&&value.start===value.end)throw Error('HOURS_INVALID');
  try{new Intl.DateTimeFormat('en',{timeZone:value.timeZone});}catch{throw Error('HOURS_INVALID');}
  return {enabled:value.enabled,start:value.start,end:value.end,timeZone:value.timeZone};
}
export function acceptingOrders(hours,now=new Date()){
  if(!hours?.enabled)return true;
  const h=validateReceivingHours(hours),parts=new Intl.DateTimeFormat('en-GB',{timeZone:h.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const clock=parts.find(p=>p.type==='hour').value+':'+parts.find(p=>p.type==='minute').value;
  return h.start<h.end?clock>=h.start&&clock<h.end:clock>=h.start||clock<h.end;
}
export function sortOrders(orders,field='scheduledAt',direction='asc',locale='zh-CN'){
  const collator=new Intl.Collator(locale,{numeric:true,sensitivity:'base'}),sign=direction==='desc'?-1:1;
  const value=o=>field==='location'?String(o.location||'').trim():field==='scheduledAt'?(deliveryWindow(o)?.scheduledAt||''):String(o[field]||'');
  return [...orders].sort((a,b)=>{const x=value(a),y=value(b);if(!x||!y)return x?-1:y?1:collator.compare(String(a.id),String(b.id));return sign*collator.compare(x,y)||collator.compare(String(a.id),String(b.id));});
}
export function kitchenSummary(orders,{day='',slot=''}={}){
  const groups=new Map();let orderCount=0,totalServings=0;
  for(const order of orders){if(!isKitchenOrder(order))continue;const window=deliveryWindow(order);if(day&&window?.scheduledAt.slice(0,10)!==day||slot&&window?.scheduledAt.slice(11)!==slot)continue;orderCount++;
    for(const item of order.items){const preference=[optionText(item),order.source==='buyer'?'':order.preference].filter(Boolean).join(' · '),key=JSON.stringify([item.dishId||item.name,preference,order.notes||'',window?.scheduledAt||'']);
      const g=groups.get(key)||{name:item.name,quantity:0,preference,scheduledAt:window?.scheduledAt||'',scheduledEndAt:window?.scheduledEndAt||'',minutes:0,incompleteTime:false,orders:new Set(),notes:new Set()};
      g.quantity+=item.quantity;totalServings+=item.quantity;g.minutes+=(item.minutes||0)*item.quantity;if(!item.minutes)g.incompleteTime=true;g.orders.add(order.number);if(order.notes)g.notes.add(order.notes);groups.set(key,g);
    }
  }
  return {orderCount,totalServings,groups:[...groups.values()].sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)||a.name.localeCompare(b.name)).map(g=>({...g,orders:[...g.orders],notes:[...g.notes]}))};
}

export const operationAuditActions=['batch_create','batch_edit','batch_remove','batch_discard','batch_confirm','order_submit','order_accept','order_reject'];
const fail=message=>{throw Error(message);};
function openBatch(store,id){const b=store.batches?.find(b=>b.id===id);if(!b)fail('BATCH_NOT_FOUND');if(b.status!=='draft')fail('BATCH_CLOSED');return b;}
export function applyBatchConfirmation(store,input,next,actor,at,audit){
  if(!input.batchId)return;
  const batch=openBatch(store,input.batchId),rows=batch.kind==='menu'?next.menu:next.orders,previous=new Set((batch.kind==='menu'?store.menu:store.orders).map(r=>r.id));
  const added=rows.filter(r=>!previous.has(r.id)),live=batch.entries.filter(e=>!e.removed);
  if(added.length!==live.length||!added.length||added.some(r=>r.batchId!==batch.id)||new Set(added.map(r=>r.batchEntryId)).size!==live.length||live.some(e=>!added.some(r=>r.batchEntryId===e.id)))fail('BATCH_INVALID');
  batch.status='confirmed';batch.updatedAt=at;batch.confirmedBy=actor.id;batch.confirmedAt=at;batch.recordIds=added.map(r=>r.id);
  audit(store,actor,'batch_confirm',batch.id,{batchId:batch.id,kind:batch.kind,count:added.length});
}
export function createMerchantOperations({uid,now,audit,commit,state}){
  return function handle(context,store,actor,input){
    if(!['receiving_hours','buyer_decide','batch_begin','batch_event'].includes(input.action))return null;
    if(input.expectedRevision!==store.revision)fail('CONFLICT');const at=now().toISOString();
    if(input.action==='receiving_hours')store.receivingHours=validateReceivingHours(input.hours);
    if(input.action==='buyer_decide'){
      const order=store.orders.find(o=>o.id===input.id);if(!order||!isWaitingOrder(order))fail('ORDER_ALREADY_DECIDED');
      if(!['accept','reject'].includes(input.decision))fail('INVALID_DATA');
      const reason=typeof input.reason==='string'?input.reason.trim():'';if(input.decision==='reject'&&(!reason||reason.length>500))fail('REJECTION_REQUIRED');
      order.status=input.decision==='accept'?'pending':'rejected';order.merchantDecision={decision:input.decision,actorId:actor.id,actorName:actor.name,at,...(input.decision==='reject'?{reason}:{})};order.updatedAt=at;
      if(input.decision==='accept')order.merchantConfirmedAt=at;
      audit(store,actor,input.decision==='accept'?'order_accept':'order_reject',order.number);
    }
    if(input.action==='batch_begin'){
      if(!['orders','menu'].includes(input.kind)||!['ai','rules'].includes(input.method)||!Array.isArray(input.entryIds)||!input.entryIds.length||input.entryIds.length>(input.kind==='orders'?20:30)||new Set(input.entryIds).size!==input.entryIds.length||input.entryIds.some(id=>typeof id!=='string'||!id||id.length>100))fail('BATCH_INVALID');
      store.batches??=[];if(store.batches.length>=10000)fail('BATCH_LIMIT');
      const batch={id:uid(),kind:input.kind,method:input.method,status:'draft',createdAt:at,updatedAt:at,createdBy:actor.id,entries:input.entryIds.map(id=>({id,removed:false,edits:0}))};store.batches.push(batch);audit(store,actor,'batch_create',batch.id,{batchId:batch.id,kind:batch.kind,count:batch.entries.length});
    }
    if(input.action==='batch_event'){
      const batch=openBatch(store,input.batchId);if(!['edit','remove','discard'].includes(input.event))fail('BATCH_INVALID');
      const entry=batch.entries.find(e=>e.id===input.entryId);
      if(input.event!=='discard'&&(!entry||entry.removed))fail('BATCH_INVALID');
      if(input.event==='edit')entry.edits++;if(input.event==='remove')entry.removed=true;if(input.event==='discard')batch.status='discarded';batch.updatedAt=at;
      audit(store,actor,'batch_'+input.event,batch.id,{batchId:batch.id,kind:batch.kind,count:batch.entries.filter(e=>!e.removed).length,...(entry?{entryId:entry.id}:{})});
    }
    store.revision++;commit(context);return state(store,actor);
  };
}
