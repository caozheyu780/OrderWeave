import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanAliases,conflictingDish,findNamedDish,strongNameMatch} from '../public/menu-matching.js';
import {normalizeOutput,normalizeBatchOutput,validateInput} from '../lib/deepseek.mjs';
import {needsItemReview,applyItemReview} from '../public/order-review.js';
import {parseOrderText} from '../public/core.js';
import {batchDraftIssue,prepareBatchOrders} from '../public/batch-orders.js';
const menu=[{id:'chicken',name:'宫保鸡丁',aliases:['Kung Pao Chicken','宫爆鸡丁'],minutes:15},{id:'rice',name:'米饭',aliases:['Steamed Rice'],minutes:5}];
const base={menu,text:'Kung Pao Chicken 2份',localNow:'2026-10-22T12:00',timeZone:'Asia/Shanghai'};
test('aliases normalize, deduplicate and obey count and length limits',()=>{
 assert.deepEqual(cleanAliases('宫保鸡丁\nKung Pao Chicken\n KUNG  PAO CHICKEN \n宫爆鸡丁\n','宫保鸡丁'),['Kung Pao Chicken','宫爆鸡丁']);
 assert.throws(()=>cleanAliases(Array.from({length:21},(_,i)=>'Alias '+i),'Dish'),/ALIAS_LIMIT/);
 assert.throws(()=>cleanAliases('a'.repeat(101),'Dish'),/ALIAS_LENGTH/);
});
test('primary names and aliases cannot collide across menu dishes',()=>{
 assert.equal(conflictingDish(menu,{id:'new',name:'New',aliases:['ＫＵＮＧ ＰＡＯ ＣＨＩＣＫＥＮ']}).id,'chicken');
 assert.equal(conflictingDish(menu,{id:'rice',name:'Kung Pao Chicken',aliases:[]}).id,'chicken');
 assert.equal(findNamedDish(menu,'kung  pao chicken').id,'chicken');
 assert.equal(findNamedDish([...menu,{id:'duplicate',name:'Other',aliases:['Kung Pao Chicken']}],'Kung Pao Chicken'),undefined);
});
test('server retains aliases, rejects malformed aliases and conflicting ownership',()=>{
 assert.deepEqual(validateInput(base).menu[0].aliases,menu[0].aliases);
 for(const invalid of [{...menu[0],aliases:'bad'},{...menu[0],aliases:['']},{...menu[0],aliases:['a'.repeat(101)]},{...menu[0],aliases:Array(21).fill('name')}])assert.throws(()=>validateInput({...base,menu:[invalid]}),e=>e.code==='INVALID_REQUEST');
 assert.throws(()=>validateInput({...base,menu:[...menu,{id:'new',name:'Steamed Rice',minutes:5}]}),e=>e.code==='INVALID_REQUEST');
});
test('bound multilingual names override a wrong model guess and need no checkbox',()=>{
 const item=normalizeOutput({items:[{name:'米饭',originalName:'Kung Pao Chicken',dishId:'rice',quantity:2,matchType:'guessed'}]},menu,base.text).items[0];
 assert.equal(item.dishId,'chicken');assert.equal(item.name,'宫保鸡丁');assert.equal(item.matchType,'alias');assert.equal(needsItemReview(item),false);
 assert.equal(applyItemReview(item,'宫保鸡丁',2,menu,false,'test').dishId,'chicken');
});
test('unique close spelling gets an informational match without trusting model confidence',()=>{
 const plain=[{id:'chicken',name:'宫保鸡丁',minutes:15}];
 assert.equal(strongNameMatch(plain,'宫爆鸡丁').id,'chicken');
 const item=normalizeOutput({items:[{name:'宫保鸡丁',originalName:'宫爆鸡丁',quantity:2,matchType:'guessed'}]},plain,'宫爆鸡丁2份').items[0];
 assert.equal(item.matchType,'similar');assert.equal(needsItemReview(item),false);assert.doesNotThrow(()=>applyItemReview(item,item.name,2,plain,false,'test'));
 const fabricated=normalizeOutput({items:[{name:'宫保鸡丁',originalName:'pizza',quantity:1,matchType:'similar',confidence:1}]},plain,'pizza').items[0];assert.equal(fabricated.matchType,'guessed');assert.equal(needsItemReview(fabricated),true);
});
test('ambiguity, short names, unrelated numbers, different proteins and sizes never waive review',()=>{
 assert.equal(strongNameMatch([{name:'青椒肉丝'},{name:'青椒肉片'}],'青椒肉条'),null);
 for(const [source,name] of [['炒肉','炒饭'],['1235','宫保鸡丁'],['鱼香鸡丝','鱼香肉丝'],['大份宫保鸡丁','小份宫保鸡丁']])assert.equal(strongNameMatch([{name}],source),null);
});
test('source evidence is required for informational aliases and strong matches',()=>{
 const result=normalizeBatchOutput({orders:[{items:[{name:'宫保鸡丁',originalName:'Kung Pao Chicken',quantity:2}],sourceText:'fabricated'}]},menu,'unrelated actual source');
 assert.equal(result.orders[0].items[0].matchType,'guessed');assert.equal(needsItemReview(result.orders[0].items[0]),true);
});
test('basic rules count canonical names and aliases once using the same dish identity',()=>{
 const result=parseOrderText('Kung Pao Chicken 2份，宫保鸡丁1份，宫爆鸡丁3份；Steamed Rice 2份',menu);
 assert.equal(result.items.length,2);assert.equal(result.items[0].dishId,'chicken');assert.equal(result.items[0].quantity,6);assert.equal(result.items[1].dishId,'rice');assert.equal(result.items[1].quantity,2);
});
test('informational matches can reach final batch confirmation without dish acknowledgement',()=>{
 const normalized=normalizeOutput({items:[{name:'宫保鸡丁',originalName:'Kung Pao Chicken',quantity:2}]},menu,base.text);
 const draft={...normalized,location:'Fictional address',contact:'Test contact',scheduledAt:'2026-10-23T12:00'};
 assert.equal(batchDraftIssue(draft,menu),null);assert.equal(prepareBatchOrders([{draft,reviewed:true}],menu,[],new Date('2026-10-22T12:00Z'),()=> 'test')[0].items[0].dishId,'chicken');
});
