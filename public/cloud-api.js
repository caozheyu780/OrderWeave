export async function cloudRequest(input={},query=''){
  const response=await fetch('/api/workspace'+query,{cache:'no-store',credentials:'same-origin',...(Object.keys(input).length?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{})});
  let result;try{result=await response.json();}catch{throw Error('SERVER_ERROR');}
  if(!response.ok)throw Error(result.error||'SERVER_ERROR');return result;
}
