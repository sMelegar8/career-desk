'use strict';
const CareerActions=(()=>{
  const openStages=['applied','interview'];
  function quietSummary(state,now=new Date()){
    const stage=String(state.stage||(state.checked?'applied':'')).toLowerCase().replaceAll(' ','_');
    const result={days_quiet:null,followups_sent:0,needs_followup:false,stale:false};
    if(!openStages.includes(stage)||state.checked===false)return result;
    const instant=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value))return null;const day=Date.parse(value.slice(0,10));if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==value.slice(0,10)||value.length>10&&!/(Z|[+-]\d{2}:\d{2})$/.test(value))return null;const at=Date.parse(value);return Number.isFinite(at)&&at<=now.getTime()?at:null;};
    const events=(state.activity_events||[]).filter(event=>instant(event.at)!==null);
    const sent=events.filter(event=>event.kind==='followup_sent');
    const note=state.note||state.notes||'',legacy=new Set([...note.matchAll(/followed up\s+(\d{4}-\d{2}-\d{2})/gi)].map(match=>match[1]).filter(value=>instant(value)!==null));
    for(const event of sent)legacy.delete(event.at.slice(0,10));
    result.followups_sent=sent.length+legacy.size;
    const dates=['submitted_on','applied_on','applied_at','date','updatedAt'].map(key=>state[key]);
    dates.push(...events.map(event=>event.at),...[...note.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(match=>match[0]));
    const times=dates.map(instant).filter(value=>value!==null);
    if(!times.length)return result;
    result.days_quiet=Math.floor((now.getTime()-Math.max(...times))/86400000);
    result.needs_followup=result.days_quiet>=10&&result.followups_sent<2;
    result.stale=result.days_quiet>=60;
    return result;
  }
  function gates(row){return row.gates||row.fit?.gates||{};}
  function gateNotes(row){
    const values=[];
    for(const [key,label]of [['language','Lingua'],['eligibility','Idoneità']]){
      const gate=gates(row)[key];if(!gate)continue;
      for(const evidence of gate.evidence||[])values.push({label,verdict:gate.verdict,quote:evidence.quote,reason:evidence.reason});
    }
    return values;
  }
  function badges(parent,row){
    for(const item of gateNotes(row))parent.append(node('div',`${item.label}: ${item.reason||item.quote} · ${item.verdict}`,'subline'));
    const quiet=quietSummary(applicationState(row));
    if(quiet.needs_followup)parent.append(node('div','Da sollecitare','badge warn'));
    if(quiet.stale)parent.append(node('div','Ferma da 60+ giorni','badge warn'));
  }
  function trackerFacts(row){
    const state=applicationState(row),facts={};
    for(const key of ['checked','stage','submitted_on','channel','recruiter','updatedAt','activity_events'])if(Object.hasOwn(state,key))facts[key]=state[key];
    facts.stage=applicationStage(row);
    return facts;
  }
  async function request(row,kind,extra={}){
    await persist(false);
    const result=await localAPI('career-request',{job_id:row.job_id,kind,request_id:crypto.randomUUID(),...(['followup_sent','no_response','followup_draft'].includes(kind)?{tracker:trackerFacts(row)}:{}),...extra});
    if(result.state){model.checks=merge(model.checks,result.state);await persist(false);}
    toast(result.message||'Richiesta registrata.');
    if(model.local)model.data=await readCatalog();
    render();return result;
  }
  async function bytes(row,artifact,format){
    const file=artifact.files[format];
    if(!model.local)return decrypt(await fetchJSON(file.encrypted_url));
    const query=new URLSearchParams({id:row.job_id,format:`career:${artifact.kind}:${format}`,request_id:artifact.request_id});
    const response=await fetch('/api/file?'+query,{headers:{'X-Desk-Client':'1'}});
    if(!response.ok)throw new Error('Documento modificato o non disponibile: aggiorna il catalogo.');
    return response.arrayBuffer();
  }
  const autoApplyLabels={queued:'In coda',preparing:'In preparazione',needs_intervention:'Serve il tuo intervento',not_applicable:'Non candidabile',manual_handoff:'Da completare manualmente',awaiting_review:'Da rivedere',approved:'Approvata, in attesa del PC',submitting:'Invio in corso',submitted:'Inviata',needs_verification:'Da verificare',failed:'Preparazione non riuscita'};
  function autoApplyState(row){return row.auto_apply||(model.data.auto_apply||model.data.autoApply||{})[row.job_id]||{};}
  function autoApplyButton(parent,row){
    if(row.kind!=='job'||!row.job_id)return;
    const state=autoApplyState(row);
    if(state.status)parent.append(node('span','Auto Apply · '+(autoApplyLabels[state.status]||state.status),'badge '+(['awaiting_review','needs_intervention','needs_verification'].includes(state.status)?'warn':'')));
    if(isApplied(row)||!row.complete)return;
    const busy=['queued','preparing','approved','submitting','submitted','needs_verification'].includes(state.status),available=model.local||CareerCloud.connected;
    const b=button(state.status==='awaiting_review'?'Rivedi candidatura':'Candidati (Auto Apply)','send',async()=>{
      if(state.status==='awaiting_review'){showDetail(row);return;}
      b.disabled=true;try{await request(row,'auto_apply');}catch(error){toast(error.message);}finally{b.disabled=busy||!available;}
    });b.disabled=busy||!available;parent.append(b);
  }
  function fieldValue(field){const value=field.value??field.mapping?.value;return value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);}
  const profileLabels={first_name:'Nome',last_name:'Cognome',full_name:'Nome completo',email:'Email',phone:'Telefono',city:'Città',postal_code:'CAP',country:'Nazione',address:'Indirizzo',date_of_birth:'Data di nascita',linkedin:'LinkedIn',website:'Sito / portfolio',orcid:'ORCID',education:'Titoli di studio',languages:'Lingue',current_title:'Ruolo attuale',current_company:'Azienda attuale',notice_period:'Preavviso',availability:'Disponibilità',salary_current:'RAL attuale',salary_desired:'RAL desiderata',driving_license:'Patente',work_permit:'Permesso di lavoro',work_authorization:'Diritto al lavoro',citizenship:'Cittadinanza',relocation:'Trasferimento',protected_category:'Categorie protette (L. 68/99)',disability:'Invalidità',health:'Salute',diversity:'Diversità',criminal_record:'Precedenti penali',pregnancy:'Gravidanza',religion:'Religione',union:'Sindacato',required_privacy:'Privacy necessaria',talent_pool:'Talent pool',marketing:'Marketing'};
  async function renderProfile(parent){
    const session=model.session;parent.replaceChildren(node('p','Caricamento profilo…','muted'));
    try{
      const result=model.local?await localAPI('application-profile'):{profile:model.data.application_profile};if(session!==model.session)return;
      const profile=result.profile||result.application_profile||result,fields=profile?.fields;
      parent.replaceChildren(node('p',model.local?'Modifica i dati confermati e le regole sul PC. I dati mancanti restano vuoti.':'Profilo in sola lettura. Per modificarlo apri Career Desk sul PC.','notice'));
      if(!fields){parent.append(node('p','Il profilo è disponibile solo sul PC; non viene pubblicato in chiaro.','muted'));return;}
      const form=node('form',undefined,'application-profile-form'),inputs=new Map(),rules=profile.rules||{},ruleInputs={};
      form.onsubmit=event=>event.preventDefault();
      for(const [key,item]of Object.entries(fields)){
        if(/password|passwd|pwd|token|secret/i.test(key))continue;
        const entry=item&&typeof item==='object'&&Object.hasOwn(item,'value')?item:{value:item},label=node('label',profileLabels[key]||key.replaceAll('_',' ')),value=entry.value;
        if(value&&typeof value==='object'){label.append(node('pre',JSON.stringify(value,null,2)));}
        else{const input=node('input');input.type='text';input.maxLength=2000;input.value=value??'';input.disabled=!model.local;label.append(input);inputs.set(key,input);}
        label.append(node('span','Fonte: '+(entry.source||'non documentata')+' · '+(entry.status||(!value?'missing':'confirmed')),'muted'));form.append(label);
      }
      for(const [group,title]of [['sensitive_policy','Domande delicate'],['consents','Consensi']]){
        const values=rules[group]||profile[group]||{};if(!Object.keys(values).length)continue;
        const block=node('fieldset');block.append(node('legend',title));ruleInputs[group]={};
        for(const [key,value]of Object.entries(values)){const label=node('label',profileLabels[key]||key.replaceAll('_',' ')),select=node('select');for(const [choice,text]of [['ask','Chiedi ogni volta'],['yes','Sì'],['no','No']]){const option=node('option',text);option.value=choice;select.append(option);}if(typeof value==='string'&&!['ask','yes','no'].includes(value)){const current=node('option',value);current.value=value;select.append(current);}select.value=typeof value==='boolean'?(value?'yes':'no'):String(value||'ask');if(!select.value)select.value='ask';select.disabled=!model.local;label.append(select);block.append(label);ruleInputs[group][key]=select;}form.append(block);
      }
      if(model.local){const save=button('Salva profilo candidatura','save',async()=>{if(!form.reportValidity())return;const values={};for(const [key,input]of inputs)values[key]=input.value.trim()||null;const updateRules={};for(const [group,items]of Object.entries(ruleInputs)){updateRules[group]={};for(const [key,input]of Object.entries(items))updateRules[group][key]=input.value==='yes'?true:input.value==='no'?false:input.value;}save.disabled=true;try{await localAPI('application-profile',{version:1,fields:values,rules:updateRules});toast('Profilo candidatura salvato.');await renderProfile(parent);}catch(error){toast(error.message);save.disabled=false;}},'primary');form.append(save);}
      parent.append(form);
      const bank=result.answer_bank?.entries||result.answer_bank?.answers||[];
      if(Array.isArray(bank)&&bank.length){const s=section(parent,'Banca risposte');for(const entry of bank){const item=node('details');item.append(node('summary',entry.question||entry.normalized_question||'Risposta confermata'),node('p',String(entry.answer??'')),node('p',entry.scope==='global'?'Salvata per sempre':'Solo per questo annuncio','muted'));s.append(item);}}
    }catch(error){if(session===model.session)parent.replaceChildren(node('p',error.message,'form-error'));}
  }
  function renderAutoApply(parent,row){
    if(row.kind!=='job'||!row.job_id)return;
    const state=autoApplyState(row);if(!state.status)return;
    const s=section(parent,'Candidatura assistita · '+(autoApplyLabels[state.status]||state.status)),pack=state.package||{},available=model.local||CareerCloud.connected;
    if(state.reason)s.append(node('p',state.reason,'notice'));
    if(state.diff||state.requires_reprepare||pack.complete_form===false){
      const retry=button('Riprepara candidatura','refresh-cw',async()=>{retry.disabled=true;try{await request(row,'auto_apply_retry');}catch(error){toast(error.message);retry.disabled=!available;}});retry.disabled=!available;s.append(retry);
    }
    if(pack.complete_form===false)s.append(node('p','Modulo parziale: conferma le risposte per proseguire la preparazione. Il PC non invia finché il modulo completo non è stato rivisto.','notice'));
    if(state.status==='needs_intervention'){
      s.append(node('p','Apri sul PC: Career Desk → Apri browser candidatura. Completa accesso, account o verifica nel browser dedicato; la preparazione riprenderà dopo la chiusura.'));
      if(model.local)s.append(button('Apri browser candidatura','external-link',async()=>{try{await localAPI('auto-apply-browser',{job_id:row.job_id});toast('Browser candidatura avviato sul PC.');}catch(error){toast(error.message);}}));
    }
    if(state.status==='needs_verification')s.append(node('p','Controlla sul portale se la candidatura è arrivata. Nessun nuovo invio automatico.','notice'));
    if(state.status==='manual_handoff'){
      if(state.apply_url)s.append(safeLink(state.apply_url,'Apri candidatura sul portale'));
      const text=(pack.fields||[]).map(field=>(field.label||field.field_id)+': '+(fieldValue(field)||'[DA COMPLETARE]')).join('\n\n'),area=node('textarea');area.value=text;area.readOnly=true;area.rows=10;area.setAttribute('aria-label','Risposte da copiare sul portale');
      s.append(node('p','Completa e invia manualmente sul portale. Le risposte mancanti restano da confermare.'),area,button('Copia risposte','copy',()=>navigator.clipboard.writeText(text).then(()=>toast('Risposte copiate.')).catch(()=>toast('Seleziona il testo e copialo.'))));return;
    }
    if(!['awaiting_review','approved','submitting','submitted'].includes(state.status))return;
    const cv=pack.cv||{};s.append(node('p','CV scelto: '+(cv.label||cv.name||'CV approvato'),'auto-apply-cv'));
    if(cv.reason||pack.cv_reason)s.append(node('p',cv.reason||pack.cv_reason,'muted'));
    if(cv.sha256||cv.sha)s.append(node('p','SHA256: '+(cv.sha256||cv.sha),'auto-apply-hash'));
    if(state.diff||pack.diff)s.append(node('p','Il modulo è cambiato: '+JSON.stringify(state.diff||pack.diff),'notice'));
    const form=node('form',undefined,'auto-apply-review'),editors=new Map(),flags=new Map();
    form.onsubmit=event=>event.preventDefault();
    for(const field of pack.fields||[]){
      if(!field.field_id)continue;
      const group=node('div',undefined,'auto-apply-field'),label=node('label',(field.label||field.field_id)+(field.required?' *':'')),source=field.source||field.mapping?.source||'missing';
      group.append(label,node('p','Fonte: '+source+((field.needs_review||source==='missing')?' · Da rivedere':''),'muted'));
      let input;
      if(field.type==='file'){group.append(node('p',fieldValue(field)||'Documento approvato da caricare a cura del worker.','muted'));}
      else{
        const options=field.options||[];
        if(options.length){input=node('select');const empty=node('option','Scegli una risposta');empty.value='';input.append(empty);for(const item of options){const value=typeof item==='object'?String(item.value??item.label??''):String(item),option=node('option',typeof item==='object'?String(item.label??item.value??''):String(item));option.value=value;input.append(option);}}
        else if(field.type==='checkbox'){input=node('select');for(const [value,text]of [['','Da confermare'],['true','Sì'],['false','No']]){const option=node('option',text);option.value=value;input.append(option);}}
        else{input=node('textarea');input.rows=field.type==='textarea'?4:2;input.maxLength=Math.min(Number(field.maxlength)||2000,2000);}
        input.value=fieldValue(field);input.required=!!field.required;input.setAttribute('aria-label',field.label||field.field_id);input.disabled=state.status!=='awaiting_review';label.append(input);editors.set(field.field_id,input);
        const saveLabel=node('label','Conserva risposta'),save=node('select');for(const [value,text]of [['job','Solo qui'],['global','Salva per sempre']]){const option=node('option',text);option.value=value;save.append(option);}save.value='job';save.disabled=input.disabled;save.setAttribute('aria-label','Conserva risposta: '+(field.label||field.field_id));saveLabel.append(save);group.append(saveLabel);flags.set(field.field_id,save);
      }
      const evidence=field.evidence||field.mapping?.evidence;if(evidence?.length)group.append(node('blockquote',evidence.join('\n')));
      form.append(group);
    }
    for(const shot of pack.screenshots||[]){
      const name=typeof shot==='string'?shot:shot.name;if(!name||!/^[-\w.]+\.(png|jpe?g)$/i.test(name))continue;
      const preview=node('div');form.append(button('Mostra screenshot: '+(shot.label||name),'image',async()=>{
        try{let data;if(!model.local&&shot.encrypted_url)data=await decrypt(await fetchJSON(shot.encrypted_url));else if(model.local){const query=new URLSearchParams({job_id:row.job_id,name}),response=await fetch('/api/auto-apply-screenshot?'+query,{headers:{'X-Desk-Client':'1'}});if(!response.ok)throw new Error('Screenshot non disponibile.');data=await response.arrayBuffer();}else throw new Error('Screenshot disponibile sul PC.');const image=node('img'),url=URL.createObjectURL(new Blob([data],{type:'image/png'}));image.alt=shot.label||'Modulo candidatura';image.onload=()=>URL.revokeObjectURL(url);image.src=url;preview.replaceChildren(image);}catch(error){toast(error.message);}
      }),preview);
    }
    if(state.status==='awaiting_review'){
      const reviewed=node('input'),label=node('label',' Ho verificato tutti i campi');reviewed.type='checkbox';reviewed.disabled=!!state.requires_reprepare;label.prepend(reviewed);
      const approve=button('Approva e invia','check',async()=>{if(!reviewed.checked||state.requires_reprepare||!form.reportValidity())return;approve.disabled=true;const answers={},save_flags={};for(const [id,input]of editors){answers[id]=input.value;save_flags[id]=flags.get(id).value;}try{await request(row,'approve_auto_apply',{package_sha:state.package_sha||pack.package_sha,answers,save_flags});$('detail').close();}catch(error){toast(error.message);approve.disabled=!reviewed.checked||!available||!!state.requires_reprepare;}} ,'primary');approve.disabled=true;reviewed.onchange=()=>{approve.disabled=!reviewed.checked||!available||!!state.requires_reprepare;};form.append(label,approve,node('p','L’approvazione vale 7 giorni ed è legata a questo pacchetto. Il PC invia solo dopo i controlli sul modulo e sui documenti.','muted'));
    }
    s.append(form);
  }
  function renderDocuments(parent,row,options={}){
    if(row.kind!=='job'||!row.job_id)return;
    const s=section(parent,'Documenti e azioni su richiesta'),available=model.local||CareerCloud.connected;
    if(!available)s.append(node('p','Collega GitHub in Connessioni per inviare richieste dal telefono.','muted'));
    const run=(text,kind,enabled=true)=>{const b=button(text,'file-pen-line',async()=>{b.disabled=true;try{await request(row,kind);}catch(error){toast(error.message);}finally{b.disabled=!available||!enabled;}});b.disabled=!available||!enabled;s.append(b);};
    const quiet=quietSummary(applicationState(row)),stage=applicationStage(row);
    if(!options.tailoredOnly){
      if(stage==='interview')s.append(node('p','Colloquio registrato: puoi richiedere la preparazione con esempi documentati.','notice'));
      run('Richiedi lettera di presentazione','cover_letter',row.complete&&gates(row).verdict!=='FAIL');
      // A greyed-out button alone read as "missing" (7 Nov 2026): say why the letter cannot be requested.
      if(!row.complete)s.append(node('p','Lettera non disponibile: manca il testo completo dell’annuncio.','muted'));
      else if(gates(row).verdict==='FAIL')s.append(node('p','Lettera non disponibile: un requisito obbligatorio dell’annuncio risulta non soddisfatto.','muted'));
      run('Richiedi preparazione colloquio','interview_prep',row.complete);
      run('Richiedi risposte per il modulo','form_answers',row.complete);
      run('Richiedi panel di revisori','hiring_panel',row.complete);
    }
    // Tailored CV only for favourites (candidate decision 6 Nov 2026); it stays a draft until approved.
    if(applicationState(row).favorite===true){
      const base=typeof suggestedCV==='function'?suggestedCV(row):null;
      run('Adatta CV'+(base?' (da '+base.label+')':''),'tailored_cv',row.complete);
      s.append(node('p','Riordina ed evidenzia solo fatti già documentati nel CV base e nelle tue conferme; le lacune restano elencate. Usa il limite giornaliero dei CV Claude.','muted'));
    }else s.append(node('p','Metti la stellina ★ per poter adattare il CV a questo annuncio.','muted'));
    if(!options.tailoredOnly&&openStages.includes(stage)){
      if(quiet.days_quiet!==null)s.append(node('p',`${quiet.days_quiet} giorni senza attività · ${quiet.followups_sent} solleciti registrati`,'muted'));
      run('Richiedi bozza di sollecito','followup_draft',!!applicationState(row).submitted_on);
      run('Segna sollecito inviato','followup_sent');
      run('Chiudi: nessuna risposta','no_response');
    }
    for(const artifact of row.career_documents?.artifacts||[]){
      if(options.tailoredOnly&&artifact.kind!=='tailored_cv')continue;
      const article=node('article',undefined,'detail-section');article.append(node('h4',artifact.label_it||artifact.status));
      for(const format of ['pdf','docx'])if(artifact.files?.[format])article.append(button(format==='pdf'?'Apri PDF':'Scarica Word','download',async()=>{try{saveBlob(await bytes(row,artifact,format),artifact.files[format].name,'application/octet-stream');}catch(error){toast(error.message);}}));
      if(artifact.text){const form=artifact.kind==='form_answers',text=node('textarea');text.value=artifact.text;text.readOnly=true;text.rows=7;text.setAttribute('aria-label',form?'Risposte per il modulo da copiare':'Sollecito da copiare');article.append(text,button(form?'Copia risposte':'Copia sollecito','copy',()=>navigator.clipboard.writeText(artifact.text).then(()=>toast('Testo copiato.')).catch(()=>toast('Seleziona il testo e copialo.'))));}
      if(artifact.kind==='tailored_cv'){
        if(artifact.base_label)article.append(node('p','Partito da '+artifact.base_label,'muted'));
        const list=(title,items)=>{if(!items?.length)return;article.append(node('h4',title));const ul=node('ul');for(const item of items)ul.append(node('li',item));article.append(ul);};
        list('Modifiche',artifact.changes);list('Keyword con evidenza',(artifact.keywords||[]).map(item=>item.keyword));
        list('Lacune (requisiti senza evidenza)',artifact.gaps?.length?artifact.gaps:['Nessuna lacuna segnalata: verifica comunque l’annuncio.']);
      }
      if(['cover_letter','tailored_cv'].includes(artifact.kind)&&artifact.status==='awaiting_approval'&&artifact.files?.preview_1){
        const cv=artifact.kind==='tailored_cv',pages=Object.keys(artifact.files).filter(key=>key.startsWith('preview_')).sort();
        const preview=node('div'),reviewed=node('input'),label=node('label',cv?' Ho verificato fatti, lacune e le due pagine renderizzate':' Ho verificato contenuti e pagina renderizzata');reviewed.type='checkbox';reviewed.disabled=true;label.prepend(reviewed);
        const approve=button(cv?'Approva CV adattato e copia su Drive':'Approva lettera e copia su Drive','check',async()=>{approve.disabled=true;try{await request(row,'approve_'+artifact.kind,{docx_sha:artifact.document_hashes['.docx'],pdf_sha:artifact.document_hashes['.pdf']});}catch(error){toast(error.message);approve.disabled=!reviewed.checked;}});approve.disabled=true;
        reviewed.onchange=()=>{approve.disabled=!reviewed.checked||!available;};
        article.append(button(cv?'Mostra le pagine da approvare':'Mostra pagina da approvare','eye',async()=>{try{const images=[];for(const key of pages){const data=await bytes(row,artifact,key),url=URL.createObjectURL(new Blob([data],{type:'image/png'})),image=node('img');image.alt='Pagina renderizzata '+key.slice(8)+(cv?' del CV adattato':' della lettera');image.style.width='100%';image.onload=()=>URL.revokeObjectURL(url);image.src=url;images.push(image);}preview.replaceChildren(...images);reviewed.disabled=false;}catch(error){toast(error.message);}}),preview,label,approve);
      }
      s.append(article);
    }
    s.append(node('p','Le bozze non vengono inviate. Lettera e CV adattato richiedono la tua approvazione (legata agli hash dei file) prima della copia su Drive.','muted'));
  }
  return {quietSummary,gateNotes,badges,renderDocuments,autoApplyState,autoApplyButton,renderAutoApply,renderProfile};
})();
