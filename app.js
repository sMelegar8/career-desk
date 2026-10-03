'use strict';
const $ = id => document.getElementById(id);
const enc = new TextEncoder(), dec = new TextDecoder();
const AAD = enc.encode('career-desk-v1');
const model = {data:null,key:null,config:null,checks:{version:2,rows:{}},view:'saved',page:0,local:false,csrf:'',token:'',save:Promise.resolve(),agentRows:[],session:0};
const labels = {saved:'Salvati LinkedIn',agent:'Salvati da AI Job Agent',jobs:'Tutti gli annunci',companies:'Aziende e recruiter',documents:'Libreria CV',reviews:'Revisioni ATS'};
const statuses = {not_started:'Da analizzare',running:'Analisi in corso',awaiting_visual_review:'Verifica visiva',ready:'CV verificato',needs_correction:'Da correggere',failed:'Da riprovare',interrupted:'Da riprendere',service_paused:'API da verificare',budget_paused:'Budget raggiunto',incomplete_posting:'Testo incompleto'};
const unb64 = text => Uint8Array.from(atob(text), c=>c.charCodeAt(0));
function b64(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function icon(name){const n=document.createElement('i');n.dataset.lucide=name;n.setAttribute('aria-hidden','true');return n;}
function button(text,iconName,fn,cls=''){const n=node('button',undefined,cls);n.type='button';if(iconName)n.append(icon(iconName));if(text)n.append(document.createTextNode(text));n.addEventListener('click',fn);return n;}
function icons(){if(window.lucide)lucide.createIcons({attrs:{width:17,height:17}});}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function safeLink(url,text){try{if(new URL(url).protocol!=='https:')return node('span',text);}catch{return node('span',text);}const a=node('a',text,'button');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
async function fetchJSON(url,opts={}){const r=await fetch(url,{cache:'no-store',...opts});if(!r.ok)throw new Error('Richiesta non riuscita ('+r.status+')');return r.json();}
async function derive(password){const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:unb64(model.config.salt),iterations:model.config.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function decrypt(value){return crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(value.iv),additionalData:AAD},model.key,unb64(value.data));}
async function encrypt(value){const iv=crypto.getRandomValues(new Uint8Array(12));const result=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD},model.key,enc.encode(JSON.stringify(value)));return{iv:b64(iv),data:b64(new Uint8Array(result))};}
function merge(...states){const out={version:2,rows:{}};for(const state of states){for(const [id,row]of Object.entries(state?.rows||{})){if(typeof row.checked!=='boolean'||!Number.isFinite(Date.parse(row.updatedAt)))continue;if(!out.rows[id]||Date.parse(row.updatedAt)>=Date.parse(out.rows[id].updatedAt))out.rows[id]={checked:row.checked,updatedAt:row.updatedAt,note:String(row.note||'').slice(0,8000)};}}return out;}
const storageKey=()=> 'career-desk-state-'+model.config.salt;
async function localAPI(path,body){return fetchJSON('/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Desk-Client':'1','X-CSRF-Token':model.csrf},...(body?{body:JSON.stringify(body)}:{})});}
async function unlock(password){
  model.config=await fetchJSON('config.json');model.key=await derive(password);
  model.data=model.local?await localAPI('catalog'):JSON.parse(dec.decode(await decrypt(await fetchJSON('catalog.enc'))));
  let local={},remote={};
  try{const stored=localStorage.getItem(storageKey());if(stored)local=JSON.parse(dec.decode(await decrypt(JSON.parse(stored))));}catch{toast('Le spunte locali non sono leggibili; conservate senza sovrascriverle.');}
  if(!model.local)try{remote=JSON.parse(dec.decode(await decrypt(await fetchJSON('state.enc'))));}catch{}
  model.checks=merge(model.data.state,remote,local);$('password').value='';
  $('login').hidden=true;$('workspace').hidden=false;
  $('run-all').hidden=!model.local;$('publish').hidden=!model.local;
  $('agent-mode').textContent=model.local?'Agenti locali collegati':'Agenti sul PC';
  $('agent-count').textContent=model.local?'Stato in aggiornamento':'Consultazione da web';
  if(location.hash==='#agent-saved')model.view='agent';
  populateAreas();render();await persist(false);
  if(model.view==='agent'&&AgentSaved.available())await loadAgentCollection();
  if(model.local)refreshWorker();
}
async function refreshWorker(){if(!model.local||!model.data)return;try{const state=await localAPI('status');$('agent-count').textContent=state.running?'Ciclo di revisione in corso':'Nessun ciclo in esecuzione';model.running=state.running;if(model.revision!==state.revision){model.revision=state.revision;model.data=await localAPI('catalog');render();}}catch{$('agent-count').textContent='Connessione locale da verificare';}}
async function persist(sync=true){
  const snapshot=structuredClone(model.checks);
  model.save=model.save.catch(()=>{}).then(async()=>{
    localStorage.setItem(storageKey(),JSON.stringify(await encrypt(snapshot)));
    if(model.local)await localAPI('state',snapshot);
    $('sync-status').textContent=model.local?'Salvato sul PC':'Salvato sul dispositivo';
    if(sync&&model.token)await githubSync();
  }).catch(e=>{toast('Salvataggio da riprovare: '+e.message);$('sync-status').textContent='Salvataggio non riuscito';});
  return model.save;
}
function setRow(id,change){model.checks.rows[id]={checked:false,note:'',...model.checks.rows[id],...change,updatedAt:new Date().toISOString()};renderMetrics();persist();}
function getDoc(row){return model.data.documents.find(d=>d.id===row.cv_id);}
function populateAreas(){const select=$('area'),current=select.value;select.replaceChildren(node('option','Tutte le aree'));select.firstChild.value='';for(const area of ['Parma','Reggio','Modena','Bologna','Milano','Piacenza','Monza','Remoto']){const o=node('option',area);o.value=area.toLowerCase();select.append(o);}select.value=current;}
function renderMetrics(){
  const d=model.data,a=d.audit;
  $('count-saved').textContent=a.saved_jobs;$('count-jobs').textContent=a.all_jobs;$('count-companies').textContent=a.companies;$('count-documents').textContent=a.cvs;
  $('count-agent').textContent=model.agentRows.length;
  const reviewed=[...d.jobs,...d.companies].filter(j=>j.review).length;$('count-reviews').textContent=reviewed;
  $('metric-total').textContent=a.complete_jobs;$('metric-cvs').textContent=d.documents.filter(x=>x.ready).length;
  $('metric-sent').textContent=Object.values(model.checks.rows).filter(r=>r.checked).length;$('metric-review').textContent=reviewed;
  const metricLabels=document.querySelectorAll('.metrics>div>span:last-child');
  const metricText=model.view==='agent'?['pacchetti conservati','CV da verificare','candidature inviate','revisioni AI eseguite']:['annunci completi','CV verificati','candidature inviate','revisioni analizzate'];
  metricLabels.forEach((label,i)=>label.textContent=metricText[i]);
  if(model.view==='agent'){
    $('metric-total').textContent=model.agentRows.length;
    $('metric-cvs').textContent=model.agentRows.filter(r=>!r.cv_ready).length;
    $('metric-sent').textContent=model.agentRows.filter(r=>model.checks.rows[r.id]?.checked).length;
    $('metric-review').textContent=model.agentRows.filter(r=>r.ai_reviewed).length;
  }
  const budget=d.budget,calls=Object.values(budget?.calls||{}),used=calls.reduce((sum,c)=>sum+(c.actual_usd??c.reserved_usd),0);
  $('budget-info').textContent=budget?`Ciclo API: fino a $${used.toFixed(2)} / $${budget.limit_usd.toFixed(2)}`:'';
  $('budget-info').title='Stima prudente: include le riserve per chiamate senza risposta. Non e la fattura OpenAI.';
}
function allRows(){const d=model.data;switch(model.view){case'agent':return model.agentRows;case'saved':return d.jobs.filter(j=>j.saved);case'companies':return d.companies;case'documents':return d.documents.map(doc=>({id:'cv:'+doc.id,cv_id:doc.id,name:doc.folder,role:doc.group,kind:'document',cv_ready:doc.ready}));case'reviews':return [...d.companies.filter(c=>c.review),...d.jobs.filter(j=>j.complete)];default:return d.jobs;}}
function visibleRows(){const q=$('search').value.toLocaleLowerCase('it'),area=$('area').value,status=$('status').value;return allRows().filter(r=>{
  if(q&&!`${r.company||r.name} ${r.title||r.role} ${r.location||r.place} ${r.activity||''} ${r.description||''}`.toLocaleLowerCase('it').includes(q))return false;
  if(area&&!`${r.location||r.place||''} ${r.g||''}`.toLowerCase().includes(area))return false;
  const checked=!!model.checks.rows[r.id]?.checked;
  return !(status==='sent'&&!checked||status==='unsent'&&checked||status==='ready'&&!r.cv_ready||status==='complete'&&!r.complete||status==='incomplete'&&(r.complete||r.kind!=='job'));
});}
function render(){
  renderMetrics();$('view-title').textContent=labels[model.view];
  $('agent-panel').hidden=model.view!=='agent';
  $('view-subtitle').textContent=model.view==='companies'?'Target e candidature spontanee, non vacancy confermate':model.view==='documents'?'Word e PDF approvati, organizzati per destinazione':'Annunci archiviati: verifica l’apertura prima della candidatura';
  if(model.view==='agent')$('view-subtitle').textContent='Pacchetti conservati tramite Mi interessa: accesso privato e verifica prima dell\'invio';
  $('updated').textContent='Aggiornato '+new Date(model.data.updated_at).toLocaleDateString('it-IT');
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===model.view);b.setAttribute('aria-current',b.dataset.view===model.view?'page':'false');});
  const rows=visibleRows(),pages=Math.max(1,Math.ceil(rows.length/30));model.page=Math.min(model.page,pages-1);
  $('rows').replaceChildren();$('empty').hidden=rows.length!==0;$('results-status').textContent=rows.length+' risultati';
  for(const row of rows.slice(model.page*30,(model.page+1)*30)){
    const tr=node('tr');tr.dataset.id=row.id;tr.classList.toggle('sent',!!model.checks.rows[row.id]?.checked);
    const check=node('td',undefined,'check-cell');if(row.kind!=='document'){const input=node('input');input.type='checkbox';input.checked=!!model.checks.rows[row.id]?.checked;input.setAttribute('aria-label','Inviato a '+(row.company||row.name));input.addEventListener('change',()=>{setRow(row.id,{checked:input.checked});tr.classList.toggle('sent',input.checked);});check.append(input);}
    const main=node('td');main.append(node('div',row.company||row.name,'company'),node('div',row.title||row.role,'role'));
    if(row.kind==='job')main.append(node('div',row.saved?'Salvato LinkedIn':'Ricerca archiviata','subline'));
    const place=node('td',row.location||row.place||'—','location-cell');
    const files=node('td'),actions=node('div',undefined,'file-actions'),doc=getDoc(row);
    if(row.kind==='agent'){for(const kind of ['cv','posting','company'])if(row.files[kind])actions.append(button(row.files[kind].label,'download',()=>downloadAgent(row,kind)));}
    else if(doc){for(const fmt of ['pdf','docx'])if(doc.files[fmt])actions.append(button(fmt==='pdf'?'PDF':'Word',fmt==='pdf'?'file-text':'file-pen-line',()=>download(doc.files[fmt],doc.id,fmt),doc.ready?'ready':''));}
    else actions.append(node('span',row.complete?'CV da preparare':'CV non disponibile','muted'));
    files.append(actions);const progress=node('td');
    if(row.kind==='job')progress.append(node('span',statuses[row.review_status]||row.review_status,'badge '+(row.review_status==='ready'?'ready':row.review?'review':!row.complete?'warn':'')));
    else progress.append(node('span',row.kind==='agent'?(row.status==='needs_visual_review'?'Verifica visiva':'Da verificare'):row.cv_ready?'CV pronto':'Da verificare','badge '+(row.cv_ready?'ready':'warn')));
    const open=node('td',undefined,'open-cell');const b=button('','chevron-right',()=>showDetail(row),'icon');b.title='Apri dettagli';b.setAttribute('aria-label','Apri '+(row.company||row.name));open.append(b);
    tr.append(check,main,place,files,progress,open);$('rows').append(tr);
  }
  $('previous').disabled=model.page===0;$('next').disabled=model.page>=pages-1;$('page-count').textContent=`${model.page+1} / ${pages}`;icons();
}
function section(parent,title){const s=node('section',undefined,'detail-section');s.append(node('h3',title));parent.append(s);return s;}
function showDetail(row){
  $('detail-company').textContent=row.company||row.name;$('detail-title').textContent=row.title||row.role;$('detail-location').textContent=row.location||row.place||'';
  const root=$('detail-content');root.replaceChildren();const actions=node('div',undefined,'actions');
  if(row.kind==='agent'){
    if(row.link)actions.append(safeLink(row.link,'Annuncio originale'));
    for(const [kind,file]of Object.entries(row.files))actions.append(button(file.label,'download',()=>downloadAgent(row,kind)));
    root.append(actions,node('p',row.note,'notice'));
    section(root,'Stato della revisione').append(node('p',row.automated_checks_passed?'Controlli automatici superati. Resta necessaria la verifica dei contenuti e delle pagine.':'Controlli da completare: non considerare questo CV pronto per l\'invio.'),node('p',row.ai_reviewed?'Revisione AI eseguita.':'Revisione AI non confermata.'));
    $('detail').showModal();icons();return;
  }
  const url=row.link||row.url;if(url)actions.append(safeLink(url,row.kind==='job'?'Annuncio originale':'Sito / candidature'));
  const doc=getDoc(row);if(doc){for(const fmt of ['pdf','docx'])if(doc.files[fmt])actions.append(button(fmt==='pdf'?'CV PDF':'CV Word','download',()=>download(doc.files[fmt],doc.id,fmt),'ready'));if(doc.drive_url)actions.append(safeLink(doc.drive_url,'Cartella Drive'));}
  if(row.posting)actions.append(button(row.posting.complete===false?'Annuncio PDF (parziale)':'Job posting PDF','file-text',()=>download(row.posting,row.job_id,'posting')));
  if(row.company_website)actions.append(safeLink(row.company_website,'Sito aziendale'));
  else if(row.kind==='job')actions.append(node('span','Sito aziendale da verificare','muted'));
  if(row.kind==='job'&&row.complete&&model.local)actions.append(button('Revisiona CV','scan-text',()=>runReviews([row.job_id])));
  root.append(actions);
  if(row.draft&&model.local){const s=section(root,'Bozza da verificare');s.append(button('Controlla le due pagine','eye',()=>showPreview(row,s)));}
  if(row.kind==='job'){root.append(node('p','Copia archiviata del '+(row.captured_at?new Date(row.captured_at).toLocaleDateString('it-IT'):'periodo di raccolta')+'. Apertura attuale non verificata.','notice'));}
  else if(row.note)root.append(node('p',row.note,'notice'));
  if(row.review){
    const review=row.review;
    if(review.source_url)root.append(safeLink(review.source_url,'Fonte della review'));
    if(review.status)root.append(node('p',review.status,'notice'));
    if(review.verdict&&review.verdict!==row.note)root.append(node('p',review.verdict));
    if(row.review_scores)root.append(node('p',`Affinità documentata ${row.review_scores.candidate_fit}/10 · Qualità del testo ${row.review_scores.writing_quality}/10 · Valutazioni interne, non punteggi ATS universali`,'muted'));
    let s=section(root,'1. Keyword e gap');
    for(const k of review.keywords){s.append(node('h4',k.keyword+' · '+k.support),node('blockquote',k.posting_quote));if(k.cv_quote)s.append(node('p','CV: '+k.cv_quote));s.append(node('p',k.action));}
    s=section(root,'2. Riscritture delle esperienze');for(const [i,r]of review.rewrites.entries()){s.append(node('h4','R'+(i+1)),node('blockquote',r.original_quote),node('p',r.rewrite));if(r.missing_evidence_question)s.append(node('p','Da confermare: '+r.missing_evidence_question,'question'));}
    s=section(root,'3. Profilo professionale');s.append(node('p',review.summary.text));
    s=section(root,'4. Struttura e leggibilità');for(const r of review.structure){if(r.cv_quote)s.append(node('blockquote',r.cv_quote));s.append(node('p',r.issue+' '+r.action));}
    s=section(root,'Evidenze da integrare');for(const [i,q]of review.questions.entries())s.append(node('p',`${i+1}. ${q}`,'question'));
  }
  if(row.description){const s=section(root,row.complete?'Testo dell’annuncio':'Testo parziale disponibile');s.append(node('div',row.description,'posting'));}
  if(row.status&&row.kind==='company')section(root,'Stato del target').append(node('p',row.status));
  if(row.kind!=='document'){const s=section(root,'Note personali');const area=node('textarea');area.value=model.checks.rows[row.id]?.note||'';area.setAttribute('aria-label','Note personali');s.append(area);s.append(button('Salva note','save',()=>{setRow(row.id,{note:area.value});toast('Note salvate');}));}
  $('detail').showModal();icons();
}
async function showPreview(row,parent){
  parent.replaceChildren(node('h3','Controllo finale'));
  const checks=[],approveButton=button('Approva e salva su Drive','check',async()=>{
    approveButton.disabled=true;
    try{const result=await localAPI('approve',{job_id:row.job_id,docx_sha:row.draft.docx_sha,pdf_sha:row.draft.pdf_sha,reviewed_pages:[1,2]});toast(result.message);$('detail').close();model.data=await localAPI('catalog');render();}
    catch(e){toast(e.message);approveButton.disabled=false;}
  },'primary');approveButton.disabled=true;
  try{for(const page of [1,2]){
    const response=await fetch(`/api/preview?job_id=${encodeURIComponent(row.job_id)}&page=${page}&pdf_sha=${row.draft.pdf_sha}`,{headers:{'X-Desk-Client':'1'}});
    if(!response.ok)throw new Error('Anteprima cambiata o non disponibile. Aggiorna la dashboard.');
    const url=URL.createObjectURL(await response.blob()),img=node('img');img.src=url;img.alt='Anteprima CV pagina '+page;img.className='cv-preview';img.onload=()=>URL.revokeObjectURL(url);parent.append(img);
    const label=node('label',undefined,'review-confirmation'),check=node('input');check.type='checkbox';checks.push(check);label.append(check,document.createTextNode('Pagina '+page+' verificata: contenuti corretti e impaginazione leggibile'));parent.append(label);
    check.onchange=()=>{approveButton.disabled=checks.length!==2||!checks.every(c=>c.checked);};
  }parent.append(approveButton);icons();}catch(e){parent.append(node('p',e.message,'notice'));}
}
function saveBlob(value,name,type){const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function download(file,id,format){try{toast('Apertura documento…');let data;if(model.local){const r=await fetch(`/api/file?id=${encodeURIComponent(id)}&format=${format}`,{headers:{'X-Desk-Client':'1'}});if(!r.ok)throw new Error('Documento non disponibile');data=await r.arrayBuffer();}else data=await decrypt(await fetchJSON(file.encrypted_url));saveBlob(data,file.name,format==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/pdf');toast('Documento pronto');}catch(e){toast(e.message);}}
async function loadAgentCollection(value){
  const session=model.session;
  $('agent-message').textContent='Caricamento della raccolta privata...';
  try{const rows=await AgentSaved.load(value);if(session!==model.session||!model.data)return;model.agentRows=rows;$('agent-message').textContent=rows.length+' pacchetti conservati. Le spunte indicano candidature inviate, non interesse.';render();}
  catch(e){if(session===model.session&&model.data)$('agent-message').textContent=e.message;}
}
async function downloadAgent(row,kind){const session=model.session;try{const data=await AgentSaved.file(row,kind);if(session!==model.session||!model.data)return;saveBlob(data,row.files[kind].name,'application/octet-stream');toast('Documento scaricato: verifica la bozza prima dell\'invio.');}catch(e){if(session===model.session&&model.data)toast(e.message);}}
async function githubSync(){
  if(model.local&&!model.token){await localAPI('sync',{});$('sync-status').textContent='Sincronizzato con GitHub';return;}
  if(!model.token||!/^[-\w.]+\/[-\w.]+$/.test(model.config.repository))throw new Error('Inserisci un token limitato al repository della dashboard');
  const url=`https://api.github.com/repos/${model.config.repository}/contents/state.enc`;
  const headers={Authorization:'Bearer '+model.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  for(let attempt=0;attempt<3;attempt++){
    const current=await fetchJSON(url+'?ref='+encodeURIComponent(model.config.branch),{headers});
    const remote=JSON.parse(dec.decode(await decrypt(JSON.parse(dec.decode(unb64(current.content.replace(/\s/g,'')))))));
    model.checks=merge(remote,model.checks);const encrypted=await encrypt(model.checks);
    const r=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Update encrypted application state',branch:model.config.branch,sha:current.sha,content:b64(enc.encode(JSON.stringify(encrypted)))})});
    if(r.status===409)continue;if(!r.ok)throw new Error('Sincronizzazione GitHub non riuscita ('+r.status+')');
    localStorage.setItem(storageKey(),JSON.stringify(encrypted));render();$('sync-status').textContent='Sincronizzato con GitHub';return;
  }throw new Error('Conflitto di sincronizzazione: riprova');
}
async function runReviews(ids=[]){if(!model.local)return;const text=ids.length?'Avviare la revisione di questo annuncio?':'Avviare le revisioni mancanti di tutti gli annunci completi?';if(!confirm(text+' Il ciclo usa il budget autorizzato residuo, massimo 3 USD complessivi. Non invia candidature.'))return;try{const r=await localAPI('review',{ids});toast(r.message);}catch(e){toast(e.message);}}
$('unlock-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('login-error').textContent='';try{await unlock($('password').value);}catch{$('login-error').textContent='Accesso non riuscito. Controlla password e connessione.';model.key=null;}finally{b.disabled=false;}});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{model.view=b.dataset.view;model.page=0;render();if(model.view==='agent'&&AgentSaved.available())loadAgentCollection();}));
$('agent-connect').onclick=()=>{const value=$('agent-token').value.trim();$('agent-token').value='';loadAgentCollection(value||undefined);};
for(const id of ['search','area','status'])$(id).addEventListener(id==='search'?'input':'change',()=>{model.page=0;render();});
$('previous').onclick=()=>{model.page--;render();};$('next').onclick=()=>{model.page++;render();};
document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('settings').onclick=()=>{$('sync-dialog').showModal();};
$('sync-now').onclick=async()=>{model.token=$('github-token').value.trim();$('github-token').value='';try{await githubSync();$('sync-message').textContent='Spunte e note sincronizzate.';}catch(e){$('sync-message').textContent=e.message;}};
$('export-state').onclick=async()=>saveBlob(JSON.stringify(await encrypt(model.checks)),'Career_Desk_Spunte.enc','application/json');
$('import-state').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const incoming=JSON.parse(dec.decode(await decrypt(JSON.parse(await file.text()))));model.checks=merge(model.checks,incoming);await persist();render();toast('Spunte importate');}catch{toast('File non valido o cifrato con un’altra password');}e.target.value='';};
$('lock').onclick=()=>{model.session++;AgentSaved.lock();model.agentRows=[];$('agent-token').value='';$('agent-message').textContent='';$('count-agent').textContent='0';model.data=null;model.key=null;model.token='';model.checks={version:2,rows:{}};$('workspace').hidden=true;$('rows').replaceChildren();$('detail-content').replaceChildren();document.querySelectorAll('dialog').forEach(d=>d.close());$('login').hidden=false;};
$('refresh').onclick=async()=>{if(model.view==='agent'){await loadAgentCollection();return;}try{if(model.local)model.data=await localAPI('catalog');else{model.data=JSON.parse(dec.decode(await decrypt(await fetchJSON('catalog.enc'))));const shared=JSON.parse(dec.decode(await decrypt(await fetchJSON('state.enc'))));model.checks=merge(model.data.state,shared,model.checks);}render();toast('Dashboard aggiornata');}catch(e){toast(e.message);}};
$('run-all').onclick=()=>runReviews();$('publish').onclick=async()=>{try{toast('Pubblicazione in corso…');const result=await localAPI('publish',{});toast(result.message);}catch(e){toast(e.message);}};
(async()=>{icons();try{if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){const runtime=await localAPI('runtime');model.local=runtime.local;model.csrf=runtime.csrf;if(runtime.password){await unlock(runtime.password);return;}}}catch(e){console.warn('Local dashboard access failed:',e.name,e.message);$('login-error').textContent='Accesso locale non riuscito: '+e.message;}const params=new URLSearchParams(location.hash.slice(1));const password=params.get('key');if(password){history.replaceState(null,'',location.pathname+location.search);try{await unlock(password);}catch{$('login-error').textContent='Accesso automatico non riuscito.';}}})();
setInterval(refreshWorker,10000);
