import {AI_REQUEST_LIMIT} from '../public/import-limits.js';
import {AIError} from './deepseek.mjs';

export async function readAIInput(request){
  if(Number(request.headers.get('content-length')||0)>AI_REQUEST_LIMIT)throw new AIError('REQUEST_TOO_LARGE',413);
  const reader=request.body?.getReader();
  if(!reader)throw new AIError('INVALID_REQUEST',400);
  const chunks=[];let length=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;
      if(length>AI_REQUEST_LIMIT){await reader.cancel();throw new AIError('REQUEST_TOO_LARGE',413);}chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AIError('INVALID_REQUEST',400);}
}
