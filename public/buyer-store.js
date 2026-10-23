import {priceItem,CURRENCY} from './commerce.js';
import {snapshotItem} from './materials.js';
import {localDateTime,validateOrder} from './core.js';
import {deliveryWindow} from './delivery-slots.js';
export const BUYER_SESSION='orderweave-buyer-session';
const fail=code=>{throw Error(code);};
const trim=(v,max)=>String(v??'').trim().slice(0,max);
function phone(value){const s=String(value??'').trim().replace(/[\s()-]/g,'');if(!/^\+?[0-9]{7,15}$/.test(s))fail('PHONE_INVALID');return s;}
function image(value){return value===''||typeof value==='string'&&value.length<=400000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);}
export function createBuyerHandler({sessionStorage,crypt,now,passwordHash,uid,commit,audit}){
 function buyers(data){if(data.buyers!==undefined&&!Array.isArray(data.buyers))fail('LOCAL_DATA_INVALID');return data.buyers||[];}
 function current(data){const id=sessionStorage.getItem(BUYER_SESSION),b=buyers(data).find(b=>b.id===id);if(!b)fail('BUYER_AUTH_REQUIRED');return b;}
 function state(data,b){return {profile:{id:b.id,phone:b.phone,name:b.name,avatar:b.avatar,profileComplete:b.profileComplete,addresses:structuredClone(b.addresses)},cart:structuredClone(b.cart),stores:data.stores.map(s=>({id:s.id,shop:s.shop,menu:structuredClone(s.menu.map(({id,name,image,description,minutes,priceCents,category,optionGroups})=>({id,name,image,description,minutes,priceCents,category,optionGroups})))})),orders:data.stores.flatMap(s=>s.orders.filter(o=>o.buyerId===b.id).map(o=>({...structuredClone(o),shop:s.shop}))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))};}
 async function quote(data,b){
  const store=data.stores.find(s=>s.id===b.cart.storeId);if(!store||!b.cart.lines.length)fail('CART_EMPTY');
  const items=b.cart.lines.map(line=>snapshotItem(priceItem(store.menu.find(d=>d.id===line.dishId),line),store.menu));
  const totalCents=items.reduce((sum,i)=>sum+i.lineTotalCents,0);if(totalCents>99999999)fail('PRICE_INVALID');
  const payload={storeId:store.id,version:b.cart.version,items,totalCents,currency:CURRENCY};
  const hash=await crypt.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
  return {...payload,shop:store.shop,quoteToken:[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')};
 }
 return async function handle(context,input){
  const data=context.data;
  if(input.action==='buyer_logout'){sessionStorage.removeItem(BUYER_SESSION);return {ok:true};}
  if(input.action==='buyer_login'){
   const number=phone(input.phone),password=String(input.password||'');if(password.length<6||password.length>200)fail('PASSWORD_INVALID');let b=buyers(data).find(b=>b.phone===number),created=false;
   if(b){if(await passwordHash(password,b.salt)!==b.hash)fail('WRONG_PASSWORD');}
   else{const salt=[...crypt.getRandomValues(new Uint8Array(16))];b={id:uid(),phone:number,name:[...crypt.getRandomValues(new Uint8Array(10))].map(n=>'abcdefghijklmnopqrstuvwxyz0123456789'[n%36]).join(''),avatar:'',profileComplete:false,salt,hash:await passwordHash(password,salt),addresses:[],cart:{storeId:null,version:uid(),lines:[]}};data.buyers??=[];data.buyers.push(b);commit(context);created=true;}
   try{sessionStorage.setItem(BUYER_SESSION,b.id);}catch{fail('LOCAL_SESSION_UNAVAILABLE');}return {...state(data,b),created};
  }
  const b=current(data);
  if(input.action==='buyer_state')return state(data,b);
  if(input.action==='buyer_profile'){
   const name=trim(input.name,60)||b.name,avatar=input.avatar??b.avatar;if(!image(avatar))fail('INVALID_IMAGE');b.name=name;b.avatar=avatar;b.profileComplete=true;commit(context);return state(data,b);
  }
  if(input.action==='buyer_address'){
   const address={id:input.id||uid(),name:trim(input.name,80),phone:phone(input.phone),location:trim(input.location,500)};if(!address.name||!address.location)fail('ADDRESS_REQUIRED');
   if(input.id){const index=b.addresses.findIndex(a=>a.id===input.id);if(index<0)fail('ADDRESS_REQUIRED');b.addresses[index]=address;}else{if(b.addresses.length>=20)fail('ADDRESS_LIMIT');b.addresses.push(address);}commit(context);return state(data,b);
  }
  if(input.action==='buyer_cart_add'){
   const store=data.stores.find(s=>s.id===input.storeId);if(!store)fail('DISH_UNAVAILABLE');if(b.cart.lines.length&&b.cart.storeId!==store.id)fail('CART_OTHER_STORE');if(b.cart.lines.length>=50)fail('CART_INVALID');
   const line={id:uid(),dishId:input.dishId,selections:structuredClone(input.selections||{}),quantity:input.quantity,notes:trim(input.notes,300)};priceItem(store.menu.find(d=>d.id===line.dishId),line);
   b.cart.storeId=store.id;b.cart.lines.push(line);b.cart.version=uid();commit(context);return state(data,b);
  }
  if(input.action==='buyer_cart_quantity'){
   const line=b.cart.lines.find(l=>l.id===input.id);if(!line||!Number.isInteger(input.quantity)||input.quantity<0||input.quantity>99)fail('CART_INVALID');
   if(input.quantity===0)b.cart.lines=b.cart.lines.filter(l=>l.id!==line.id);else line.quantity=input.quantity;b.cart.version=uid();if(!b.cart.lines.length)b.cart.storeId=null;commit(context);return state(data,b);
  }
  if(input.action==='buyer_cart_clear'){b.cart={storeId:null,version:uid(),lines:[]};commit(context);return state(data,b);}
  if(input.action==='buyer_quote')return quote(data,b);
  if(input.action==='buyer_checkout'){
   if(typeof input.requestId!=='string'||!input.requestId||input.requestId.length>100)fail('INVALID_DATA');
   const existing=data.stores.flatMap(s=>s.orders).find(o=>o.buyerId===b.id&&o.checkoutId===input.requestId);if(existing)return {order:structuredClone(existing),...state(data,b)};
   const q=await quote(data,b);if(q.quoteToken!==input.quoteToken)fail('QUOTE_CHANGED');
   const address=b.addresses.find(a=>a.id===input.addressId);if(!address)fail('ADDRESS_REQUIRED');
   if(!['local_wallet','local_card','cash'].includes(input.paymentMethod))fail('PAYMENT_INVALID');
   const window=deliveryWindow(input);if(!window||new Date(window.scheduledEndAt)<=now())fail('DELIVERY_INVALID');
   const store=data.stores.find(s=>s.id===q.storeId);if(store.orders.length>=10000)fail('INVALID_DATA');
   const timestamp=now().toISOString(),prefix=localDateTime(now()).slice(0,10).replaceAll('-','');let seq=store.orders.length,number;do{number=prefix+'-'+String(++seq).padStart(3,'0');}while(store.orders.some(o=>o.number===number));
   const order={id:uid(),number,source:'buyer',buyerId:b.id,checkoutId:input.requestId,items:q.items,customer:address.name,contact:address.phone,location:address.location,preference:q.items.map(i=>i.name+': '+i.options.map(o=>o.groupName+' / '+o.name).join(' · ')).join('\n'),notes:trim(input.notes,3000),...window,status:'pending',createdAt:timestamp,updatedAt:timestamp,totalCents:q.totalCents,currency:q.currency,payment:{mode:'local',method:input.paymentMethod,status:input.paymentMethod==='cash'?'due':'simulated_paid',amountCents:q.totalCents,recordedAt:timestamp}};
   if(validateOrder(order))fail('INVALID_DATA');store.orders.push(order);store.revision++;audit(store,{id:b.id,name:b.name,username:b.phone},'order_add',number);
   b.cart={storeId:null,version:uid(),lines:[]};commit(context);return {order:structuredClone(order),...state(data,b)};
  }
  fail('INVALID_DATA');
 };
}
