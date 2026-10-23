import {deliveryWindow} from './delivery-slots.js';
export function preparationEstimate(order){
  let minutes=0,incomplete=false;
  for(const item of order.items||[]){if(!(Number(item.minutes)>0)||!(Number(item.quantity)>0)){incomplete=true;continue;}minutes+=Number(item.minutes)*Number(item.quantity);}
  return {minutes,incomplete};
}
export function orderTiming(order,now=Date.now()){
  if(['delivered','awaiting_acceptance','rejected'].includes(order.status))return {state:'complete'};
  const window=deliveryWindow(order);if(!window)return {state:'unknown'};
  const remainingMs=new Date(window.scheduledAt).getTime()-Number(now);
  if(!Number.isFinite(remainingMs))return {state:'unknown'};
  return {state:remainingMs<0?'overdue':remainingMs<20*60000?'urgent':'normal',remainingMs};
}
