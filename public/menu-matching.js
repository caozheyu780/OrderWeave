export const normalizeName=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
export function dishNames(dish){return [dish.name,...(Array.isArray(dish.aliases)?dish.aliases:[])].filter(n=>typeof n==='string'&&n.trim());}
export function cleanAliases(value,primary){
  const names=Array.isArray(value)?value:String(value||'').split(/\r?\n/);
  const seen=new Set([normalizeName(primary)]),aliases=[];
  for(const entry of names){const name=String(entry).trim(),key=normalizeName(name);if(!key||seen.has(key))continue;if(name.length>100)throw Error('ALIAS_LENGTH');seen.add(key);aliases.push(name);}
  if(aliases.length>20)throw Error('ALIAS_LIMIT');
  return aliases;
}
export function conflictingDish(menu,dish){
  const keys=new Set(dishNames(dish).map(normalizeName));
  return menu.find(other=>other.id!==dish.id&&dishNames(other).some(n=>keys.has(normalizeName(n))));
}
export function findNamedDish(menu,name){
  const key=normalizeName(name);if(!key)return undefined;
  const matches=menu.filter(d=>dishNames(d).some(n=>normalizeName(n)===key));
  return matches.length===1?matches[0]:undefined;
}
function distance(a,b,limit){
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));if(Math.min(...next)>limit)return limit+1;previous=next;}
  return previous[b.length];
}
const compact=value=>normalizeName(value).replace(/[\s\p{P}]/gu,'');
function distinctFood(a,b){
  const tokens=/鸡|鸭|鹅|牛|猪|羊|鱼|虾|蟹|肉|素|大份|小份|中份|chicken|beef|pork|duck|lamb|shrimp|fish|vegan|large|small/gu;
  const left=[...new Set(a.match(tokens)||[])].sort().join('|'),right=[...new Set(b.match(tokens)||[])].sort().join('|');
  return !!left&&!!right&&left!==right;
}
// Only a unique, closely spelled name is notification-only. AI labels cannot bypass this check.
export function strongNameMatch(menu,source){
  const input=compact(source);if(input.length<4||!/[\p{L}]/u.test(input))return null;
  const ranked=menu.map(dish=>{
    let score=0;
    for(const name of dishNames(dish)){
      const candidate=compact(name),length=Math.max(input.length,candidate.length);
      if(Math.min(input.length,candidate.length)<4||Math.abs(input.length-candidate.length)>2||distinctFood(input,candidate))continue;
      const limit=Math.min(2,Math.max(1,Math.floor(length*.15))),edits=distance(input,candidate,limit);
      if(edits<=limit)score=Math.max(score,1-edits/length);
    }
    return {dish,score};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  return best&&best.score>=.75&&best.score-(ranked[1]?.score||0)>=.2?best.dish:null;
}
