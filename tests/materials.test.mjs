import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeRows,validateRecipe,snapshotItem,freezeOrderMaterials,aggregateMaterials,materialOrders} from '../public/materials.js';
import {prepareBatchOrders} from '../public/batch-orders.js';
const recipe=[{name:'Chicken',quantity:0.2,unit:'kg'},{name:'Oil',quantity:10,unit:'ml'}];
const menu=[{id:'dish',name:'Dish',minutes:10,ingredients:recipe}];
const item={dishId:'dish',name:'Dish',quantity:3};
const order=items=>({items});
test('structured recipes validate bounded positive quantities, decimals, units and names',()=>{
 assert.deepEqual(validateRecipe(recipe),recipe);
 for(const quantity of [0,-1,NaN,Infinity,1000001,0.0001,'2'])assert.throws(()=>validateRecipe([{name:'a',quantity,unit:'g'}]));
 for(const rows of [[],Array(51).fill(recipe[0]),[{name:'',quantity:1,unit:'g'}],[{name:'a',quantity:1,unit:'unknown'}]])assert.throws(()=>validateRecipe(rows));
 assert.equal(validateRecipe([{name:'  Rice  flour ',quantity:0.001,unit:'g'}])[0].name,'Rice flour');
});
test('legacy text preserves names and never fabricates quantities',()=>{
 assert.deepEqual(recipeRows('鸡肉、花生，青椒'),['鸡肉','花生','青椒'].map(name=>({name,quantity:null,unit:''})));
 assert.throws(()=>validateRecipe(recipeRows('盐适量')));
 const result=aggregateMaterials([order([item])],[{...menu[0],ingredients:'鸡肉、花生'}]);
 assert.equal(result.totals.length,0);assert.equal(result.missing.length,2);assert.equal(result.estimated,true);assert.equal(result.missing[0].servings,3);
});
test('servings multiply, compatible units combine, case/whitespace normalize and other units stay separate',()=>{
 const ingredients=[...recipe,{name:' chicken ',quantity:50,unit:'g'},{name:'Oil',quantity:0.1,unit:'l'},{name:'Oil',quantity:1,unit:'spoon'}];
 const result=aggregateMaterials([order([item,{...item,quantity:2}])],[{...menu[0],ingredients}]);
 assert.deepEqual(result.totals.map(r=>[r.unit,r.quantity]),[['g',1250],['ml',550],['spoon',5]]);
});
test('small fractional totals avoid floating-point artifacts',()=>{
 const result=aggregateMaterials([order([{...item,quantity:3}])],[{...menu[0],ingredients:[{name:'Salt',quantity:0.1,unit:'g'},{name:'Salt',quantity:0.2,unit:'g'}]}]);
 assert.equal(result.totals[0].quantity,0.9);
});
test('new order snapshots survive menu edits/deletion and are detached copies',()=>{
 const saved=snapshotItem(item,menu);const changed=structuredClone(menu);changed[0].ingredients[0].quantity=9;
 assert.equal(aggregateMaterials([order([saved])],changed).totals[0].quantity,600);
 assert.equal(aggregateMaterials([order([saved])],[]).totals[0].quantity,600);
 assert.equal(saved.materialSnapshot.basis,'recipe');assert.notEqual(saved.materialSnapshot.ingredients,recipe);
});
test('same-dish edits retain recipe while quantity changes; switching dishes captures a fresh recipe',()=>{
 const saved=snapshotItem(item,menu),changed=[{...menu[0],ingredients:[{name:'New',quantity:1,unit:'piece'}]}];
 const edited=snapshotItem({...item,quantity:5},changed,saved);
 assert.equal(aggregateMaterials([order([edited])],changed).totals[0].quantity,1000);
 const other={id:'other',name:'Other',ingredients:[{name:'Rice',quantity:100,unit:'g'}]};
 const switched=snapshotItem({...item,dishId:'other',name:'Other'},[other],saved);
 assert.equal(switched.materialSnapshot.ingredients[0].name,'Rice');
});
test('legacy delivery freezes its estimate and missing recipes stay visible',()=>{
 const frozen=freezeOrderMaterials(order([item]),menu);assert.equal(frozen.items[0].materialSnapshot.basis,'estimate');
 assert.equal(aggregateMaterials([frozen],[]).totals[0].quantity,600);
 const missing=aggregateMaterials([order([{...item,dishId:'removed'}])],menu);
 assert.equal(missing.totals.length,0);assert.equal(missing.missing[0].dish,'Dish');
 const savedMissing=snapshotItem({...item,name:'Custom',dishId:null},menu);
 assert.equal(savedMissing.materialSnapshot.basis,'unavailable');
});
test('current scope includes future active orders; consumption uses actual local delivery date only',()=>{
 const now=new Date(2026,9,22,12,0),today=new Date(2026,9,22,0,0).toISOString(),yesterday=new Date(2026,9,21,23,59).toISOString(),tomorrow=new Date(2026,9,23,0,0).toISOString();
 const orders=[{id:'active',status:'pending',scheduledAt:'2026-11-01T12:00'},{id:'today',status:'delivered',deliveredAt:today,scheduledAt:'2026-10-21T12:00'},{id:'yesterday',status:'delivered',deliveredAt:yesterday},{id:'tomorrow',status:'delivered',deliveredAt:tomorrow},{id:'unknown',status:'delivered'},{id:'invalid',status:'delivered',deliveredAt:'bad'}];
 assert.deepEqual(materialOrders(orders,'current',now).map(o=>o.id),['active']);assert.deepEqual(materialOrders(orders,'today',now).map(o=>o.id),['today']);
});
test('batch finalization snapshots each recipe and does not trust imported recipe fields',()=>{
 const draft={items:[{...item,materialSnapshot:{version:1,ingredients:[]}}],scheduledAt:'2026-10-22T12:00',location:'Test location',contact:'Test contact'};
 const orders=prepareBatchOrders([{reviewed:true,draft}],menu,[],new Date('2026-10-22T00:00Z'),()=> 'test');
 assert.deepEqual(orders[0].items[0].materialSnapshot.ingredients,recipe);assert.equal(draft.items[0].materialSnapshot.ingredients.length,0);
});
test('aggregation does not mutate saved orders or menus',()=>{
 const orders=[order([item])],before=JSON.stringify([orders,menu]);aggregateMaterials(orders,menu);assert.equal(JSON.stringify([orders,menu]),before);
});
