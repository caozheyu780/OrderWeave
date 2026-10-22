import {findNamedDish} from './menu-matching.js';

export const materialUnits=['g','kg','ml','l','piece','slice','spoon','portion'];
const clean=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const key=value=>clean(value).toLocaleLowerCase('en');
const round=value=>Math.round((value+Number.EPSILON)*1e6)/1e6;

// Legacy text is retained as names with unknown quantities; never infer a recipe.
export function recipeRows(ingredients){
  if(Array.isArray(ingredients))return ingredients.map(row=>({name:clean(row?.name),quantity:row?.quantity??null,unit:row?.unit||''}));
  return String(ingredients||'').split(/[、,，;；\n]+/).map(name=>({name:clean(name),quantity:null,unit:''})).filter(row=>row.name);
}
export function validMaterial(row){return !!row.name&&row.name.length<=80&&typeof row.quantity==='number'&&Number.isFinite(row.quantity)&&row.quantity>0&&row.quantity<=1e6&&Math.abs(row.quantity*1000-Math.round(row.quantity*1000))<1e-6&&materialUnits.includes(row.unit);}
export function validateRecipe(rows){
  const recipe=recipeRows(rows);
  if(!recipe.length||recipe.length>50||recipe.some(row=>!validMaterial(row)))throw Error('INVALID_RECIPE');
  return recipe;
}
function menuDish(item,menu){
  // An old ID must not silently attach to a different dish that reused its name.
  return item.dishId?menu.find(d=>d.id===item.dishId):findNamedDish(menu,item.name);
}
export function snapshotItem(item,menu,source=null,legacy=false){
  const same=source&&(source.dishId?source.dishId===item.dishId:source.name===item.name);
  if(same&&source.materialSnapshot?.version===1)return {...item,materialSnapshot:structuredClone(source.materialSnapshot)};
  const dish=menuDish(item,menu);
  return {...item,materialSnapshot:{version:1,basis:dish?(legacy?'estimate':'recipe'):'unavailable',ingredients:recipeRows(dish?.ingredients)}};
}
export function freezeOrderMaterials(order,menu){return {...order,items:order.items.map(item=>snapshotItem(item,menu,item,true))};}

function itemRecipe(item,menu){
  if(item.materialSnapshot?.version===1)return item.materialSnapshot;
  const dish=menuDish(item,menu);
  return {basis:dish?'estimate':'unavailable',ingredients:recipeRows(dish?.ingredients)};
}
export function aggregateMaterials(orders,menu){
  const totals=new Map(),missing=new Map();let estimated=false;
  for(const order of orders)for(const item of order.items||[]){
    const recipe=itemRecipe(item,menu),quantity=Number(item.quantity);
    if(recipe.basis==='estimate')estimated=true;
    const rows=recipe.ingredients?.length?recipe.ingredients:[{name:'',quantity:null,unit:''}];
    for(const row of rows){
      if(!validMaterial(row)||!Number.isInteger(quantity)||quantity<1||quantity>999){
        const id=JSON.stringify([key(row.name),item.dishId||item.name]);
        const entry=missing.get(id)||{name:row.name||'',dish:item.name,servings:0};
        entry.servings+=Number.isInteger(quantity)&&quantity>0?quantity:0;missing.set(id,entry);continue;
      }
      const unit=row.unit==='kg'?'g':row.unit==='l'?'ml':row.unit,multiplier=['kg','l'].includes(row.unit)?1000:1;
      const id=JSON.stringify([key(row.name),unit]),entry=totals.get(id)||{name:row.name,unit,quantity:0};
      entry.quantity=round(entry.quantity+row.quantity*multiplier*quantity);totals.set(id,entry);
    }
  }
  return {totals:[...totals.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.unit.localeCompare(b.unit)),missing:[...missing.values()],estimated,orderCount:orders.length};
}
export function materialOrders(orders,scope,now=new Date()){
  if(scope!=='today')return orders.filter(order=>order.status!=='delivered');
  return orders.filter(order=>{
    if(order.status!=='delivered'||!order.deliveredAt)return false;
    const delivered=new Date(order.deliveredAt);
    return Number.isFinite(delivered.getTime())&&delivered.getFullYear()===now.getFullYear()&&delivered.getMonth()===now.getMonth()&&delivered.getDate()===now.getDate();
  });
}
