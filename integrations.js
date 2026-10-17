'use strict';
const integrationStates={disabled:'Disattivata',active:'Collegata',degraded:'Da verificare',manual_ready:'Import pronto',api_unconfigured:'Da configurare'};
function jobSources(row){return [...new Set((row.source_references||[]).map(ref=>ref.platform).filter(Boolean).concat(row.source?[row.source]:[]))];}
function renderExplorerFilters(){
  const selected=$('job-source').value,select=$('job-source');select.replaceChildren(new Option('Tutte le fonti',''));
  for(const source of [...new Set(model.data.jobs.flatMap(jobSources))].sort())select.add(new Option(source,source));select.value=selected;
  const profiles=$('career-profile'),chosen=profiles.value,choices=new Map([...profiles.options].filter(o=>o.value).map(o=>[o.value,o.text]));
  for(const profile of model.data.integrations?.config?.profiles||[])choices.set(profile.id,profile.label);
  for(const job of model.data.jobs)for(const profile of job.profile_matches?.profiles||[])choices.set(profile.id,profile.label);
  profiles.replaceChildren(new Option('Tutti i profili',''));for(const [id,label]of choices)profiles.add(new Option(label,id));profiles.value=chosen;
  const saved=$('saved-search');saved.replaceChildren(new Option('Ricerche salvate',''));
  for(const [id,row]of Object.entries(model.checks.rows))if(id.startsWith('search:'))try{const search=JSON.parse(row.note);if(search.name)saved.add(new Option(search.name,id));}catch{}
}
function integrationFilter(row){
  if($('job-source').value&&!jobSources(row).includes($('job-source').value))return false;
  if($('job-lifecycle').value&&(row.registry_lifecycle_status||row.lifecycle_status||row.job_status)!==$('job-lifecycle').value)return false;
  const profile=$('career-profile').value;if(profile){const result=row.profile_matches?.profiles?.find(p=>p.id===profile);if(!result||result.score<Number($('fit-min').value||1))return false;}
  return true;
}
function integrationField(parent,label,value,type='text'){
  const wrapper=node('label',label),input=node('input');input.type=type;if(type==='checkbox')input.checked=!!value;else input.value=value??'';input.setAttribute('aria-label',label);wrapper.append(input);parent.append(wrapper);return input;
}
async function refreshIntegrationData(){const session=model.session;const data=await readCatalog();if(session!==model.session||!model.data)return;model.data=data;render();}
function renderIntegrations(){
  const root=$('integrations-panel');root.replaceChildren();const snapshot=model.data.integrations;
  root.append(node('p',model.local?'Configura le fonti e importa gli alert ricevuti. La sincronizzazione automatica usa solo API pubbliche abilitate.':'Stato esportato dal PC. Configurazione, import e sincronizzazione manuale sono disponibili dal programma sul PC.','notice'));
  if(!snapshot){root.append(node('p','Aggiorna il catalogo dal PC per visualizzare le integrazioni.'));return;}
  const draft=structuredClone(snapshot.config),message=node('p');message.setAttribute('role','status');root.append(message);
  const form=node('form'),grid=node('div',undefined,'integration-grid');form.append(grid);
  for(const connector of snapshot.connectors){
    const config=draft.connectors.find(c=>c.id===connector.id),card=node('article',undefined,'detail-section');card.append(node('h2',connector.label));
    card.append(node('p',integrationStates[connector.status]||connector.status),node('p','Ultimo successo: '+(connector.last_success_at?new Date(connector.last_success_at).toLocaleString('it-IT'):'mai')));
    if(connector.last_error)card.append(node('p',connector.last_error,'form-error'));
    if(connector.evidence_url)card.append(safeLink(connector.evidence_url,'Info della fonte'));
    if(model.local){
      const fields=node('fieldset');fields.append(node('legend','Configurazione '+connector.label));
      const enabled=integrationField(fields,'Abilita '+connector.label,config.enabled,'checkbox');enabled.onchange=()=>config.enabled=enabled.checked;
      const modeLabel=node('label','Modalità'),mode=node('select');for(const [id,label]of [['manual','Import manuale'],['email','Alert email ricevuti'],...(['greenhouse','lever'].includes(connector.platform)?[['api','API pubblica del datore']]:[])])mode.add(new Option(label,id));mode.value=config.mode;mode.onchange=()=>config.mode=mode.value;modeLabel.append(mode);fields.append(modeLabel);
      if(['greenhouse','lever'].includes(connector.platform)){
        for(const [key,label]of [['board','Board del datore'],['company','Nome del datore']]){const input=integrationField(fields,label,config[key]);input.oninput=()=>config[key]=input.value.trim();}
        if(connector.platform==='lever'){const regionLabel=node('label','Regione dati'),region=node('select');region.add(new Option('Globale','global'));region.add(new Option('Europa','eu'));region.value=config.region;region.onchange=()=>config.region=region.value;regionLabel.append(region);fields.append(regionLabel);}
      }
      const frequency=integrationField(fields,'Intervallo minimo (ore)',config.frequency_hours,'number');frequency.min='1';frequency.max='720';frequency.onchange=()=>config.frequency_hours=Number(frequency.value);
      const raw=integrationField(fields,'Conserva anche i dati originali dell’annuncio',config.retain_raw,'checkbox');raw.onchange=()=>config.retain_raw=raw.checked;card.append(fields);
      if(config.mode==='api'){
        const sync=button('Sincronizza ora','refresh-cw',async()=>{sync.disabled=true;message.textContent='Sincronizzazione in corso…';try{const result=await localAPI('job-sync',{connector_id:connector.id});message.textContent=result.runs.some(r=>r.status==='degraded')?'Fonte non disponibile: dati precedenti conservati.':'Sincronizzazione completata.';await refreshIntegrationData();}catch(e){message.textContent=e.message;}finally{sync.disabled=false;}});sync.disabled=!config.enabled;card.append(sync);
      }
    }grid.append(card);
  }
  root.append(form);
  if(model.local){
    const legacy=node('fieldset');legacy.append(node('legend','Fonti dello scouting già presente'));draft.legacy_sources=draft.legacy_sources||{};
    for(const [key,label]of [['linkedin','Ricerca LinkedIn esistente'],['adzuna','Adzuna (credenziali esistenti)'],['chiesi','Chiesi Careers'],['smartrecruiters','SmartRecruiters'],['randstad','Ricerca Randstad esistente']]){const input=integrationField(legacy,label,draft.legacy_sources[key]!==false,'checkbox');input.onchange=()=>draft.legacy_sources[key]=input.checked;}form.prepend(legacy);
    form.prepend(node('p','Le schede configurano import e nuove API. I controlli seguenti governano i collector già presenti; disabilitarli interrompe nuove ricerche e conserva il catalogo.'));
    const retention=integrationField(form,'Conservazione annunci chiusi (giorni)',draft.retention_days,'number');retention.min='7';retention.max='730';retention.onchange=()=>draft.retention_days=Number(retention.value);
    draft.priority_alerts=draft.priority_alerts||{enabled:false,min_score:85,max_jobs:5};
    const alerts=integrationField(form,'Abilita email aggiuntive per nuove offerte ad alta priorità',draft.priority_alerts.enabled,'checkbox');alerts.onchange=()=>draft.priority_alerts.enabled=alerts.checked;
    const threshold=integrationField(form,'Soglia alert /100',draft.priority_alerts.min_score,'number');threshold.min='0';threshold.max='100';threshold.onchange=()=>draft.priority_alerts.min_score=Number(threshold.value);
    const advanced=node('details'),profileLabel=node('label','Preferenze dei quattro profili (JSON)'),profiles=node('textarea');profiles.rows=8;profiles.value=JSON.stringify(draft.profiles,null,2);profiles.setAttribute('aria-label','Preferenze dei profili');profileLabel.append(profiles);advanced.append(node('summary','Preferenze avanzate di carriera'),node('p','Una lista vuota usa i quattro profili predefiniti. Le preferenze non aggiungono esperienza al CV.'),profileLabel);form.append(advanced);
    const save=node('button','Salva integrazioni','primary');save.type='submit';form.append(save);form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{draft.profiles=JSON.parse(profiles.value);const result=await localAPI('job-integrations',draft);toast(result.message);await refreshIntegrationData();}catch(e){message.textContent=e.message;}finally{save.disabled=false;}};
    const sectionImport=node('section',undefined,'detail-section');sectionImport.append(node('h2','Importa offerte o alert email'),node('p','Gli alert con soli link restano incompleti: integra il testo dell’annuncio per abilitarne la valutazione. I messaggi non vengono inviati o archiviati nella casella.'));
    const connectorLabel=node('label','Fonte'),connector=node('select');for(const c of snapshot.connectors.filter(c=>c.enabled))connector.add(new Option(c.label+' · '+c.id,c.id));connectorLabel.append(connector);
    const formatLabel=node('label','Formato'),format=node('select');for(const [value,label]of [['json','Offerte strutturate JSON'],['email','Alert HTML o testo'],['eml','Messaggio EML']])format.add(new Option(label,value));formatLabel.append(format);
    const contentLabel=node('label','Contenuto ricevuto'),content=node('textarea');content.rows=7;content.maxLength=400000;content.setAttribute('aria-label','Contenuto da importare');contentLabel.append(content);
    const fileLabel=node('label','Oppure scegli un file'),file=node('input');file.type='file';file.accept='.eml,.html,.txt,.json';file.onchange=async()=>{if(file.files[0]?.size>400000){message.textContent='File troppo grande (massimo 400 KB).';return;}if(file.files[0])content.value=await file.files[0].text();};fileLabel.append(file);
    const run=button('Importa nel catalogo','download',async()=>{run.disabled=true;try{const result=await localAPI('job-import',{connector_id:connector.value,format:format.value,content:content.value});toast(result.imported+' offerte importate; '+result.incomplete+' incomplete.');await refreshIntegrationData();}catch(e){message.textContent=e.message;}finally{run.disabled=false;}});run.disabled=!connector.options.length;
    sectionImport.append(connectorLabel,formatLabel,contentLabel,fileLabel,run);root.append(sectionImport);
  }
}
function renderJobIntelligence(){
  const root=$('intelligence-panel'),data=model.data.job_intelligence;root.replaceChildren();if(!data){root.append(node('p','Aggiorna il catalogo per visualizzare l’analisi.'));return;}
  root.append(node('p',data.jobs+' annunci unici nel catalogo. Frequenze del campione; comprendono le opportunità archiviate.','notice'));
  const grid=node('div',undefined,'integration-grid');
  for(const [key,label]of [['sources','Copertura fonti'],['companies','Aziende'],['skills','Competenze richieste'],['missing','Gap ricorrenti'],['geography','Località']]){const s=node('section');s.append(node('h2',label));const list=node('ul');for(const [name,count]of Object.entries(data[key]||{}).slice(0,12))list.append(node('li',name+' · '+count));s.append(list);grid.append(s);}root.append(grid);
  const salary=node('section');salary.append(node('h2','Retribuzioni dichiarate e stime'));for(const group of data.salary_groups||[]){salary.append(node('p',`${group.currency}/${group.period} · ${group.provenance}: ${group.jobs} offerte, mediana estremi ${group.median_min??'?'}–${group.median_max??'?'}`));for(const url of group.source_urls.slice(0,3))salary.append(safeLink(url,'Fonte retribuzione'));}salary.append(node('p',data.salary_unknown_or_invalid+' annunci senza retribuzione comparabile.'));root.append(salary);
  if(data.new_companies?.length)root.append(node('h2','Nuove aziende osservate nel campione'),node('p',data.new_companies.map(c=>c.company).join(', ')));
  if(data.trends?.status==='observed_sample'){const trend=data.trends.discovery;root.append(node('h2','Confronto del campione: 7 giorni / 7 precedenti'),node('p',trend.current+' / '+trend.previous+' annunci scoperti. Copertura non dimostrata; questi conteggi non misurano il mercato.'));}
  else root.append(node('p','Trend temporali: storico insufficiente per confrontare periodi omogenei.'));
  root.append(node('p','Possibili ripubblicazioni da verificare: '+data.possible_reposts));
}
function renderJobSourceDetails(parent,row){
  const root=section(parent,'Fonti e percorso professionale');root.append(node('p','Fonti: '+(jobSources(row).join(', ')||'non disponibile')));
  for(const ref of row.source_references||[])root.append(safeLink(ref.url,ref.platform+' · '+ref.source_job_id));
  if(row.job_status)root.append(node('p','Stato fonte: '+row.job_status));if(row.possible_duplicates?.length)root.append(node('p',row.possible_duplicates.length+' possibili duplicati da verificare; mantenuti distinti.'));
  const matches=row.profile_matches?.profiles||[];for(const match of matches){const detail=node('details');detail.append(node('summary',match.label+': '+match.score+'/100 · confidenza '+match.confidence+'/100'));for(const [key,label]of [['demonstrated','Esperienza dimostrata'],['training','Formazione'],['transferable','Esperienza trasferibile'],['missing','Requisiti mancanti o da chiarire']]){const rows=match.explanation?.[key]||[];if(!rows.length)continue;detail.append(node('h3',label));const list=node('ul');for(const evidence of rows.slice(0,12))list.append(node('li',evidence.requirement+(evidence.posting_quote?' · “'+evidence.posting_quote+'”':'')+(evidence.evidence_ids?.length?' · evidenze: '+evidence.evidence_ids.join(', '):'')));detail.append(list);}root.append(detail);}
  if(row.salary?.min!=null||row.salary?.max!=null)root.append(node('p',`Retribuzione: ${row.salary.min??'?'}–${row.salary.max??'?'} ${row.salary.currency}/${row.salary.period} · provenienza ${row.salary.provenance}`));
  if(row.internal_id&&model.local)for(const [feedback,label]of [['relevant','Pertinente'],['irrelevant','Poco pertinente'],['dismissed','Scarta']])root.append(button(label,null,async()=>{try{await localAPI('job-feedback',{job_id:row.internal_id,feedback});toast('Feedback registrato; le evidenze del profilo non cambiano.');}catch(e){toast(e.message);}}));
}
document.addEventListener('career-ready',()=>{
  for(const id of ['job-source','job-lifecycle','career-profile'])$(id).onchange=()=>{model.page=0;render();};
  $('save-search').onclick=()=>{const name=$('search-name').value.trim();if(!name){$('search-name').reportValidity();return;}const filters={};for(const id of ['search','area','status','distance','fit-min','fit-tier','sort-order','job-source','job-lifecycle','career-profile'])filters[id]=$(id).value;setRow('search:'+name.toLocaleLowerCase('it'),{checked:false,note:JSON.stringify({name,filters})});renderExplorerFilters();toast('Ricerca salvata cifrata con le candidature.');};
  $('saved-search').onchange=()=>{const row=model.checks.rows[$('saved-search').value];if(!row)return;try{const saved=JSON.parse(row.note);for(const [id,value]of Object.entries(saved.filters))if($(id))$(id).value=String(value);model.view='jobs';model.page=0;render();}catch{toast('Ricerca salvata non valida.');}};
});
