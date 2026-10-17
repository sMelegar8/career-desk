'use strict';
function canConfigure(){return model.local||CareerCloud.connected;}
const CareerCloud=(()=>{
  const repository='sMelegar8/Auto-LinkdIn-v2.0',prefix='https://api.github.com/repos/'+repository;
  const aad=new TextEncoder().encode('CareerDesk/cloud-command/v1');
  let token='',config=null,epoch=0,lastStatus=null;
  const oauthStates=new Map();
  const encode=value=>new TextEncoder().encode(value),decode=value=>new TextDecoder().decode(value);
  function bytes(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
  function base64(value){let text='';for(let i=0;i<value.length;i+=16384)text+=String.fromCharCode(...value.subarray(i,i+16384));return btoa(text);}
  async function configuration(){
    if(config)return config;
    const response=await fetch('cloud-config.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Configurazione GitHub in preparazione: ricarica Career Desk.');
    const value=await response.json();
    if(value.version!==1||value.repository!==repository||value.branch!=='main'||value.workflow!=='connections.yml'||value.callback!=='https://smelegar8.github.io/career-desk/oauth-callback.html')throw new Error('Configurazione cloud non verificata.');
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value.public_key)));
    if(Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')!==value.key_id)throw new Error('Chiave cloud non verificata.');
    config=value;return value;
  }
  async function api(path,options={}){
    if(!token)throw new Error('Collega GitHub per gestire la configurazione.');
    const current=epoch,response=await fetch(prefix+path,{cache:'no-store',redirect:'error',...options,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json',...options.headers}});
    if(current!==epoch)throw new Error('Sessione GitHub chiusa.');
    if(!response.ok)throw new Error(response.status===401?'Token GitHub scaduto o non valido.':response.status===403?'Accesso GitHub negato: servono Contents e Actions in lettura/scrittura.':'Operazione GitHub non riuscita ('+response.status+').');
    return response.status===204?{}:response.json();
  }
  function mergeOverlay(rows){
    if(!model.data)return;
    function canonical(link){try{const url=new URL(link);for(const key of [...url.searchParams.keys()])if(key.toLowerCase().startsWith('utm_')||['trk','trackingid','fbclid','gclid'].includes(key.toLowerCase()))url.searchParams.delete(key);url.hash='';url.pathname=url.pathname.replace(/\/$/,'')||'/';url.searchParams.sort();return url.href;}catch{return link;}}
    const existing=new Map(model.data.jobs.map(job=>[canonical(job.link),job]));
    for(const row of rows||[]){const key=canonical(row.canonical_url||row.link),old=existing.get(key);
      if(old){
        const moved=row.location!==old.location,changed=row.description!==old.description||row.title!==old.title||row.company!==old.company;
        for(const field of ['description','company','title','location','source_references','profile_matches','salary','job_status','registry_lifecycle_status','relevance_feedback','archived','vacancy_status','history'])if(Object.hasOwn(row,field))old[field]=row[field];
        if(moved)for(const field of ['distance_from_parma_km','distance_band','distance_label','location_verification'])old[field]=row[field]??null;
        if(changed){old.complete=row.complete;old.description_verified=row.description_verified;old.posting=null;old.review_status=row.review_status;old.profile_matches=row.profile_matches||{profiles:[]};}
        if(moved||changed||row.archived||row.relevance_feedback==='dismissed')old.fit={score:null,application_tier:'insufficient_information'};
      }
      else{model.data.jobs.push(row);existing.set(key,row);}
    }
    model.data.audit.all_jobs=model.data.jobs.length;model.data.audit.complete_jobs=model.data.jobs.filter(job=>job.complete).length;
  }
  async function status(){
    const current=epoch,file=await api('/contents/data/career_cloud_status.json?ref=main',{headers:{Accept:'application/vnd.github.raw+json'}});
    let value=file;
    if(file.version!==1){
      if(file.encoding!=='base64'||typeof file.content!=='string')throw new Error('Stato cloud non disponibile.');
      value=JSON.parse(decode(bytes(file.content.replace(/\s/g,''))));
    }
    if(current!==epoch)throw new Error('Sessione GitHub chiusa.');
    if(value.version!==1||value.connections?.scope!=='github_actions')throw new Error('Formato stato GitHub non valido.');
    lastStatus=value;return value;
  }
  async function load(){
    const value=await status();
    if(model.data){model.data.connections=value.connections;model.data.integrations=value.integrations;model.data.newsletter=value.newsletter;if(value.job_intelligence)model.data.job_intelligence=value.job_intelligence;mergeOverlay(value.jobs_overlay);}
    return value.connections;
  }
  async function encryptedRequest(route,body,id){
    const settings=await configuration(),key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
    const publicKey=await crypto.subtle.importKey('spki',bytes(settings.public_key),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
    const aes=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
    const plaintext=encode(JSON.stringify({id,created_at:new Date().toISOString(),route,body}));
    if(plaintext.length>500000)throw new Error('Configurazione troppo grande (massimo 500 KB).');
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},aes,plaintext);
    const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP',label:aad},publicKey,key);key.fill(0);
    return {version:1,key_id:settings.key_id,wrapped_key:base64(new Uint8Array(wrapped)),iv:base64(iv),data:base64(new Uint8Array(ciphertext))};
  }
  async function request(route,body){
    if(!['connections','job-integrations','job-import','job-sync','job-feedback','newsletter-config'].includes(route))throw new Error('Questa operazione richiede il programma sul PC.');
    if(body===undefined){await load();return route==='connections'?lastStatus.connections:route==='job-integrations'?lastStatus.integrations:route==='newsletter-config'?lastStatus.newsletter:{};}
    const current=epoch,id=crypto.randomUUID(),envelope=await encryptedRequest(route,body,id);
    await api('/contents/data/career_cloud_requests/'+id+'.json',{method:'PUT',body:JSON.stringify({branch:'main',message:'Queue encrypted Career Desk configuration [skip ci]',content:base64(encode(JSON.stringify(envelope)))})});
    try{await api('/actions/workflows/connections.yml/dispatches',{method:'POST',body:JSON.stringify({ref:'main'})});}
    catch{throw new Error('Richiesta cifrata salvata. Avvio immediato non disponibile: GitHub la elaborerà al prossimo controllo. Puoi ricaricare lo stato senza reinserire le credenziali.');}
    for(let attempt=0;attempt<50;attempt++){
      await new Promise(resolve=>setTimeout(resolve,3000));if(current!==epoch)throw new Error('Sessione GitHub chiusa.');
      const value=await status(),result=value.results?.[id];
      if(result){await load();if(result.status!=='done')throw new Error(result.error||'Configurazione non completata.');return result.result;}
    }
    throw new Error('Richiesta salvata e in coda su GitHub. Ricarica lo stato tra poco; non occorre reinserire le credenziali.');
  }
  function authorize(url,message){
    const target=new URL(url);if(!['accounts.google.com','login.microsoftonline.com'].includes(target.hostname)||target.protocol!=='https:'||!target.searchParams.get('state'))throw new Error('Indirizzo di accesso non valido.');
    oauthStates.set(target.searchParams.get('state'),Date.now()+600000);
    const link=node('a','Completa accesso sicuro');link.href=url;link.target='_blank';link.rel='opener noreferrer';link.onclick=event=>{event.preventDefault();window.open(url,'career-desk-oauth');};
    message.replaceChildren(node('span','Completa il consenso e torna a questa scheda. '),link);
  }
  function authorizeDevice(value,message){
    const url=new URL(value.verification_uri);if(url.protocol!=='https:'||!['microsoft.com','www.microsoft.com','login.microsoftonline.com'].includes(url.hostname)||typeof value.user_code!=='string')throw new Error('Accesso Microsoft non verificato.');
    message.replaceChildren(node('span','Codice Microsoft: '+value.user_code+' · '),safeLink(value.verification_uri,'Apri accesso Microsoft'),node('span',' Dopo il consenso usa “Ricarica stato connessioni”; se resta in attesa, premi Verifica sulla casella.'));
  }
  async function callback(value){
    if(!value||value.type!=='career-desk-oauth'||typeof value.state!=='string'||!oauthStates.has(value.state)||oauthStates.get(value.state)<Date.now())return;
    oauthStates.delete(value.state);
    try{await request('connections',{action:'oauth-complete',query:{state:value.state,code:typeof value.code==='string'?value.code:'',error:typeof value.error==='string'?value.error:''}});connectionsData=await load();if(model.view==='connections')renderConnections();toast('Account verificato su GitHub.');}
    catch(error){toast(error.message);}
  }
  window.addEventListener('message',event=>{if(event.origin===location.origin)callback(event.data);});
  if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('career-desk-oauth');channel.onmessage=event=>callback(event.data);}
  function renderAccess(root){
    const section=node('section',undefined,'detail-section');section.append(node('h2','GitHub · accesso dal cellulare'));
    if(token){section.append(node('p','Collegato al repository privato. Le operazioni vengono eseguite su GitHub Actions, anche con il PC spento.'),button('Scollega questa sessione GitHub',null,()=>{lock();connectionsData=null;renderConnections();}));root.append(section);return;}
    section.append(node('p','Inserisci un token GitHub limitato al repository Auto-LinkdIn-v2.0, con Contents e Actions in lettura/scrittura. Il token resta soltanto in memoria fino al blocco della dashboard.'));
    section.append(safeLink('https://github.com/settings/personal-access-tokens/new','Crea token GitHub'));
    const form=node('form'),label=node('label','Token GitHub'),input=node('input');input.type='password';input.autocomplete='off';input.required=true;input.setAttribute('aria-label','Token GitHub cloud');label.append(input);form.append(label);const submit=node('button','Collega GitHub e configura online','primary');submit.type='submit';form.append(submit);const message=node('p');message.setAttribute('role','status');
    form.onsubmit=async event=>{event.preventDefault();const value=input.value.trim();input.value='';submit.disabled=true;message.textContent='Verifica accesso GitHub…';try{await configuration();token=value;const metadata=await api('');if(metadata.private!==true||metadata.full_name.toLowerCase()!==repository.toLowerCase()||!metadata.permissions?.push)throw new Error('Serve accesso in scrittura al repository privato Career Desk.');await api('/actions/workflows/connections.yml');connectionsData=await load();connectionsDirty=false;render();}catch(error){lock();message.textContent=error.message;}finally{submit.disabled=false;}};
    section.append(form,message);root.append(section);
  }
  function lock(){token='';epoch++;lastStatus=null;oauthStates.clear();}
  return {get connected(){return !!token;},load,request,authorize,authorizeDevice,renderAccess,lock};
})();
