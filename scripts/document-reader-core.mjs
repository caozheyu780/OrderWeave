import * as XLSX from 'xlsx';
import {unzipSync} from 'fflate';

export const DOCUMENT_EXTENSIONS=['txt','csv','tsv','xlsx','xls','ods','docx','doc','odt','rtf','pdf'];
export const FILE_LIMIT=5*1024*1024,TEXT_LIMIT=20000;
const fail=code=>{throw Error(code);};
const decoder=(bytes,encoding='utf-8',fatal=false)=>new TextDecoder(encoding,{fatal}).decode(bytes);
function plain(bytes){
  if(bytes[0]===255&&bytes[1]===254)return decoder(bytes.subarray(2),'utf-16le');
  if(bytes[0]===254&&bytes[1]===255)return decoder(bytes.subarray(2),'utf-16be');
  try{return decoder(bytes,'utf-8',true);}catch{return decoder(bytes,'gb18030');}
}
export function finishText(text){
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/[\t ]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim();
  if(text.length>TEXT_LIMIT)fail('TOO_LARGE');
  if(!text||!/[\p{L}\p{N}]/u.test(text))fail('EMPTY');
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(text))fail('INVALID');
  return text;
}
function xmlText(xml){
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('INVALID');
  return xml.replace(/<(?:w:tab|text:tab)\b[^>]*\/?\s*>/g,'\t')
    .replace(/<text:s(?:\s[^>]*)?\/?\s*>/g,' ')
    .replace(/<\/(?:w:tc|table:table-cell)>/g,'\t')
    .replace(/<\/(?:w:p|w:tr|text:p|text:h|table:table-row)>/g,'\n')
    .replace(/<(?:w:br|text:line-break)\b[^>]*\/?\s*>/g,'\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,(whole,num,name)=>{if(name)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[name.toLowerCase()];const n=num[0].toLowerCase()==='x'?parseInt(num.slice(1),16):Number(num);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';});
}
// Validate the ZIP central directory before any library allocates expanded data.
export function inspectZip(bytes){
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(v.getUint32(p,true)===0x06054b50){end=p;break;}
  if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))fail('INVALID');
  const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),start=v.getUint32(end+16,true);
  if(count>2000||size>bytes.length||start+size>end)fail('TOO_LARGE');
  const names=[];let p=start,total=0;
  for(let i=0;i<count;i++){
    if(p+46>end||v.getUint32(p,true)!==0x02014b50)fail('INVALID');
    const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),compressed=v.getUint32(p+20,true),expanded=v.getUint32(p+24,true),n=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),local=v.getUint32(p+42,true);
    total+=expanded;if(total>32*1024*1024||expanded>16*1024*1024||expanded>Math.max(1024*1024,compressed*300))fail('TOO_LARGE');
    if(flags&1||![0,8].includes(method)||p+46+n+extra+comment>end||local+30>start||v.getUint32(local,true)!==0x04034b50)fail('INVALID');
    const name=decoder(bytes.subarray(p+46,p+46+n));if(names.includes(name)||name.includes('..')||name.startsWith('/'))fail('INVALID');names.push(name);
    const localFlags=v.getUint16(local+6,true),localMethod=v.getUint16(local+8,true);
    if(localFlags!==flags||localMethod!==method||local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true)+compressed>start)fail('INVALID');
    p+=46+n+extra+comment;
  }
  if(p!==start+size)fail('INVALID');return names;
}
function zipDocument(bytes,ext){
  const names=inspectZip(bytes),path=ext==='docx'?'word/document.xml':'content.xml';
  if(!names.includes(path)||(ext==='docx'&&!names.includes('[Content_Types].xml')))fail('INVALID');
  const extracted=unzipSync(bytes,{filter:entry=>entry.name===path});
  return xmlText(decoder(extracted[path],'utf-8',true));
}
function spreadsheet(bytes,ext){
  if(ext!=='xls'){const names=inspectZip(bytes);if(ext==='xlsx'&&!names.includes('xl/workbook.xml')||ext==='ods'&&!names.includes('content.xml'))fail('INVALID');}
  else if(!isOLE(bytes))fail('INVALID');
  // Formulas/macros/external links are never executed. Keep displayed cell values.
  const book=XLSX.read(bytes,{type:'array',cellFormula:false,cellHTML:false,cellStyles:false,bookVBA:false,sheetRows:1002});
  if(book.SheetNames.length>30)fail('TOO_LARGE');
  const sections=[];
  for(const name of book.SheetNames){const sheet=book.Sheets[name];if(!sheet)continue;const range=sheet['!fullref']||sheet['!ref'];if(!range)continue;const dims=XLSX.utils.decode_range(range);if(dims.e.r>1000||dims.e.c>99)fail('TOO_LARGE');
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:true});
    sections.push('['+name+']\n'+rows.map(row=>row.map(cell=>String(cell).replace(/\r?\n/g,' / ')).join('\t')).join('\n'));
  }
  return sections.join('\n\n');
}
const isOLE=b=>b.length>=8&&[208,207,17,224,161,177,26,225].every((n,i)=>b[i]===n);
function legacyWord(bytes){
  if(!isOLE(bytes))fail('INVALID');
  const container=XLSX.CFB.read(bytes,{type:'array'}),streams=container.FileIndex;
  const get=name=>{const content=streams.find(f=>f.name===name)?.content;return content?new Uint8Array(content):null;};
  const word=get('WordDocument');if(!word||word.length<426)fail('INVALID');
  const w=new DataView(word.buffer,word.byteOffset,word.byteLength),flags=w.getUint16(10,true);if(flags&0x100)fail('INVALID');
  const table=get(flags&0x200?'1Table':'0Table'),offset=w.getUint32(418,true),length=w.getUint32(422,true);if(!table||!length||offset+length>table.length)fail('INVALID');
  const tv=new DataView(table.buffer,table.byteOffset,table.byteLength);let p=offset;
  while(p<offset+length&&table[p]===1){if(p+3>offset+length)fail('INVALID');p+=3+tv.getUint16(p+1,true);}
  if(p+5>offset+length||table[p]!==2)fail('INVALID');const size=tv.getUint32(p+1,true);p+=5;
  const count=(size-4)/12;if(!Number.isInteger(count)||count<1||count>10000||p+size>offset+length)fail('INVALID');
  const parts=[];const bodyLength=w.getUint32(76,true);
  for(let i=0;i<count;i++){
    const start=tv.getUint32(p+i*4,true),end=Math.min(tv.getUint32(p+(i+1)*4,true),bodyLength);if(end<=start)continue;if(end-start>TEXT_LIMIT)fail('TOO_LARGE');
    const fc=tv.getUint32(p+4*(count+1)+8*i+2,true),compressed=!!(fc&0x40000000),from=(fc&0x3fffffff)/(compressed?2:1),to=from+(end-start)*(compressed?1:2);if(to>word.length||!Number.isInteger(from))fail('INVALID');
    parts.push(decoder(word.subarray(from,to),compressed?'windows-1252':'utf-16le'));
  }
  return parts.join('').replace(/\x07/g,'\t').replace(/[\x13-\x15]/g,'').replace(/\x0b/g,'\n').replace(/\x0c/g,'\n');
}
export function rtfText(bytes){
  const source=decoder(bytes,'windows-1252');if(!source.startsWith('{\\rtf'))fail('INVALID');
  let output='',skip=false,uc=1,fallback=0,depth=0;const stack=[];
  const destinations=new Set(['fonttbl','colortbl','stylesheet','info','pict','object','objdata','header','footer','filetbl','listtable','listoverridetable','fldinst','datastore','themedata','xmlnstbl']);
  for(let p=0;p<source.length;){const ch=source[p++];
    if(ch==='{'){stack.push({skip,uc});if(++depth>128)fail('INVALID');continue;}
    if(ch==='}'){if(!depth--)fail('INVALID');({skip,uc}=stack.pop());continue;}
    if(ch!=='\\'){if(!skip&&!/[\r\n]/.test(ch)){if(fallback)fallback--;else output+=ch;}continue;}
    const c=source[p++];if(c==='*'){skip=true;continue;}if(['{','}','\\'].includes(c)){if(!skip){if(fallback)fallback--;else output+=c;}continue;}
    if(c==="'"){const hex=source.slice(p,p+2);if(!/^[0-9a-f]{2}$/i.test(hex))fail('INVALID');p+=2;if(!skip){if(fallback)fallback--;else output+=decoder(new Uint8Array([parseInt(hex,16)]),'windows-1252');}continue;}
    if(c==='~'){if(!skip)output+=' ';continue;}if(c==='-'||c==='_')continue;
    p--;const match=/^([a-z]+)(-?\d+)? ?/i.exec(source.slice(p));if(!match)continue;p+=match[0].length;const [,word,num]=match;
    if(destinations.has(word)){skip=true;continue;}if(word==='bin'){const n=Number(num);if(!Number.isInteger(n)||n<0||p+n>source.length)fail('INVALID');p+=n;continue;}
    if(skip)continue;if(word==='uc'){uc=Math.max(0,Math.min(16,Number(num)));continue;}if(word==='u'){output+=String.fromCharCode((Number(num)+65536)%65536);fallback=uc;continue;}
    if(['par','line','row'].includes(word))output+='\n';if(['tab','cell'].includes(word))output+='\t';
    if(output.length>TEXT_LIMIT)fail('TOO_LARGE');
  }
  if(depth)fail('INVALID');return output;
}
async function pdfText(bytes){
  if(decoder(bytes.subarray(0,5))!=='%PDF-')fail('INVALID');
  const pdfjs=await import('./pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./pdf.worker.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false,useWorkerFetch:true,stopAtErrors:true,cMapUrl:new URL('./cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./standard_fonts/',import.meta.url).href});
  try{const doc=await task.promise;if(doc.numPages>50)fail('TOO_LARGE');let text='';for(let page=1;page<=doc.numPages;page++){const item=await doc.getPage(page),content=await item.getTextContent();text+=content.items.map(v=>v.str+(v.hasEOL?'\n':' ')).join('')+'\n\n';if(text.length>TEXT_LIMIT)fail('TOO_LARGE');item.cleanup();}return text;}finally{await task.destroy();}
}
export async function readDocumentBytes(name,input){
  const ext=String(name).toLowerCase().split('.').pop(),bytes=new Uint8Array(input);
  if(!DOCUMENT_EXTENSIONS.includes(ext))fail('REJECTED');if(!bytes.length)fail('EMPTY');if(bytes.length>FILE_LIMIT)fail('TOO_LARGE');
  try{
    let text;
    if(['txt','csv','tsv'].includes(ext)){if(isOLE(bytes)||bytes[0]===0x50&&bytes[1]===0x4b||bytes[0]===0x89||bytes[0]===0xff&&bytes[1]===0xd8||decoder(bytes.subarray(0,5))==='%PDF-')fail('INVALID');text=plain(bytes);}
    else if(['docx','odt'].includes(ext))text=zipDocument(bytes,ext);
    else if(['xls','xlsx','ods'].includes(ext))text=spreadsheet(bytes,ext);
    else if(ext==='doc')text=legacyWord(bytes);
    else if(ext==='rtf')text=rtfText(bytes);
    else text=await pdfText(bytes);
    return finishText(text);
  }catch(error){if(['REJECTED','TOO_LARGE','EMPTY','INVALID'].includes(error.message))throw error;fail('INVALID');}
}
