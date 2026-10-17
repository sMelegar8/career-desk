'use strict';
let connectionsData=null,connectionsLoad=null,connectionsDirty=false,connectionsChecklistOpen=null;
const connectionLabels={connected:'Accesso verificato',needs_authorization:'Consenso da completare',error:'Da verificare',disabled:'Disattivato',verified:'Verificato',ready:'Pronto da verificare',todo:'Da fare',missing:'Da configurare',environment:'Credenziali ambiente · da verificare',vault_unavailable:'Archivio credenziali non disponibile'};
const connectionDate=value=>value?new Date(value).toLocaleString('it-IT'):'mai';
function connectionStatus(value){return connectionLabels[value]||value||'Da configurare';}
function connectionInput(parent,label,value='',type='text'){
  const input=integrationField(parent,label,value,type);input.autocomplete=type==='password'?'new-password':'off';return input;
}
function connectionSelect(parent,label,options,value){const field=node('label',label),select=node('select');select.setAttribute('aria-label',label);for(const [id,text]of options)select.add(new Option(text,id));select.value=value??'';field.append(select);parent.append(field);return select;}
async function loadConnections(force=false){
  if(!canConfigure())return;
  if(connectionsDirty&&!force)return;
  if(connectionsLoad)return connectionsLoad;
  const session=model.session;
  connectionsLoad=(async()=>{try{const data=await localAPI('connections');if(session!==model.session||!model.data||connectionsDirty&&!force)return;connectionsData=data;connectionsDirty=false;if(model.view==='connections')renderConnections();}catch(e){if(session===model.session&&model.data){const root=$('connections-panel');root.append(node('p','Impossibile aggiornare le connessioni. '+e.message,'form-error'));}}finally{connectionsLoad=null;}})();return connectionsLoad;
}
async function connectionAction(body,message,trigger){
  const session=model.session;if(trigger)trigger.disabled=true;message.textContent='Operazione in corso…';
  try{const result=await localAPI('connections',body);if(session!==model.session||!model.data)return;
    if(!model.local&&result.verification_uri){await CareerCloud.authorizeDevice(result,message);}
    else if(result.authorization_url){if(!model.local)await CareerCloud.authorize(result.authorization_url,message);else{message.replaceChildren(node('span','Completa il consenso nel browser. '),safeLink(result.authorization_url,'Apri accesso sicuro'));window.open(result.authorization_url,'_blank','noopener,noreferrer');}}
    else{connectionsData=null;connectionsDirty=false;await loadConnections(true);toast(result.message||'Configurazione aggiornata.');}
  }catch(e){if(session===model.session&&model.data)message.textContent=e.message;}finally{if(trigger)trigger.disabled=false;}
}
function renderConnections(){
  const root=$('connections-panel');root.replaceChildren();root.oninput=root.onchange=event=>{if(event.target.closest('[data-connection-form]'))connectionsDirty=true;};const editable=canConfigure(),cloud=!model.local&&editable,data=editable?connectionsData:null;
  root.append(node('p',model.local?'Collega gli account, scegli le fonti e controlla le verifiche. Le credenziali sono protette dall’account Windows di questo PC.':'Collega GitHub per configurare gli account anche da telefono. Il monitor GitHub Actions funziona senza il PC acceso.','notice'));
  if(!model.local)CareerCloud.renderAccess(root);
  if(!data){root.append(node('p',editable?'Caricamento configurazione…':'Collega GitHub per caricare configurazione e checklist aggiornate.'));if(editable&&!connectionsLoad)loadConnections();return;}
  const message=node('p');message.setAttribute('role','status');root.append(message);
  const monitor=section(root,'Monitor connessioni');
  const remote=cloud||data.scope==='github_actions';
  monitor.append(node('p',(remote?'GitHub Actions · PC non necessario':!data.settings.monitor.enabled?'Monitor automatico disattivato':data.running?'Monitor attivo sul PC':'Monitor non rilevato di recente')+' · ultimo controllo '+connectionDate(data.monitor?.last_scan_at)),node('p','Ultimo successo: '+connectionDate(data.monitor?.last_success_at)+' · offerte importate nell’ultimo ciclo: '+(data.monitor?.imported??0)));
  if(remote)monitor.append(node('p',(data.settings.monitor.enabled?'Monitor automatico abilitato. ':'Monitor automatico disattivato. ')+'La pianificazione di GitHub Actions può subire ritardi; il controllo manuale avvia una nuova richiesta.'));
  if(data.monitor?.last_error)monitor.append(node('p',data.monitor.last_error,'form-error'));
  monitor.append(node('p','Pubblicazione: '+(data.monitor?.publish_status||'mai')+' · '+connectionDate(data.monitor?.last_published_at)));
  const draft=structuredClone(data.settings);
  if(editable){
    const form=node('form');form.id='connection-settings-form';form.dataset.connectionForm='true';
    const enabled=connectionInput(form,'Attiva il monitor automatico',draft.monitor.enabled,'checkbox'),interval=connectionInput(form,'Controlla ogni (minuti)',draft.monitor.interval_minutes,'number'),publish=connectionInput(form,'Pubblica automaticamente stato e dati cifrati',draft.monitor.auto_publish,'checkbox');interval.min=cloud?'30':'5';interval.max='1440';
    enabled.onchange=()=>{draft.monitor.enabled=enabled.checked;connectionsDirty=true;};interval.oninput=()=>{draft.monitor.interval_minutes=Number(interval.value);connectionsDirty=true;};publish.onchange=()=>{draft.monitor.auto_publish=publish.checked;connectionsDirty=true;};
    draft.application_tracking=draft.application_tracking||{enabled:false,account_ids:[],lookback_days:30};
    const tracking=node('fieldset');tracking.append(node('legend','Tracker dalle email'),node('p','Legge conferme di candidatura e risposte soltanto nelle cartelle delle caselle selezionate. Aggiunge le posizioni mancanti, aggiorna lo stato e crea notifiche; i casi incerti restano da verificare.'));
    const trackingEnabled=connectionInput(tracking,'Aggiorna il tracker dalle email',draft.application_tracking.enabled,'checkbox');trackingEnabled.onchange=()=>{draft.application_tracking.enabled=trackingEnabled.checked;connectionsDirty=true;};
    for(const account of data.accounts){const selected=connectionInput(tracking,'Usa '+(account.label||account.email_masked||account.id)+' per il tracker · '+account.folder,draft.application_tracking.account_ids.includes(account.id),'checkbox');selected.onchange=()=>{const ids=new Set(draft.application_tracking.account_ids);if(selected.checked)ids.add(account.id);else ids.delete(account.id);draft.application_tracking.account_ids=[...ids];connectionsDirty=true;};}
    if(!data.accounts.length)tracking.append(node('p','Aggiungi prima una casella email qui sotto. Il collegamento Gmail in Codex/chat non collega la casella a Career Desk su GitHub Actions.'));
    const lookback=connectionInput(tracking,'Cerca candidature negli ultimi (giorni)',draft.application_tracking.lookback_days,'number');lookback.min='1';lookback.max='180';lookback.oninput=()=>{draft.application_tracking.lookback_days=Number(lookback.value);connectionsDirty=true;};tracking.append(node('p','Includi conferme e risposte nella cartella/etichetta scelta usando i filtri del provider. Le caselle e i messaggi non vengono modificati. Salva con “Salva checklist e monitor”.','muted'));form.append(tracking);
    const grid=node('div',undefined,'integration-grid');
    for(const row of data.checklist){
      const card=node('article',undefined,'detail-section');card.append(node('h3',row.label),node('p',connectionStatus(row.status)),node('p','Dati ricevuti: '+row.imported+' · ultimo import '+connectionDate(row.last_import_at)));
      const account=connectionInput(card,'Account '+row.label+' creato / accesso completato',row.user_account_confirmed,'checkbox'),alerts=connectionInput(card,'Alert '+row.label+' attivati sul sito',row.user_alerts_confirmed,'checkbox');
      card.append(node('p','Le spunte sono dichiarazioni personali; la verifica automatica richiede dati ricevuti.','muted'));
      account.onchange=()=>{draft.checks[row.id+':account']=account.checked;connectionsDirty=true;};alerts.onchange=()=>{draft.checks[row.id+':alerts']=alerts.checked;connectionsDirty=true;};
      const mailbox=connectionSelect(card,'Casella alert '+row.label,[['','Nessuna'],...data.accounts.map(a=>[a.id,a.label||a.email_masked||a.id])],row.account_id);mailbox.onchange=()=>{if(mailbox.value)draft.platform_accounts[row.id]=mailbox.value;else delete draft.platform_accounts[row.id];connectionsDirty=true;};
      card.append(node('p',(row.configured?'Fonte abilitata':'Fonte da abilitare in Integrazioni')+' · casella '+(row.account_verified?'verificata':'da verificare')));
      if(row.setup_url)card.append(safeLink(row.setup_url,'Apri sito / istruzioni '+row.label));
      grid.append(card);
    }
    const checklist=node('details',undefined,'connection-checklist');checklist.open=connectionsChecklistOpen??window.matchMedia('(min-width:760px)').matches;checklist.append(node('summary','Checklist collegamenti · '+data.checklist.filter(row=>row.verified).length+' di '+data.checklist.length+' verificati'),grid);checklist.ontoggle=()=>{connectionsChecklistOpen=checklist.open;};form.append(checklist);const save=node('button','Salva checklist e monitor','primary');save.type='submit';form.append(save);form.onsubmit=e=>{e.preventDefault();connectionAction({action:'settings',settings:draft,expected_revision:data.revision},message,save);};monitor.append(form);
    monitor.append(button('Controlla connessioni ora','refresh-cw',()=>connectionAction({action:'scan'},message)));
    monitor.append(button('Configura fonti e board API','plug',()=>{history.replaceState(null,'','#integrations');selectView('integrations');}));
    monitor.append(button('Preferenze newsletter','mail',()=>{history.replaceState(null,'','#newsletter');selectView('newsletter');}));
  }else{
    const list=node('ul');for(const row of data.checklist)list.append(node('li',row.label+' · '+connectionStatus(row.status)+' · '+row.imported+' ricevuti'));monitor.append(list);
  }
  const mail=section(root,'Caselle email');mail.append(node('p','Scegli una cartella o etichetta dedicata (predefinita CareerDesk/Alerts) e crea un filtro nel provider per gli alert di lavoro. Per aggiornare il tracker includi anche conferme di invio e risposte, poi seleziona la casella in “Tracker dalle email”. Lettura senza modificare i messaggi; i messaggi fuori dalla cartella scelta non vengono letti.'),node('p','Un account Gmail collegato soltanto a Codex/chat non è disponibile al monitor GitHub: serve una connessione diretta salvata in questa sezione.'));
  for(const account of data.accounts){
    const card=node('article',undefined,'detail-section');card.append(node('h3',account.label||account.email_masked||account.id),node('p',account.provider+' · '+connectionStatus(account.status)+' · cartella '+account.folder),node('p','Ultima verifica: '+connectionDate(account.verified_at)));
    if(editable){card.append(button('Verifica '+account.id,null,()=>connectionAction({action:'mail-test',id:account.id},message)),button('Scollega '+account.id,null,()=>connectionAction({action:'mail-disconnect',id:account.id},message)));}mail.append(card);
  }
  if(editable){
    const details=node('details');details.append(node('summary','Aggiungi o aggiorna una casella'));const form=node('form');form.id='mail-account-form';form.dataset.connectionForm='true';
    const provider=connectionSelect(form,'Provider',[['gmail','Gmail'],['microsoft','Outlook / Microsoft 365'],['icloud','iCloud'],['yahoo','Yahoo']],'gmail');
    const id=connectionInput(form,'Nome connessione (lettere minuscole, numeri e trattini)','gmail-personale');id.required=true;id.pattern='[a-z][a-z0-9_-]{0,47}';
    const email=connectionInput(form,'Indirizzo email','','email');email.required=true;
    const folder=connectionInput(form,'Cartella / etichetta alert','CareerDesk/Alerts');folder.required=true;
    const mode=connectionSelect(form,'Metodo accesso',[['imap','Password per app (Gmail, iCloud, Yahoo)'],['oauth','Login Google / Microsoft (OAuth)']],'imap');
    const password=connectionInput(form,'Password per app (vuota per conservare quella esistente)','','password');
    const advanced=node('details');advanced.append(node('summary','Impostazioni login OAuth'));
    const client=connectionInput(advanced,cloud?'Client ID della propria app Web':'Client ID della propria app desktop'),secret=connectionInput(advanced,cloud?'Client secret Google':'Client secret Google, se richiesto','','password');
    advanced.append(node('p',(cloud?'Per Google registra una propria app Web con client secret e callback pubblica. Per Microsoft registra una app public client e abilita il flusso per dispositivi; il client secret non serve. ':'OAuth locale richiede una propria registrazione desktop Google / Microsoft. ')+'Consenso in sola lettura alla casella; Career Desk legge solo la cartella scelta. Non viene richiesto il permesso di inviare email.'),safeLink(cloud?'https://developers.google.com/identity/protocols/oauth2/web-server':'https://developers.google.com/identity/protocols/oauth2/native-app',cloud?'Configura app Web Google':'Crea client desktop Google'),safeLink(cloud?'https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code':'https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration',cloud?'Configura accesso Microsoft con codice dispositivo':'Configura app desktop Microsoft'),node('p',(cloud?'Callback Google da registrare: ':'Callback da registrare: ')+data.oauth_redirect));form.append(advanced);
    const help=node('p');function method(){if(provider.value==='microsoft')mode.value='oauth';const oauth=mode.value==='oauth',device=cloud&&provider.value==='microsoft';password.disabled=oauth;advanced.open=oauth;client.required=oauth;client.parentElement.firstChild.textContent=cloud?(device?'Client ID della propria app Microsoft public client':'Client ID della propria app Web'):'Client ID della propria app desktop';client.setAttribute('aria-label',client.parentElement.firstChild.textContent);secret.required=cloud&&oauth&&!device;secret.disabled=device;if(device)secret.value='';help.replaceChildren(oauth?node('span',device?'Salva, apri il collegamento Microsoft e inserisci il codice dispositivo mostrato. Se il consenso richiede più tempo, usa Verifica nella scheda dell’account.':'Salva e avvia il login. Il provider può chiedere consenso o autorizzazione amministrativa.'):safeLink(provider.value==='gmail'?'https://support.google.com/accounts/answer/185833':provider.value==='icloud'?'https://support.apple.com/102654':'https://help.yahoo.com/kb/SLN15241.html','Genera una password per app dal provider'));}provider.onchange=method;mode.onchange=method;form.append(help);method();
    const save=node('button','Salva e collega casella','primary');save.type='submit';form.append(save);form.onsubmit=e=>{e.preventDefault();const account={id:id.value,provider:provider.value,email:email.value,folder:folder.value,auth_mode:mode.value,enabled:true,password:password.value,client_id:client.value,client_secret:secret.value};password.value='';secret.value='';connectionAction({action:mode.value==='oauth'?'oauth-start':'mail-save',account},message,save);};details.append(form);mail.append(details);
    const services=section(root,'Scouting e invio Career Brief');services.append(node('p',(cloud?'Le credenziali configurate qui valgono per il monitor GitHub Actions. ':'Le credenziali configurate qui valgono sul PC. ')+'Il test SMTP verifica l’accesso senza inviare messaggi. L’invio continua a seguire le preferenze e i controlli della newsletter.'));
    for(const [service,title,fields]of [['smtp','Invio Gmail / SMTP',[['sender','Mittente Gmail','email'],['recipient','Destinatario Career Brief','email'],['password','Password per app Gmail','password']]],['adzuna','Adzuna API',[['app_id','Adzuna App ID','text'],['app_key','Adzuna App Key','password']]],...(cloud?[]:[['github','GitHub Career Desk',[['token','Token GitHub per i due repository Career Desk','password']]]])]){
      const card=node('details');card.append(node('summary',title+' · '+connectionStatus(data.services[service]?.status)));const form=node('form'),inputs={};form.dataset.connectionForm='true';for(const [key,label,type]of fields){inputs[key]=connectionInput(form,label,'',type);inputs[key].required=type!=='password';}
      if(service==='github')form.append(safeLink('https://github.com/settings/personal-access-tokens/new','Crea token GitHub: seleziona i due repository, Contents in lettura/scrittura'));const save=node('button','Salva e verifica '+title);save.type='submit';form.append(save);form.onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value]));for(const input of Object.values(inputs))if(input.type==='password')input.value='';connectionAction({action:'service-save',service,values},message,save);};card.append(form,button('Rimuovi credenziali '+(cloud?'cloud ':'locali ')+title,null,()=>connectionAction({action:'service-delete',service},message)));services.append(card);
    }
    if(!cloud){const sync=section(root,'GitHub e aggiornamento online');sync.append(node('p','Usa il collegamento GitHub già configurato sul PC. Password email e token OAuth restano nel vault locale e non vengono pubblicati. La sincronizzazione automatica aggiorna gli asset e i dati cifrati.'),button('Pubblica aggiornamento ora','cloud',async()=>{try{const result=await localAPI('publish',{});toast(result.message);await loadConnections(true);}catch(e){message.textContent=e.message;}}),button('Sincronizzazione dal browser','settings',()=>$('sync-dialog').showModal()));}
  }
  if(editable)root.append(button('Ricarica stato connessioni','refresh-cw',()=>{connectionsDirty=false;loadConnections(true);}));icons();
}
document.addEventListener('career-ready',()=>{setInterval(()=>{if(model.data&&model.view==='connections'&&canConfigure()&&!connectionsDirty&&!document.querySelector('#connections-panel input:focus, #connections-panel select:focus'))loadConnections();},15000);});
