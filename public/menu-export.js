import {money,validCents,cnyReference,FX} from './commerce.js';

export const MENU_PAGE={width:1240,height:1754,margin:64,bottom:1630};
const clean=(v,max)=>String(v??'').trim().slice(0,max);
// Only explicitly public menu fields enter an export, never orders or accounts.
export function publicMenu(account,{ids,description=true,options=true,cny=true}={}){
 const selected=new Set(ids??account.menu.map(d=>d.id));
 const dishes=account.menu.filter(d=>selected.has(d.id)).map(d=>({name:clean(d.name,100),category:clean(d.category,60),image:typeof d.image==='string'&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d.image)?d.image:'',priceCents:validCents(d.priceCents)?d.priceCents:null,description:description?clean(d.description,2000):'',groups:options?(d.optionGroups||[]).map(g=>({name:clean(g.name,60),required:!!g.required,multiple:!!g.multiple,choices:g.choices.map(c=>({name:clean(c.name,60),priceCents:validCents(c.priceCents)?c.priceCents:0}))})):[]}));
 if(!dishes.length)throw Error('MENU_EXPORT_EMPTY');
 return {shop:clean(account.shop,100),dishes,cny:!!cny,fxDate:FX.date};
}
export function wrapMenuText(text,maxWidth,measure){
 const result=[];
 for(const paragraph of String(text).split(/\r?\n/)){
  let line='';
  for(const char of Array.from(paragraph)){if(line&&measure(line+char)>maxWidth){const space=line.lastIndexOf(' ');if(space>0){result.push(line.slice(0,space));line=line.slice(space+1)+char;}else{result.push(line);line=char;}}else line+=char;}
  result.push(line.trimEnd());
 }
 return result;
}
export function layoutMenu(model,{measure,t,locale,generatedDate}){
 const {width,margin,bottom}=MENU_PAGE,textX=margin+224,textWidth=width-margin-textX;
 const shopLines=wrapMenuText(model.shop,width-2*margin,s=>measure(s,44));
 const headerBottom=146+shopLines.length*54;
 const pages=[{shopLines,generatedDate,entries:[]}];let y=headerBottom;
 const addPage=()=>{pages.push({shopLines,generatedDate,entries:[]});y=headerBottom;};
 for(const dish of model.dishes){
  const lines=[];
  const push=(value,size=24,color='#596b60',gap=34)=>{for(const text of wrapMenuText(value,textWidth,s=>measure(s,size)))lines.push({text,size,color,gap});};
  if(dish.category)push(dish.category,22,'#20624b',30);
  push(dish.name,32,'#24372f',44);
  push(dish.priceCents===null?t('menuPricePending'):money(dish.priceCents,locale),30,'#20624b',42);
  if(model.cny&&dish.priceCents!==null)push('≈ '+money(cnyReference(dish.priceCents),locale,'CNY'),21,'#768078',30);
  if(dish.description)push(dish.description);
  for(const group of dish.groups){push(group.name+' ('+t(group.required?'requiredChoice':'optionalChoice')+(group.multiple?' · '+t('multiChoice'):'')+'): '+group.choices.map(c=>c.name+' +'+money(c.priceCents,locale)).join(' / '),22,'#596b60',32);}
  let index=0,part=0;
  while(index<lines.length){
   if(bottom-y<240)addPage();
   const continuation=part?dish.name+' · '+t('menuContinued'):'';
   const repeated=part?wrapMenuText(continuation,textWidth,s=>measure(s,26)).map(text=>({text,size:26,color:'#24372f',gap:36})):[];
   let height=32+repeated.reduce((n,l)=>n+l.gap,0),end=index;
   while(end<lines.length&&height+lines[end].gap+24<=bottom-y){height+=lines[end].gap;end++;}
   if(end===index){addPage();if(part>1000)throw Error('MENU_EXPORT_LIMIT');continue;}
   height=Math.max(212,height+24);
   pages.at(-1).entries.push({dish,y,height,lines:[...repeated,...lines.slice(index,end)]});y+=height+24;index=end;part++;
   if(pages.length>100)throw Error('MENU_EXPORT_LIMIT');
  }
 }
 return pages;
}
const encoder=new TextEncoder();
export function menuPdf(jpegs){
 if(!jpegs.length||jpegs.length>100)throw Error('MENU_EXPORT_LIMIT');
 const chunks=[],offsets=[0];let offset=0;
 const add=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);offset+=bytes.length;};
 const object=(id,body)=>{offsets[id]=offset;add(id+' 0 obj\n');if(Array.isArray(body))body.forEach(add);else add(body);add('\nendobj\n');};
 add('%PDF-1.4\n%OrderWeave menu\n');
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Count '+jpegs.length+' /Kids ['+jpegs.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 jpegs.forEach((page,i)=>{
  if(!(page.bytes instanceof Uint8Array)||page.bytes[0]!==255||page.bytes[1]!==216||!Number.isInteger(page.width)||!Number.isInteger(page.height)||page.width<1||page.height<1)throw Error('MENU_EXPORT_FAILED');
  const id=3+i*3,content='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
  object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');
  object(id+1,['<< /Type /XObject /Subtype /Image /Width '+page.width+' /Height '+page.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+page.bytes.length+' >>\nstream\n',page.bytes,'\nendstream']);
  object(id+2,'<< /Length '+encoder.encode(content).length+' >>\nstream\n'+content+'endstream');
 });
 const xref=offset,count=3+jpegs.length*3;add('xref\n0 '+count+'\n0000000000 65535 f \n');for(let i=1;i<count;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 add('trailer\n<< /Size '+count+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 return new Blob(chunks,{type:'application/pdf'});
}
export function menuFilename(shop,page,format,date){const name=clean(shop,60).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'')||'OrderWeave';return name+'-menu-'+date+(format==='png'?'-'+String(page+1).padStart(2,'0'):'')+'.'+format;}
