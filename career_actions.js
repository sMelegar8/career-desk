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
  function renderDocuments(parent,row){
    if(row.kind!=='job'||!row.job_id)return;
    const s=section(parent,'Documenti e azioni su richiesta'),available=model.local||CareerCloud.connected;
    if(!available)s.append(node('p','Collega GitHub in Connessioni per inviare richieste dal telefono.','muted'));
    const run=(text,kind,enabled=true)=>{const b=button(text,'file-pen-line',async()=>{b.disabled=true;try{await request(row,kind);}catch(error){toast(error.message);}finally{b.disabled=!available||!enabled;}});b.disabled=!available||!enabled;s.append(b);};
    const quiet=quietSummary(applicationState(row)),stage=applicationStage(row);
    if(stage==='interview')s.append(node('p','Colloquio registrato: puoi richiedere la preparazione con esempi documentati.','notice'));
    run('Richiedi lettera di presentazione','cover_letter',row.complete&&gates(row).verdict!=='FAIL');
    run('Richiedi preparazione colloquio','interview_prep',row.complete);
    if(openStages.includes(stage)){
      if(quiet.days_quiet!==null)s.append(node('p',`${quiet.days_quiet} giorni senza attività · ${quiet.followups_sent} solleciti registrati`,'muted'));
      run('Richiedi bozza di sollecito','followup_draft',!!applicationState(row).submitted_on);
      run('Segna sollecito inviato','followup_sent');
      run('Chiudi: nessuna risposta','no_response');
    }
    for(const artifact of row.career_documents?.artifacts||[]){
      const article=node('article',undefined,'detail-section');article.append(node('h4',artifact.label_it||artifact.status));
      for(const format of ['pdf','docx'])if(artifact.files?.[format])article.append(button(format==='pdf'?'Apri PDF':'Scarica Word','download',async()=>{try{saveBlob(await bytes(row,artifact,format),artifact.files[format].name,'application/octet-stream');}catch(error){toast(error.message);}}));
      if(artifact.text){const text=node('textarea');text.value=artifact.text;text.readOnly=true;text.rows=7;text.setAttribute('aria-label','Sollecito da copiare');article.append(text,button('Copia sollecito','copy',()=>navigator.clipboard.writeText(artifact.text).then(()=>toast('Testo copiato.')).catch(()=>toast('Seleziona il testo e copialo.'))));}
      if(artifact.kind==='cover_letter'&&artifact.status==='awaiting_approval'&&artifact.files?.preview_1){
        const preview=node('div'),reviewed=node('input'),label=node('label',' Ho verificato contenuti e pagina renderizzata');reviewed.type='checkbox';reviewed.disabled=true;label.prepend(reviewed);
        const approve=button('Approva lettera e copia su Drive','check',async()=>{approve.disabled=true;try{await request(row,'approve_cover_letter',{docx_sha:artifact.document_hashes['.docx'],pdf_sha:artifact.document_hashes['.pdf']});}catch(error){toast(error.message);approve.disabled=!reviewed.checked;}});approve.disabled=true;
        reviewed.onchange=()=>{approve.disabled=!reviewed.checked||!available;};
        article.append(button('Mostra pagina da approvare','eye',async()=>{try{const data=await bytes(row,artifact,'preview_1'),url=URL.createObjectURL(new Blob([data],{type:'image/png'})),image=node('img');image.alt='Pagina renderizzata della lettera';image.style.width='100%';image.onload=()=>{reviewed.disabled=false;URL.revokeObjectURL(url);};image.src=url;preview.replaceChildren(image);}catch(error){toast(error.message);}}),preview,label,approve);
      }
      s.append(article);
    }
    s.append(node('p','Le bozze non vengono inviate. La lettera usa il CV base assegnato e richiede approvazione prima della copia su Drive.','muted'));
  }
  return {quietSummary,gateNotes,badges,renderDocuments};
})();
