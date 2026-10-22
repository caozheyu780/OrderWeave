import {validateOrder,localDateTime} from './core.js';
import {withDeliveryWindow} from './delivery-slots.js';
import {findMenuDish,needsItemReview} from './order-review.js';
import {snapshotItem} from './materials.js';

export function batchDraftIssue(draft,menu){
  const invalid=validateOrder(draft);
  if(invalid)return invalid;
  if(draft.items.some(i=>!findMenuDish(menu,i.name)))return 'menu';
  if(draft.items.some(i=>needsItemReview(i)&&!i.merchantReviewedAt))return 'match';
  return null;
}

// Validate the entire batch before creating any records; persistence happens once.
export function prepareBatchOrders(entries,menu,existing,now=new Date(),makeId=()=>crypto.randomUUID()){
  if(!entries.length||entries.length>20)throw Error('BATCH_INVALID');
  for(const entry of entries){if(!entry.reviewed||batchDraftIssue(entry.draft,menu))throw Error('BATCH_REVIEW_REQUIRED');}
  const timestamp=now.toISOString(),prefix=localDateTime(now).slice(0,10).replaceAll('-','');
  const used=new Set(existing.map(o=>o.number));let number=existing.length;
  return entries.map(({draft})=>{
    let label;do{label=prefix+'-'+String(++number).padStart(3,'0');}while(used.has(label));used.add(label);
    return {...withDeliveryWindow(structuredClone(draft)),id:makeId(),number:label,status:'pending',createdAt:timestamp,updatedAt:timestamp,merchantConfirmedAt:timestamp,requiresMerchantConfirmation:false,
      items:draft.items.map(i=>{const dish=findMenuDish(menu,i.name);return snapshotItem({...i,name:dish.name,dishId:dish.id,minutes:dish.minutes,...(i.matchType?{merchantReviewedAt:timestamp}:{})},menu);})};
  });
}
