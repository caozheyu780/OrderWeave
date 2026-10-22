import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';
const files=['lib/workspace.mjs','public/core.js','public/menu-matching.js','public/delivery-slots.js','public/materials.js'];
export async function createWorkspaceRuntime(){
 const modules=await Promise.all(files.map(async path=>({type:'ESModule',path:resolve(path),contents:await readFile(path,'utf8')})));
 const runtime=new Miniflare({compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['BUCKET'],modules:[{type:'ESModule',path:resolve('tests/workspace-fixture.mjs'),contents:`import {handleWorkspace} from '../lib/workspace.mjs';export default {fetch(request,env){const user=request.headers.get('x-test-user');return handleWorkspace(request,env,user?{userId:user,displayName:'Test '+user}:null);}};`},...modules]});
 const db=await runtime.getD1Database('DB');for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){const sql=await readFile('drizzle/'+file,'utf8');for(const statement of sql.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();}
 return {runtime,db};
}
test('actual D1/R2 workspace: identities, shared stores, atomic revisions, logs and invitations',async()=>{
 const {runtime,db}=await createWorkspaceRuntime();
 async function call(user,input,query=''){const response=await runtime.dispatchFetch('https://test.local/api/workspace'+query,{method:input?'POST':'GET',headers:{...(user?{'x-test-user':user}:{}),Origin:'https://test.local','Content-Type':'application/json'},...(input?{body:JSON.stringify(input)}:{})});return {status:response.status,data:await response.json()};}
 try{
  assert.equal((await call(null)).status,401);
  const created=await call('owner',{action:'create',shop:'Fictional shared shop',operatorName:'Manager'});assert.equal(created.status,201);const store=created.data.id;
  assert.equal((await call('outsider',null,'?merchantId='+store)).status,403);
  const invite=await call('owner',{action:'invite',merchantId:store,name:'Kitchen'});assert.equal(invite.status,200);
  const storedInvite=await db.prepare('SELECT token_hash FROM invitations').first();assert.notEqual(storedInvite.token_hash,invite.data.code);
  const joined=await call('staff',{action:'join',code:invite.data.code});assert.equal(joined.status,200);assert.equal(joined.data.operator.role,'operator');
  assert.equal((await call('other',{action:'join',code:invite.data.code})).status,409);
  assert.equal((await call('staff',{action:'invite',merchantId:store,name:'Forbidden'})).status,403);
  const menu=[{id:'dish',name:'Test dish',description:'Fictional',ingredients:[{name:'Rice',quantity:100,unit:'g'}],minutes:15,image:'data:image/png;base64,aGVsbG8='}];
  const first=await call('owner',{action:'save',merchantId:store,expectedRevision:0,menu,orders:[],actorName:'Forged'});assert.equal(first.status,200);assert.match(first.data.menu[0].image,/^\/api\/workspace/);
  const image=await runtime.dispatchFetch('https://test.local'+first.data.menu[0].image,{headers:{'x-test-user':'staff'}});assert.equal(image.status,200);assert.equal(await image.text(),'hello');
  assert.equal((await runtime.dispatchFetch('https://test.local'+first.data.menu[0].image,{headers:{'x-test-user':'outsider'}})).status,403);
  const stale=await call('staff',{action:'save',merchantId:store,expectedRevision:0,menu:[],orders:[]});assert.equal(stale.status,409);
  const shared=await call('staff',null,'?merchantId='+store);assert.equal(shared.data.revision,1);assert.equal(shared.data.menu.length,1);
  const order={id:'order',number:'TEST-1',items:[{name:'Test dish',quantity:2,minutes:15,dishId:'dish'}],status:'pending',scheduledAt:'2026-10-22T12:00',scheduledEndAt:'2026-10-22T12:30',location:'Fictional location',contact:'Test contact'};
  const writes=await Promise.all(['owner','staff'].map(user=>call(user,{action:'save',merchantId:store,expectedRevision:1,menu:first.data.menu,orders:[order]})));assert.deepEqual(writes.map(x=>x.status).sort(),[200,409]);
  const latest=await call('staff',null,'?merchantId='+store);assert.equal(latest.data.orders.length,1);
  const logs=await call('staff',null,'?merchantId='+store+'&logs=1');assert.equal(logs.data.entries.filter(x=>x.action==='order_add').length,1);assert.ok(logs.data.entries.some(x=>x.action==='dish_add'&&x.actor_name==='Manager'));assert.ok(!JSON.stringify(logs.data).includes(invite.data.code));
  assert.ok(logs.data.entries.some(x=>x.action==='operation_failed'&&x.target==='save: CONFLICT'));
  const revoked=await call('owner',{action:'invite',merchantId:store,name:'Revoked test'});const invites=await call('owner',null,'?merchantId='+store+'&operators=1');const pending=invites.data.invitations.find(x=>x.name==='Revoked test');await call('owner',{action:'revoke',merchantId:store,id:pending.id});assert.equal((await call('revoked-user',{action:'join',code:revoked.data.code})).status,409);
  const expiring=await call('owner',{action:'invite',merchantId:store,name:'Expiry test'});await db.prepare('UPDATE invitations SET expires=? WHERE name=?').bind('2000-01-01T00:00:00Z','Expiry test').run();assert.equal((await call('expired-user',{action:'join',code:expiring.data.code})).status,409);
  const statements=Array.from({length:110},(_,index)=>db.prepare('INSERT INTO audit (id,store_id,actor_id,actor_name,action,target,at) VALUES (?,?,?,?,?,?,?)').bind('page-'+String(index).padStart(3,'0'),store,created.data.operator.id,'Manager','view_logs','','2020-01-01T00:00:00Z'));await db.batch(statements);
  const page1=(await call('owner',null,'?merchantId='+store+'&logs=1')).data;assert.equal(page1.entries.length,100);assert.ok(page1.nextCursor);const page2=(await call('owner',null,'?merchantId='+store+'&logs=1&cursor='+encodeURIComponent(page1.nextCursor))).data;assert.ok(page2.entries.length);const ids=[...page1.entries,...page2.entries].map(x=>x.id);assert.equal(new Set(ids).size,ids.length);
  const delivered=await call('staff',{action:'save',merchantId:store,expectedRevision:latest.data.revision,menu:latest.data.menu,orders:[{...latest.data.orders[0],status:'delivered',deliveredAt:'2000-01-01T00:00:00Z'}]});assert.equal(delivered.status,200);assert.notEqual(delivered.data.orders[0].deliveredAt,'2000-01-01T00:00:00Z');
  assert.equal((await call('owner',{action:'save',merchantId:store,expectedRevision:delivered.data.revision,menu:delivered.data.menu,orders:[{...delivered.data.orders[0],notes:'changed'}]})).status,409);
  assert.equal((await call('owner',{action:'operator_status',merchantId:store,id:joined.data.operator.id,disabled:true})).status,200);assert.equal((await call('staff',null,'?merchantId='+store)).status,403);
  assert.equal((await call('owner',{action:'operator_status',merchantId:store,id:created.data.operator.id,disabled:true})).status,403);
  const cross=await call('outsider',{action:'create',shop:'Other shop'});assert.equal((await call('outsider',{action:'save',merchantId:cross.data.id,expectedRevision:0,menu:first.data.menu,orders:[]})).status,400);
  const bad=await runtime.dispatchFetch('https://test.local/api/workspace',{method:'POST',headers:{'x-test-user':'owner','Content-Type':'application/json',Origin:'https://evil.local'},body:JSON.stringify({action:'create',shop:'No'})});assert.equal(bad.status,403);
 }finally{await runtime.dispose();}
});
test('legacy migration preserves historical timestamps and cannot replace nonempty cloud data',async()=>{
 const {runtime}=await createWorkspaceRuntime();const call=async input=>{const r=await runtime.dispatchFetch('https://test.local/api/workspace',{method:'POST',headers:{'x-test-user':'owner',Origin:'https://test.local','Content-Type':'application/json'},body:JSON.stringify(input)});return {status:r.status,data:await r.json()};};
 try{const created=await call({action:'create',shop:'Migration fixture'}),store=created.data.id;const orders=[{id:'old',number:'OLD-1',items:[{name:'Retired dish',quantity:1,minutes:8}],scheduledAt:'2026-10-21T12:00',location:'Fictional',contact:'Test',status:'delivered',createdAt:'2026-10-20T00:00:00Z',deliveredAt:'2026-10-21T00:00:00Z'}];const migrated=await call({action:'migrate',merchantId:store,expectedRevision:0,menu:[],orders});assert.equal(migrated.status,200);assert.equal(migrated.data.orders[0].deliveredAt,orders[0].deliveredAt);assert.equal(migrated.data.orders[0].createdAt,orders[0].createdAt);assert.equal((await call({action:'migrate',merchantId:store,expectedRevision:1,menu:[],orders})).status,409);}finally{await runtime.dispose();}
});
