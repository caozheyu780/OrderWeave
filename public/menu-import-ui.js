import {TEXT_LIMIT} from './import-limits.js';
import {getAIStatus,recognizeMenuWithAI} from './ai-adapter.js';
import {documentField,wireDocumentImport} from './document-import.js';
import {menuDraftIssue,prepareMenuBatch} from './menu-import.js';
import {money} from './commerce.js';

export function createMenuImportUI({modal,t,e,account,currentId,openModal,confirmAction,dishForm,saveAccount,render,toast,aiMessage,beginBatch,recordBatch}){
  let batch=null;
  const button=(name,label,id='',disabled=false)=>`<button type="button" data-menu-import="${name}" data-id="${e(id)}" ${disabled?'disabled':''}>${e(label)}</button>`;
  const active=()=>modal.open&&!!modal.querySelector('#menu-import-form,#menu-import-list,#dish-form[data-menu-review]');
  const summary=d=>[d.name,d.priceCents==null?t('unpriced'):money(d.priceCents),d.category||'',d.description||'',...(d.ingredients||[]).map(r=>`${r.name} ${r.quantity??'?'} ${r.unit||'?'}`),d.minutes==null?'':d.minutes+' '+t('minutes'),...(d.optionGroups||[]).map(g=>g.name+': '+g.choices.map(c=>c.name+' +'+(c.priceCents==null?'?':money(c.priceCents))).join(' / '))].filter(Boolean).join('\n');
  function clear(){batch=null;delete modal.dataset.menuImport;modal.close();}
  function show(){
    if(!batch||batch.storeId!==currentId())return clear();
    const entries=batch.entries;
    openModal(t('menuImportReview'),`<div class="modal-body"><p class="notice">${t('menuImportReviewHelp')}</p>${batch.warnings.length?`<p class="notice">${batch.warnings.map(e).join('<br>')}</p>`:''}<div id="menu-import-list" class="batch-review-list">${entries.map((entry,i)=>{
      const issue=menuDraftIssue(entry.draft,[...account().menu,...entries.filter(v=>v!==entry).map(v=>v.draft)]);
      return `<article class="batch-card"><h3>${i+1}. ${e(entry.draft.name)}</h3><div class="batch-summary">${e(summary(entry.draft))}</div>${entry.draft.warnings?.length?`<p class="notice">${entry.draft.warnings.map(e).join('<br>')}</p>`:''}${issue?`<p class="error">${t('menuImportMissing')}: ${t(issue)}</p>`:''}<p>${t(entry.reviewed&&!issue?'batchReady':'menuImportNeedsReview')}</p><div class="row">${button('edit',t('batchEdit'),entry.draft.id)}${button('remove',t('menuImportRemove'),entry.draft.id)}</div><details><summary>${t('menuImportEvidence')}</summary><p class="detail-value" style="white-space:pre-wrap">${e(entry.draft.sourceText||'')}</p></details></article>`;
    }).join('')}</div><p id="menu-import-error" class="error" role="alert"></p></div><div class="modal-foot sticky">${button('discard',t('cancel'))}${button('save',t('menuImportConfirm'),'',!entries.length||entries.some(v=>!v.reviewed||menuDraftIssue(v.draft,[...account().menu,...entries.filter(x=>x!==v).map(x=>x.draft)])))}</div>`);
    modal.dataset.menuImport='list';
  }
  async function open(){
    batch=null;delete modal.dataset.batchView;
    openModal(t('menuImportTitle'),`<form id="menu-import-form"><div class="modal-body"><p>${t('menuImportHelp')}</p><div id="menu-ai-notice" class="notice">${t('checkingAI')}</div><label for="menu-source">${t('menuImportSource')}</label><textarea id="menu-source" class="source-text" required maxlength="${TEXT_LIMIT}"></textarea>${documentField(t,'menu-document')}<p id="menu-import-error" class="error" role="alert"></p></div><div class="modal-foot sticky">${button('discard',t('cancel'))}<button class="primary" type="submit" disabled>${t('extractAI')}</button></div></form>`);
    modal.dataset.menuImport='source';const storeId=currentId(),form=modal.querySelector('form'),source=form.querySelector('textarea'),error=form.querySelector('#menu-import-error'),submit=form.querySelector('[type=submit]');
    let configured=false,extracting=false;
    const isCurrent=()=>modal.open&&currentId()===storeId&&modal.querySelector('#menu-import-form')===form;
    const reading=wireDocumentImport({form,source,input:form.querySelector('#menu-document'),error,t,confirmAction,isCurrent,id:'menu-document',busy:value=>{submit.disabled=value||!configured||extracting;}});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(!configured||reading()||extracting)return;
      const text=source.value.trim();if(!text||text.length>TEXT_LIMIT){error.textContent=t('document_TOO_LARGE');return;}
      extracting=true;submit.disabled=true;submit.textContent=t('busy');error.textContent='';form.querySelector('#menu-document').disabled=true;source.readOnly=true;
      try{const result=await recognizeMenuWithAI(text,storeId);if(!isCurrent())return;
        const next={storeId,warnings:result.warnings||[],entries:result.dishes.map(d=>({draft:{...d,id:crypto.randomUUID()},reviewed:false}))};next.id=await beginBatch(next.entries.map(e=>e.draft.id));if(!isCurrent())return;batch=next;show();
      }catch(err){if(isCurrent())error.textContent=/^(AI_|AUTH_REQUIRED|INVALID_REQUEST|REQUEST_TOO_LARGE)/.test(err.message)?aiMessage(err.message):t('cloud_'+err.message);}finally{extracting=false;submit.disabled=!configured;submit.textContent=t('extractAI');source.readOnly=false;form.querySelector('#menu-document').disabled=false;}
    });
    try{const status=await getAIStatus();if(!isCurrent())return;configured=!!status.configured;submit.disabled=!configured||reading();form.querySelector('#menu-ai-notice').textContent=configured?t('menuAIReady'):aiMessage('AI_NOT_CONFIGURED');}catch(err){if(isCurrent())form.querySelector('#menu-ai-notice').textContent=aiMessage(err.message);}
  }
  function close(){
    if(!active())return false;
    if(modal.dataset.menuImport==='edit'){show();return true;}
    if(batch)confirmAction(t('menuImportDiscard'),t('menuImportDiscardHelp'),'',async()=>{try{await recordBatch(batch.id,'discard');clear();}catch(error){toast(t('cloud_'+error.message));}});else clear();
    return true;
  }
  modal.addEventListener('click',async event=>{
    const target=event.target.closest('[data-menu-import]');if(!target)return;
    const action=target.dataset.menuImport,entry=batch?.entries.find(v=>v.draft.id===target.dataset.id);
    if(action==='discard')close();
    if(action==='remove'&&entry){try{await recordBatch(batch.id,'remove',entry.draft.id);batch.entries=batch.entries.filter(v=>v!==entry);show();}catch(error){toast(t('cloud_'+error.message));}}
    if(action==='edit'&&entry){dishForm(null,entry.draft,async dish=>{try{await recordBatch(batch.id,'edit',entry.draft.id);entry.draft={...dish,sourceText:entry.draft.sourceText,warnings:entry.draft.warnings};entry.reviewed=true;show();}catch(error){toast(t('cloud_'+error.message));}});modal.dataset.menuImport='edit';}
    if(action==='save'&&batch){
      const current=batch;let dishes;try{dishes=prepareMenuBatch(current.entries,account().menu);}catch(err){modal.querySelector('#menu-import-error').textContent=t(err.message);return;}
      confirmAction(t('menuImportConfirm'),t('menuImportConfirmHelp'),dishes.map(summary).join('\n\n'),async()=>{
        if(batch!==current||currentId()!==current.storeId)return;
        try{dishes=prepareMenuBatch(current.entries,account().menu).map((dish,i)=>({...dish,batchId:current.id,batchEntryId:current.entries[i].draft.id}));}catch(err){show();modal.querySelector('#menu-import-error').textContent=t(err.message);return;}
        const next=structuredClone(account());next.menu.push(...dishes);
        if(await saveAccount(next,false,{batchId:current.id})){clear();render();toast(t('saved')+' · '+dishes.length);}
      });
    }
  });
  return {open,close,active};
}
