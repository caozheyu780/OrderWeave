import {readDocumentBytes} from './document-reader-core.mjs';
self.onmessage=async({data})=>{
  if(data?.type!=='orderweave-document-request')return;
  try{self.postMessage({type:'orderweave-document-result',text:await readDocumentBytes(data.name,data.bytes)});}catch(error){self.postMessage({type:'orderweave-document-result',error:error.message});}
};
