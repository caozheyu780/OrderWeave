// Positions are derived from exact source text, never from model-provided offsets.
export function locateOrderSource(source,quote){
  if(typeof source!=='string'||typeof quote!=='string'||!quote)return null;
  const start=source.indexOf(quote);
  if(start<0||source.indexOf(quote,start+1)!==-1)return null;
  const lines=text=>(text.match(/\r\n|\r|\n/g)||[]).length;
  return {start,end:start+quote.length,startLine:lines(source.slice(0,start))+1,endLine:lines(source.slice(0,start+quote.length))+1};
}

function ordinal(value){
  if(/^\d+$/.test(value))return Number(value);
  const n={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'两':2};
  if(value.includes('十')){const [a,b]=value.split('十');return (n[a]||1)*10+(n[b]||0);}
  return n[value]||0;
}
export function warningOrderNumbers(warning,count){
  const message=typeof warning==='string'?warning:warning?.message;
  const explicit=Array.isArray(warning?.orderNumbers)?warning.orderNumbers:[];
  const found=[...explicit.filter(Number.isInteger)];
  if(typeof message==='string'){
    for(const match of message.matchAll(/第\s*([\d一二三四五六七八九十两]+)\s*(?:个\s*)?(?:订单|单)|(?:订单|order|pesanan)\s*#?\s*(\d+)(?!\d)/giu))found.push(ordinal(match[1]||match[2]));
  }
  return [...new Set(found)].filter(n=>n>=1&&n<=count);
}
export function routeBatchWarnings(orders,warnings,source){
  const messages=[];
  for(const warning of Array.isArray(warnings)?warnings.slice(0,10):[]){
    const raw=typeof warning==='string'?warning:warning?.message;
    const message=typeof raw==='string'?raw.trim().slice(0,300):'';
    if(!message)continue;messages.push(message);
    const numbers=warningOrderNumbers(warning,orders.length);
    // A verified quote may scope a warning only when it belongs to one order.
    if(!numbers.length&&typeof warning?.sourceText==='string'){
      const quote=warning.sourceText.trim();
      if(locateOrderSource(source,quote)){
        const owners=orders.flatMap((order,i)=>order.sourceText&&order.sourceText!==source&&order.sourceText.includes(quote)?[i+1]:[]);
        if(owners.length===1)numbers.push(owners[0]);
      }
    }
    for(const number of numbers){
      const order=orders[number-1];
      if(!order.warnings.includes(message))order.warnings.push(message);
    }
  }
  return messages;
}
