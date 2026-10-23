import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalWorkspace,DEMO_KEY,DEMO_SESSION} from '../public/local-workspace.js';
class MemoryStorage{
 values=new Map();failWrite=false;
 getItem(key){return this.values.get(key)??null;}
 setItem(key,value){if(this.failWrite)throw Error('QuotaExceededError');this.values.set(key,String(value));}
 removeItem(key){this.values.delete(key);}
}
const now=()=>new Date('2026-10-22T10:00:00Z');
const create=(storage=new MemoryStorage(),sessionStorage=new MemoryStorage())=>({api:createLocalWorkspace({storage,sessionStorage,now}),storage,sessionStorage});
const ownerInput={action:'create',shop:'Fictional demo shop',operatorName:'Demo owner',username:'demo-owner',password:'fictional-pass-123',repeatPassword:'fictional-pass-123'};
const menu=[{id:'dish',name:'Demo dish',description:'Fictional',ingredients:[{name:'Rice',quantity:100,unit:'g'}],minutes:15,image:'data:image/png;base64,aGVsbG8='}];
const order={id:'order',number:'TEST-1',items:[{name:'Demo dish',dishId:'dish',quantity:2,minutes:15}],scheduledAt:'2026-10-22T19:00',scheduledEndAt:'2026-10-22T19:30',status:'pending',location:'Fictional location',contact:'Test contact'};
test('local registration persists hashed credentials and restores sessions without a server',async()=>{
 const {api,storage,sessionStorage}=create();assert.equal((await api.request()).identity,null);
 const state=await api.request(ownerInput);const persisted=JSON.parse(storage.getItem(DEMO_KEY));assert.equal(persisted.stores[0].members[0].hash.length,64);assert.ok(!storage.getItem(DEMO_KEY).includes(ownerInput.password));assert.ok(!JSON.stringify(state).includes('hash'));assert.ok(sessionStorage.getItem(DEMO_SESSION));
 const reloaded=create(storage,sessionStorage).api;assert.equal((await reloaded.request()).memberships[0].merchantId,state.id);
 await reloaded.request({action:'logout'});await assert.rejects(()=>reloaded.request({},'?merchantId='+state.id),/MEMBERSHIP_REQUIRED/);
 await assert.rejects(()=>reloaded.request({action:'login',username:'demo-owner',password:'wrong'}),/WRONG_PASSWORD/);
 assert.equal((await reloaded.request({action:'login',username:'DEMO-OWNER',password:ownerInput.password})).id,state.id);
});
test('reusable store codes join multiple operators; all members see sanitized accounts',async()=>{
 const {api,storage}=create(),state=await api.request(ownerInput),store=state.id;const second=create(storage).api;
 const listing=await api.request({},'?merchantId='+store+'&operators=1');assert.match(listing.storeCode,/^[A-Z2-9]{4}(-[A-Z2-9]{4}){2}$/);
 const joined=await second.request({action:'join',code:listing.storeCode.toLowerCase().replaceAll('-',' '),operatorName:'Kitchen',username:'kitchen',password:'fictional-kitchen',repeatPassword:'fictional-kitchen'});assert.equal(joined.operator.role,'operator');
 const other=await create(storage).api.request({action:'join',code:listing.storeCode,username:'other',password:'fictional-other',repeatPassword:'fictional-other'});assert.equal(other.id,store);
 const memberList=await second.request({},'?merchantId='+store+'&operators=1');assert.equal(memberList.members.length,3);assert.equal(memberList.storeCode,listing.storeCode);assert.ok(!JSON.stringify(memberList).includes('hash'));assert.ok(!JSON.stringify(memberList).includes('salt'));assert.ok(!JSON.stringify(memberList).includes('password'));
 await assert.rejects(()=>second.request({action:'operator_delete',merchantId:store,id:other.operator.id}),/OWNER_REQUIRED/);
 const saved=await api.request({action:'save',merchantId:store,expectedRevision:0,menu,orders:[order]});assert.equal(saved.orders[0].createdAt,now().toISOString());
 assert.equal((await second.request({},'?merchantId='+store)).orders.length,1);
 const updated=await second.request({action:'save',merchantId:store,expectedRevision:1,menu:saved.menu,orders:[{...saved.orders[0],notes:'Kitchen edit'}],actorName:'Forged'});
 const logs=await api.request({},'?merchantId='+store+'&logs=1');assert.ok(logs.entries.some(row=>row.action==='order_update'&&row.actor_name==='Kitchen (kitchen)'));assert.ok(!JSON.stringify(logs).includes('Forged'));assert.equal(updated.orders[0].notes,'Kitchen edit');
 await assert.rejects(()=>api.request({action:'operator_delete',merchantId:store,id:state.operator.id}),/OWNER_REQUIRED/);
 const beforeDelete=storage.getItem(DEMO_KEY);storage.failWrite=true;await assert.rejects(()=>api.request({action:'operator_delete',merchantId:store,id:joined.operator.id}),/LOCAL_STORAGE_FULL/);assert.equal(storage.getItem(DEMO_KEY),beforeDelete);storage.failWrite=false;assert.equal((await second.request({},'?merchantId='+store)).operator.id,joined.operator.id);
 await api.request({action:'operator_delete',merchantId:store,id:joined.operator.id});await assert.rejects(()=>second.request({},'?merchantId='+store),/MEMBERSHIP_REQUIRED/);await assert.rejects(()=>second.request({},'?merchantId='+store+'&operators=1'),/MEMBERSHIP_REQUIRED/);await assert.rejects(()=>second.request({action:'save',merchantId:store,expectedRevision:2,menu,orders:[]}),/MEMBERSHIP_REQUIRED/);await assert.rejects(()=>second.request({action:'login',username:'kitchen',password:'fictional-kitchen'}),/WRONG_PASSWORD/);
 assert.equal((await api.request({},'?merchantId='+store)).orders[0].notes,'Kitchen edit');assert.ok((await api.request({},'?merchantId='+store+'&logs=1')).entries.some(row=>row.actor_id===joined.operator.id&&row.actor_name==='Kitchen (kitchen)'));assert.equal((await api.request({},'?merchantId='+store+'&operators=1')).members.length,2);
});
test('local stores and separate browser storage remain isolated',async()=>{
 const first=create(),state=await first.api.request(ownerInput),second=create();assert.equal((await second.api.request()).memberships.length,0);await assert.rejects(()=>second.api.request({},'?merchantId='+state.id),/MEMBERSHIP_REQUIRED/);
 const other=create(first.storage).api,otherStore=await other.request({...ownerInput,username:'other-owner'});await assert.rejects(()=>other.request({},'?merchantId='+state.id),/MEMBERSHIP_REQUIRED/);assert.equal(otherStore.orders.length,0);
});
test('legacy accounts keep their existing credentials, menus, history and untouched original storage',async()=>{
 const storage=new MemoryStorage(),salt=Array(16).fill(3),material=await crypto.subtle.importKey('raw',new TextEncoder().encode('legacy-fictional'),'PBKDF2',false,['deriveBits']),bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new Uint8Array(salt),iterations:150000,hash:'SHA-256'},material,256),hash=[...new Uint8Array(bits)].map(n=>n.toString(16).padStart(2,'0')).join('');
 const legacy=JSON.stringify({accounts:[{id:'legacy',username:'legacy-owner',shop:'Legacy shop',salt,hash,menu,orders:[{...order,status:'delivered',createdAt:'2026-10-20T00:00:00Z',deliveredAt:'2026-10-21T00:00:00Z'}]}]});storage.setItem('takeaway-desk-v1',legacy);
 const {api}=create(storage);assert.equal((await api.request()).legacyAccountCount,1);assert.equal(storage.getItem(DEMO_KEY),null);
 const state=await api.request({action:'login',username:'legacy-owner',password:'legacy-fictional'});assert.equal(state.menu.length,1);assert.equal(state.orders[0].deliveredAt,'2026-10-21T00:00:00Z');assert.equal(storage.getItem('takeaway-desk-v1'),legacy);
 const logs=await api.request({},'?merchantId=legacy&logs=1');assert.equal(logs.entries.length,0);assert.ok((await api.request({},'?merchantId=legacy&operators=1')).storeCode);
});
test('concurrent local writers reject stale revisions and preserve the winning edit',async()=>{
 const {api,storage}=create(),state=await api.request(ownerInput),second=create(storage).api;await second.request({action:'login',username:'demo-owner',password:ownerInput.password});
 const writes=await Promise.allSettled([api,second].map((client,index)=>client.request({action:'save',merchantId:state.id,expectedRevision:0,menu,orders:[{...order,notes:'Writer '+index}]})));
 assert.equal(writes.filter(x=>x.status==='fulfilled').length,1);assert.match(writes.find(x=>x.status==='rejected').reason.message,/CONFLICT/);
 const current=await api.request({},'?merchantId='+state.id);assert.equal(current.revision,1);assert.equal(current.orders.length,1);const logs=await api.request({},'?merchantId='+state.id+'&logs=1');assert.equal(logs.entries.filter(x=>x.action==='order_add').length,1);
});
test('quota errors and invalid writes do not lose previously saved records',async()=>{
 const {api,storage}=create(),state=await api.request(ownerInput);const saved=await api.request({action:'save',merchantId:state.id,expectedRevision:0,menu,orders:[order]}),before=storage.getItem(DEMO_KEY);
 storage.failWrite=true;await assert.rejects(()=>api.request({action:'save',merchantId:state.id,expectedRevision:1,menu,orders:[{...saved.orders[0],notes:'Cannot save'}]}),/LOCAL_STORAGE_FULL/);assert.equal(storage.getItem(DEMO_KEY),before);storage.failWrite=false;
 await assert.rejects(()=>api.request({action:'save',merchantId:state.id,expectedRevision:1,menu:[],orders:[]}),/ORDER_DELETE_FORBIDDEN/);assert.equal((await api.request({},'?merchantId='+state.id)).orders.length,1);
 assert.equal(storage.getItem(DEMO_KEY),before);
 const corrupt=new MemoryStorage();corrupt.setItem(DEMO_KEY,'{"version":99}');await assert.rejects(()=>create(corrupt).api.request(),/LOCAL_DATA_INVALID/);assert.equal(corrupt.getItem(DEMO_KEY),'{"version":99}');
});
test('only actual order changes are logged; legacy noise is filtered before pagination',async()=>{
 const {api,storage}=create(),state=await api.request(ownerInput);const before=storage.getItem(DEMO_KEY);
 for(const event of ['login','view_orders','view_menu','language','form_order','recognition_success','export','cancel'])await api.request({action:'event',merchantId:state.id,event});assert.equal(storage.getItem(DEMO_KEY),before);
 let saved=await api.request({action:'save',merchantId:state.id,expectedRevision:0,menu,orders:[]});assert.equal((await api.request({},'?merchantId='+state.id+'&logs=1')).entries.length,0);
 for(let i=0;i<110;i++)saved=await api.request({action:'save',merchantId:state.id,expectedRevision:saved.revision,menu,orders:[{...order,notes:'Edit '+i}]});
 const db=JSON.parse(storage.getItem(DEMO_KEY));for(let i=0;i<120;i++)db.stores[0].audit.push({id:'old-noise-'+i,at:'2026-10-22T10:00:00Z',action:'view_orders'});storage.setItem(DEMO_KEY,JSON.stringify(db));
 const page1=await api.request({},'?merchantId='+state.id+'&logs=1'),page2=await api.request({},'?merchantId='+state.id+'&logs=1&cursor='+encodeURIComponent(page1.nextCursor));assert.equal(page1.entries.length,100);assert.ok(page2.entries.length);const ids=[...page1.entries,...page2.entries].map(x=>x.id);assert.equal(new Set(ids).size,ids.length);
 assert.equal(ids.length,110);assert.equal(page2.nextCursor,null);assert.ok([...page1.entries,...page2.entries].every(x=>['order_add','order_update'].includes(x.action)));assert.equal(JSON.parse(storage.getItem(DEMO_KEY)).stores[0].audit.length,230);
 saved=await api.request({action:'save',merchantId:state.id,expectedRevision:saved.revision,menu,orders:[{...saved.orders[0],status:'delivered'}]});
 // The fixed clock gives every entry the same timestamp. Random UUID tie order
 // can place delivery on either page, so verify the complete paginated history.
 const deliveredPage=await api.request({},'?merchantId='+state.id+'&logs=1'),deliveredTail=deliveredPage.nextCursor?await api.request({},'?merchantId='+state.id+'&logs=1&cursor='+encodeURIComponent(deliveredPage.nextCursor)):{entries:[]};
 assert.ok([...deliveredPage.entries,...deliveredTail.entries].some(x=>x.action==='order_deliver'));assert.ok(saved.orders[0].deliveredAt);
});

test('existing stores receive stable codes without losing data or expiring them',async()=>{
 const {api,storage,sessionStorage}=create(),state=await api.request(ownerInput),query='?merchantId='+state.id+'&operators=1';await api.request({action:'save',merchantId:state.id,expectedRevision:0,menu,orders:[order]});
 const old=JSON.parse(storage.getItem(DEMO_KEY));delete old.stores[0].storeCode;old.stores[0].invitations=[{id:'old-invite',name:'Prior invite',tokenHash:'old-token',expires:'2026-10-23T00:00Z'}];storage.setItem(DEMO_KEY,JSON.stringify(old));
 storage.failWrite=true;await assert.rejects(()=>api.request({},query),/LOCAL_STORAGE_FULL/);assert.equal(storage.getItem(DEMO_KEY),JSON.stringify(old));storage.failWrite=false;
 const [first,concurrent]=await Promise.all([api.request({},query),create(storage,sessionStorage).api.request({},query)]);assert.equal(first.storeCode,concurrent.storeCode);assert.equal((await create(storage,sessionStorage).api.request({},query)).storeCode,first.storeCode);
 const future=createLocalWorkspace({storage,sessionStorage:new MemoryStorage(),now:()=>new Date('2027-10-24T00:00Z')});assert.equal((await future.request({action:'join',code:first.storeCode,username:'future-user',password:'fictional-123',repeatPassword:'fictional-123'})).id,state.id);
 const after=JSON.parse(storage.getItem(DEMO_KEY));assert.deepEqual(after.stores[0].menu,old.stores[0].menu);assert.deepEqual(after.stores[0].orders,old.stores[0].orders);assert.deepEqual(after.stores[0].invitations,old.stores[0].invitations);
 await assert.rejects(()=>create(storage).api.request({action:'join',code:'wrong-code',username:'bad-code',password:'fictional-123',repeatPassword:'fictional-123'}),/STORE_CODE_INVALID/);
 const other=create(storage).api,otherStore=await other.request({...ownerInput,username:'other-admin'}),otherCode=(await other.request({},'?merchantId='+otherStore.id+'&operators=1')).storeCode;assert.notEqual(otherCode,first.storeCode);await assert.rejects(()=>other.request({},query),/MEMBERSHIP_REQUIRED/);await assert.rejects(()=>api.request({action:'operator_delete',merchantId:state.id,id:otherStore.operator.id}),/ACCOUNT_NOT_FOUND/);
});
