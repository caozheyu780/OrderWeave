import {escapeHtml as e} from './core.js';
import {locateOrderSource} from './order-source.js';

export function orderEvidenceHtml(order,source,t){
  const quote=order.sourceText||'',location=locateOrderSource(source,quote);
  const positioned=location&&order.sourceVerified!==false;
  const label=positioned?`${t('sourceLines')} ${location.startLine}–${location.endLine}`:t('sourceNotLocated');
  return `<section class="order-evidence"><b>${t('sourceEvidence')}</b><p class="muted">${e(label)}</p>${quote&&order.sourceVerified!==false?`<pre>${e(quote)}</pre>`:''}${positioned?`<button type="button" class="small" data-locate-source data-source-start="${location.start}" data-source-end="${location.end}">${t('locateSource')}</button>`:''}</section>`;
}
export function fullSourceHtml(source,t){
  return source?`<details class="batch-full-source"><summary>${t('fullSourceText')}</summary><label>${t('fullSourceText')}<textarea class="source-navigation" readonly wrap="off" aria-label="${t('fullSourceText')}">${e(source)}</textarea></label></details>`:'';
}
export function batchWarningSummaryHtml(entries,warnings,t,translate=value=>value){
  const assigned=new Set(entries.flatMap(entry=>entry.draft.warnings||[]));
  const general=(warnings||[]).filter(message=>!assigned.has(message));
  const linked=entries.flatMap((entry,index)=>(entry.draft.warnings||[]).map(message=>`<li><button type="button" class="small ghost" data-go-order="${e(entry.id)}">${t('batchOrder')} ${index+1}</button> ${e(translate(message))}</li>`));
  if(!general.length&&!linked.length)return '';
  return `<div class="notice order-warning batch-warning-summary"><b>${t('orderUncertain')}</b>${general.map(message=>`<p>${e(translate(message))}</p>`).join('')}${linked.length?`<ul>${linked.join('')}</ul>`:''}</div>`;
}
export function wireSourceNavigation(root){
  root.addEventListener('click',event=>{
    const link=event.target.closest('[data-go-order]');
    if(link){const card=[...root.querySelectorAll('[data-batch-entry]')].find(node=>node.dataset.batchEntry===link.dataset.goOrder);if(card){card.tabIndex=-1;card.focus();card.scrollIntoView({block:'start'});}return;}
    const button=event.target.closest('[data-locate-source]');if(!button)return;
    const panel=root.querySelector('.batch-full-source'),text=panel?.querySelector('textarea');if(!text)return;
    const start=Number(button.dataset.sourceStart),end=Number(button.dataset.sourceEnd);
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>text.value.length)return;
    panel.open=true;text.focus();text.setSelectionRange(start,end);
    const line=(text.value.slice(0,start).match(/\n/g)||[]).length;
    const height=parseFloat(getComputedStyle(text).lineHeight)||24;text.scrollTop=Math.max(0,(line-1)*height);
    text.scrollIntoView({block:'center'});
  });
}
