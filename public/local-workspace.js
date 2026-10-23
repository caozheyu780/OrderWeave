import {validateOrder} from './core.js';
import {cleanAliases,conflictingDish} from './menu-matching.js';
import {validateRecipe} from './materials.js';
import {validateCommerce} from './commerce.js';
import {createBuyerHandler} from './buyer-store.js';

export const DEMO_KEY='orderweave-demo-v1',DEMO_SESSION='orderweave-demo-session';
const LEGACY_KEY='takeaway-desk-v1';
const copy=value=>structuredClone(value);
const fail=code=>{throw Error(code);};
const text=(value,max=100)=>String(value??'').trim().slice(0,max);
let queue=Promise.resolve();
function fallbackLock(fn){const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;}
const events=new Set(['login','logout','view_orders','view_menu','view_materials','view_operators','view_logs','order_view','export','recognition_start','recognition_success','recognition_failure','review_cancel','language','cancel','order_filter','material_scope','form_dish','form_order','recognition_open','recognition_rules','source_import','review_edit','review_remove','close_dialog']);
const orderActions=new Set(['order_add','order_update','order_deliver','order_import']);
const codeAlphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const normalizeCode=value=>text(value,100).replace(/[\s-]/g,'').toUpperCase();

// Store accounts and permissions are scoped to this browser's storage.
export function createLocalWorkspace({storage,sessionStorage,crypto:crypt=globalThis.crypto,now=()=>new Date(),lock=globalThis.navigator?.locks?fn=>navigator.locks.request('orderweave-demo-write',fn):fallbackLock}){
  const uid=()=>crypt.randomUUID(),at=()=>now().toISOString();
  async function passwordHash(password,salt){const material=await crypt.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypt.subtle.deriveBits({name:'PBKDF2',salt:new Uint8Array(salt),iterations:150000,hash:'SHA-256'},material,256);return [...new Uint8Array(bits)].map(n=>n.toString(16).padStart(2,'0')).join('');}
  const buyerRequest=createBuyerHandler({sessionStorage,crypt,now,passwordHash,uid,commit,audit});
  function ensureStoreCode(context,store){
    if(store.storeCode)return false;
    let code;do{code=[...crypt.getRandomValues(new Uint8Array(12))].map(n=>codeAlphabet[n&31]).join('').match(/.{4}/g).join('-');}while(context.data.stores.some(s=>normalizeCode(s.storeCode)===normalizeCode(code)));
    store.storeCode=code;return true;
  }
  function read(){
    let raw,data;
    try{raw=storage.getItem(DEMO_KEY);if(raw){data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.stores)||data.stores.some(s=>!s.id||!Array.isArray(s.members)||!Array.isArray(s.menu)||!Array.isArray(s.orders)||!Array.isArray(s.audit)||!Array.isArray(s.invitations)||!Number.isInteger(s.revision)))fail('LOCAL_DATA_INVALID');}
      else {data={version:1,stores:[]};const legacyRaw=storage.getItem(LEGACY_KEY);if(legacyRaw){const legacy=JSON.parse(legacyRaw);if(!Array.isArray(legacy.accounts)||legacy.accounts.some(a=>!a.id||!Array.isArray(a.menu)||!Array.isArray(a.orders)||!a.hash||!Array.isArray(a.salt)))fail('LOCAL_DATA_INVALID');data.stores=legacy.accounts.map(a=>({id:a.id,shop:a.shop||a.username,revision:0,menu:copy(a.menu),orders:copy(a.orders),audit:[],invitations:[],restoredLegacy:true,members:[{id:a.id+'-owner',username:a.username,name:a.username,role:'owner',disabled:false,salt:copy(a.salt),hash:a.hash}]}));}}
    }catch(error){if(error.message==='LOCAL_DATA_INVALID')throw error;fail('LOCAL_DATA_INVALID');}return {raw,data};
  }
  function commit(context){
    try{if(storage.getItem(DEMO_KEY)!==context.raw)fail('CONFLICT');storage.setItem(DEMO_KEY,JSON.stringify(context.data));}
    catch(error){if(error.message==='CONFLICT')throw error;fail('LOCAL_STORAGE_FULL');}
  }
  function session(){try{const value=sessionStorage.getItem(DEMO_SESSION);return value?JSON.parse(value):null;}catch{return null;}}
  function actorFor(data,storeId){const selected=session(),store=data.stores.find(s=>s.id===storeId),actor=store?.members.find(m=>m.id===selected?.actorId&&!m.disabled);if(!store||!actor||selected.storeId!==storeId)fail('MEMBERSHIP_REQUIRED');return {store,actor};}
  function audit(store,actor,action,target=''){if(orderActions.has(action))store.audit.push({id:uid(),store_id:store.id,actor_id:actor.id,actor_name:actor.name+' ('+actor.username+')',action,target:text(target,120),at:at()});}
  function state(store,actor){return {id:store.id,shop:store.shop,revision:store.revision,menu:copy(store.menu),orders:copy(store.orders),username:actor.username,operator:{id:actor.id,name:actor.name,username:actor.username,role:actor.role}};}
  function setSession(store,actor){try{sessionStorage.setItem(DEMO_SESSION,JSON.stringify({storeId:store.id,actorId:actor.id}));}catch{fail('LOCAL_SESSION_UNAVAILABLE');}}
  function loginName(value){const username=text(value,60).toLowerCase();if(username.length<2)fail('INVALID_DATA');return username;}
  async function newMember(input,role,name){
    const username=loginName(input.username),password=String(input.password??'');if(password.length<6||password.length>200||password!==input.repeatPassword)fail('PASSWORD_INVALID');
    const salt=[...crypt.getRandomValues(new Uint8Array(16))];return {id:uid(),username,name:text(name,80)||username,role,disabled:false,salt,hash:await passwordHash(password,salt)};
  }
  function validateData(input){
    if(!Array.isArray(input.menu)||!Array.isArray(input.orders)||input.menu.length>300||input.orders.length>10000)fail('INVALID_DATA');const menu=copy(input.menu),orders=copy(input.orders),ids=new Set();
    for(const dish of menu){if(!dish||!text(dish.id)||ids.has(dish.id)||typeof dish.name!=='string'||!dish.name.trim()||dish.name.length>100||typeof dish.description!=='string'||dish.description.length>2000||!Number.isInteger(dish.minutes)||dish.minutes<1||dish.minutes>1440||typeof dish.image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dish.image))fail('INVALID_DATA');ids.add(dish.id);dish.aliases=cleanAliases(dish.aliases||[],dish.name);if(typeof dish.ingredients==='string'){if(!dish.ingredients.trim())fail('INVALID_DATA');}else{try{dish.ingredients=validateRecipe(dish.ingredients);}catch{fail('INVALID_DATA');}}if(conflictingDish(menu.filter(d=>d.id!==dish.id),dish))fail('INVALID_DATA');}
    menu.forEach(validateCommerce);
    ids.clear();for(const order of orders){if(!order||!text(order.id)||ids.has(order.id)||validateOrder(order)||!['pending','preparing','delivering','delivered'].includes(order.status))fail('INVALID_DATA');ids.add(order.id);}return {menu,orders};
  }
  async function request(input={},query=''){
    const mutate=Object.keys(input).length>0;
    const run=async()=>{
      const context=read(),data=context.data;
      if(typeof input.action==='string'&&input.action.startsWith('buyer_'))return buyerRequest(context,input);
      if(!mutate){const params=new URLSearchParams(query.replace(/^\?/,'')),storeId=params.get('merchantId');
        if(!storeId){const selected=session(),store=data.stores.find(s=>s.id===selected?.storeId),actor=store?.members.find(m=>m.id===selected?.actorId&&!m.disabled);return {identity:actor?{name:actor.username}:null,memberships:actor?[{id:actor.id,merchantId:store.id,shop:store.shop,name:actor.name,role:actor.role}]:[],legacyAccountCount:data.stores.filter(s=>s.restoredLegacy).length};}
        const {store,actor}=actorFor(data,storeId);
        if(params.has('logs')){const cursor=params.get('cursor')||'9999',rows=store.audit.filter(row=>orderActions.has(row.action)&&row.at+row.id<cursor).sort((a,b)=>(b.at+b.id).localeCompare(a.at+a.id)),entries=rows.slice(0,100);return {entries:copy(entries),nextCursor:rows.length>100?entries.at(-1).at+entries.at(-1).id:null};}
        if(params.has('operators')){if(ensureStoreCode(context,store))commit(context);return {members:store.members.map(({id,username,name,role,disabled})=>({id,username,name,role,disabled})),storeCode:store.storeCode};}
        return state(store,actor);
      }
      if(input.action==='logout'){try{sessionStorage.removeItem(DEMO_SESSION);}catch{}return {ok:true};}
      if(input.action==='login'){
        const username=loginName(input.username);let found;for(const store of data.stores){const actor=store.members.find(m=>m.username===username);if(actor)found={store,actor};}
        if(!found||await passwordHash(String(input.password||''),found.actor.salt)!==found.actor.hash)fail('WRONG_PASSWORD');if(found.actor.disabled)fail('OPERATOR_DISABLED');
        if(found.store.restoredLegacy){audit(found.store,found.actor,'local_restore');found.store.restoredLegacy=false;}
        ensureStoreCode(context,found.store);commit(context);setSession(found.store,found.actor);return state(found.store,found.actor);
      }
      if(input.action==='create'||input.action==='join'){
        const username=loginName(input.username);if(data.stores.some(s=>s.members.some(m=>m.username===username)))fail('ACCOUNT_EXISTS');
        if(input.action==='create'){
          const shop=text(input.shop,100);if(!shop)fail('INVALID_DATA');const actor=await newMember(input,'owner',input.operatorName),store={id:uid(),shop,revision:0,menu:[],orders:[],members:[actor],invitations:[],audit:[]};ensureStoreCode(context,store);data.stores.push(store);commit(context);setSession(store,actor);return state(store,actor);
        }
        const code=normalizeCode(input.code),store=data.stores.find(s=>s.storeCode&&normalizeCode(s.storeCode)===code);if(!code||!store)fail('STORE_CODE_INVALID');
        const actor=await newMember(input,'operator',input.operatorName);store.members.push(actor);commit(context);setSession(store,actor);return state(store,actor);
      }
      const {store,actor}=actorFor(data,input.merchantId);
        if(input.action==='event'){if(!events.has(input.event))fail('INVALID_DATA');return {ok:true};}
        if(input.action==='save'||input.action==='migrate'){
          if(input.expectedRevision!==store.revision)fail('CONFLICT');const imported=input.action==='migrate';if(imported&&(actor.role!=='owner'||store.menu.length||store.orders.length))fail('MIGRATION_EMPTY_ONLY');
          const next=validateData(input);
          for(const row of next.orders){const old=store.orders.find(o=>o.id===row.id);if(old?.source==='buyer'){for(const key of ['source','buyerId','checkoutId','items','totalCents','currency','payment'])if(JSON.stringify(row[key])!==JSON.stringify(old[key]))fail('PAID_ORDER_LOCKED');}else if(row.source==='buyer'||row.buyerId||row.payment)fail('INVALID_DATA');}
          for(const kind of ['menu','orders']){const previous=new Map(store[kind].map(row=>[row.id,row]));for(const row of next[kind]){const old=previous.get(row.id);previous.delete(row.id);if(JSON.stringify(old)===JSON.stringify(row))continue;if(kind==='orders'){if(old?.status==='delivered')fail('DELIVERED_LOCKED');if(!imported){row.updatedAt=at();if(!old)row.createdAt=at();if(row.status==='delivered'&&old?.status!=='delivered')row.deliveredAt=at();}}
            audit(store,actor,imported?(kind==='menu'?'dish_import':'order_import'):kind==='menu'?(old?'dish_update':'dish_add'):row.status==='delivered'?'order_deliver':old?'order_update':'order_add',kind==='menu'?row.name:row.number);}
            for(const old of previous.values()){if(kind==='orders')fail('ORDER_DELETE_FORBIDDEN');audit(store,actor,'dish_delete',old.name);}}
          store.menu=next.menu;store.orders=next.orders;store.revision++;commit(context);return state(store,actor);
        }
        if(actor.role!=='owner')fail('OWNER_REQUIRED');
        if(input.action==='operator_delete'){const target=store.members.find(m=>m.id===input.id);if(!target)fail('ACCOUNT_NOT_FOUND');if(target.role==='owner')fail('OWNER_REQUIRED');store.members=store.members.filter(m=>m.id!==target.id);store.revision++;commit(context);return {ok:true};}
        if(input.action==='operator_status'){const target=store.members.find(m=>m.id===input.id);if(!target||target.role==='owner')fail('OWNER_REQUIRED');target.disabled=!!input.disabled;audit(store,actor,input.disabled?'operator_disable':'operator_enable',target.name+' ('+target.username+')');commit(context);return {ok:true};}
        fail('INVALID_DATA');
    };
    // Reads can initialize a missing store code; serialize that migration with writes.
    return lock(run);
  }
  return {request};
}
