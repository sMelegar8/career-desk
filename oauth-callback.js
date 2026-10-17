'use strict';
(()=>{
  const query=new URLSearchParams(location.search),message={type:'career-desk-oauth',state:query.get('state')||'',code:query.get('code')||'',error:query.get('error')||''};
  history.replaceState(null,'',location.pathname);
  if(!message.state||(!message.code&&!message.error)){document.getElementById('oauth-result').textContent='Autorizzazione assente o non valida. Avvia un nuovo login da Connessioni.';return;}
  if(window.opener)window.opener.postMessage(message,location.origin);
  if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('career-desk-oauth');channel.postMessage(message);setTimeout(()=>channel.close(),1000);}
  document.getElementById('oauth-result').textContent=message.error?'Autorizzazione negata: torna a Career Desk e riprova.':'Autorizzazione ricevuta. Torna a Career Desk mentre GitHub verifica il collegamento.';
})();
