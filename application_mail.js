'use strict';
const CareerApplicationMail=(()=>{
  let snapshot=null,aliases=new Map(),pending=false;
  function canonical(value){
    try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return '';const linkedin=url.hostname.match(/(^|\.)linkedin\.com$/i)&&url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/);if(linkedin)return 'linkedin:'+linkedin[1];for(const key of [...url.searchParams.keys()])if(key.toLowerCase().startsWith('utm_')||['trk','trackingid','fbclid','gclid'].includes(key.toLowerCase()))url.searchParams.delete(key);url.hash='';url.pathname=url.pathname.replace(/\/$/,'')||'/';url.searchParams.sort();return url.href;}catch{return '';}
  }
  function apply(value){
    if(!model.data||!value||value.version!==1)return false;
    snapshot=value;model.data.application_mail=value;aliases=new Map();
    const rows=model.data.jobs,byId=new Map(rows.map(row=>[row.id,row])),byLink=new Map();
    for(const row of rows){const key=canonical(row.canonical_url||row.link);if(key)byLink.set(key,row);}
    let changed=false;
    for(const row of value.jobs||[]){
      if(!row||typeof row.id!=='string'||['__proto__','constructor','prototype'].includes(row.id))continue;
      const key=canonical(row.canonical_url||row.link),existing=byId.get(row.id)||(key&&byLink.get(key));
      if(existing){aliases.set(row.id,existing.id);continue;}
      const job={...row,kind:'job',complete:false,description_verified:false,saved:false};rows.push(job);byId.set(job.id,job);if(key)byLink.set(key,job);aliases.set(row.id,job.id);changed=true;
    }
    const incoming={version:2,rows:{}};
    for(const [id,state]of Object.entries(value.state?.rows||{})){const target=aliases.get(id)||id;if(['__proto__','constructor','prototype'].includes(target))continue;incoming.rows[target]=merge({rows:{[target]:incoming.rows[target]}},{rows:{[target]:state}}).rows[target];}
    const merged=merge(model.checks,incoming);
    if(JSON.stringify(merged)!==JSON.stringify(model.checks)){model.checks=merged;changed=true;}
    if(changed){applicationCache=null;model.data.audit.all_jobs=rows.length;}
    updateCount();return changed;
  }
  function updateCount(){const count=$('count-notifications');if(count)count.textContent=String((snapshot?.notifications||[]).filter(item=>item.status!=='read').length);}
  function date(value){const parsed=Date.parse(value);return Number.isFinite(parsed)?new Date(parsed).toLocaleString('it-IT'):'Data non disponibile';}
  async function action(body){
    const session=model.session,result=await localAPI('application-mail',body);if(session!==model.session||!model.data)return;
    apply(result.application_mail||result);render();return result;
  }
  function openTracker(id){
    const target=aliases.get(id)||id;history.replaceState(null,'',location.pathname+location.search+'#tracker');
    for(const key of ['search','area','distance','status','tracker-stage','fit-min','fit-tier','job-source','job-lifecycle','career-profile'])if($(key))$(key).value='';
    selectView('tracker');const row=applicationRows().find(item=>item.id===target||item.state_ids?.includes(target));if(row)showDetail(row);
  }
  function renderNotifications(){
    const root=$('notifications-panel');root.replaceChildren();
    root.append(node('p','Conferme di invio e risposte alle candidature ricevute dalle caselle selezionate. I casi incerti richiedono la tua verifica; nessuna candidatura viene inviata.','notice'));
    if(!model.local&&!CareerCloud.connected)root.append(node('p','Collega GitHub in Connessioni per ricevere lo stato aggiornato e segnare le notifiche come lette.'));
    const actions=node('div',undefined,'actions');actions.append(button('Configura email e tracker','settings',()=>{history.replaceState(null,'','#connections');selectView('connections');}));
    if(canConfigure()){
      const check=button('Controlla email ora','refresh-cw',async()=>{check.disabled=true;try{await action({action:'refresh'});toast('Controllo email richiesto; i risultati compaiono al termine del ciclo.');}catch(error){toast(error.message);}finally{check.disabled=false;}});actions.append(check);
      const unread=(snapshot?.notifications||[]).filter(item=>item.status!=='read');if(unread.length)actions.append(button('Segna tutte come lette','check',async()=>{try{await action({action:'acknowledge',ids:unread.map(item=>item.id)});}catch(error){toast(error.message);}}));
    }root.append(actions);
    const items=[...(snapshot?.notifications||[])].sort((a,b)=>(Date.parse(b.received_at)||0)-(Date.parse(a.received_at)||0));
    if(!items.length){root.append(node('p','Nessuna notifica sulle candidature. Seleziona le caselle in Connessioni e includi nella cartella scelta conferme di invio e risposte.'));return;}
    for(const item of items){
      const card=node('article',undefined,'mail-notification'+(item.status==='read'?' is-read':''));card.append(node('span',item.status==='needs_review'?'Da verificare':item.status==='read'?'Letta':'Nuova','badge'),node('h2',item.title||'Aggiornamento candidatura'),node('p',item.message||''));
      card.append(node('p',date(item.received_at)+' · Email ricevuta','muted'));
      if(item.evidence?.subject){const evidence=node('details');evidence.append(node('summary','Riferimento email'),node('p',item.evidence.subject));card.append(evidence);}
      const buttons=node('div',undefined,'actions');if(item.job_id)buttons.append(button('Apri nel tracker','list-checks',()=>openTracker(item.job_id)));
      if(canConfigure()&&item.status!=='read')buttons.append(button('Segna come letta','check',async()=>{try{await action({action:'acknowledge',ids:[item.id]});}catch(error){toast(error.message);}}));card.append(buttons);root.append(card);
    }icons();
  }
  async function refresh(){
    if(pending||!model.data||document.hidden||!canConfigure())return;pending=true;const session=model.session;
    try{if(!model.local)await CareerCloud.load();else{const value=await localAPI('application-mail');if(session!==model.session||!model.data)return;apply(value.application_mail||value);}if(session!==model.session||!model.data)return;renderMetrics();if(['tracker','notifications'].includes(model.view)&&!document.querySelector('dialog[open]'))render();}
    catch(error){if(model.view==='notifications'){$('notifications-panel').querySelector('.mail-poll-error')?.remove();$('notifications-panel').append(node('p','Aggiornamento non disponibile: '+error.message,'form-error mail-poll-error'));}}
    finally{pending=false;}
  }
  function lock(){snapshot=null;aliases.clear();updateCount();$('notifications-panel').replaceChildren();}
  document.addEventListener('career-ready',()=>{refresh();});setInterval(refresh,60000);
  // Mail-only ids that point to a known posting resolve to that posting's row.
  function alias(id){const target=aliases.get(id);return target&&target!==id?target:null;}
  return {apply,alias,render:renderNotifications,refresh,lock};
})();
