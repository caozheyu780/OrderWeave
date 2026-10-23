import {localDateTime} from './core.js';
export const AI_ENDPOINT='/api/parse-order';
export async function getAIStatus(){
  const response=await fetch('/api/ai-status',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(response.status===401?'AUTH_REQUIRED':'AI_UNAVAILABLE');
  return response.json();
}
export async function recognizeWithAI(text,menu,merchantId){
  let response;
  try{response=await fetch(AI_ENDPOINT,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({merchantId,batch:true,text,menu:menu.map(({id,name,minutes,aliases})=>({id,name,minutes,...(aliases?.length?{aliases}:{})})),localNow:localDateTime(new Date()),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}),
    signal:AbortSignal.timeout(75000)
  });}catch(error){throw new Error(error.name==='TimeoutError'||error.name==='AbortError'?'AI_TIMEOUT':'AI_UNAVAILABLE');}
  let result;try{result=await response.json();}catch{throw new Error('AI_INVALID_RESPONSE');}
  if(!response.ok)throw new Error(result.error||'AI_UNAVAILABLE');
  if(!result||!Array.isArray(result.orders)||!result.orders.length||result.orders.length>20||result.orders.some(o=>!Array.isArray(o.items)||o.items.some(i=>typeof i.name!=='string'||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>999)))throw new Error('AI_INVALID_RESPONSE');
  return {...result,sourceText:text};
}
export async function recognizeMenuWithAI(text,merchantId){
  let response;
  try{response=await fetch(AI_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'menu',text,merchantId}),signal:AbortSignal.timeout(75000)});}catch(error){throw Error(['TimeoutError','AbortError'].includes(error.name)?'AI_TIMEOUT':'AI_UNAVAILABLE');}
  let result;try{result=await response.json();}catch{throw Error('AI_INVALID_RESPONSE');}
  if(!response.ok)throw Error(result.error||'AI_UNAVAILABLE');
  if(!Array.isArray(result?.dishes)||!result.dishes.length||result.dishes.length>30)throw Error('AI_INVALID_RESPONSE');
  return result;
}
