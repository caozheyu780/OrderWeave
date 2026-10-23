import {TEXT_LIMIT} from '../public/import-limits.js';
import {validateOrder} from '../public/core.js';
import {cleanAliases,conflictingDish} from '../public/menu-matching.js';
import {validateRecipe} from '../public/materials.js';
const headers={'Cache-Control':'no-store'};
export class WorkspaceError extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status;}}
const fail=(code,status)=>{throw new WorkspaceError(code,status);};
const trimmed=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const id=()=>crypto.randomUUID();
const reply=(data,status=200)=>Response.json(data,{status,headers});
async function hash(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const actions=new Set(["order_filter","material_scope","form_dish","form_order","recognition_open","recognition_rules","source_import","review_edit","review_remove","close_dialog",'login','logout','view_orders','view_menu','view_materials','view_operators','view_logs','order_view','export','recognition_start','recognition_success','recognition_failure','review_cancel','language','cancel']);
const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
function auditStatement(db,store,actor,action,target='',guard=null){
  const sql=guard?'INSERT INTO audit (id,store_id,actor_id,actor_name,action,target,at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM stores WHERE id=? AND write_id=?)':'INSERT INTO audit (id,store_id,actor_id,actor_name,action,target,at) VALUES (?,?,?,?,?,?,?)';
  return stmt(db,sql,id(),store,actor.id,actor.name,action,trimmed(target,120),new Date().toISOString(),...(guard?[store,guard]:[]));
}
async function member(db,store,user){
  const row=await stmt(db,'SELECT * FROM members WHERE store_id=? AND user_id=? AND disabled=0',store,user.userId).first();
  if(!row)fail('MEMBERSHIP_REQUIRED',403);return row;
}
async function readState(db,store,actor){
  const shop=await stmt(db,'SELECT * FROM stores WHERE id=?',store).first();if(!shop)fail('NOT_FOUND',404);
  // A single batch gives a consistent database snapshot for revision and records.
  const results=await db.batch([stmt(db,'SELECT * FROM stores WHERE id=?',store),stmt(db,'SELECT kind,body FROM records WHERE store_id=?',store)]);
  const state={id:store,shop:results[0].results[0].shop,revision:results[0].results[0].revision,menu:[],orders:[],username:actor.name,operator:{id:actor.id,name:actor.name,role:actor.role}};
  for(const row of results[1].results)state[row.kind==='menu'?'menu':'orders'].push(JSON.parse(row.body));
  return state;
}
export function validateWorkspaceData(data){
  if(!Array.isArray(data.menu)||!Array.isArray(data.orders)||data.menu.length>300||data.orders.length>10000)fail('INVALID_DATA');
  const menu=structuredClone(data.menu),orders=structuredClone(data.orders),ids=new Set();
  for(const dish of menu){
    if(dish&&dish.image==null)dish.image='';
    if(!dish||typeof dish.id!=='string'||!dish.id||dish.id.length>100||ids.has(dish.id)||typeof dish.name!=='string'||!dish.name.trim()||dish.name.length>100||typeof dish.description!=='string'||dish.description.length>2000||dish.minutes!=null&&(!Number.isInteger(dish.minutes)||dish.minutes<1||dish.minutes>1440)||typeof dish.image!=='string')fail('INVALID_DATA');
    ids.add(dish.id);dish.minutes??=null;dish.aliases=cleanAliases(dish.aliases||[],dish.name);
    if(typeof dish.ingredients==='string'){if(!dish.ingredients.trim()||dish.ingredients.length>2000)fail('INVALID_DATA');}else {try{dish.ingredients=validateRecipe(dish.ingredients);}catch{fail('INVALID_DATA');}}
    if(conflictingDish(menu.filter(x=>x.id!==dish.id),dish))fail('INVALID_DATA');
  }
  ids.clear();
  for(const order of orders){
    if(!order||typeof order.id!=='string'||!order.id||order.id.length>100||ids.has(order.id)||validateOrder(order)||!['pending','preparing','delivering','delivered'].includes(order.status)||JSON.stringify(order).length>150000)fail('INVALID_DATA');
    for(const [field,max] of [['number',100],['customer',100],['location',500],['contact',200],['preference',500],['notes',3000],['sourceText',TEXT_LIMIT]])if(order[field]!=null&&(typeof order[field]!=='string'||order[field].length>max))fail('INVALID_DATA');
    if(order.items.length>100||order.items.some(i=>typeof i.name!=='string'||i.name.length>100))fail('INVALID_DATA');
    ids.add(order.id);
  }
  return {menu,orders};
}
async function storeImages(menu,bucket,store){
  for(const dish of menu){
    if(!dish.image)continue;
    if(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dish.image)){
      const [prefix,encoded]=dish.image.split(',');if(encoded.length>1500000)fail('IMAGE_TOO_LARGE',413);
      const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),name=await hash(dish.image);
      await bucket.put(store+'/'+name,bytes,{httpMetadata:{contentType:prefix.split(';')[0].slice(5)}});
      dish.image='/api/workspace?merchantId='+encodeURIComponent(store)+'&image='+name;
    }else if(dish.image.startsWith('/api/workspace?')){
      const url=new URL(dish.image,'https://internal');if(url.searchParams.get('merchantId')!==store||!/^\w{64}$/.test(url.searchParams.get('image')||''))fail('INVALID_IMAGE');
    }else fail('INVALID_IMAGE');
  }
}
async function saveState(db,bucket,store,actor,input,migration=false){
  const data=validateWorkspaceData(input),before=await readState(db,store,actor),revision=input.expectedRevision;
  if(!Number.isInteger(revision)||revision!==before.revision)fail('CONFLICT',409);
  if(migration&&(actor.role!=='owner'||before.menu.length||before.orders.length))fail('MIGRATION_EMPTY_ONLY',409);
  await storeImages(data.menu,bucket,store);
  const guard=id(),batch=[stmt(db,'UPDATE stores SET revision=revision+1,write_id=? WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM members WHERE id=? AND disabled=0)',guard,store,revision,actor.id)];
  const now=new Date().toISOString();
  for(const kind of ['menu','orders']){
    const previous=new Map(before[kind].map(x=>[x.id,x]));
    for(const row of data[kind]){
      const old=previous.get(row.id);previous.delete(row.id);
      if(JSON.stringify(old)===JSON.stringify(row))continue;
      if(kind==='orders'){
        if(old?.status==='delivered'&&JSON.stringify(old)!==JSON.stringify(row))fail('DELIVERED_LOCKED',409);
        if(!migration){row.updatedAt=now;if(!old)row.createdAt=now;if(row.status==='delivered'&&old?.status!=='delivered')row.deliveredAt=now;}
        else if(!Number.isFinite(Date.parse(row.createdAt))||(row.status==='delivered'&&!Number.isFinite(Date.parse(row.deliveredAt))))fail('INVALID_DATA');
      }
      batch.push(stmt(db,'INSERT INTO records (store_id,kind,id,body) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM stores WHERE id=? AND write_id=?) ON CONFLICT(store_id,kind,id) DO UPDATE SET body=excluded.body',store,kind==='menu'?'menu':'order',row.id,JSON.stringify(row),store,guard));
      const action=migration?(kind==='menu'?'dish_import':'order_import'):kind==='menu'?(old?'dish_update':'dish_add'):row.status==='delivered'?'order_deliver':old?'order_update':'order_add';
      batch.push(auditStatement(db,store,actor,action,kind==='menu'?row.name:row.number,guard));
    }
    for(const old of previous.values()){
      if(kind==='orders')fail('ORDER_DELETE_FORBIDDEN',403);
      batch.push(stmt(db,'DELETE FROM records WHERE store_id=? AND kind=? AND id=? AND EXISTS (SELECT 1 FROM stores WHERE id=? AND write_id=?)',store,'menu',old.id,store,guard));batch.push(auditStatement(db,store,actor,'dish_delete',old.name,guard));
    }
  }
  const result=await db.batch(batch);if(!result[0].meta.changes)fail('CONFLICT',409);return readState(db,store,actor);
}
export async function handleWorkspace(request,env,user){
  let failureContext=null;
  try{
    if(!user)fail('AUTH_REQUIRED',401);if(!env.DB||!env.BUCKET)fail('STORAGE_UNAVAILABLE',503);
    const db=env.DB,url=new URL(request.url),store=url.searchParams.get('merchantId');
    if(request.method==='GET'){
      if(!store){const result=await stmt(db,'SELECT m.id,m.store_id AS merchantId,m.name,m.role,s.shop FROM members m JOIN stores s ON s.id=m.store_id WHERE m.user_id=? AND m.disabled=0',user.userId).all();return reply({identity:{name:user.displayName},memberships:result.results});}
      const actor=await member(db,store,user);
      if(url.searchParams.has('image')){const image=url.searchParams.get('image');if(!/^[a-f0-9]{64}$/.test(image||''))fail('NOT_FOUND',404);const object=await env.BUCKET.get(store+'/'+image);if(!object)fail('NOT_FOUND',404);return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});}
      if(url.searchParams.has('logs')){const cursor=url.searchParams.get('cursor')||'9999',rows=await stmt(db,'SELECT * FROM audit WHERE store_id=? AND (at || id) < ? ORDER BY at DESC,id DESC LIMIT 101',store,cursor).all();const entries=rows.results.slice(0,100);return reply({entries,nextCursor:rows.results.length>100?entries.at(-1).at+entries.at(-1).id:null});}
      if(url.searchParams.has('operators')){if(actor.role!=='owner')fail('OWNER_REQUIRED',403);return reply({members:(await stmt(db,'SELECT id,name,role,disabled FROM members WHERE store_id=?',store).all()).results,invitations:(await stmt(db,'SELECT id,name,expires,used_at,revoked FROM invitations WHERE store_id=? ORDER BY expires DESC',store).all()).results});}
      return reply(await readState(db,store,actor));
    }
    if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
    if(request.headers.get('origin')!==url.origin)fail('FORBIDDEN',403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))fail('INVALID_DATA',415);
    const reader=request.body?.getReader();if(!reader)fail('INVALID_DATA');let bytes=0,chunks=[];
    for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>12000000){await reader.cancel();fail('REQUEST_TOO_LARGE',413);}chunks.push(part.value);}const content=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){content.set(chunk,offset);offset+=chunk.length;}
    let input;try{input=JSON.parse(new TextDecoder().decode(content));}catch{fail('INVALID_DATA');}
    if(input.action==='create'){
      const shop=trimmed(input.shop,100);if(!shop)fail('INVALID_DATA');
      const count=await stmt(db,'SELECT count(*) AS n FROM members WHERE user_id=? AND role=?',user.userId,'owner').first();if(count.n>=10)fail('STORE_LIMIT',409);
      const storeId=id(),actor={id:id(),name:trimmed(input.operatorName,80)||trimmed(user.displayName,80),role:'owner'};
      await db.batch([stmt(db,'INSERT INTO stores (id,shop) VALUES (?,?)',storeId,shop),stmt(db,'INSERT INTO members (id,store_id,user_id,name,role) VALUES (?,?,?,?,?)',actor.id,storeId,user.userId,actor.name,'owner'),auditStatement(db,storeId,actor,'store_create',shop)]);
      return reply(await readState(db,storeId,actor),201);
    }
    if(input.action==='join'){
      const code=trimmed(input.code,100),invite=await stmt(db,'SELECT * FROM invitations WHERE token_hash=? AND used_at IS NULL AND revoked=0 AND expires>?',await hash(code),new Date().toISOString()).first();if(!invite)fail('INVITE_INVALID',409);
      const existing=await stmt(db,'SELECT id FROM members WHERE store_id=? AND user_id=?',invite.store_id,user.userId).first();if(existing)fail('ALREADY_MEMBER',409);
      const actor={id:id(),name:invite.name,role:'operator'},now=new Date().toISOString(),claim='claimed:'+id();
      const result=await db.batch([stmt(db,'UPDATE invitations SET used_at=?,token_hash=? WHERE id=? AND token_hash=? AND used_at IS NULL AND revoked=0 AND expires>?',now,claim,invite.id,invite.token_hash,now),stmt(db,'INSERT INTO members (id,store_id,user_id,name,role) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM invitations WHERE id=? AND token_hash=?)',actor.id,invite.store_id,user.userId,actor.name,actor.role,invite.id,claim),stmt(db,'INSERT INTO audit (id,store_id,actor_id,actor_name,action,target,at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM members WHERE id=?)',id(),invite.store_id,actor.id,actor.name,'operator_join','',now,actor.id)]);
      if(!result[1].meta.changes)fail('INVITE_INVALID',409);return reply(await readState(db,invite.store_id,actor));
    }
    const storeId=trimmed(input.merchantId,100),actor=await member(db,storeId,user);failureContext={db,storeId,actor,action:trimmed(input.action,30)};
    if(input.action==='save'||input.action==='migrate')return reply(await saveState(db,env.BUCKET,storeId,actor,input,input.action==='migrate'));
    if(input.action==='event'){if(!actions.has(input.event))fail('INVALID_DATA');await auditStatement(db,storeId,actor,input.event,trimmed(input.target,120)).run();return reply({ok:true});}
    if(actor.role!=='owner')fail('OWNER_REQUIRED',403);
    if(input.action==='invite'){
      const name=trimmed(input.name,80);if(!name)fail('INVALID_DATA');const token=Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join(''),expires=new Date(Date.now()+86400000).toISOString();
      await db.batch([stmt(db,'INSERT INTO invitations (id,store_id,name,token_hash,expires) VALUES (?,?,?,?,?)',id(),storeId,name,await hash(token),expires),auditStatement(db,storeId,actor,'operator_invite',name)]);return reply({code:token,expires});
    }
    if(input.action==='revoke'){
      const result=await db.batch([stmt(db,'UPDATE invitations SET revoked=1 WHERE id=? AND store_id=? AND used_at IS NULL',input.id,storeId),auditStatement(db,storeId,actor,'invite_revoke',input.id)]);return reply({ok:!!result[0].meta.changes});
    }
    if(input.action==='operator_status'){
      const target=await stmt(db,'SELECT * FROM members WHERE id=? AND store_id=?',input.id,storeId).first();if(!target||target.role==='owner')fail('OWNER_PROTECTED',403);
      await db.batch([stmt(db,'UPDATE members SET disabled=? WHERE id=? AND store_id=?',input.disabled?1:0,target.id,storeId),auditStatement(db,storeId,actor,input.disabled?'operator_disable':'operator_enable',target.name)]);return reply({ok:true});
    }
    fail('INVALID_DATA');
  }catch(error){const known=error instanceof WorkspaceError;if(failureContext&&request.method==='POST'){const {db,storeId,actor,action}=failureContext;try{await auditStatement(db,storeId,actor,'operation_failed',action+': '+(known?error.code:'SERVER_ERROR')).run();}catch{}}
    if(!known)console.error(JSON.stringify({event:'workspace_failure',requestId:id()}));return reply({error:known?error.code:'SERVER_ERROR'},known?error.status:500);}
}
