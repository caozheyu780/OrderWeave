export const DOCUMENT_ACCEPT='.txt,.csv,.tsv,.xlsx,.xls,.ods,.docx,.doc,.odt,.rtf,.pdf';
export function readDocument(file){
  if(!DOCUMENT_ACCEPT.split(',').some(ext=>file.name.toLowerCase().endsWith(ext)))return Promise.reject(Error('REJECTED'));
  if(file.size>5*1024*1024)return Promise.reject(Error('TOO_LARGE'));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./document-vendor/reader-worker.js',import.meta.url),{type:'module'});
    const finish=(error,text)=>{clearTimeout(timer);worker.terminate();error?reject(Error(error)):resolve(text);};
    const timer=setTimeout(()=>finish('INVALID'),30000);
    worker.onmessage=event=>{if(event.data?.type==='orderweave-document-result')finish(event.data.error,event.data.text);};worker.onerror=()=>finish('INVALID');
    file.arrayBuffer().then(bytes=>worker.postMessage({type:'orderweave-document-request',name:file.name,bytes},[bytes])).catch(()=>finish('INVALID'));
  });
}
export function documentField(t,id='text-file'){
  return `<div class="field"><label for="${id}">${t('documentImport')}</label><input id="${id}" type="file" accept="${DOCUMENT_ACCEPT}" aria-describedby="${id}-help"><small id="${id}-help">${t('documentHelp')}</small><p id="${id}-status" role="status"></p></div>`;
}
export function wireDocumentImport({form,source,input,error,t,confirmAction,isCurrent,busy=()=>{},id='text-file'}){
  let reading=false,version=0;
  input.addEventListener('change',()=>{
    const file=input.files[0];if(!file)return;input.value='';
    const run=async()=>{if(!isCurrent())return;const token=++version;reading=true;busy(true);input.disabled=true;source.readOnly=true;const status=form.querySelector('#'+id+'-status');status.textContent=t('documentReading');error.textContent='';
      try{const text=await readDocument(file);if(token!==version||!isCurrent())return;source.value=text;status.textContent=t('documentLoaded');}
      catch(err){if(isCurrent()){error.textContent=t('document_'+(['REJECTED','TOO_LARGE','EMPTY','INVALID'].includes(err.message)?err.message:'INVALID'));status.textContent='';}}
      finally{reading=false;input.disabled=false;source.readOnly=false;busy(false);}
    };
    if(source.value.trim())confirmAction(t('document_REPLACE'),t('document_REPLACE_HELP'),file.name,run);else run();
  });
  return ()=>reading;
}
