'use strict';
let connectionsData=null,connectionsLoad=null,connectionsDirty=false;
const connectionLabels={connected:'Accesso verificato',needs_authorization:'Consenso da completare',error:'Da verificare',disabled:'Disattivato',verified:'Verificato',ready:'Pronto da verificare',todo:'Da fare',missing:'Da configurare',environment:'Credenziali ambiente · da verificare',vault_unavailable:'Archivio credenziali non disponibile'};
const connectionDate=value=>value?new Date(value).toLocaleString('it-IT'):'mai';
function connectionStatus(value){return connectionLabels[value]||value||'Da configurare';}
function connectionInput(parent,label,value='',type='text'){
  const input=integrationField(parent,label,value,type);input.autocomplete=type==='password'?'new-password':'off';return input;
}
function connectionSelect(parent,label,options,value){const field=node('label',label),select=node('select');select.setAttribute('aria-label',label);for(const [id,text]of options)select.add(new Option(text,id));select.value=value??'';field.append(select);parent.append(field);return select;}
async function loadConnections(force=false){
  if(!model.local)return;
  if(connectionsDirty&&!force)return;
  if(connectionsLoad)return connectionsLoad;
  const session=model.session;
  connectionsLoad=(async()=>{try{const data=await localAPI('connections');if(session!==model.session||!model.data||connectionsDirty&&!force)return;connectionsData=data;connectionsDirty=false;if(model.view==='connections')renderConnections();}catch(e){if(session===model.session&&model.data){const root=$('connections-panel');root.append(node('p','Impossibile aggiornare le connessioni. '+e.message,'form-error'));}}finally{connectionsLoad=null;}})();return connectionsLoad;
}
async function connectionAction(body,message,trigger){
  const session=model.session;if(trigger)trigger.disabled=true;message.textContent='Operazione in corso…';
  try{const result=await localAPI('connections',body);if(session!==model.session||!model.data)return;
    if(result.authorization_url){message.replaceChildren(node('span','Completa il consenso nel browser. '),safeLink(result.authorization_url,'Apri accesso sicuro'));window.open(result.authorization_url,'_blank','noopener,noreferrer');}
    else{connectionsData=null;connectionsDirty=false;await loadConnections(true);toast(result.message||'Configurazione aggiornata.');}
  }catch(e){if(session===model.session&&model.data)message.textContent=e.message;}finally{if(trigger)trigger.disabled=false;}
}
function renderConnections(){
  const root=$('connections-panel');root.replaceChildren();root.oninput=()=>{connectionsDirty=true;};root.onchange=()=>{connectionsDirty=true;};const data=model.local?connectionsData:model.data.connections;
  root.append(node('p',model.local?'Collega gli account, scegli le fonti e controlla le verifiche. Le credenziali sono protette dall’account Windows di questo PC.':'Configurazione e credenziali vengono gestite dal PC che esegue Career Desk. Qui trovi l’ultimo stato esportato.','notice'));
  if(!model.local){const link=node('a','Apri configurazione sul PC');link.href='http://127.0.0.1:8765/#connections';link.target='_blank';link.rel='noopener noreferrer';root.append(link,node('p','Apri questo collegamento sul PC con Career Desk avviato. Sul telefono mostra lo stato sincronizzato; il monitor richiede il PC acceso.'));}
  if(!data){root.append(node('p',model.local?'Caricamento configurazione…':'Aggiorna Career Desk dal PC per visualizzare la checklist.'));if(model.local&&!connectionsLoad)loadConnections();return;}
  const message=node('p');message.setAttribute('role','status');root.append(message);
  const monitor=section(root,'Monitor connessioni');
  monitor.append(node('p',(!data.settings.monitor.enabled?'Monitor automatico disattivato':data.running?'Monitor attivo sul PC':'Monitor non rilevato di recente')+' · ultimo controllo '+connectionDate(data.monitor?.last_scan_at)),node('p','Ultimo successo: '+connectionDate(data.monitor?.last_success_at)+' · offerte importate nell’ultimo ciclo: '+(data.monitor?.imported??0)));
  if(data.monitor?.last_error)monitor.append(node('p',data.monitor.last_error,'form-error'));
  monitor.append(node('p','Pubblicazione: '+(data.monitor?.publish_status||'mai')+' · '+connectionDate(data.monitor?.last_published_at)));
  const draft=structuredClone(data.settings);
  if(model.local){
    const form=node('form');form.id='connection-settings-form';
    const enabled=connectionInput(form,'Attiva il monitor automatico',draft.monitor.enabled,'checkbox'),interval=connectionInput(form,'Controlla ogni (minuti)',draft.monitor.interval_minutes,'number'),publish=connectionInput(form,'Pubblica automaticamente stato e dati cifrati',draft.monitor.auto_publish,'checkbox');interval.min='5';interval.max='1440';
    enabled.onchange=()=>{draft.monitor.enabled=enabled.checked;connectionsDirty=true;};interval.oninput=()=>{draft.monitor.interval_minutes=Number(interval.value);connectionsDirty=true;};publish.onchange=()=>{draft.monitor.auto_publish=publish.checked;connectionsDirty=true;};
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
    form.append(grid);const save=node('button','Salva checklist e monitor','primary');save.type='submit';form.append(save);form.onsubmit=e=>{e.preventDefault();connectionAction({action:'settings',settings:draft,expected_revision:data.revision},message,save);};monitor.append(form);
    monitor.append(button('Controlla connessioni ora','refresh-cw',()=>connectionAction({action:'scan'},message)));
    monitor.append(button('Configura fonti e board API','plug',()=>{history.replaceState(null,'','#integrations');selectView('integrations');}));
    monitor.append(button('Preferenze newsletter','mail',()=>{history.replaceState(null,'','#newsletter');selectView('newsletter');}));
  }else{
    const list=node('ul');for(const row of data.checklist)list.append(node('li',row.label+' · '+connectionStatus(row.status)+' · '+row.imported+' ricevuti'));monitor.append(list);
  }
  const mail=section(root,'Caselle email');mail.append(node('p','Scegli una cartella o etichetta dedicata (predefinita CareerDesk/Alerts) e crea un filtro nel provider per gli alert di lavoro. Lettura senza modificare i messaggi; massimo 25 messaggi per ciclo, ultimi 14 giorni. Conferme di candidatura escluse.'));
  for(const account of data.accounts){
    const card=node('article',undefined,'detail-section');card.append(node('h3',account.label||account.email_masked||account.id),node('p',account.provider+' · '+connectionStatus(account.status)+' · cartella '+account.folder),node('p','Ultima verifica: '+connectionDate(account.verified_at)));
    if(model.local){card.append(button('Verifica '+account.id,null,()=>connectionAction({action:'mail-test',id:account.id},message)),button('Scollega '+account.id,null,()=>connectionAction({action:'mail-disconnect',id:account.id},message)));}mail.append(card);
  }
  if(model.local){
    const details=node('details');details.append(node('summary','Aggiungi o aggiorna una casella'));const form=node('form');form.id='mail-account-form';
    const provider=connectionSelect(form,'Provider',[['gmail','Gmail'],['microsoft','Outlook / Microsoft 365'],['icloud','iCloud'],['yahoo','Yahoo']],'gmail');
    const id=connectionInput(form,'Nome connessione (lettere minuscole, numeri e trattini)','gmail-personale');id.required=true;id.pattern='[a-z0-9_-]{1,60}';
    const email=connectionInput(form,'Indirizzo email','','email');email.required=true;
    const folder=connectionInput(form,'Cartella / etichetta alert','CareerDesk/Alerts');folder.required=true;
    const mode=connectionSelect(form,'Metodo accesso',[['imap','Password per app (Gmail, iCloud, Yahoo)'],['oauth','Login Google / Microsoft (OAuth)']],'imap');
    const password=connectionInput(form,'Password per app (vuota per conservare quella esistente)','','password');
    const advanced=node('details');advanced.append(node('summary','Impostazioni login OAuth'));
    const client=connectionInput(advanced,'Client ID della propria app desktop'),secret=connectionInput(advanced,'Client secret Google, se richiesto','','password');
    advanced.append(node('p','OAuth richiede una propria registrazione desktop Google / Microsoft. Consenso in sola lettura alla casella; Career Desk legge solo la cartella scelta. Non viene richiesto il permesso di inviare email.'),safeLink('https://developers.google.com/identity/protocols/oauth2/native-app','Crea client desktop Google'),safeLink('https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration','Configura app desktop Microsoft'),node('p','Callback da registrare: '+data.oauth_redirect));form.append(advanced);
    const help=node('p');function method(){if(provider.value==='microsoft')mode.value='oauth';const oauth=mode.value==='oauth';password.disabled=oauth;advanced.open=oauth;client.required=oauth;help.replaceChildren(oauth?node('span','Salva e avvia il login. Il provider può chiedere consenso o autorizzazione amministrativa.'):safeLink(provider.value==='gmail'?'https://support.google.com/accounts/answer/185833':provider.value==='icloud'?'https://support.apple.com/102654':'https://help.yahoo.com/kb/SLN15241.html','Genera una password per app dal provider'));}provider.onchange=method;mode.onchange=method;form.append(help);method();
    const save=node('button','Salva e collega casella','primary');save.type='submit';form.append(save);form.onsubmit=e=>{e.preventDefault();const account={id:id.value,provider:provider.value,email:email.value,folder:folder.value,auth_mode:mode.value,enabled:true,password:password.value,client_id:client.value,client_secret:secret.value};password.value='';secret.value='';connectionAction({action:mode.value==='oauth'?'oauth-start':'mail-save',account},message,save);};details.append(form);mail.append(details);
    const services=section(root,'Scouting e invio Career Brief');services.append(node('p','Le credenziali configurate qui valgono sul PC. Il test SMTP verifica l’accesso senza inviare messaggi. L’invio continua a seguire le preferenze e i controlli della newsletter.'));
    for(const [service,title,fields]of [['smtp','Invio Gmail / SMTP',[['sender','Mittente Gmail','email'],['recipient','Destinatario Career Brief','email'],['password','Password per app Gmail','password']]],['adzuna','Adzuna API',[['app_id','Adzuna App ID','text'],['app_key','Adzuna App Key','password']]],['github','GitHub Career Desk',[['token','Token GitHub per i due repository Career Desk','password']]]]){
      const card=node('details');card.append(node('summary',title+' · '+connectionStatus(data.services[service]?.status)));const form=node('form'),inputs={};for(const [key,label,type]of fields){inputs[key]=connectionInput(form,label,'',type);inputs[key].required=type!=='password';}
      if(service==='github')form.append(safeLink('https://github.com/settings/personal-access-tokens/new','Crea token GitHub: seleziona i due repository, Contents in lettura/scrittura'));const save=node('button','Salva e verifica '+title);save.type='submit';form.append(save);form.onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value]));for(const input of Object.values(inputs))if(input.type==='password')input.value='';connectionAction({action:'service-save',service,values},message,save);};card.append(form,button('Rimuovi credenziali locali '+title,null,()=>connectionAction({action:'service-delete',service},message)));services.append(card);
    }
    const sync=section(root,'GitHub e aggiornamento online');sync.append(node('p','Usa il collegamento GitHub già configurato sul PC. Password email e token OAuth restano nel vault locale e non vengono pubblicati. La sincronizzazione automatica aggiorna gli asset e i dati cifrati.'),button('Pubblica aggiornamento ora','cloud',async()=>{try{const result=await localAPI('publish',{});toast(result.message);await loadConnections(true);}catch(e){message.textContent=e.message;}}),button('Sincronizzazione dal browser','settings',()=>$('sync-dialog').showModal()));
  }
  if(model.local)root.append(button('Ricarica stato connessioni','refresh-cw',()=>{connectionsDirty=false;loadConnections(true);}));icons();
}
document.addEventListener('career-ready',()=>{setInterval(()=>{if(model.data&&model.view==='connections'&&model.local&&!connectionsDirty&&!document.querySelector('#connections-panel input:focus, #connections-panel select:focus'))loadConnections();},15000);});
