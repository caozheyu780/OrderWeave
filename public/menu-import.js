import {cleanAliases,conflictingDish} from './menu-matching.js';
import {validateRecipe} from './materials.js';
import {validateCommerce,validCents} from './commerce.js';

export const MAX_MENU_BATCH=30;
export function menuDraftIssue(dish,menu=[]){
  if(!dish||typeof dish.name!=='string'||!dish.name.trim()||dish.name.length>100)return 'dishName';
  try{cleanAliases(dish.aliases||[],dish.name);}catch{return 'aliases';}
  if(conflictingDish(menu,dish))return 'aliasesConflict';
  if(typeof dish.description!=='string'||dish.description.length>2000)return 'dishDescription';
  if(!validCents(dish.priceCents))return 'priceLabel';
  try{validateCommerce(dish);}catch{return 'optionsTitle';}
  try{validateRecipe(dish.ingredients);}catch{return 'recipePerServing';}
  if(dish.minutes!=null&&(!Number.isInteger(dish.minutes)||dish.minutes<1||dish.minutes>1440))return 'duration';
  if(dish.image!=null&&(typeof dish.image!=='string'||dish.image!==''&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dish.image)))return 'image';
  return null;
}
export function menuBatchStatus(entries,menu){
  const ids=new Set(menu.map(d=>d.id));
  const rows=entries.map((entry,index)=>{
    let issue=menuDraftIssue(entry.draft,[...menu,...entries.filter(other=>other!==entry).map(other=>other.draft)]);
    const id=entry.draft?.id;
    if(typeof id!=='string'||!id||ids.has(id))issue||='aliasesConflict';
    ids.add(id);return {entry,index,issue};
  });
  const incompleteCount=rows.filter(row=>row.issue).length;
  const limitExceeded=entries.length>MAX_MENU_BATCH||menu.length+entries.length>300;
  return {rows,total:entries.length,completeCount:entries.length-incompleteCount,incompleteCount,limitExceeded,firstIncomplete:rows.find(row=>row.issue),canConfirm:!!entries.length&&!limitExceeded&&!incompleteCount};
}
export function prepareMenuBatch(entries,menu){
  if(!Array.isArray(entries)||!entries.length)throw Error('menuImportLimit');
  const status=menuBatchStatus(entries,menu);
  if(status.limitExceeded)throw Error('menuImportLimit');
  const result=[];
  for(const {entry,issue} of status.rows){
    if(issue)throw Error(issue);
    const dish=structuredClone(entry.draft);
    dish.minutes??=null;dish.image??='';dish.aliases=cleanAliases(dish.aliases||[],dish.name);
    // Source evidence and AI warnings are review-only, never public catalog fields.
    delete dish.sourceText;delete dish.warnings;
    result.push(dish);
  }
  return result;
}
