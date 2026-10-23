import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalWorkspace,DEMO_KEY} from '../public/local-workspace.js';
import {cents,priceItem,validateCommerce,CURRENCY,cnyReference} from '../public/commerce.js';
class Storage{values=new Map();fail=false;getItem(k){return this.values.get(k)??null;}setItem(k,v){if(this.fail)throw Error('QuotaExceededError');this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}}
const now=()=>new Date('2026-10-23T04:00:00Z');
const owner={action:'create',shop:'Fictional food shop',username:'owner-test',operatorName:'Test owner',password:'test-merchant-123',repeatPassword:'test-merchant-123'};
const login={action:'buyer_login',phone:'+60111111111',password:'test-buyer-123'};
const dish={id:'dish',name:'Rice bowl',description:'Fictional bowl',ingredients:[{name:'Rice',quantity:150,unit:'g'}],minutes:10,image:'data:image/png;base64,aGVsbG8=',priceCents:1050,category:'Bowls',optionGroups:[{id:'size',name:'Size',required:true,multiple:false,choices:[{id:'normal',name:'Normal',priceCents:0},{id:'large',name:'Large',priceCents:250}]},{id:'extras',name:'Extras',required:false,multiple:true,choices:[{id:'egg',name:'Egg',priceCents:150},{id:'cheese',name:'Cheese',priceCents:200}]}]};
const line={dishId:'dish',selections:{size:['large'],extras:['egg']},quantity:2,notes:'Less salt'};
async function fixture(){const storage=new Storage(),api=()=>createLocalWorkspace({storage,sessionStorage:new Storage(),now}),merchant=api(),m=await merchant.request(owner);await merchant.request({action:'save',merchantId:m.id,expectedRevision:0,menu:[dish],orders:[]});const buyer=api();await buyer.request(login);return {storage,api,merchant,buyer,id:m.id};}
async function cart(f){await f.buyer.request({action:'buyer_cart_add',storeId:f.id,...line});await f.buyer.request({action:'buyer_address',name:'Fictional buyer',phone:login.phone,location:'Fictional street 1'});const state=await f.buyer.request({action:'buyer_state'}),quote=await f.buyer.request({action:'buyer_quote'});return {state,quote,input:{action:'buyer_checkout',requestId:'checkout-test',quoteToken:quote.quoteToken,addressId:state.profile.addresses[0].id,scheduledAt:'2026-10-24T12:00',scheduledEndAt:'2026-10-24T12:30',paymentMethod:'local_wallet'}};}
test('money uses exact minor units; required options, duplicates and invalid prices are rejected',()=>{
 assert.equal(CURRENCY,'MYR');assert.equal(cents('10.05'),1005);assert.equal(cents('0'),0);assert.equal(cents('999999.99'),99999999);for(const x of ['-1','1.001','NaN','1e3','1000000',''])assert.throws(()=>cents(x),/PRICE_INVALID/);
 const p=priceItem(dish,line);assert.equal(p.unitPriceCents,1450);assert.equal(p.lineTotalCents,2900);assert.equal(p.options.length,2);assert.ok(cnyReference(100)>100);
 assert.throws(()=>priceItem(dish,{...line,selections:{}}),/OPTIONS_REQUIRED/);assert.throws(()=>priceItem(dish,{...line,selections:{size:['normal','large']}}),/OPTIONS_REQUIRED/);assert.throws(()=>priceItem(dish,{...line,selections:{size:['normal'],extras:['egg','egg']}}),/OPTIONS_REQUIRED/);assert.throws(()=>priceItem(dish,{...line,selections:{size:['made-up']}}),/OPTIONS_CHANGED/);assert.throws(()=>validateCommerce({...dish,priceCents:1.2}),/PRICE_INVALID/);
});
test('phone sign-in creates only new accounts and exposes no hashes or other buyers data',async()=>{
 const f=await fixture(),one=await f.buyer.request({action:'buyer_state'});assert.match(one.profile.name,/^[a-z0-9]{10}$/);assert.equal(one.profile.avatar,'');assert.equal(one.profile.profileComplete,false);assert.ok(!JSON.stringify(one).includes('hash'));assert.ok(!JSON.stringify(one).includes('members'));
 const db=f.storage.getItem(DEMO_KEY);assert.ok(!db.includes(login.password));assert.equal(JSON.parse(db).buyers[0].hash.length,64);
 await assert.rejects(()=>f.api().request({...login,password:'wrong-password'}),/WRONG_PASSWORD/);assert.equal(JSON.parse(f.storage.getItem(DEMO_KEY)).buyers.length,1);
 const second=f.api();await second.request({...login,phone:'+60122222222'});await f.buyer.request({action:'buyer_profile',name:'Test name',avatar:''});assert.equal((await second.request({action:'buyer_state'})).profile.addresses.length,0);
 await f.buyer.request({action:'buyer_logout'});await assert.rejects(()=>f.buyer.request({action:'buyer_state'}),/BUYER_AUTH_REQUIRED/);assert.equal((await f.api().request(login)).profile.name,'Test name');
 await assert.rejects(()=>f.api().request({...login,phone:'abc123'}),/PHONE_INVALID/);
});
test('profile photo validation, address editing and cart reloads preserve isolated buyer state',async()=>{
 const f=await fixture();await assert.rejects(()=>f.buyer.request({action:'buyer_profile',name:'Photo',avatar:'https://example.com/photo.jpg'}),/INVALID_IMAGE/);
 const p=await f.buyer.request({action:'buyer_profile',name:'',avatar:'data:image/png;base64,aGVsbG8='});assert.equal(p.profile.profileComplete,true);assert.match(p.profile.name,/^[a-z0-9]{10}$/);
 await f.buyer.request({action:'buyer_cart_add',storeId:f.id,...line});const fresh=f.api();const restored=await fresh.request(login);assert.equal(restored.cart.lines[0].quantity,2);
 const addressed=await f.buyer.request({action:'buyer_address',name:'Fictional name',phone:login.phone,location:'Fictional road'});const id=addressed.profile.addresses[0].id;const edited=await f.buyer.request({action:'buyer_address',id,name:'Fictional new name',phone:login.phone,location:'Fictional revised road'});assert.equal(edited.profile.addresses.length,1);assert.equal(edited.profile.addresses[0].location,'Fictional revised road');
 await assert.rejects(()=>f.buyer.request({action:'buyer_address',id:'other-buyer-address',name:'Wrong',phone:login.phone,location:'Wrong address'}),/ADDRESS_REQUIRED/);
});
test('checkout calculates current options, creates merchant-readable snapshots and fixes financials',async()=>{
 const f=await fixture(),{input}=await cart(f),r=await f.buyer.request({...input,totalCents:1,unitPriceCents:1});assert.equal(r.order.totalCents,2900);assert.equal(r.order.currency,'MYR');assert.equal(r.order.payment.status,'simulated_paid');assert.equal(r.order.items[0].itemNotes,'Less salt');assert.ok(!('category' in r.order.items[0]));assert.equal(r.cart.lines.length,0);
 let state=await f.merchant.request({},'?merchantId='+f.id);assert.equal(state.orders.length,1);assert.deepEqual(state.orders[0],r.order);assert.equal(state.orders[0].items[0].materialSnapshot.ingredients[0].quantity,150);
 state=await f.merchant.request({action:'save',merchantId:f.id,expectedRevision:state.revision,menu:[{...dish,priceCents:2000,ingredients:[{name:'Rice',quantity:200,unit:'g'}]}],orders:[{...state.orders[0],notes:'Merchant delivery note',status:'preparing'}]});assert.equal(state.orders[0].totalCents,2900);assert.equal(state.orders[0].items[0].materialSnapshot.ingredients[0].quantity,150);
 await assert.rejects(()=>f.merchant.request({action:'save',merchantId:f.id,expectedRevision:state.revision,menu:state.menu,orders:[{...state.orders[0],totalCents:1}]}),/PAID_ORDER_LOCKED/);
 assert.equal((await f.buyer.request({action:'buyer_state'})).orders[0].status,'preparing');const logs=await f.merchant.request({},'?merchantId='+f.id+'&logs=1');assert.ok(logs.entries.some(l=>l.actor_id===r.profile.id&&l.action==='order_add'));
});
test('repeated and concurrent checkout commits one order and consumes the cart once',async()=>{
 const f=await fixture(),{input}=await cart(f),other=f.api();await other.request(login);const results=await Promise.all([f.buyer.request(input),other.request(input)]);assert.equal(results[0].order.id,results[1].order.id);assert.equal((await f.merchant.request({},'?merchantId='+f.id)).orders.length,1);
 const third=f.api();await third.request({...login,phone:'+60133333333'});await assert.rejects(()=>third.request(input),/CART_EMPTY/);
});
test('a stale quote never charges old prices or clears a cart; missing options stay blocked',async()=>{
 const f=await fixture(),{input}=await cart(f),m=await f.merchant.request({},'?merchantId='+f.id);await f.merchant.request({action:'save',merchantId:f.id,expectedRevision:m.revision,menu:[{...dish,priceCents:1150}],orders:[]});
 await assert.rejects(()=>f.buyer.request(input),/QUOTE_CHANGED/);assert.equal((await f.buyer.request({action:'buyer_state'})).cart.lines.length,1);assert.equal((await f.merchant.request({},'?merchantId='+f.id)).orders.length,0);
 const fresh=await f.buyer.request({action:'buyer_quote'});assert.equal(fresh.totalCents,3100);await f.buyer.request({action:'buyer_cart_quantity',id:(await f.buyer.request({action:'buyer_state'})).cart.lines[0].id,quantity:3});await assert.rejects(()=>f.buyer.request({...input,quoteToken:fresh.quoteToken}),/QUOTE_CHANGED/);
});
test('failed local payment saves nothing on quota, missing address, invalid payment or past windows',async()=>{
 const f=await fixture(),{input}=await cart(f),before=f.storage.getItem(DEMO_KEY);f.storage.fail=true;await assert.rejects(()=>f.buyer.request(input),/LOCAL_STORAGE_FULL/);assert.equal(f.storage.getItem(DEMO_KEY),before);f.storage.fail=false;
 for(const [change,error]of [[{addressId:'missing'},/ADDRESS_REQUIRED/],[{paymentMethod:'real-credit-card'},/PAYMENT_INVALID/],[{scheduledAt:'2020-01-01T12:00',scheduledEndAt:'2020-01-01T12:30'},/DELIVERY_INVALID/]])await assert.rejects(()=>f.buyer.request({...input,...change}),error);
 assert.equal(f.storage.getItem(DEMO_KEY),before);
});
test('cash orders remain unpaid, unpriced dishes cannot be ordered and stores cannot share carts',async()=>{
 const f=await fixture(),{input}=await cart(f),r=await f.buyer.request({...input,paymentMethod:'cash'});assert.equal(r.order.payment.status,'due');
 const other=f.api(),m=await other.request({...owner,username:'second-owner'});await other.request({action:'save',merchantId:m.id,expectedRevision:0,menu:[{...dish,priceCents:undefined}],orders:[]});await assert.rejects(()=>f.buyer.request({action:'buyer_cart_add',storeId:m.id,...line}),/DISH_UNAVAILABLE/);
 await other.request({action:'save',merchantId:m.id,expectedRevision:1,menu:[dish],orders:[]});await f.buyer.request({action:'buyer_cart_add',storeId:f.id,...line});await assert.rejects(()=>f.buyer.request({action:'buyer_cart_add',storeId:m.id,...line}),/CART_OTHER_STORE/);
 await f.buyer.request({action:'buyer_cart_clear'});assert.equal((await f.buyer.request({action:'buyer_cart_add',storeId:m.id,...line})).cart.storeId,m.id);
});
