'use strict';
const $ = id => document.getElementById(id);
const enc = new TextEncoder(), dec = new TextDecoder();
const AAD = enc.encode('career-desk-v1');
const model = {data:null,key:null,config:null,checks:{version:2,rows:{}},view:'saved',page:0,local:false,csrf:'',token:'',save:Promise.resolve(),agentRows:[],session:0,newsletter:{draft:null,revision:'',loaded:false,dirty:false}};
const labels = {notifications:'Notifiche candidature',connections:'Connessioni e configurazione',integrations:'Integrazioni',intelligence:'Job Intelligence','parma-research':'Parma · opportunità ottobre 2026',saved:'Salvati LinkedIn',agent:'Salvati da AI Job Agent',tracker:'Tracker candidature',newsletter:'Newsletter / Brief',jobs:'Tutti gli annunci',companies:'Aziende e recruiter',documents:'Libreria CV',reviews:'Revisioni ATS','linkedin-profile':'Profilo LinkedIn',impact:'Impatto CV'};
const stages = {planned:'Da valutare',interested:'Mi interessa',applied:'Inviata',interview:'Colloquio',offer:'Offerta',rejected:'Esito negativo',withdrawn:'Ritirata'};
const applicationStages = ['applied','interview','offer','rejected','withdrawn'];
const newsletterAreas = ['R&D','Project Management','Software Development','Chimica e laboratorio','Data Analysis e Data Engineering','AI e LLM','Qualita e Compliance','Altre opportunita'];
const newsletterNumbers = {max_jobs:[1,100],max_per_section:[1,50],min_score:[0,100]};
const newsletterToggles = ['include_bridge','show_summary','show_distance_summary','show_strengths','show_gaps'];
const statuses = {not_started:'Da analizzare',running:'Analisi in corso',awaiting_visual_review:'Verifica visiva',ready:'CV verificato',needs_correction:'Da correggere',needs_attention:'Da verificare',waiting_claude:'Claude in attesa (accesso o limite abbonamento)',waiting_local_ai:'AI locale in attesa',waiting_local_resources:'In attesa di memoria',resource_deferred:'In attesa di memoria',failed:'Da riprovare',interrupted:'Da riprendere',service_paused:'Claude da verificare',budget_paused:'Vecchio ciclo sospeso',incomplete_posting:'Testo incompleto'};
const unb64 = text => Uint8Array.from(atob(text), c=>c.charCodeAt(0));
function b64(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function icon(name){const n=document.createElement('i');n.dataset.lucide=name;n.setAttribute('aria-hidden','true');return n;}
function button(text,iconName,fn,cls=''){const n=node('button',undefined,cls);n.type='button';if(iconName)n.append(icon(iconName));if(text)n.append(document.createTextNode(text));n.addEventListener('click',fn);return n;}
function icons(){if(window.lucide&&document.querySelector('i[data-lucide]'))lucide.createIcons({attrs:{width:17,height:17}});}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function safeLink(url,text){try{if(new URL(url).protocol!=='https:')return node('span',text);}catch{return node('span',text);}const a=node('a',text,'button');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
async function fetchJSON(url,opts={}){const r=await fetch(url,{cache:'no-store',...opts});if(!r.ok){let body={};try{body=await r.json();}catch{}const error=new Error(body.message||body.error||'Richiesta non riuscita ('+r.status+')');error.status=r.status;throw error;}return r.json();}
async function derive(password){const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:unb64(model.config.salt),iterations:model.config.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function decrypt(value){return crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(value.iv),additionalData:AAD},model.key,unb64(value.data));}
async function encrypt(value){const iv=crypto.getRandomValues(new Uint8Array(12));const result=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD},model.key,enc.encode(JSON.stringify(value)));return{iv:b64(iv),data:b64(new Uint8Array(result))};}
function merge(...states){
  const out={version:2,rows:{}};
  for(const state of states)for(const [id,row]of Object.entries(state?.rows||{})){
    if(!row||typeof row.checked!=='boolean'||!Number.isFinite(Date.parse(row.updatedAt))||['__proto__','constructor','prototype'].includes(id))continue;
    const clean={checked:row.checked,updatedAt:row.updatedAt};
    for(const field of ['note','stage','deadline','submitted_on','follow_up','channel','cv_version','cv_sha256','outcome','matched_cv_id','matched_cv_sha256','cover_letter','cover_letter_language','cover_letter_cv_sha256','recruiter','interview_on'])if(Object.hasOwn(row,field))clean[field]=String(row[field]??'').slice(0,field==='cover_letter'?16000:field==='note'?8000:512);
    const previous=out.rows[id];
    // Older clients omit new fields; an explicit empty string still clears a field.
    out.rows[id]=!previous||Date.parse(clean.updatedAt)>=Date.parse(previous.updatedAt)?{...previous,...clean}:{...clean,...previous};
  }
  return out;
}
function applicationIdentity(row){
  if(row.kind==='company')return row.id;
  const link=row.link||row.url||'';
  try{const url=new URL(link),job=url.hostname.match(/(^|\.)linkedin\.com$/i)&&url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/);if(job)return 'job:'+job[1];if(!row.job_id)return url.origin+url.pathname.replace(/\/$/,'');}catch{}
  return row.job_id?'job:'+row.job_id:row.id;
}
let applicationCache=null;
function applicationRows(){
  if(applicationCache&&applicationCache.data===model.data&&applicationCache.agents===model.agentRows&&applicationCache.checks===model.checks)return applicationCache.rows;
  const grouped=new Map(),d=model.data;
  const catalogAgent=Array.isArray(d.agent)?d.agent:(d.agent?.jobs||[]);
  for(const row of [...d.jobs,...d.companies,...catalogAgent,...model.agentRows]){
    if(!row.id)continue;
    const identity=applicationIdentity(row),existing=grouped.get(identity);
    if(existing){if(!existing.state_ids.includes(row.id))existing.state_ids.push(row.id);if(!existing.sources.includes(row.kind))existing.sources.push(row.kind);}
    else grouped.set(identity,{...row,state_ids:[row.id],sources:[row.kind]});
  }
  const known=new Set([...grouped.values()].flatMap(r=>r.state_ids));
  for(const [id,state]of Object.entries(model.checks.rows))if(!known.has(id)&&!id.startsWith('impact:')&&!id.startsWith('cv:')&&(state.checked||applicationStages.includes(state.stage)||state.stage==='interested'||state.matched_cv_id))grouped.set('archived:'+id,{id,kind:'archived',name:'Record archiviato',role:id,state_ids:[id],sources:['archived']});
  const rows=[...grouped.values()],byId=new Map();
  for(const row of rows)for(const id of row.state_ids)byId.set(id,row);
  applicationCache={data:model.data,agents:model.agentRows,checks:model.checks,rows,byId,states:new Map()};
  return rows;
}
function applicationRecord(row){if(row.state_ids)return row;applicationRows();return applicationCache.byId.get(row.id)||row;}
function applicationState(row){
  applicationRows();const record=applicationRecord(row);
  if(applicationCache.states.has(record.id))return applicationCache.states.get(record.id);
  const states=(record.state_ids||[row.id]).map(id=>model.checks.rows[id]).filter(state=>state&&typeof state.checked==='boolean'&&Number.isFinite(Date.parse(state.updatedAt)));
  const state=merge(...states.map(state=>({rows:{[record.id]:state}}))).rows[record.id]||{};
  // A sent check is historical evidence, even if another source only has notes.
  if(states.length)state.checked=states.some(state=>state.checked);
  applicationCache.states.set(record.id,state);return state;
}
function applicationStage(row){const state=applicationState(row);return state.stage||(state.checked?'applied':'planned');}
function setApplicationRow(row,change){
  const record=applicationRecord(row),state={...applicationState(record),...change},updatedAt=new Date().toISOString();
  if(Object.hasOwn(change,'checked')&&!Object.hasOwn(change,'stage'))state.stage=change.checked?(applicationStages.includes(state.stage)?state.stage:'applied'):'planned';
  for(const id of record.state_ids||[])if(id!==record.id&&model.checks.rows[id])model.checks.rows[id]={...model.checks.rows[id],...state,updatedAt};
  setRow(record.id,state);if(model.view==='tracker')render();
}
const storageKey=()=> 'career-desk-state-'+model.config.salt;
async function localAPI(path,body){if(!model.local&&CareerCloud.connected)return CareerCloud.request(path,body);return fetchJSON('/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Desk-Client':'1','X-CSRF-Token':model.csrf},...(body?{body:JSON.stringify(body)}:{})});}
function catalogData(value){if(!value||!Array.isArray(value.jobs)||!Array.isArray(value.documents)||!Array.isArray(value.companies)||!value.audit||typeof value.audit!=='object')throw new Error('Catalogo incompleto: aggiorna la copia locale o riprova.');return value;}
async function readCatalog(){
  if(model.local)return catalogData(await localAPI('catalog'));
  const compressed=model.config.catalog?.compression==='gzip'&&typeof DecompressionStream!=='undefined';
  const bytes=await decrypt(await fetchJSON(compressed?model.config.catalog.url:'catalog.enc'));
  if(!compressed)return catalogData(JSON.parse(dec.decode(bytes)));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return catalogData(JSON.parse(await new Response(stream).text()));
}
async function unlock(password){
  model.config=await fetchJSON('config.json');model.key=await derive(password);
  model.data=await readCatalog();
  let local={},remote={};
  try{const stored=localStorage.getItem(storageKey());if(stored)local=JSON.parse(dec.decode(await decrypt(JSON.parse(stored))));}catch{toast('Le spunte locali non sono leggibili; conservate senza sovrascriverle.');}
  if(!model.local)try{remote=JSON.parse(dec.decode(await decrypt(await fetchJSON('state.enc'))));}catch{}
  model.checks=merge(model.data.state,remote,local);$('password').value='';
  $('login').hidden=true;$('workspace').hidden=false;
  $('run-all').hidden=!model.local;$('publish').hidden=!model.local;
  $('linkedin-login').hidden=!model.local;
  $('agent-mode').textContent=model.local?'Agenti locali collegati':'Agenti sul PC';
  $('agent-count').textContent=model.local?'Stato in aggiornamento':'Consultazione da web';
  populateAreas();render();await persist(false);
  document.dispatchEvent(new Event('career-ready'));
  if(['agent','tracker'].includes(model.view)&&AgentSaved.available())await loadAgentCollection();
  if(model.view==='newsletter'&&canConfigure())await loadNewsletterConfig();
  if(model.local)refreshWorker();
}
async function refreshWorker(){if(!model.local||!model.data||document.hidden||refreshWorker.pending)return;refreshWorker.pending=true;const session=model.session;try{const state=await localAPI('status');if(session!==model.session||!model.data)return;$('agent-count').textContent=state.running?'Ciclo di revisione in corso':'Nessun ciclo in esecuzione';model.running=state.running;renderSystem(state.system);if(model.revision!==undefined&&model.revision!==state.revision){model.revision=state.revision;const data=await readCatalog();if(session!==model.session||!model.data)return;model.data=data;model.checks=merge(model.data.state,model.checks);render();}model.revision=state.revision;}catch{$('agent-count').textContent='Connessione locale da verificare';}finally{refreshWorker.pending=false;}}
async function persist(sync=true){
  const snapshot=structuredClone(model.checks),version=dirtyVersion;
  model.save=model.save.catch(()=>{}).then(async()=>{
    localStorage.setItem(storageKey(),JSON.stringify(await encrypt(snapshot)));savedVersion=version;
    if(model.local)await localAPI('state',snapshot);
    $('sync-status').textContent=model.local?'Salvato sul PC':'Salvato sul dispositivo';
    if(sync&&model.token)await githubSync();
  }).catch(e=>{toast('Salvataggio da riprovare: '+e.message);$('sync-status').textContent='Salvataggio non riuscito';});
  return model.save;
}
let saveTimer,dirtyVersion=0,savedVersion=0;
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;persist();},200);$('sync-status').textContent='Salvataggio…';}
function setRow(id,change){dirtyVersion++;model.checks={...model.checks,rows:{...model.checks.rows,[id]:{checked:false,note:'',...model.checks.rows[id],...change,updatedAt:new Date().toISOString()}}};renderMetrics();scheduleSave();}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&model.key){clearTimeout(saveTimer);persist(false);}else if(model.local)refreshWorker();});
window.addEventListener('beforeunload',event=>{if(model.key&&dirtyVersion>savedVersion){clearTimeout(saveTimer);persist(false);event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{if(model.key){clearTimeout(saveTimer);persist(false);}});
function impactId(question){return 'impact:'+question.id;}
function renderImpact(){
  const questions=model.data.impact_questions||[],root=$('impact-questions');root.replaceChildren();
  const answered=questions.filter(q=>(model.checks.rows[impactId(q)]?.note||'').trim()).length;
  $('count-impact').textContent=`${answered}/${questions.length}`;
  $('impact-progress').textContent=`${answered} risposte su ${questions.length}`;
  let group='';
  for(const [index,q] of questions.entries()){
    if(q.group!==group){group=q.group;root.append(node('h2',group,'impact-group'));}
    const item=node('div',undefined,'impact-item'),label=node('label',`${index+1}. ${q.text}`),area=node('textarea');
    area.id='impact-'+q.id;label.htmlFor=area.id;area.value=model.checks.rows[impactId(q)]?.note||'';
    area.rows=3;area.maxLength=8000;area.placeholder='Risposta, dato iniziale e finale, periodo, fonte di verifica';
    const save=button('Salva risposta','save',()=>{setRow(impactId(q),{checked:false,note:area.value});renderImpactProgress();toast('Risposta salvata sul dispositivo');},'primary');
    item.append(label,area,save);root.append(item);
  }
  icons();
}
function renderImpactProgress(){const questions=model.data.impact_questions||[];const answered=questions.filter(q=>(model.checks.rows[impactId(q)]?.note||'').trim()).length;$('count-impact').textContent=`${answered}/${questions.length}`;$('impact-progress').textContent=`${answered} risposte su ${questions.length}`;}
function renderLinkedInProfile(){
  const root=$('linkedin-profile-panel'),review=model.data.linkedin_profile_review;root.replaceChildren();
  if(!review){root.append(node('p','Nessuna revisione del profilo LinkedIn disponibile.','linkedin-empty'));return;}
  const addSection=title=>{const s=node('section',undefined,'linkedin-section');s.append(node('h2',title));root.append(s);return s;};
  const fields=(parent,values)=>{
    const dl=node('dl',undefined,'linkedin-fields');
    for(const [label,text]of values)if(text!==undefined&&text!==null&&text!=='')dl.append(node('dt',label),node('dd',text));
    parent.append(dl);
  };
  const list=(title,values)=>{const s=addSection(title),ul=node('ul',undefined,'linkedin-list');for(const text of values||[])ul.append(node('li',text));s.append(ul);};
  const summary=addSection(review.title||'Revisione del profilo');
  summary.append(node('p',`Revisione ${review.reviewed_at||''} · Versione ${review.version}`,'muted'));
  if(review.profile_url){const link=safeLink(review.profile_url,review.profile_url);link.className='linkedin-link';summary.append(link);}
  fields(summary,[['Valutazione',review.verdict],['Posizionamento',review.positioning]]);
  list('Punti di forza',review.strengths);
  const findings=addSection('Criticita e priorita');
  for(const finding of review.findings||[]){
    const item=node('article',undefined,'linkedin-item'),heading=node('div',undefined,'linkedin-item-heading');
    const priority=node('span','Priorita '+finding.priority,'badge '+(finding.priority==='Alta'?'linkedin-high':'linkedin-medium'));
    heading.append(node('h3',finding.section),priority);item.append(heading);
    if(finding.quote)item.append(node('blockquote',finding.quote));
    fields(item,[['Diagnosi',finding.diagnosis],['Rischio',finding.risk],['Azione',finding.action],['Evidenza',finding.evidence]]);
    findings.append(item);
  }
  const rewrites=addSection('Riscritture');
  for(const rewrite of review.rewrites||[]){
    const item=node('article',undefined,'linkedin-item'),heading=node('div',undefined,'linkedin-item-heading');
    const text=node('p',rewrite.text,'linkedin-rewrite');if(rewrite.language)text.lang=rewrite.language;
    const copy=button('', 'copy',async()=>{
      copy.disabled=true;
      try{await navigator.clipboard.writeText(rewrite.text);toast('Testo copiato');}
      catch{toast('Copia non riuscita. Seleziona il testo e copialo manualmente.');}
      finally{copy.disabled=false;}
    },'icon');
    copy.title='Copia '+rewrite.label;copy.setAttribute('aria-label',copy.title);
    heading.append(node('h3',rewrite.label),copy);item.append(heading,node('p',rewrite.language||'','muted'),text);
    if(rewrite.note)item.append(node('p',rewrite.note,'linkedin-note'));rewrites.append(item);
  }
  const standout=addSection('Elementi distintivi');
  for(const entry of review.standout||[]){
    const item=node('article',undefined,'linkedin-item');item.append(node('h3',entry.title));
    fields(item,[['Problema',entry.problem],['Prova',entry.proof],['Deliverable',entry.deliverable],['Salvaguardia',entry.safeguard]]);standout.append(item);
  }
  const plan=addSection('Piano di intervento'),progress=node('p',undefined,'muted'),planRows=review.plan||[];
  progress.setAttribute('aria-live','polite');plan.append(progress);
  const updateProgress=()=>{progress.textContent=`${planRows.filter(step=>model.checks.rows['impact:linkedin:'+step.id]?.checked).length} di ${planRows.length} interventi completati`;};
  for(const step of planRows){
    const item=node('div',undefined,'linkedin-plan-item'),label=node('label',undefined,'check-label'),check=node('input'),body=node('div');
    check.type='checkbox';check.checked=!!model.checks.rows['impact:linkedin:'+step.id]?.checked;
    check.onchange=()=>{setRow('impact:linkedin:'+step.id,{checked:check.checked});updateProgress();};
    label.append(check,node('span',step.title));body.append(label,node('p',step.phase||'','muted'),node('p',step.detail));item.append(body);plan.append(item);
  }
  updateProgress();list('Domande aperte',review.questions);
  list('Copertura della revisione',review.coverage);
  const sources=addSection('Fonti'),sourceList=node('ul',undefined,'linkedin-list');
  for(const source of review.sources||[]){
    const item=node('li'),link=safeLink(source.url,source.title);link.className='linkedin-link';
    item.append(link,node('p',source.url,'muted'));sourceList.append(item);
  }
  sources.append(sourceList);icons();
}
function renderParmaResearch(){
  const root=$('parma-research-panel'),research=model.data.parma_research;root.replaceChildren();
  if(!research){root.append(node('p','Ricerca Parma non disponibile in questo snapshot.'));return;}
  root.append(node('p',research.summary,'notice'));
  root.append(node('p','Verifica: '+research.researched_at+' · '+research.scope+' · Riapri l’annuncio prima di candidarti.','muted'));
  const addList=(parent,title,items)=>{if(!items?.length)return;const details=node('details');details.append(node('summary',title));const list=node('ul');for(const item of items)list.append(node('li',item));details.append(list);parent.append(details);};
  root.append(node('h2','Opportunità prioritarie'));
  for(const row of research.opportunities||[]){
    const card=section(root,row.company+' — '+row.title);card.dataset.researchId=row.id;
    card.append(node('p',row.priority_label+' · '+row.fit_label),node('p',row.location+' · '+row.contract));
    card.append(node('span',row.verification_status,'badge ready'),node('p',row.verification_evidence,'muted'));
    if(row.conditions)card.append(node('p',row.conditions));
    addList(card,'Perché è in linea',row.profile_evidence);addList(card,'Requisiti richiesti',row.required);addList(card,'Preferenze dell’annuncio',row.preferred);addList(card,'Gap e punti da chiarire',row.gaps);
    card.append(safeLink(row.official_url,'Apri annuncio ufficiale'));
  }
  root.append(node('h2','Altre aziende: opportunità meno aderenti o da monitorare'));
  for(const company of research.companies||[]){
    const card=section(root,company.name);card.dataset.researchId=company.id;
    card.append(node('p',company.location,'muted'),node('p',company.finding));
    addList(card,'Posizioni esaminate e limiti',company.roles_considered);
    for(const source of company.sources||[])card.append(safeLink(source.url,source.label));
  }
  icons();
}
let documentCache=null;
function getDoc(row){const documents=model.data.documents;if(documentCache?.source!==documents)documentCache={source:documents,byId:new Map(documents.map(d=>[d.id,d]))};const selected=row.kind==='document'?row.cv_id:applicationState(row).matched_cv_id||row.cv_id;return documentCache.byId.get(selected);}
function populateAreas(){const select=$('area'),current=select.value;select.replaceChildren(node('option','Tutte le aree'));select.firstChild.value='';for(const area of ['Parma','Reggio','Modena','Bologna','Milano','Piacenza','Monza','Remoto']){const o=node('option',area);o.value=area.toLowerCase();select.append(o);}select.value=current;}
function renderMetrics(){
  const d=model.data,a=d.audit;
  $('count-saved').textContent=a.saved_jobs;$('count-jobs').textContent=a.all_jobs;$('count-companies').textContent=a.companies;$('count-documents').textContent=a.cvs;
  $('count-agent').textContent=model.agentRows.length;
  const applications=applicationRows();$('count-tracker').textContent=applications.filter(r=>tracked(r)).length;
  const reviewed=[...d.jobs,...d.companies].filter(j=>j.review).length;$('count-reviews').textContent=reviewed;
  $('metric-total').textContent=a.complete_jobs;$('metric-cvs').textContent=d.documents.filter(x=>x.ready).length;
  $('metric-sent').textContent=applications.filter(r=>applicationState(r).checked).length;$('metric-review').textContent=reviewed;
  const questions=d.impact_questions||[];$('count-impact').textContent=`${questions.filter(q=>(model.checks.rows[impactId(q)]?.note||'').trim()).length}/${questions.length}`;
  const metricLabels=document.querySelectorAll('.metrics>div>span:last-child');
  const metricText=model.view==='agent'?['pacchetti conservati','CV da verificare','candidature inviate','revisioni AI eseguite']:['annunci completi','CV verificati','candidature inviate','revisioni analizzate'];
  metricLabels.forEach((label,i)=>label.textContent=metricText[i]);
  if(model.view==='agent'){
    $('metric-total').textContent=model.agentRows.length;
    $('metric-cvs').textContent=model.agentRows.filter(r=>!r.cv_ready).length;
    $('metric-sent').textContent=model.agentRows.filter(r=>applicationState(r).checked).length;
    $('metric-review').textContent=model.agentRows.filter(r=>r.ai_reviewed).length;
  }
  $('budget-info').textContent='Claude · abbonamento, nessuna API a consumo';
  renderSystem(d.system);
  $('budget-info').title='Claude Code sul PC con il token dell’abbonamento; chiavi API escluse';
}
function allRows(){const d=model.data;switch(model.view){case'tracker':return applicationRows().filter(r=>tracked(r));case'agent':return model.agentRows;case'saved':return d.jobs.filter(j=>j.saved);case'companies':return d.companies;case'documents':return d.documents.map(doc=>({id:'cv:'+doc.id,cv_id:doc.id,name:doc.folder,role:doc.group,kind:'document',cv_ready:doc.ready}));case'reviews':return [...d.companies.filter(c=>c.review),...d.jobs.filter(j=>j.complete)];default:return d.jobs;}}
const fitLabels={apply_now:'Candidatura diretta',bridge:'Ruolo affine con gap',insufficient_information:'Da verificare',not_aligned:'Non allineato'};
function alignmentScore(row){const selected=applicationState(row).matched_cv_id;if(selected&&typeof CareerMatching!=='undefined'&&model.data?.documents){const doc=getDoc(row);if(doc)return CareerMatching.evaluate(row,doc).score;}const score=row.fit?.score;return typeof score==='number'&&Number.isFinite(score)&&score>=0&&score<=100?score:null;}
function compareRows(a,b,order){
  const missingLast=(x,y,direction=1)=>x===null?(y===null?0:1):y===null?-1:direction*(x-y);
  const distance=row=>row.location_verification==='verified'&&Number.isFinite(row.distance_from_parma_km)&&row.distance_from_parma_km>=0?row.distance_from_parma_km:null;
  const observed=row=>{const time=Date.parse(row.first_seen_at||row.first_seen||row.captured_at||row.posted_at||'');return Number.isFinite(time)?time:null;};
  let result=0;
  if(order==='score-desc'||order==='score-asc')result=missingLast(alignmentScore(a),alignmentScore(b),order==='score-desc'?-1:1);
  else if(order==='date-desc')result=missingLast(observed(a),observed(b),-1);
  else if(order==='distance-asc')result=missingLast(distance(a),distance(b));
  else if(order==='company')result=String(a.company||a.name||'').localeCompare(String(b.company||b.name||''),'it');
  else if(order==='role')result=String(a.title||a.role||'').localeCompare(String(b.title||b.role||''),'it');
  return result||String(a.id||'').localeCompare(String(b.id||''),'it');
}
function alignmentTier(row){return applicationState(row).matched_cv_id?'cv_comparison':row.fit?.application_tier;}
function visibleRows(){const q=$('search').value.toLocaleLowerCase('it'),area=$('area').value,status=$('status').value,distance=$('distance').value,minScore=$('fit-min').value,tier=$('fit-tier').value;return allRows().filter(r=>{
  const score=alignmentScore(r);
  if(!integrationFilter(r))return false;
  if(minScore!==''&&(score===null||score<Number(minScore)))return false;
  if(tier&&(tier==='unscored'?score!==null:alignmentTier(r)!==tier))return false;
  if(distance){const km=r.distance_from_parma_km,verified=r.location_verification==='verified'&&Number.isFinite(km);if(distance==='unknown'?verified:!verified||km>Number(distance))return false;}
  const state=applicationState(r);
  if(q&&!`${r.company||r.name} ${r.title||r.role} ${r.location||r.place} ${r.activity||''} ${r.description||''} ${model.view==='tracker'?[state.channel,state.cv_version,state.note,state.outcome].join(' '):''}`.toLocaleLowerCase('it').includes(q))return false;
  if(area&&!`${r.location||r.place||''} ${r.g||''}`.toLowerCase().includes(area))return false;
  const checked=!!state.checked;
  if(model.view==='tracker'){const stage=$('tracker-stage').value;return !stage||(stage==='sent'?checked:stage==='due'?isFollowUpDue(r):applicationStage(r)===stage);}
  return !(status==='sent'&&!checked||status==='unsent'&&checked||status==='ready'&&!(state.matched_cv_id?getDoc(r)?.ready:r.cv_ready)||status==='complete'&&!r.complete||status==='incomplete'&&(r.complete||r.kind!=='job'));
}).sort((a,b)=>compareRows(a,b,$('sort-order').value));}
function render(){
  CareerApplicationMail.apply(model.data.application_mail);renderExplorerFilters();
  renderMetrics();$('view-title').textContent=labels[model.view];
  $('agent-panel').hidden=model.view!=='agent';
  const extra=['connections','integrations','intelligence','notifications'].includes(model.view);$('notifications-panel').hidden=model.view!=='notifications';$('connections-panel').hidden=model.view!=='connections';$('integrations-panel').hidden=model.view!=='integrations';$('intelligence-panel').hidden=model.view!=='intelligence';
  const parma=model.view==='parma-research',impact=model.view==='impact',newsletter=model.view==='newsletter',tracker=model.view==='tracker',linkedin=model.view==='linkedin-profile';$('parma-research-panel').hidden=!parma;$('impact-panel').hidden=!impact;$('newsletter-panel').hidden=!newsletter;$('linkedin-profile-panel').hidden=!linkedin;
  for(const selector of ['.metrics','.toolbar','.search','.filter-drawer','.table-wrap','.pagination','#results-status','#empty'])document.querySelector(selector).hidden=parma||impact||newsletter||linkedin||extra;
  document.querySelector('.metrics').hidden=parma||impact||newsletter||linkedin||extra||tracker;
  $('status').hidden=tracker;$('tracker-stage').hidden=!tracker;
  document.querySelector('table').classList.toggle('tracker-table',tracker);
  const headings=document.querySelectorAll('thead th');headings[2].textContent=tracker?'Stato': 'Sede';headings[3].textContent=tracker?'Invio / Follow-up':'Documenti';headings[4].textContent=tracker?'Canale / CV / Esito':'Revisione';
  $('view-subtitle').textContent=model.view==='companies'?'Target e candidature spontanee, non vacancy confermate':model.view==='documents'?'CV disponibili e revisioni in corso':'Annunci archiviati: verifica l’apertura prima della candidatura';
  if(model.view==='agent')$('view-subtitle').textContent='Pacchetti conservati tramite Mi interessa: accesso privato e verifica prima dell\'invio';
  if(impact)$('view-subtitle').textContent='Dati verificabili per riscrivere i CV con risultati concreti';
  if(tracker)$('view-subtitle').textContent='Candidature aggiornate dalle email selezionate e dalle tue modifiche. Nessun invio dalla dashboard.';
  if(newsletter)$('view-subtitle').textContent=canConfigure()?'Configurazione del prossimo ciclo; nessuna email inviata al salvataggio.':'Newsletter in sola lettura. Collega GitHub in Connessioni per modificarla.';
  if(linkedin)$('view-subtitle').textContent='';
  if(parma)$('view-subtitle').textContent='Nove aziende, priorità motivate e stato verificato al 14 ottobre 2026.';
  $('updated').textContent='Aggiornato '+new Date(model.data.updated_at).toLocaleDateString('it-IT');
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===model.view);b.setAttribute('aria-current',b.dataset.view===model.view?'page':'false');});
  renderTrackerSummary(tracker);
  if(extra){$('view-subtitle').textContent='';if(model.view==='notifications')CareerApplicationMail.render();else if(model.view==='connections')renderConnections();else if(model.view==='integrations')renderIntegrations();else renderJobIntelligence();return;}
  if(parma){renderParmaResearch();return;}
  if(impact){renderImpact();return;}
  if(newsletter){renderNewsletter();return;}
  if(linkedin){renderLinkedInProfile();return;}
  const rows=visibleRows(),pages=Math.max(1,Math.ceil(rows.length/30));model.page=Math.min(model.page,pages-1);
  const fragment=document.createDocumentFragment();$('rows').replaceChildren();$('empty').hidden=rows.length!==0;$('results-status').textContent=rows.length+' risultati';
  for(const row of rows.slice(model.page*30,(model.page+1)*30)){
    const state=applicationState(row),tr=node('tr');tr.dataset.id=row.id;tr.classList.toggle('sent',!!state.checked);
    const check=node('td',undefined,'check-cell');if(row.kind!=='document'){const input=node('input');input.type='checkbox';input.checked=!!state.checked;input.setAttribute('aria-label','Candidatura già inviata a '+(row.company||row.name));input.addEventListener('change',()=>{setApplicationRow(row,{checked:input.checked});if(!tracker)render();});check.append(input);}
    const main=node('td');main.append(node('div',row.company||row.name,'company'),node('div',row.title||row.role,'role'));
    if(row.kind==='job'||row.fit){
      const score=alignmentScore(row),summary=node('div',undefined,'alignment-summary');
      const badge=node('span',score===null?'Allineamento n.d.':state.matched_cv_id?`CV selezionato ${score}/100`:`Allineamento ${score}/100`,'badge alignment-score');
      badge.title='Affinità delle competenze documentate con l’annuncio; non probabilità di assunzione.';
      summary.append(badge);
      if(state.matched_cv_id)summary.append(node('span','Confronto del CV associato','subline'));else if(row.fit?.application_tier)summary.append(node('span',fitLabels[row.fit.application_tier]||'Da verificare','subline'));
      main.append(summary);if(state.matched_cv_id)main.append(node('div','CV associato: '+(getDoc(row)?.folder||'non disponibile'),'subline'));
    }
    if(row.kind==='job'){
      main.append(node('div',row.saved?'Salvato LinkedIn':'Ricerca archiviata','subline'));
      const observed=row.first_seen_at||row.captured_at;
      if(row.saved&&observed)main.append(node('div','Rilevato il '+new Date(observed).toLocaleDateString('it-IT'),'subline'));
    }
    const place=node('td',row.location||row.place||'—','location-cell');
    const files=node('td'),actions=node('div',undefined,'file-actions'),doc=getDoc(row);
    if(tracker){
      main.append(node('div',row.location||row.place||'Sede non registrata','subline'),node('div',row.sources.map(source=>({job:'Annuncio',company:'Azienda / recruiter',agent:'AI Job Agent',archived:'Non presente nel catalogo'}[source]||source)).join(' · '),'subline'));
      place.replaceChildren(stageSelect(row));
      for(const [field,label]of [['submitted_on','Invio'],['follow_up','Follow-up']])files.append(node('div',label+': '+(state[field]?new Date(state[field]+'T00:00:00').toLocaleDateString('it-IT'):'non registrato'),'subline'));
      const info=node('td');info.append(node('div',state.channel||'Canale non registrato','role'),node('div',state.cv_version||'Versione CV non registrata','subline'));
      if(state.cv_sha256){const hash=node('div','SHA256 '+state.cv_sha256.slice(0,12),'subline');hash.title=state.cv_sha256;info.append(hash);}
      if(state.outcome)info.append(node('div',state.outcome,'tracker-outcome'));
      if(state.note)info.append(node('div','Note presenti','subline'));
      const open=node('td',undefined,'open-cell'),edit=button('','pencil',()=>showDetail(row),'icon');edit.title='Modifica candidatura';edit.setAttribute('aria-label','Modifica candidatura '+(row.company||row.name));open.append(edit);
      tr.append(check,main,place,files,info,open);fragment.append(tr);continue;
    }
    if(row.kind==='agent'){for(const kind of ['cv','posting','company'])if(row.files[kind])actions.append(button(row.files[kind].label,'download',()=>downloadAgent(row,kind)));}
    else if(doc){if(doc.pending_revision)actions.append(node('span','Revisione da verificare','muted'));for(const fmt of ['pdf','docx'])if(doc.files[fmt])actions.append(button(fmt==='pdf'?'PDF':'Word',fmt==='pdf'?'file-text':'file-pen-line',()=>download(doc.files[fmt],doc.id,fmt),doc.ready?'ready':''));}
    else actions.append(node('span',row.complete?'CV da preparare':'CV non disponibile','muted'));
    files.append(actions);const progress=node('td');
    if(row.kind==='job')progress.append(node('span',statuses[row.review_status]||row.review_status,'badge '+(row.review_status==='ready'?'ready':row.review?'review':!row.complete?'warn':'')));
    else progress.append(node('span',row.kind==='agent'?(row.status==='needs_visual_review'?'Verifica visiva':'Da verificare'):row.cv_ready?'CV pronto':'Da verificare','badge '+(row.cv_ready?'ready':'warn')));
    const open=node('td',undefined,'open-cell');const b=button('','chevron-right',()=>showDetail(row),'icon');b.title='Apri dettagli';b.setAttribute('aria-label','Apri '+(row.company||row.name));open.append(b);
    tr.append(check,main,place,files,progress,open);fragment.append(tr);
  }
  $('rows').append(fragment);
  $('previous').disabled=model.page===0;$('next').disabled=model.page>=pages-1;$('page-count').textContent=`${model.page+1} / ${pages}`;icons();
}
function section(parent,title){const s=node('section',undefined,'detail-section');s.append(node('h3',title));parent.append(s);return s;}
function renderSystem(system){
  const el=$('system-health');if(!el)return;
  const q=system?.queue?.counts||{},sync=system?.linkedin||{};
  const date=system?.updated_at?new Date(system.updated_at).toLocaleString('it-IT'):'non disponibile';
  el.textContent=`In coda: ${q.queued||0} · Da verificare: ${q.needs_attention||0} · LinkedIn: ${sync.status||'non verificato'} · Ultimo stato PC: ${date}`;
}
function stageSelect(row){
  const select=node('select');select.setAttribute('aria-label','Fase candidatura '+(row.company||row.name));
  for(const [value,text]of Object.entries(stages)){const option=node('option',text);option.value=value;select.append(option);}
  select.value=applicationStage(row);
  select.onchange=()=>setApplicationRow(row,{stage:select.value,...(['applied','interview','offer','rejected'].includes(select.value)?{checked:true}:{})});
  return select;
}
function applicationFields(parent,row,doc){
  const state=applicationState(row),s=section(parent,'Candidatura'),grid=node('div',undefined,'application-fields');
  const checkLabel=node('label',undefined,'check-label'),check=node('input');check.type='checkbox';check.checked=!!state.checked;check.onchange=()=>{setApplicationRow(row,{checked:check.checked});select.value=applicationStage(row);if(model.view!=='tracker')render();};checkLabel.append(check,document.createTextNode('Candidatura già inviata'));s.append(checkLabel);
  const label=node('label','Fase'),select=stageSelect(row);select.addEventListener('change',()=>{check.checked=!!applicationState(row).checked;});label.append(select);grid.append(label);
  for(const [key,text]of [['recruiter','Recruiter'],['interview_on','Data colloquio'],['submitted_on','Data invio'],['deadline','Scadenza'],['follow_up','Follow-up'],['channel','Canale'],['cv_version','Versione CV'],['cv_sha256','Hash CV (SHA256)'],['outcome','Esito']]){
    const l=node('label',text),input=node('input'),date=['submitted_on','deadline','follow_up','interview_on'].includes(key);input.type=date?'date':'text';input.value=state[key]||'';input.setAttribute('aria-label',text);input.maxLength=key==='cv_sha256'?64:512;
    if(key==='cv_sha256')input.pattern='[a-fA-F0-9]{64}';
    input.addEventListener(date||key==='cv_sha256'?'change':'input',()=>{if(!input.checkValidity()){input.reportValidity();return;}setApplicationRow(row,{[key]:key==='cv_sha256'?input.value.toLowerCase():input.value});if(key==='submitted_on')unknown.hidden=!!input.value;});
    l.append(input);grid.append(l);
  }
  s.append(grid);const unknown=node('p','Data invio non registrata: sconosciuta.','muted');unknown.hidden=!!state.submitted_on;s.append(unknown);
  if(doc?.files?.pdf?.sha256)s.append(button('Registra questo CV','file-check',()=>{setApplicationRow(row,{cv_sha256:doc.files.pdf.sha256,cv_version:doc.files.pdf.name||doc.folder||''});grid.querySelector('input[aria-label="Versione CV"]').value=applicationState(row).cv_version;grid.querySelector('input[aria-label="Hash CV (SHA256)"]').value=applicationState(row).cv_sha256;}));
  const notes=node('label','Note personali','application-notes'),area=node('textarea');area.value=state.note||'';area.maxLength=8000;area.rows=4;area.setAttribute('aria-label','Note personali');area.oninput=()=>setApplicationRow(row,{note:area.value});notes.append(area);s.append(notes);
}
function tracked(row){const state=applicationState(row);return !!(state.checked||applicationStages.includes(state.stage)||state.stage==='interested'||state.matched_cv_id);}
function todayISO(){const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
function isFollowUpDue(row){const state=applicationState(row);return !!(state.follow_up&&state.follow_up<=todayISO()&&!['rejected','withdrawn','offer'].includes(applicationStage(row)));}
function renderTrackerSummary(visible){
  let root=$('tracker-summary');if(!root){root=node('section',undefined,'tracker-summary');root.id='tracker-summary';root.setAttribute('aria-label','Avanzamento candidature');document.querySelector('.search').before(root);}root.hidden=!visible;if(!visible)return;
  root.replaceChildren();const rows=applicationRows().filter(tracked),counts=new Map();for(const row of rows){const stage=applicationStage(row);counts.set(stage,(counts.get(stage)||0)+1);}
  for(const [value,label]of [['','Tutte'],['interested','Da preparare'],['applied','Inviate'],['interview','Colloqui'],['offer','Offerte'],['due','Follow-up']]){const count=value==='due'?rows.filter(isFollowUpDue).length:value?counts.get(value)||0:rows.length;const b=button('',null,()=>{$('tracker-stage').value=value;model.page=0;render();},'tracker-stat');b.append(node('strong',String(count)),node('span',label));b.setAttribute('aria-pressed',String($('tracker-stage').value===value));root.append(b);}
}
function renderWorkbench(parent,row){
  const s=section(parent,'Prepara la candidatura');s.classList.add('application-workbench');
  if(typeof CareerMatching==='undefined'){s.append(node('p','Motore di confronto non disponibile. Aggiorna la pagina.','notice'));return;}
  const state=applicationState(row),documents=model.data.documents,ranked=CareerMatching.rank(row,documents);
  const controls=node('div',undefined,'match-controls'),label=node('label','CV da associare'),select=node('select');select.setAttribute('aria-label','CV da associare');
  const none=node('option','Scegli un CV dalla libreria');none.value='';select.append(none);
  for(const {document:cv,evaluation}of ranked){const option=node('option',`${cv.folder} · ${evaluation.score===null?'n.d.':evaluation.score+'/100'}${cv.ready?' · verificato':' · da verificare'}`);option.value=cv.id;select.append(option);}
  select.value=state.matched_cv_id||'';label.append(select);controls.append(label);
  const best=ranked.find(item=>item.evaluation.score!==null&&item.document.ready);
  const recommend=button('Associa il migliore verificato','sparkles',()=>associate(best.document.id));recommend.disabled=!best;controls.append(recommend);s.append(controls);
  const content=node('div');s.append(content);
  function associate(id){const cv=documents.find(doc=>doc.id===id);setApplicationRow(row,{matched_cv_id:id,matched_cv_sha256:cv?.files?.pdf?.sha256||cv?.files?.docx?.sha256||'',...(applicationStage(row)==='planned'?{stage:'interested'}:{})});select.value=id;render();draw();const stage=parent.querySelector('select[aria-label^="Fase candidatura"]');if(stage)stage.value=applicationStage(row);}
  select.onchange=()=>associate(select.value);
  function draw(){
    content.replaceChildren();const current=applicationState(row),cv=documents.find(doc=>doc.id===current.matched_cv_id);
    if(!cv){content.append(node('p',current.matched_cv_id?'Il CV associato non è più nella libreria. Scegli una versione disponibile.':'Associa un CV per ricalcolare il confronto e preparare la lettera.','muted'));return;}
    const evaluation=CareerMatching.evaluate(row,cv),hash=cv.files?.pdf?.sha256||cv.files?.docx?.sha256||'';
    const summary=node('div',undefined,'match-summary');summary.append(node('strong',evaluation.score===null?'Confronto non disponibile':evaluation.score+'/100'),node('p',evaluation.score===null?({ 'Posting is incomplete':'Annuncio incompleto: integra il testo prima del confronto.', 'CV evidence is unavailable':'Testo del CV non disponibile.', 'No supported requirement could be identified':'Nessun requisito riconosciuto dal confronto locale.', 'Posting lists example skills only':'Sono stati riconosciuti solo esempi, senza requisiti da valutare.' }[evaluation.reason]||evaluation.reason):'Copertura delle competenze riconosciute nel testo dell’annuncio da parte di questo CV.'));
    content.append(summary,node('p','Euristica locale basata sul testo: non è un punteggio ATS né una probabilità di colloquio.','muted'));
    if(!cv.ready)content.append(node('p','Questo CV richiede ancora verifica prima dell’invio.','notice'));
    if(current.matched_cv_sha256&&hash!==current.matched_cv_sha256)content.append(node('p','La versione del CV è cambiata dopo l’associazione: ricontrolla lettera e documento.','notice'));
    const downloads=node('div',undefined,'actions');for(const fmt of ['pdf','docx'])if(cv.files?.[fmt])downloads.append(button('Apri CV '+(fmt==='pdf'?'PDF':'Word'),'download',()=>download(cv.files[fmt],cv.id,fmt)));content.append(downloads);
    const details=node('details',undefined,'match-evidence');details.append(node('summary',`Evidenze e gap · ${evaluation.matched.length} coperti · ${evaluation.partial.length} parziali · ${evaluation.missing.length} non documentati`));
    for(const [items,title]of [[evaluation.matched,'Coperto'],[evaluation.partial,'Parziale / formazione'],[evaluation.missing,'Non documentato'],[evaluation.optional||[],'Esempio: escluso dal punteggio']])for(const item of items){const article=node('article');article.append(node('h4',title+': '+item.requirement),node('p',({mandatory:'Obbligatorio nel testo',mentioned:'Competenza o attività citata: verifica il livello richiesto',preferred:'Preferenziale',optional:'Esempio non vincolante'}[item.bucket]||'Requisito da verificare'),'muted'));for(const quote of item.evidence||[])article.append(node('blockquote',quote.text),node('p',`${cv.cv_evidence?.source?.name||cv.folder} · paragrafo ${quote.paragraph}`,'muted'));details.append(article);}content.append(details);
    const letter=section(content,'Lettera di presentazione'),langLabel=node('label','Lingua'),lang=node('select');lang.setAttribute('aria-label','Lingua della lettera');for(const [value,text]of [['en','English']]){const option=node('option',text);option.value=value;lang.append(option);}lang.value='en';langLabel.append(lang);letter.append(langLabel);
    const area=node('textarea',undefined,'letter-editor');area.rows=15;area.maxLength=16000;area.setAttribute('aria-label','Testo della lettera di presentazione');area.value=current.cover_letter||'';area.placeholder='Genera una bozza dalle evidenze del CV selezionato e rivedila prima di usarla.';
    const status=node('p','','muted');status.setAttribute('role','status');
    if(current.cover_letter&&current.cover_letter_cv_sha256!==hash)status.textContent='La lettera salvata si riferisce a un’altra versione del CV. Ricontrollala o rigenerala.';
    const generate=button(current.cover_letter?'Rigenera bozza':'Genera bozza','file-pen-line',()=>{if(area.value.trim()){confirmReplace.hidden=false;return;}generateDraft();},'primary');generate.disabled=evaluation.score===null;
    function generateDraft(){const draft=CareerMatching.coverLetter(row,cv,lang.value);if(draft.status!=='ready'&&draft.status!=='draft'){status.textContent=draft.reason||'Evidenze insufficienti per una lettera affidabile.';return;}area.value=draft.text;setApplicationRow(row,{cover_letter:area.value,cover_letter_language:lang.value,cover_letter_cv_sha256:hash});status.textContent='Bozza salvata. Rivedi contenuti, motivazione e destinatario prima dell’invio.';confirmReplace.hidden=true;}
    area.oninput=()=>{setApplicationRow(row,{cover_letter:area.value,cover_letter_language:lang.value,cover_letter_cv_sha256:hash});status.textContent='Salvataggio automatico in corso…';};
    const actions=node('div',undefined,'actions');actions.append(generate,button('Salva lettera','save',async()=>{clearTimeout(saveTimer);await persist();status.textContent=$('sync-status').textContent;}),button('Copia testo','copy',async()=>{try{await navigator.clipboard.writeText(area.value);toast('Lettera copiata');}catch{area.focus();area.select();toast('Seleziona e copia il testo.');}}),button('Scarica testo','download',()=>saveBlob(area.value,`Lettera_${String(row.company||'candidatura').replace(/[^\p{L}\p{N}_-]/gu,'_')}.txt`,'text/plain;charset=utf-8')));
    const confirmReplace=node('div',undefined,'notice');confirmReplace.hidden=true;confirmReplace.append(node('p','Rigenerare sostituirà il testo modificato.'),button('Sostituisci la bozza',null,generateDraft),button('Mantieni il testo',null,()=>confirmReplace.hidden=true));
    letter.append(actions,confirmReplace,area,status);
  }
  draw();
}
function renderFit(parent,fit){
  if(!fit||typeof fit!=='object')return;
  const s=section(parent,'Affinità documentata /100'),heading=node('div',undefined,'fit-heading');
  const score=Number.isFinite(fit.score)&&fit.score>=0&&fit.score<=100?fit.score+'/100':'Non disponibile';
  const tiers={apply_now:'Candidatura diretta',bridge:'Ruolo ponte',insufficient_information:'Informazioni insufficienti',not_aligned:'Non allineato'},tier=node('span',tiers[fit.application_tier]||'Tier non disponibile','badge');tier.title=fit.application_tier||'';
  heading.append(node('strong',score,'fit-score'),tier);s.append(heading,node('p','Valutazione delle evidenze, non probabilità di successo.','muted'));
  if(fit.rationale)s.append(node('p',Array.isArray(fit.rationale)?fit.rationale.join('\n'):fit.rationale));
  if(Array.isArray(fit.unknown_mandatory)&&fit.unknown_mandatory.length)s.append(node('p','Requisiti obbligatori da verificare: '+fit.unknown_mandatory.join('; '),'notice'));
  else if(!Array.isArray(fit.unknown_mandatory)&&fit.unknown_mandatory)s.append(node('p','Requisiti obbligatori da verificare: '+fit.unknown_mandatory,'notice'));
  const rows=Array.isArray(fit.rows)?fit.rows:[],details=node('details',undefined,'fit-requirements');details.append(node('summary','Requisiti e fonti ('+rows.length+')'));
  const list=node('ul',undefined,'fit-list'),supports={direct:'Documentato',transferable:'Trasferibile',training:'Formazione',learning:'In apprendimento',missing:'Non documentato',unresolved:'Da verificare',matched:'Documentato',supported:'Documentato',unsupported:'Non documentato',partial:'Parziale',unknown:'Da verificare'},buckets={mandatory:'Obbligatorio',responsibility:'Mansione',optional:'Preferenziale',preferred:'Preferenziale'};
  for(const row of rows){
    if(!row||typeof row!=='object')continue;
    const item=node('li'),head=node('div',undefined,'fit-heading');head.append(node('strong',row.requirement||'Requisito'),node('span',buckets[row.bucket]||row.bucket||'Tipo non specificato','badge'),node('span',supports[row.support]||row.support||'Da verificare','badge '+(['direct','matched','supported'].includes(row.support)?'ready':'warn')));item.append(head);
    if(row.posting_quote)item.append(node('blockquote',row.posting_quote));
    if(row.reason)item.append(node('p',row.reason));
    const quotes=Array.isArray(row.evidence_quotes)?row.evidence_quotes.filter(q=>q&&typeof q.text==='string'&&q.text.trim()):[];
    if(quotes.length)for(const quote of quotes)item.append(node('p','Evidenza'+(quote.id?' '+quote.id:'')+(quote.source?' · Fonte: '+quote.source:''),'muted'),node('blockquote',quote.text));
    else item.append(node('p','Evidenze: '+(Array.isArray(row.evidence_ids)&&row.evidence_ids.length?row.evidence_ids.join(', '):'nessuna fonte indicata'),'muted'));
    list.append(item);
  }
  details.append(list);s.append(details);
}
function validateNewsletter(config){
  if(!config||config.version!==1||!['area_then_distance','distance_then_area'].includes(config.grouping))throw new Error('Configurazione newsletter non valida (versione 1 richiesta).');
  if(!Array.isArray(config.sections)||config.sections.length!==newsletterAreas.length||new Set(config.sections.map(s=>s?.id)).size!==newsletterAreas.length||config.sections.some(s=>!s||!newsletterAreas.includes(s.id)||typeof s.label!=='string'||!s.label.trim()||s.label.length>80||typeof s.enabled!=='boolean'))throw new Error('Le sezioni devono contenere tutte le aree, una sola volta, con un nome da 1 a 80 caratteri.');
  for(const [key,[min,max]]of Object.entries(newsletterNumbers))if(!Number.isInteger(config[key])||config[key]<min||config[key]>max)throw new Error(key+': valore richiesto tra '+min+' e '+max+'.');
  for(const key of newsletterToggles)if(typeof config[key]!=='boolean')throw new Error('Opzione non valida: '+key);
}
function newsletterResponse(result){
  const config=structuredClone(result?.config);if(config&&config.include_bridge===undefined)config.include_bridge=false;validateNewsletter(config);
  if(typeof result.revision!=='string'||!result.revision)throw new Error('Revisione newsletter mancante. Nessun salvataggio confermato.');
  return {config,revision:result.revision};
}
function newsletterStatus(){
  const n=model.newsletter;
  $('newsletter-mode').textContent=model.local?'PC locale: le modifiche salvate valgono dal prossimo ciclo.':canConfigure()?'GitHub Actions: modifica la newsletter da telefono; il PC può restare spento. L’anteprima è disponibile nella versione locale.':'Newsletter in sola lettura. Collega GitHub in Connessioni per modificarla da web o telefono.';
  $('newsletter-status').textContent=n.loading?'Lettura configurazione...':n.saving?'Salvataggio configurazione...':n.message||(n.dirty?'Modifiche non salvate':n.draft?'Configurazione '+(model.local?'letta dal PC':canConfigure()?'letta da GitHub':'esportata'):'Nessuna configurazione esportata disponibile.');
  $('newsletter-error').textContent=n.error||'';
  $('newsletter-fields').disabled=!canConfigure()||!n.loaded||n.loading||n.saving;
  $('newsletter-save').hidden=!canConfigure();$('newsletter-reload').hidden=!canConfigure();
  $('newsletter-save').disabled=!canConfigure()||!n.loaded||!n.dirty||n.loading||n.saving||n.previewLoading||n.conflict;
  $('newsletter-reload').disabled=n.loading||n.saving||n.previewLoading;
  $('newsletter-preview').hidden=!model.local;$('newsletter-preview').disabled=!!n.previewLoading||!!n.saving||!!n.loading;
}
function markNewsletterDirty(){const n=model.newsletter;n.dirty=true;n.message='Modifiche non salvate';n.githubSync='';if(!$('newsletter-preview-frame').hidden)$('newsletter-preview-status').textContent='Configurazione salvata; modifiche non salvate escluse. Nessun invio.';newsletterStatus();}
function renderNewsletter(fill=false){
  const n=model.newsletter;
  if(!n.draft&&model.data.newsletter){try{const saved=newsletterResponse(model.data.newsletter);n.draft=structuredClone(saved.config);n.revision=saved.revision;fill=true;}catch(e){n.error=e.message;}}
  $('newsletter-form').hidden=!n.draft&&!canConfigure();$('newsletter-fields').hidden=!n.draft;
  if(n.draft&&(fill||!$('newsletter-sections').childElementCount)){
    const root=$('newsletter-sections');root.replaceChildren();
    for(const [index,section]of n.draft.sections.entries()){
      const item=node('div',undefined,'newsletter-section'),check=node('input'),name=node('input'),order=node('div',undefined,'section-order');
      check.type='checkbox';check.checked=section.enabled;check.id='newsletter-section-enabled-'+index;check.setAttribute('aria-label','Abilita sezione '+section.id);check.onchange=()=>{section.enabled=check.checked;markNewsletterDirty();};
      const enabled=node('label',undefined,'section-enabled');enabled.htmlFor=check.id;enabled.append(check,node('span',section.id));
      name.type='text';name.value=section.label;name.required=true;name.minLength=1;name.maxLength=80;name.setAttribute('aria-label','Nome sezione '+section.id);name.oninput=()=>{section.label=name.value;markNewsletterDirty();};
      for(const [offset,symbol,title]of [[-1,'arrow-up','Sposta su'],[1,'arrow-down','Sposta giù']]){
        const move=button('',symbol,()=>{const next=index+offset;[n.draft.sections[index],n.draft.sections[next]]=[n.draft.sections[next],n.draft.sections[index]];markNewsletterDirty();renderNewsletter(true);const target=$('newsletter-sections').children[next].querySelector('button[data-direction="'+offset+'"]');(target.disabled?$('newsletter-sections').children[next].querySelector('input[type=text]'):target).focus();},'icon');
        move.title=title;move.setAttribute('aria-label',title+' '+section.id);move.dataset.direction=offset;move.disabled=index+offset<0||index+offset>=n.draft.sections.length;order.append(move);
      }
      item.append(enabled,name,order);root.append(item);
    }
    $('newsletter-grouping').value=n.draft.grouping;
    for(const key of Object.keys(newsletterNumbers))$('newsletter-'+key).value=n.draft[key];
    for(const key of newsletterToggles)$('newsletter-'+key).checked=n.draft[key];
    icons();
  }
  newsletterStatus();
}
async function loadNewsletterConfig(){
  if(!canConfigure()||model.newsletter.loading||model.newsletter.saving||model.newsletter.previewLoading)return;
  const n=model.newsletter,session=model.session;n.loading=true;n.error='';newsletterStatus();
  try{
    const result=await localAPI('newsletter-config');if(session!==model.session||!model.data)return;
    const saved=newsletterResponse(result);n.confirmOverwrite=!!n.dirty&&(n.confirmOverwrite||n.revision!==saved.revision);
    if(!n.dirty)n.draft=structuredClone(saved.config);
    n.revision=saved.revision;n.loaded=true;n.conflict=false;model.data.newsletter=saved;
    n.message=n.dirty?'Configurazione riletta; modifiche non salvate conservate.':model.local?'Configurazione letta dal PC.':'Configurazione letta da GitHub.';
    renderNewsletter(true);
  }catch(e){if(session===model.session)n.error=e.message;}
  finally{if(session===model.session){n.loading=false;newsletterStatus();}}
}
async function saveNewsletter(event){
  event.preventDefault();const n=model.newsletter;
  if(!canConfigure()||!n.loaded||!n.dirty||n.saving||n.loading||n.previewLoading||n.conflict||!$('newsletter-form').reportValidity())return;
  try{validateNewsletter(n.draft);}catch(e){n.error=e.message;newsletterStatus();return;}
  if(n.confirmOverwrite&&!confirm('La configurazione condivisa è cambiata. Sostituirla con le tue modifiche conservate?'))return;
  const session=model.session,config=structuredClone(n.draft),expected_revision=n.revision;n.saving=true;n.error='';newsletterStatus();
  try{
    const result=await localAPI('newsletter-config',{config,expected_revision});if(session!==model.session||!model.data)return;
    const saved=newsletterResponse(result);n.draft=structuredClone(saved.config);n.revision=saved.revision;n.dirty=false;n.conflict=false;n.confirmOverwrite=false;n.githubSync=result.github_sync;model.data.newsletter=saved;
    const sync=result.github_sync==='updated'?'GitHub aggiornato.':result.github_sync==='pending'?(model.local?'Salvato sul PC; sincronizzazione GitHub in attesa.':'Aggiornamento GitHub in attesa.'):model.local?'Stato sincronizzazione GitHub non confermato.':'';
    n.message=(result.message||(model.local?'Configurazione salvata sul PC.':'Configurazione salvata su GitHub.'))+' '+sync;
    $('newsletter-preview-frame').hidden=true;$('newsletter-preview-frame').removeAttribute('srcdoc');$('newsletter-preview-status').textContent='';renderNewsletter(true);
  }catch(e){if(session===model.session){n.conflict=[409,412].includes(e.status);n.error=n.conflict?'Conflitto di revisione: '+e.message+' Le modifiche non salvate sono conservate. Rileggi la configurazione prima di salvare.':e.message;}}
  finally{if(session===model.session){n.saving=false;newsletterStatus();}}
}
async function previewNewsletter(){
  if(!model.local||model.newsletter.previewLoading||model.newsletter.saving||model.newsletter.loading)return;
  const n=model.newsletter,session=model.session;n.previewLoading=true;newsletterStatus();$('newsletter-preview-status').textContent='Caricamento anteprima salvata...';
  try{
    const response=await fetch('/api/newsletter-preview',{cache:'no-store',headers:{'X-Desk-Client':'1'}});
    if(!response.ok)throw new Error('Anteprima non disponibile ('+response.status+')');
    const html=await response.text();if(session!==model.session||!model.data)return;
    $('newsletter-preview-frame').srcdoc=html;$('newsletter-preview-frame').hidden=false;
    $('newsletter-preview-status').textContent=n.dirty?'Configurazione salvata; modifiche non salvate escluse. Nessun invio.':'Configurazione salvata. Nessun invio.';
  }catch(e){if(session===model.session)$('newsletter-preview-status').textContent=e.message;}
  finally{if(session===model.session){n.previewLoading=false;newsletterStatus();}}
}
function showDetail(row){
  $('detail-company').textContent=row.company||row.name;$('detail-title').textContent=row.title||row.role;$('detail-location').textContent=row.location||row.place||'';
  const root=$('detail-content');root.replaceChildren();const actions=node('div',undefined,'actions');
  if(row.kind==='agent'){
    if(row.link)actions.append(safeLink(row.link,'Annuncio originale'));
    for(const [kind,file]of Object.entries(row.files))actions.append(button(file.label,'download',()=>downloadAgent(row,kind)));
    root.append(actions,node('p',row.note,'notice'));
    section(root,'Stato della revisione').append(node('p',row.automated_checks_passed?'Controlli automatici superati. Resta necessaria la verifica dei contenuti e delle pagine.':'Controlli da completare: non considerare questo CV pronto per l\'invio.'),node('p',row.ai_reviewed?'Revisione AI eseguita.':'Revisione AI non confermata.'));
    applicationFields(root,row,getDoc(row));
    $('detail').showModal();icons();return;
  }
  const url=row.link||row.url;if(url)actions.append(safeLink(url,row.kind==='job'?'Annuncio originale':'Sito / candidature'));
  const doc=getDoc(row);if(doc){for(const fmt of ['pdf','docx'])if(doc.files[fmt])actions.append(button(fmt==='pdf'?'CV PDF':'CV Word','download',()=>download(doc.files[fmt],doc.id,fmt),'ready'));if(doc.drive_url)actions.append(safeLink(doc.drive_url,'Cartella Drive'));}
  if(row.posting)actions.append(button(row.posting.complete===false?'Annuncio PDF (parziale)':'Job posting PDF','file-text',()=>download(row.posting,row.job_id,'posting')));
  if(row.company_website)actions.append(safeLink(row.company_website,'Sito aziendale'));
  else if(row.kind==='job')actions.append(node('span','Sito aziendale da verificare','muted'));
  if(row.kind==='job'&&row.complete&&model.local)actions.append(button('Revisiona CV','scan-text',()=>runReviews([row.job_id])));
  if(row.kind==='job'&&row.complete&&!model.local)actions.append(button(row.cv_ready?'CV pronto':'Prepara CV','scan-text',async()=>{if(row.cv_ready)return;try{await AgentSaved.queueCV(row.job_id);toast('Richiesta inviata al worker del PC.');}catch(e){toast(e.message);}},row.cv_ready?'ready':''));
  root.append(actions);
  if(model.view==='tracker'&&row.kind!=='document')applicationFields(root,row,doc);
  if(row.draft&&model.local){const s=section(root,'Bozza da verificare');s.append(button('Controlla le due pagine','eye',()=>showPreview(row,s)));}
  if(row.kind==='job'){renderJobSourceDetails(root,row);renderWorkbench(root,row);}
  if(!applicationState(row).matched_cv_id){if(row.kind==='job')renderFit(root,row.fit);}
  else if(row.kind==='job'){const historical=node('details');historical.append(node('summary','Analisi generale archiviata del profilo'));renderFit(historical,row.fit);root.append(historical);}
  if(row.kind==='job'){
    const observed=row.first_seen_at||row.captured_at;
    const date=observed?new Date(observed).toLocaleString('it-IT',{dateStyle:'long',timeStyle:'short'}):'non disponibile';
    const note=row.saved?'Prima rilevazione nei tuoi annunci salvati: '+date+'. LinkedIn non fornisce la data originale del salvataggio.':'Annuncio acquisito il '+date+'.';
    root.append(node('p',note+' Apertura attuale non verificata.','notice'));
  }
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
  if(row.kind!=='document'&&model.view!=='tracker')applicationFields(root,row,doc);
  if(!$('detail').open)$('detail').showModal();icons();
}
async function showPreview(row,parent){
  parent.replaceChildren(node('h3','Controllo finale'));
  const checks=[],approveButton=button('Approva e salva su Drive','check',async()=>{
    approveButton.disabled=true;
    try{const result=await localAPI('approve',{job_id:row.job_id,docx_sha:row.draft.docx_sha,pdf_sha:row.draft.pdf_sha,reviewed_pages:[1,2]});toast(result.message);$('detail').close();model.data=await readCatalog();render();}
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
async function runReviews(ids=[]){if(!model.local)return;const text=ids.length?'Accodare la revisione di questo annuncio?':'Accodare le revisioni mancanti di tutti gli annunci completi?';if(!confirm(text+' Claude con il tuo abbonamento (consuma i limiti del piano), nessuna API a consumo. Pubblicazione su Drive solo dopo tutti i controlli. Non invia candidature.'))return;try{const r=await localAPI('review',{ids});toast(r.message);}catch(e){toast(e.message);}}
$('unlock-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('login-error').textContent='';try{await unlock($('password').value);}catch{$('login-error').textContent='Accesso non riuscito. Controlla password e connessione.';model.key=null;}finally{b.disabled=false;}});
function viewFromHash(){const view=location.hash.slice(1);return view==='agent-saved'?'agent':Object.hasOwn(labels,view)?view:null;}
function closeNavigation(){if(window.matchMedia('(max-width:760px)').matches){$('career-navigation').classList.remove('nav-open');$('navigation-toggle').setAttribute('aria-expanded','false');$('navigation-toggle').setAttribute('aria-label','Apri menu');}}
$('navigation-toggle').onclick=()=>{const open=$('career-navigation').classList.toggle('nav-open');$('navigation-toggle').setAttribute('aria-expanded',String(open));$('navigation-toggle').setAttribute('aria-label',open?'Chiudi menu':'Apri menu');};
function selectView(view){if(!Object.hasOwn(labels,view))return;closeNavigation();model.view=view;model.page=0;if(!model.data)return;render();if(['agent','tracker'].includes(model.view)&&AgentSaved.available())loadAgentCollection();if(model.view==='newsletter'&&canConfigure()&&!model.newsletter.loaded)loadNewsletterConfig();}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{history.replaceState(null,'',location.pathname+location.search+'#'+b.dataset.view);selectView(b.dataset.view);}));
window.addEventListener('hashchange',()=>selectView(viewFromHash()));
$('agent-connect').onclick=()=>{const value=$('agent-token').value.trim();$('agent-token').value='';loadAgentCollection(value||undefined);};
let filterTimer;
for(const id of ['search','area','status','distance','tracker-stage','fit-min','fit-tier','sort-order'])$(id).addEventListener(['search','fit-min'].includes(id)?'input':'change',()=>{model.page=0;clearTimeout(filterTimer);if(['search','fit-min'].includes(id))filterTimer=setTimeout(render,120);else render();});
{const option=node('option','Confronto CV associato');option.value='cv_comparison';$('fit-tier').append(option);}
{const option=node('option','Follow-up da fare');option.value='due';$('tracker-stage').append(option);}
for(const [value,text]of Object.entries(stages)){const option=node('option',text);option.value=value;$('tracker-stage').append(option);}
$('newsletter-grouping').onchange=e=>{model.newsletter.draft.grouping=e.target.value;markNewsletterDirty();};
for(const key of Object.keys(newsletterNumbers))$('newsletter-'+key).oninput=e=>{model.newsletter.draft[key]=e.target.value===''?null:Number(e.target.value);markNewsletterDirty();};
for(const key of newsletterToggles)$('newsletter-'+key).onchange=e=>{model.newsletter.draft[key]=e.target.checked;markNewsletterDirty();};
$('newsletter-form').onsubmit=saveNewsletter;$('newsletter-reload').onclick=loadNewsletterConfig;$('newsletter-preview').onclick=previewNewsletter;
$('previous').onclick=()=>{model.page--;render();};$('next').onclick=()=>{model.page++;render();};
document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('settings').onclick=()=>{$('sync-dialog').showModal();};
$('sync-now').onclick=async()=>{model.token=$('github-token').value.trim();$('github-token').value='';try{await githubSync();$('sync-message').textContent='Candidature, CV associati e lettere sincronizzati.';}catch(e){$('sync-message').textContent=e.message;}};
$('export-state').onclick=async()=>saveBlob(JSON.stringify(await encrypt(model.checks)),'Career_Desk_Candidature.enc','application/json');
$('import-state').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const incoming=JSON.parse(dec.decode(await decrypt(JSON.parse(await file.text()))));model.checks=merge(model.checks,incoming);await persist();render();toast('Spunte importate');}catch{toast('File non valido o cifrato con un’altra password');}e.target.value='';};
$('lock').onclick=async()=>{CareerApplicationMail.lock();CareerCloud.lock();for(const input of document.querySelectorAll('#connections-panel input'))input.value='';$('connections-panel').replaceChildren();clearTimeout(saveTimer);await persist(false);await model.save;applicationCache=null;documentCache=null;model.session++;AgentSaved.lock();model.agentRows=[];$('agent-token').value='';$('agent-message').textContent='';$('count-agent').textContent='0';model.data=null;model.key=null;model.token='';model.checks={version:2,rows:{}};model.newsletter={draft:null,revision:'',loaded:false,dirty:false};$('newsletter-form').reset();$('newsletter-sections').replaceChildren();$('newsletter-preview-frame').removeAttribute('srcdoc');$('newsletter-preview-frame').hidden=true;$('workspace').hidden=true;$('rows').replaceChildren();$('detail-content').replaceChildren();$('linkedin-profile-panel').replaceChildren();$('parma-research-panel').replaceChildren();$('integrations-panel').replaceChildren();$('intelligence-panel').replaceChildren();$('connections-panel').replaceChildren();connectionsData=null;connectionsDirty=false;document.querySelectorAll('dialog').forEach(d=>d.close());$('login').hidden=false;};
$('refresh').onclick=async()=>{if(model.view==='notifications'&&canConfigure()){await CareerApplicationMail.refresh();return;}if(model.view==='connections'&&canConfigure()){await loadConnections(true);return;}if(model.view==='integrations'&&!model.local&&CareerCloud.connected){try{await refreshIntegrationData();toast('Configurazione aggiornata');}catch(e){toast(e.message);}return;}if(model.view==='newsletter'&&canConfigure()){await loadNewsletterConfig();return;}if(model.view==='agent'){await loadAgentCollection();return;}try{if(model.local){model.data=await readCatalog();model.checks=merge(model.data.state,model.checks);}else{model.config=await fetchJSON('config.json');model.data=await readCatalog();const shared=JSON.parse(dec.decode(await decrypt(await fetchJSON('state.enc'))));model.checks=merge(model.data.state,shared,model.checks);model.newsletter={draft:null,revision:'',loaded:false,dirty:false};$('newsletter-sections').replaceChildren();if(CareerCloud.connected)connectionsData=await CareerCloud.load();}render();toast('Dashboard aggiornata');}catch(e){toast(e.message);}};
$('run-all').onclick=()=>runReviews();$('publish').onclick=async()=>{try{toast('Pubblicazione in corso…');const result=await localAPI('publish',{});toast(result.message);}catch(e){toast(e.message);}};
$('linkedin-login').onclick=async()=>{try{const result=await localAPI('linkedin-login',{});toast(result.message);}catch(e){toast(e.message);}};
(async()=>{model.view=viewFromHash()||model.view;icons();try{if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){const runtime=await localAPI('runtime');model.local=runtime.local;model.csrf=runtime.csrf;if(runtime.password){await unlock(runtime.password);return;}}}catch(e){console.warn('Local dashboard access failed:',e.name,e.message);$('login-error').textContent='Accesso locale non riuscito: '+e.message;}const params=new URLSearchParams(location.hash.slice(1));const password=params.get('key');if(password){history.replaceState(null,'',location.pathname+location.search);try{await unlock(password);}catch{$('login-error').textContent='Accesso automatico non riuscito.';}}})();
setInterval(refreshWorker,10000);
