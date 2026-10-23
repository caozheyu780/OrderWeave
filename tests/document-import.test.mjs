import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import * as XLSX from 'xlsx';
import {readDocumentBytes,inspectZip} from '../scripts/document-reader-core.mjs';
import {readDocument} from '../public/document-import.js';
const encode=s=>new TextEncoder().encode(s);
const menu='宫保鸡丁\tRM 18.50\n材料：鸡肉 300g，花生 30g\n制作时间15分钟';
const docx=xml=>zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8(xml),'word/media/ignored.png':new Uint8Array([1,2,3])});
test('reads UTF-8/UTF-16 text and preserves delimited rows in common text files',async()=>{
  for(const ext of ['txt','csv','tsv'])assert.equal(await readDocumentBytes('menu.'+ext,encode(menu)),menu);
  const b=Buffer.concat([Buffer.from([255,254]),Buffer.from(menu,'utf16le')]);assert.equal(await readDocumentBytes('menu.txt',b),menu);
});
test('DOCX preserves paragraphs, table-cell boundaries and Unicode without media',async()=>{
  const bytes=docx('<w:document><w:p><w:r><w:t>宫保鸡丁 &amp; rice</w:t></w:r></w:p><w:tr><w:tc><w:p><w:r><w:t>RM 18.50</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>15分钟</w:t></w:r></w:p></w:tc></w:tr></w:document>');
  const text=await readDocumentBytes('menu.docx',bytes);assert.ok(text.includes('宫保鸡丁 & rice'));assert.ok(text.includes('RM 18.50'));assert.ok(text.includes('15分钟'));assert.ok(!text.includes('ignored'));
});
test('reads every spreadsheet tab, displayed prices and legacy XLS without evaluating formulas',async()=>{
  const book=XLSX.utils.book_new();for(const name of ['Main','Drinks'])XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Dish','Price'],[name==='Main'?'宫保鸡丁':'茶',18.5]]),name);
  for(const ext of ['xlsx','xls','ods']){const text=await readDocumentBytes('menu.'+ext,XLSX.write(book,{type:'array',bookType:ext==='xls'?'biff8':ext}));assert.ok(text.includes('[Main]'));assert.ok(text.includes('[Drinks]'));assert.ok(text.includes('宫保鸡丁\t18.5'));}
});
test('ODT and Unicode RTF extract only document text, excluding embedded pictures and objects',async()=>{
  assert.equal(await readDocumentBytes('menu.odt',zipSync({'content.xml':strToU8('<office:text><text:p>宫保鸡丁</text:p><text:p>RM 18.50</text:p></office:text>')})),'宫保鸡丁\nRM 18.50');
  const text=await readDocumentBytes('menu.rtf',encode('{\\rtf1\\ansi{\\fonttbl hidden font;}\\uc1 \\u23467?\\u20445?\\u40481?\\u19969?\\par RM 18.50{\\pict not menu}{\\object hidden}\\par 15min}'));
  assert.equal(text,'宫保鸡丁\nRM 18.50\n15min');
});
test('old DOC piece tables recover Unicode body text only',async()=>{
  const word=Buffer.alloc(4096),table=Buffer.alloc(4096),text=Buffer.from(menu,'utf16le');word.writeUInt16LE(0x200,10);word.writeUInt32LE(menu.length,76);word.writeUInt32LE(0,418);word.writeUInt32LE(21,422);text.copy(word,512);
  table[0]=2;table.writeUInt32LE(16,1);table.writeUInt32LE(0,5);table.writeUInt32LE(menu.length,9);table.writeUInt32LE(512,15);
  const cfb=XLSX.CFB.utils.cfb_new();XLSX.CFB.utils.cfb_add(cfb,'WordDocument',word);XLSX.CFB.utils.cfb_add(cfb,'1Table',table);
  assert.equal(await readDocumentBytes('menu.doc',XLSX.CFB.write(cfb,{type:'buffer'})),menu);
});
test('rejects unsupported media, renamed binaries, corrupt or encrypted archives without partial text',async()=>{
  for(const ext of ['png','jpg','mp4','mp3','zip','exe','docm','xlsm'])await assert.rejects(readDocumentBytes('menu.'+ext,encode(menu)),/REJECTED/);
  for(const ext of ['docx','xlsx','pdf','doc','rtf'])await assert.rejects(readDocumentBytes('bad.'+ext,encode(menu)),/INVALID/);
  await assert.rejects(readDocumentBytes('bad.txt',new Uint8Array([0x89,0x50,0x4e,0x47])),/INVALID/);
  await assert.rejects(readDocumentBytes('bad.docx',docx('<!DOCTYPE x [<!ENTITY leak SYSTEM "file:///test">]><w:p>&leak;</w:p>')),/INVALID/);
});
test('fails oversized text, zip bombs and excessive rows instead of truncating',async()=>{
  await assert.rejects(readDocumentBytes('huge.txt',encode('x'.repeat(20001))),/TOO_LARGE/);
  await assert.rejects(readDocumentBytes('huge.txt',new Uint8Array(5*1024*1024+1)),/TOO_LARGE/);
  assert.throws(()=>inspectZip(zipSync({'content.xml':encode('x'.repeat(2*1024*1024))})),/TOO_LARGE/);
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(Array.from({length:1002},()=>['dish'])),'TooMany');
  await assert.rejects(readDocumentBytes('rows.xlsx',XLSX.write(book,{type:'array',bookType:'xlsx'})),/TOO_LARGE/);
  await assert.rejects(readDocumentBytes('empty.txt',encode(' \n ')),/EMPTY/);
});
test('document client ignores PDF worker handshake messages until the tagged extraction result',async()=>{
  const previous=globalThis.Worker;let worker;
  class FakeWorker{constructor(){worker=this;}postMessage(data){this.sent=data;}terminate(){this.terminated=true;}}
  globalThis.Worker=FakeWorker;
  try{let settled=false;const pending=readDocument({name:'fixture.pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(10)}).then(text=>{settled=true;return text;});
    await Promise.resolve();worker.onmessage({data:{action:'ready',sourceName:'worker'}});await Promise.resolve();assert.equal(settled,false);
    assert.equal(worker.sent.type,'orderweave-document-request');worker.onmessage({data:{type:'orderweave-document-result',text:'PDF text'}});assert.equal(await pending,'PDF text');assert.equal(worker.terminated,true);
  }finally{globalThis.Worker=previous;}
});
