'use strict';
window.AgentSaved = (() => {
  const repository = 'sMelegar8/Auto-LinkdIn-v2.0';
  const base = 'https://api.github.com/repos/' + repository;
  let token = '';
  const local = () => location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  const decode = text => Uint8Array.from(atob(text.replace(/\s/g,'')), c => c.charCodeAt(0));
  async function request(path) {
    const response = await fetch(base + path, {cache:'no-store', redirect:'error', headers:{Authorization:'Bearer '+token, Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    if (!response.ok) throw new Error('Accesso privato non disponibile. Usa un token con Contents: read su Auto-LinkdIn-v2.0.');
    return response.json();
  }
  async function bytes(path) {
    let entry = await request('/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=main');
    if (!(entry.size > 0 && entry.size <= 8000000)) throw new Error('Dimensione file non valida');
    if (entry.encoding !== 'base64') {
      if (!/^[0-9a-f]{40,64}$/.test(entry.sha)) throw new Error('Riferimento file non valido');
      entry = await request('/git/blobs/' + entry.sha);
    }
    const data = decode(entry.content);
    if (data.length > 8000000) throw new Error('File troppo grande');
    return data;
  }
  async function load(value) {
    if (value !== undefined) token = value;
    let index;
    if (local()) {
      const r=await fetch('/api/agent-saved',{cache:'no-store',headers:{'X-Desk-Client':'1'}});
      if(!r.ok)throw new Error('Accesso GitHub locale da verificare o server da riavviare');
      index=await r.json();
    } else {
      if (!token) throw new Error('Collega il repository privato per vedere i documenti salvati.');
      const repo = await request('');
      if (repo.private !== true || repo.full_name.toLowerCase() !== repository.toLowerCase()) throw new Error('Repository privato richiesto');
      index=JSON.parse(new TextDecoder().decode(await bytes('data/agent_saved/index.json')));
    }
    if(index.version!==1||!Array.isArray(index.jobs))throw new Error('Indice privato non valido');
    if(index.jobs.some(row=>!row||row.kind!=='agent'||typeof row.job_id!=='string'||!row.files||typeof row.files!=='object'||Array.isArray(row.files)))throw new Error('Record privato non valido');
    return index.jobs;
  }
  async function file(row, kind) {
    const record=row.files[kind];
    if(!record||typeof record.name!=='string'||!record.name||record.name==='.'||record.name==='..')throw new Error('Nome file non valido');
    if(!record||!/^[A-Za-z0-9_-]{1,80}$/.test(row.job_id)||typeof record.name!=='string'||!record.name||record.name==='.'||record.name==='..'||/[\\/]/.test(record.name)||record.path!=='data/agent_saved/'+row.job_id+'/'+record.name)throw new Error('Percorso file non valido');
    let data;
    if(local()){
      const r=await fetch('/api/agent-file?id='+encodeURIComponent(row.job_id)+'&kind='+encodeURIComponent(kind),{cache:'no-store',headers:{'X-Desk-Client':'1'}});
      if(!r.ok)throw new Error('Documento non disponibile');
      data=decode((await r.json()).data);
    } else data=await bytes(record.path);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==record.sha256)throw new Error('Documento aggiornato: ricarica la raccolta');
    return data;
  }
  async function queueCV(job_id){
    if(!token)throw new Error('Collega il repository privato con un token Actions: write per accodare dal telefono.');
    const response=await fetch('https://api.github.com/repos/'+repository+'/actions/workflows/generate-application.yml/dispatches',{
      method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({ref:'main',inputs:{job_id:String(job_id)}})});
    if(!response.ok)throw new Error('Richiesta non accodata: verifica il permesso Actions: write sul repository privato.');
  }
  return {load,file,queueCV,lock(){token='';},available(){return local()||!!token;}};
})();
