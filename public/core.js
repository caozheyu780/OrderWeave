import {deliveryWindow,parseDeliverySchedule} from './delivery-slots.js';
import {dishNames,normalizeName,findNamedDish} from './menu-matching.js';
export const MAX_QUANTITY=999;
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function validateOrder(order){
  if(!Array.isArray(order.items)||!order.items.length)return 'items';
  if(order.items.some(x=>!String(x.name||'').trim()||!Number.isInteger(Number(x.quantity))||Number(x.quantity)<1||Number(x.quantity)>MAX_QUANTITY))return 'quantity';
  if(!deliveryWindow(order))return 'scheduledAt';
  if(!String(order.location||'').trim())return 'location';
  if(!String(order.contact||'').trim())return 'contact';
  return null;
}
const numbers={'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
function count(value){if(!value)return 1;if(/^\d+$/.test(value))return Number(value);if(value.includes('十')){const [a,b]=value.split('十');return (numbers[a]||1)*10+(numbers[b]||0)}return numbers[value]||1;}
const escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function localDateTime(date){const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
export function parseOrderText(text,menu,now=new Date()){
  const items=[];let rest=text;
  const names=menu.flatMap(dish=>dishNames(dish).map(name=>({dish,name}))).sort((a,b)=>b.name.length-a.name.length);
  for(const {dish,name} of names){
    if(findNamedDish(menu,name)?.id!==dish.id)continue;
    const re=new RegExp(escapeRegex(name),'giu');let match;let quantity=0;
    while((match=re.exec(rest))){const before=rest.slice(0,match.index),after=rest.slice(match.index+match[0].length);const next=after.match(/^\s*(?:[x×*]\s*)?([\d一二两三四五六七八九十]+)\s*(?:份|个|碗|盒|pcs)?/i);const prev=before.match(/([\d一二两三四五六七八九十]+)\s*(?:份|个|碗|盒)\s*$/);quantity+=count(next?.[1]||prev?.[1]);}
    if(quantity){const existing=items.find(i=>i.dishId===dish.id);if(existing)existing.quantity+=quantity;else items.push({dishId:dish.id,name:dish.name,quantity,minutes:dish.minutes,...(normalizeName(name)!==normalizeName(dish.name)?{matchType:'alias',originalName:name,matchReason:'已绑定别名 / Bound alias'}:{})});rest=rest.replace(re,match=>' '.repeat(match.length));}
  }
  function field(labels){const re=new RegExp(`(?:^|[\n;；])\\s*(?:${labels})\\s*[:：]\\s*([^\n;；]+)`,'im');return text.match(re)?.[1]?.trim()||'';}
  const contact=field('联系方式|联系|电话|手机|contact|phone')||text.match(/(?:\+?\d[\d ()-]{6,}\d)/)?.[0]?.trim()||'';
  const location=field('送餐地址|配送地址|地址|地点|location|address');
  const customer=field('客户|顾客|姓名|收货人|customer|name');
  const preference=field('口味偏好|口味|偏好|preference')||(['不要辣','不辣','微辣','少辣','中辣','特辣','少盐','少油','no spicy','less salt'].filter(s=>text.toLowerCase().includes(s)).join('、'));
  const notes=field('备注|说明|notes?');
  return {items,customer,contact,location,preference,notes,...parseDeliverySchedule(text,now),sourceText:text,status:'pending'};
}
