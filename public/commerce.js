// Money is stored as integer minor units. Unpriced legacy dishes stay unavailable.
export const CURRENCY='MYR';
// Dated ECB euro reference rates: CNY 7.4786 / MYR 4.5756, 2026-10-22.
export const FX={date:'2026-10-22',cnyPerMyr:7.4786/4.5756,myrSource:'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-myr.en.html',cnySource:'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-cny.en.html'};
export const cnyReference=value=>Math.round(value*FX.cnyPerMyr);
const fail=code=>{throw Error(code);};
export function cents(value){
 const s=String(value??'').trim();if(!/^\d{1,6}(\.\d{1,2})?$/.test(s))fail('PRICE_INVALID');
 const [whole,fraction='']=s.split('.');const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(amount>99999999)fail('PRICE_INVALID');return amount;
}
export function validCents(n){return Number.isSafeInteger(n)&&n>=0&&n<=99999999;}
export function validateCommerce(dish){
 if(dish.priceCents!==undefined&&!validCents(dish.priceCents))fail('PRICE_INVALID');
 if(dish.category!==undefined&&(typeof dish.category!=='string'||dish.category.length>60))fail('OPTIONS_INVALID');
 const groups=dish.optionGroups??[];if(!Array.isArray(groups)||groups.length>8)fail('OPTIONS_INVALID');const ids=new Set();
 for(const g of groups){if(!g||typeof g.id!=='string'||!g.id||g.id.length>100||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>60||typeof g.required!=='boolean'||typeof g.multiple!=='boolean'||!Array.isArray(g.choices)||!g.choices.length||g.choices.length>20)fail('OPTIONS_INVALID');ids.add(g.id);const choiceIds=new Set();
  for(const c of g.choices){if(!c||typeof c.id!=='string'||!c.id||c.id.length>100||choiceIds.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>60||!validCents(c.priceCents))fail('OPTIONS_INVALID');choiceIds.add(c.id);}
 }
 return dish;
}
export function priceItem(dish,line){
 if(!dish||!validCents(dish.priceCents))fail('DISH_UNAVAILABLE');validateCommerce(dish);
 if(!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>99)fail('CART_INVALID');
 const selections=line.selections??{};if(!selections||typeof selections!=='object'||Array.isArray(selections))fail('OPTIONS_INVALID');
 const groups=dish.optionGroups||[];if(Object.keys(selections).some(id=>!groups.some(g=>g.id===id)))fail('OPTIONS_CHANGED');
 let unitPriceCents=dish.priceCents;const options=[];
 for(const group of groups){const ids=selections[group.id]??[];
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||(!group.multiple&&ids.length>1)||(group.required&&!ids.length))fail('OPTIONS_REQUIRED');
  for(const id of ids){const c=group.choices.find(c=>c.id===id);if(!c)fail('OPTIONS_CHANGED');unitPriceCents+=c.priceCents;options.push({groupId:group.id,groupName:group.name,choiceId:c.id,name:c.name,priceCents:c.priceCents});}
 }
 if(!validCents(unitPriceCents))fail('PRICE_INVALID');
 return {dishId:dish.id,name:dish.name,quantity:line.quantity,minutes:dish.minutes,basePriceCents:dish.priceCents,unitPriceCents,lineTotalCents:unitPriceCents*line.quantity,options,itemNotes:String(line.notes||'').trim().slice(0,300)};
}
export function money(value,locale='zh-CN',currency=CURRENCY){return currency==='MYR'?'RM '+new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(value/100):new Intl.NumberFormat(locale,{style:'currency',currency}).format(value/100);}
export const optionText=item=>(item.options||[]).map(o=>o.groupName+': '+o.name).concat(item.itemNotes?[item.itemNotes]:[]).join(' · ');
