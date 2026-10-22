export const SLOT_REVIEW_WARNING='送达时间范围无法归入单个半小时时段，请手动选择 / Select a single half-hour delivery slot.';
const pad=value=>String(value).padStart(2,'0');
function parts(value,maxYear=2200){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
  const [year,month,day,hour,minute]=value.split(/[-T:]/).map(Number),ms=Date.UTC(year,month-1,day,hour,minute),date=new Date(ms);
  return year>=2000&&year<=maxYear&&month>=1&&day>=1&&hour<24&&minute<60&&date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?{year,month,day,hour,minute,ms}:null;
}
export function validLocalMinute(value){return !!parts(value);}
const fromMilliseconds=value=>new Date(value).toISOString().slice(0,16);
export function slotForTime(value){
  const time=parts(value);if(!time)return null;
  const start=time.ms-(time.minute%30)*60000;
  return {scheduledAt:fromMilliseconds(start),scheduledEndAt:fromMilliseconds(start+30*60000)};
}
// Explicit requested ranges must fit in one slot; do not shorten wider promises.
export function slotForRequest(start,end=''){
  const slot=slotForTime(start);if(!slot)return null;
  if(end){const finish=parts(end,2201);if(!finish||finish.ms<=parts(start).ms||finish.ms>parts(slot.scheduledEndAt,2201).ms)return null;}
  return slot;
}
export function deliveryWindow(order){
  const slot=slotForTime(order?.scheduledAt);if(!slot)return null;
  if(order.scheduledEndAt&&(slot.scheduledAt!==order.scheduledAt||slot.scheduledEndAt!==order.scheduledEndAt))return null;
  return slot;
}
export function withDeliveryWindow(order){
  const slot=deliveryWindow(order);if(!slot)return {...order};
  return {...order,...slot,...(slot.scheduledAt!==order.scheduledAt&&!order.originalScheduledAt?{originalScheduledAt:order.scheduledAt}:{})};
}
export const deliverySlotOptions=Array.from({length:48},(_,index)=>{
  const minute=index*30,next=(minute+30)%1440;
  return {value:pad(Math.floor(minute/60))+':'+pad(minute%60),end:pad(Math.floor(next/60))+':'+pad(next%60),nextDay:index===47};
});
export function deliveryWindowLabel(order,locale='en-GB',nextDayLabel='next day'){
  const slot=deliveryWindow(order);if(!slot)return '—';
  const start=parts(slot.scheduledAt),day=new Date(start.year,start.month-1,start.day).toLocaleDateString(locale,{year:'numeric',month:'2-digit',day:'2-digit'});
  return `${day} ${slot.scheduledAt.slice(11)}–${slot.scheduledEndAt.slice(11)}${slot.scheduledAt.slice(0,10)!==slot.scheduledEndAt.slice(0,10)?' ('+nextDayLabel+')':''}`;
}
function clock(match,inherited='',allow24=false){
  let hour=Number(match[2]),minute=match[3]===undefined?(match[4]==='半'?30:Number(match[4]||0)):Number(match[3]);
  const period=match[1]||match[5]||inherited;
  if(hour>24||hour===24&&(!allow24||minute!==0)||minute>59)return null;
  if(/am|pm/i.test(period)&&(!hour||hour>12))return null;
  if(/下午|晚上|中午|pm/i.test(period)&&hour<12)hour+=12;
  if(/am/i.test(period)&&hour===12)hour=0;
  return {hour,minute};
}
export function parseDeliverySchedule(text,now=new Date()){
  const empty={scheduledAt:'',scheduledEndAt:'',warnings:[]};
  const clocks=[...text.matchAll(/(上午|下午|晚上|中午|早上)?\s*(\d{1,2})(?:[:：](\d{2})|点(?:(半|\d{1,2})分?)?)\s*(am|pm)?/gi)];
  if(!clocks.length)return empty;
  const first=clocks[0],second=clocks[1],range=!!second&&/^(?:[-–—~～至到]|to|hingga)$/i.test(text.slice(first.index+first[0].length,second.index).trim());
  const period=range?(second[1]||second[5]||''):'';
  const startClock=clock(first,period);if(!startClock)return {...empty,warnings:[SLOT_REVIEW_WARNING]};
  const explicit=text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/),day=new Date(now);
  if(!explicit){if(/后天|day after tomorrow|lusa/i.test(text))day.setDate(day.getDate()+2);else if(/明天|tomorrow|esok/i.test(text))day.setDate(day.getDate()+1);}
  const date=explicit?`${explicit[1]}-${pad(explicit[2])}-${pad(explicit[3])}`:`${day.getFullYear()}-${pad(day.getMonth()+1)}-${pad(day.getDate())}`;
  const start=`${date}T${pad(startClock.hour)}:${pad(startClock.minute)}`;
  let end='';
  if(range){
    const endClock=clock(second,first[1]||first[5]||'',true);if(!endClock)return {...empty,originalScheduledAt:start,warnings:[SLOT_REVIEW_WARNING]};
    end=`${date}T${pad(endClock.hour)}:${pad(endClock.minute)}`;
    if(endClock.hour===24){const midnight=parts(`${date}T00:00`);if(!midnight)return {...empty,originalScheduledAt:start,warnings:[SLOT_REVIEW_WARNING]};end=fromMilliseconds(midnight.ms+86400000);}
    if(parts(start)&&parts(end)&&parts(end).ms<parts(start).ms)end=fromMilliseconds(parts(end).ms+86400000);
  }
  const slot=slotForRequest(start,end);
  if(!slot)return {...empty,originalScheduledAt:start,...(end?{originalScheduledEndAt:end}:{}),warnings:[SLOT_REVIEW_WARNING]};
  return {...slot,...(start!==slot.scheduledAt||end&&end!==slot.scheduledEndAt?{originalScheduledAt:start,...(end?{originalScheduledEndAt:end}:{})}:{}),warnings:[]};
}
