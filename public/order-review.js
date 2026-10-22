export function needsItemReview(item){return item?.matchType==='guessed'||item?.matchType==='unmatched';}
import {findNamedDish} from './menu-matching.js';
export function findMenuDish(menu,name){return findNamedDish(menu,name);}
export function suggestedMenuName(item,menu){
  if(item?.matchType==='unmatched')return '';
  const proposed=item?.suggestedName??item?.recognizedName??item?.name;
  const dish=findMenuDish(menu,proposed);
  return dish?.name||'';
}
export function applyItemReview(source,name,quantity,menu,acknowledged,reviewedAt,requireMenuItem=!!source?.matchType){
  const chosen=String(name||'').trim(),dish=findMenuDish(menu,chosen);
  if(requireMenuItem&&!dish)throw new Error('MENU_ITEM_REQUIRED');
  if(needsItemReview(source)&&!acknowledged)throw new Error('MATCH_REVIEW_REQUIRED');
  const unchanged=source?.name===chosen;
  const item={name:dish?.name||chosen,quantity:Number(quantity),dishId:dish?.id||(unchanged?source?.dishId:null)||null,minutes:dish?.minutes||(unchanged?source?.minutes:0)||0};
  if(source?.matchType){
    item.originalName=source.originalName||source.name;
    item.recognizedName=source.recognizedName??(source.matchType==='unmatched'?'':source.name);
    item.matchType=source.matchType;
    item.matchReason=source.matchReason||'';
    item.merchantCorrected=source.name!==item.name||Number(source.quantity)!==item.quantity||!!source.merchantCorrected;
    item.merchantReviewedAt=reviewedAt;
  }
  return item;
}
