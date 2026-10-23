import test from 'node:test';
import assert from 'node:assert/strict';
import {publicMenu,wrapMenuText,layoutMenu,menuPdf,menuFilename,MENU_PAGE} from '../public/menu-export.js';
import {menuExportMessages} from '../public/menu-export-i18n.js';
import {buyerMessages} from '../public/buyer-i18n.js';
const dish={id:'one',name:'Fictional chicken',category:'Main',priceCents:1850,image:'data:image/png;base64,aGVsbG8=',description:'A public description',ingredients:[{name:'Private recipe',quantity:1,unit:'g'}],aliases:['Private alias'],optionGroups:[{id:'size',name:'Size',required:true,multiple:false,choices:[{id:'large',name:'Large',priceCents:350}]}]};
const account={shop:'Fictional shop',username:'private-owner',members:[{hash:'never-export-this'}],orders:[{contact:'private-contact'}],menu:[dish,{...dish,id:'two',name:'Unpriced dish',priceCents:undefined}]};
const t=key=>menuExportMessages.en[key]||buyerMessages.en[key]||key;
const layout=model=>layoutMenu(model,{t,locale:'en-MY',generatedDate:'2026-10-23',measure:(text,size)=>Array.from(text).length*size*.7});
test('menu export whitelists only public dish data and selected dishes',()=>{
 const model=publicMenu(account,{ids:['one']});const text=JSON.stringify(model);assert.equal(model.dishes.length,1);assert.equal(model.dishes[0].groups[0].choices[0].priceCents,350);
 for(const secret of ['private-owner','never-export-this','private-contact','Private recipe','Private alias','ingredients','orders','hash'])assert.ok(!text.includes(secret));assert.equal(account.menu[0].ingredients[0].name,'Private recipe');
 assert.equal(publicMenu(account).dishes[1].priceCents,null);assert.equal(publicMenu({...account,menu:[{...dish,image:'https://example.com/photo.png'}]}).dishes[0].image,'');
});
test('description, option and CNY controls produce the requested snapshot without rewriting data',()=>{
 const model=publicMenu(account,{description:false,options:false,cny:false});assert.equal(model.cny,false);assert.ok(model.dishes.every(d=>d.description===''&&d.groups.length===0));assert.throws(()=>publicMenu(account,{ids:[]}),/MENU_EXPORT_EMPTY/);assert.throws(()=>publicMenu(account,{ids:['unknown']}),/MENU_EXPORT_EMPTY/);assert.equal(account.menu[0].description,'A public description');
});
test('wrapping preserves long multilingual content without overflowing the text width',()=>{
 for(const source of ['鸡肉花生青椒'.repeat(40),'LongUnbrokenWord'.repeat(50),'A menu with many words and spaces. '.repeat(40),'第一行\nSecond line\nBaris ketiga']){const lines=wrapMenuText(source,100,s=>Array.from(s).length*10);assert.ok(lines.every(s=>Array.from(s).length*10<=100));assert.equal(lines.join('').replace(/\s/g,''),source.replace(/\s/g,''));}
});
test('large menus paginate all selected dishes and long option descriptions without clipping',()=>{
 const model=publicMenu({...account,menu:Array.from({length:25},(_,i)=>({...dish,id:'dish-'+i,name:'Dish '+i,description:'START-'+i+' '+('长描述 mixed text ').repeat(90)+' END-'+i}))});const pages=layout(model);assert.ok(pages.length>1);const text=pages.flatMap(p=>p.entries.flatMap(e=>e.lines.map(l=>l.text))).join('');
 for(let i=0;i<25;i++){assert.ok(text.includes('START-'+i));assert.ok(text.includes('END-'+i));}for(const p of pages){assert.ok(p.entries.length);for(const entry of p.entries){assert.ok(entry.y>=146);assert.ok(entry.y+entry.height<=MENU_PAGE.bottom);}}
});
test('PDF page objects, binary stream lengths and cross-reference byte offsets are valid',async()=>{
 const bytes=new Uint8Array([255,216,255,217]),blob=menuPdf([{bytes,width:1,height:1},{bytes,width:1,height:1}]),pdf=new Uint8Array(await blob.arrayBuffer()),text=new TextDecoder('latin1').decode(pdf);assert.equal(blob.type,'application/pdf');assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/\/Count 2/);assert.equal((text.match(/\/Type \/Page\b/g)||[]).length,2);
 const start=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(new TextDecoder().decode(pdf.slice(start,start+4)),'xref');const rows=text.slice(start).split('\n');assert.equal(rows[1],'0 9');for(let i=1;i<=8;i++){const offset=Number(rows[i+2].slice(0,10));assert.ok(new TextDecoder().decode(pdf.slice(offset,offset+12)).startsWith(i+' 0 obj'));}
 assert.throws(()=>menuPdf([]),/MENU_EXPORT_LIMIT/);assert.throws(()=>menuPdf([{bytes:new Uint8Array([1]),width:1,height:1}]),/MENU_EXPORT_FAILED/);
});
test('download filenames are safe and language keys remain equivalent',()=>{
 const name=menuFilename('Fictional / Shop: Main',2,'png','2026-10-23');assert.ok(!/[<>:"/\\|?*]/.test(name));assert.match(name,/-03\.png$/);assert.match(menuFilename('Shop',0,'pdf','2026-10-23'),/-menu-2026-10-23\.pdf$/);
 for(const lang of ['en','ms'])assert.deepEqual(Object.keys(menuExportMessages[lang]).sort(),Object.keys(menuExportMessages.zh).sort());
});
