import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMenu,normalizeMenuOutput} from '../lib/menu-extraction.mjs';
import {menuDraftIssue,prepareMenuBatch} from '../public/menu-import.js';
const source='宫保鸡丁 RM18.50 鸡肉300g 花生30g 制作15分钟\n茶 RM2';
const extracted={name:'宫保鸡丁',sourceText:source.split('\n')[0],description:'鸡肉和花生',priceCents:1850,category:'主菜',minutes:15,ingredients:[{name:'鸡肉',quantity:300,unit:'g'},{name:'花生',quantity:30,unit:'g'}],aliases:[],optionGroups:[]};
const image='data:image/png;base64,YQ==';
const dish={...extracted,id:'dish1',image};
test('menu AI uses existing official transport with only document text and retains missing fields',async()=>{
  const result=await extractMenu({text:source,orders:['private'],menu:['private']},{DEEPSEEK_API_KEY:'test-only'},async(url,options)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.redirect,'manual');const body=JSON.parse(options.body);assert.deepEqual(JSON.parse(body.messages[1].content),{text:source});assert.equal(body.max_tokens,16000);assert.ok(body.messages[0].content.includes('never guess'));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({dishes:[extracted,{name:'茶',sourceText:'茶 RM2'}]})}}]});
  });
  assert.equal(result.requiresMerchantConfirmation,true);assert.equal(result.dishes[1].priceCents,null);assert.equal(result.dishes[1].minutes,null);assert.deepEqual(result.dishes[1].ingredients,[]);assert.equal(result.dishes[1].description,'');assert.equal(result.dishes[0].image,'');
});
test('menu extraction rejects fabricated source/name, overflow, invalid numbers and empty results',()=>{
  for(const item of [{...extracted,name:'invented'},{...extracted,sourceText:'not in text'},{...extracted,priceCents:-1},{...extracted,minutes:1.5},{...extracted,ingredients:[{name:'salt',quantity:Infinity,unit:'g'}]}])assert.throws(()=>normalizeMenuOutput({dishes:[item]},source),e=>e.code==='AI_INVALID_RESPONSE');
  assert.throws(()=>normalizeMenuOutput({dishes:[]},source),e=>e.code==='AI_NO_DISHES');assert.throws(()=>normalizeMenuOutput({dishes:Array(31).fill(extracted)},source),e=>e.code==='AI_MENU_TOO_LARGE');
});
test('unknown option surcharges remain incomplete rather than becoming free',()=>{
  const normalized=normalizeMenuOutput({dishes:[{...extracted,optionGroups:[{name:'size',required:true,multiple:false,choices:[{name:'large',priceCents:null}]}]}]},source).dishes[0];assert.equal(normalized.optionGroups[0].choices[0].priceCents,null);assert.equal(menuDraftIssue({...normalized,image}), 'optionsTitle');
});
test('batch requires review, complete fields and conflict-free names/aliases and never mutates existing data',()=>{
  const old=[{...dish,id:'old',name:'米饭',aliases:['rice']}],entries=[{draft:dish,reviewed:true}],snapshot=structuredClone({old,entries});
  const result=prepareMenuBatch(entries,old);assert.equal(result.length,1);assert.ok(!('sourceText' in result[0]));assert.deepEqual({old,entries},snapshot);
  assert.throws(()=>prepareMenuBatch([{draft:dish,reviewed:false}],old),/menuImportReviewRequired/);
  for(const field of ['priceCents','minutes','image','description','ingredients']){const incomplete={...dish};delete incomplete[field];assert.ok(menuDraftIssue(incomplete,old));assert.throws(()=>prepareMenuBatch([{draft:incomplete,reviewed:true}],old));}
  assert.throws(()=>prepareMenuBatch([{draft:{...dish,aliases:['rice']},reviewed:true}],old),/aliasesConflict/);
  assert.throws(()=>prepareMenuBatch([...entries,{draft:{...dish,id:'dish2'},reviewed:true}],old),/aliasesConflict/);
  assert.throws(()=>prepareMenuBatch(entries,Array.from({length:300},(_,i)=>({...dish,id:String(i),name:'other'+i}))),/menuImportLimit/);
});
test('invalid menu input and absent secret never call the provider',async()=>{
  for(const input of [{text:''},{text:'x'.repeat(100001)}])await assert.rejects(extractMenu(input,{DEEPSEEK_API_KEY:'test'},()=>assert.fail()),e=>e.code==='INVALID_REQUEST');
  await assert.rejects(extractMenu({text:source},{},()=>assert.fail()),e=>e.code==='AI_NOT_CONFIGURED');
});

test('large menu input and its source evidence survive the new text boundary',async()=>{
  const text=source+'餐'.repeat(100000-source.length);
  const result=await extractMenu({text},{DEEPSEEK_API_KEY:'test-only'},async(_url,options)=>{
    assert.equal(JSON.parse(JSON.parse(options.body).messages[1].content).text,text);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({dishes:[extracted]})}}]});
  });
  assert.equal(result.dishes[0].sourceText,extracted.sourceText);
  const normalized=normalizeMenuOutput({dishes:[{...extracted,sourceText:text}]},text);
  assert.equal(normalized.dishes[0].sourceText.length,100000);
});
