import {cleanAliases,conflictingDish} from './menu-matching.js';
import {validateRecipe} from './materials.js';
import {validateCommerce,validCents} from './commerce.js';

export const MAX_MENU_BATCH=30;
export function menuDraftIssue(dish,menu=[]){
  if(!dish||typeof dish.name!=='string'||!dish.name.trim()||dish.name.length>100)return 'dishName';
  try{cleanAliases(dish.aliases||[],dish.name);}catch{return 'aliases';}
  if(conflictingDish(menu,dish))return 'aliasesConflict';
  if(typeof dish.description!=='string'||!dish.description.trim()||dish.description.length>2000)return 'dishDescription';
  if(!validCents(dish.priceCents))return 'priceLabel';
  try{validateCommerce(dish);}catch{return 'optionsTitle';}
  try{validateRecipe(dish.ingredients);}catch{return 'recipePerServing';}
  if(!Number.isInteger(dish.minutes)||dish.minutes<1||dish.minutes>1440)return 'duration';
  if(typeof dish.image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dish.image))return 'image';
  return null;
}
export function prepareMenuBatch(entries,menu){
  if(!Array.isArray(entries)||!entries.length||entries.length>MAX_MENU_BATCH||menu.length+entries.length>300)throw Error('menuImportLimit');
  const result=[],ids=new Set(menu.map(d=>d.id));
  for(const entry of entries){
    if(!entry.reviewed)throw Error('menuImportReviewRequired');
    const dish=structuredClone(entry.draft),issue=menuDraftIssue(dish,[...menu,...result]);
    if(issue)throw Error(issue);
    if(typeof dish.id!=='string'||!dish.id||ids.has(dish.id))throw Error('aliasesConflict');
    ids.add(dish.id);dish.aliases=cleanAliases(dish.aliases||[],dish.name);
    // Source evidence and AI warnings are review-only, never public catalog fields.
    delete dish.sourceText;delete dish.warnings;
    result.push(dish);
  }
  return result;
}
