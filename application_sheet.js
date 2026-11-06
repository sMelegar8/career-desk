'use strict';
// Application tracker as a colour-coded spreadsheet: stage colours, per-column filters, sorting,
// optional columns, inline editing and CSV export. Edits go through setApplicationRow, so the
// encrypted state and sync stay the single source (redesign requested 4 Nov 2026).
const CareerSheet=(()=>{
  const view={sort:'submitted_on',dir:-1,query:'',group:'',all:false,filters:{},hidden:null};
  const sources={job:'Annuncio',company:'Azienda / recruiter',agent:'AI Job Agent',archived:'Archivio'};
  const dates=['submitted_on','deadline','follow_up','interview_on'];
  // Stage groups drive colours and the summary chips.
  const groups=[
    ['open','Da preparare',['planned','interested','drafted']],
    ['applied','Inviate',['applied']],
    ['interview','Colloquio',['interview']],
    ['offer','Offerta',['offer','hired']],
    ['negative','Esito negativo',['rejected']],
    ['closed','Chiuse',['withdrawn','no_response','offer_declined']],
  ];
  const groupOf=stage=>(groups.find(g=>g[2].includes(stage))||groups[0])[0];
  // [key, heading, kind, width, visible by default]; kind: text/date editable, ro read only.
  const columns=[
    ['favorite','★','fav',52,true],['company','Azienda','ro',170,true],['role','Ruolo','ro',230,true],['place','Sede','ro',140,true],
    ['stage','Fase','stage',150,true],['submitted_on','Invio','date',130,true],['follow_up','Follow-up','date',130,true],
    ['channel','Canale','text',150,true],['recruiter','Recruiter / contatto','text',170,true],['outcome','Esito','text',190,true],
    ['note','Note','text',240,true],['link','Annuncio','link',80,true],
    ['source','Fonte','ro',110,false],['deadline','Scadenza','date',130,false],['interview_on','Colloquio','date',130,false],
    ['cv_version','Versione CV','text',170,false],['score','Allin. /100','ro',90,false],['updated','Aggiornata','ro',110,false]
  ];
  const STORE='career-sheet-columns-v1';
  function hidden(){
    if(view.hidden)return view.hidden;
    let saved=null;try{saved=JSON.parse(localStorage.getItem(STORE)||'null');}catch{}
    view.hidden=new Set(Array.isArray(saved)?saved:columns.filter(c=>!c[4]).map(c=>c[0]));
    return view.hidden;
  }
  function saveHidden(){try{localStorage.setItem(STORE,JSON.stringify([...hidden()]));}catch{}}
  const shown=()=>columns.filter(c=>!hidden().has(c[0]));
  function value(row,key){
    const state=applicationState(row);
    switch(key){
      case'favorite':return state.favorite===true?'★':'';
      case'company':return row.company||row.name||'';
      case'role':return cleanTitle(row.title||row.role||'');
      case'place':return String(row.location||row.place||'').replace(/^None\s*/,'').trim();
      case'source':return (row.sources||[row.kind]).map(s=>sources[s]||s).join(' · ');
      case'stage':return applicationStage(row);
      case'score':{const s=alignmentScore(row);return s===null?'':s;}
      case'link':return row.link||row.url||'';
      case'updated':return (state.updatedAt||'').slice(0,10);
      default:return state[key]||'';
    }
  }
  function display(row,key){const v=value(row,key);if(key==='stage')return stages[v]||v;if((dates.includes(key)||key==='updated')&&v)return new Date(v+'T00:00:00').toLocaleDateString('it-IT');return String(v);}
  // LinkedIn cards repeat the title after a screen-reader badge: 'Role (offerta di lavoro verificata) Role'.
  function cleanTitle(title){
    const parts=String(title).split(/\s*\((?:offerta di lavoro verificata|verified job)\)\s*/i).map(s=>s.trim()).filter(Boolean);
    return parts.length===2&&parts[0]===parts[1]?parts[0]:parts.join(' ');
  }
  const daysTo=day=>day?Math.round((Date.parse(day+'T00:00:00')-Date.parse(todayISO()+'T00:00:00'))/864e5):null;
  function base(){return applicationRows().filter(r=>r.kind!=='document'&&(view.all||tracked(r)));}
  function matches(row,skip){
    const q=view.query.toLocaleLowerCase('it');
    if(skip!=='group'&&view.group&&(view.group==='due'?!isFollowUpDue(row):view.group==='favorite'?applicationState(row).favorite!==true:groupOf(applicationStage(row))!==view.group))return false;
    for(const [key,needle]of Object.entries(view.filters)){
      if(!needle)continue;
      if(key==='stage'){if(applicationStage(row)!==needle)return false;continue;}
      if(key==='favorite'){if((needle==='yes')!==(applicationState(row).favorite===true))return false;continue;}
      if(!display(row,key).toLocaleLowerCase('it').includes(needle.toLocaleLowerCase('it')))return false;
    }
    return !q||columns.some(([key])=>display(row,key).toLocaleLowerCase('it').includes(q));
  }
  function rows(){
    const order=Object.keys(stages);
    return base().filter(r=>matches(r)).sort((a,b)=>{
      let x=value(a,view.sort),y=value(b,view.sort);
      if(view.sort==='stage'){x=order.indexOf(x);y=order.indexOf(y);}
      // Empty cells always sink to the bottom, whatever the direction.
      if(x===''||y==='')return (x==='')-(y==='');
      return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'it',{sensitivity:'base'}))*view.dir;
    });
  }
  function cell(row,key,kind){
    const td=node('td');td.dataset.key=key;
    if(kind==='stage'){
      const select=stageSelect(row);select.className='stage-pill stage-'+groupOf(applicationStage(row));
      select.addEventListener('change',()=>render());td.append(select);return td;
    }
    if(kind==='link'){const url=value(row,'link');if(url)td.append(safeLink(url,'Apri'));return td;}
    if(kind==='fav'){td.className='sheet-fav';td.append(favoriteButton(row,()=>render()));return td;}
    if(kind==='ro'){td.textContent=display(row,key);td.title=td.textContent;return td;}
    const input=node('input');input.type=kind==='date'?'date':'text';input.value=value(row,key);input.maxLength=key==='note'?8000:512;
    input.title=input.value;input.setAttribute('aria-label',(columns.find(c=>c[0]===key)[1])+' – '+(row.company||row.name||''));
    input.addEventListener('change',()=>{setApplicationRow(row,{[key]:input.value});input.title=input.value;flag(td,row,key);if(key==='follow_up')markRow(td.parentElement,row);});
    input.addEventListener('keydown',moveFocus);td.append(input);flag(td,row,key);return td;
  }
  // Cell flags: overdue follow-up (amber), deadline within 3 days or past (red), upcoming interview (green).
  function flag(td,row,key){
    const days=daysTo(value(row,key)),stage=applicationStage(row),open=['applied','interview'].includes(stage);
    td.classList.toggle('cell-overdue',key==='follow_up'&&days!==null&&days<=0&&open);
    td.classList.toggle('cell-urgent',key==='deadline'&&days!==null&&days<=3&&!['rejected','withdrawn','no_response','offer_declined'].includes(stage));
    td.classList.toggle('cell-soon',key==='interview_on'&&days!==null&&days>=0&&days<=7);
  }
  function markRow(tr,row){tr.className='stage-row stage-'+groupOf(applicationStage(row))+(isFollowUpDue(row)?' sheet-due':'');}
  // Spreadsheet keys: Enter / arrows move vertically between text cells of the same column.
  function moveFocus(event){
    if(!['Enter','ArrowDown','ArrowUp'].includes(event.key)||event.target.type!=='text')return;
    const td=event.target.closest('td'),tr=td.parentElement,index=[...tr.children].indexOf(td);
    const next=(event.key==='ArrowUp'?tr.previousElementSibling:tr.nextElementSibling)?.children[index]?.querySelector('input');
    if(next){event.preventDefault();next.focus();next.select();}
  }
  function csv(list){
    // Prefix spreadsheet formula triggers so exported text cannot run as a formula in Excel.
    const quote=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    const lines=[columns.map(c=>quote(c[1])).join(';')];
    for(const row of list)lines.push(columns.map(([key])=>quote(key==='link'?value(row,key):key==='favorite'?(value(row,key)?'sì':''):display(row,key))).join(';'));
    return '﻿'+lines.join('\r\n');
  }
  function keepFocus(selector,fn){
    const active=document.activeElement,pos=active?.selectionStart;fn();
    const again=root.querySelector(selector);if(again){again.focus();try{again.setSelectionRange(pos,pos);}catch{}}
  }
  function summary(){
    const bar=node('div',undefined,'sheet-summary'),all=base().filter(r=>matches(r,'group'));
    const chips=[['','Tutte',all.length],['favorite','★ Preferiti',all.filter(r=>applicationState(r).favorite===true).length],...groups.map(([id,label,list])=>[id,label,all.filter(r=>list.includes(applicationStage(r))).length]),['due','Da sollecitare',all.filter(isFollowUpDue).length]];
    for(const [id,label,count]of chips){
      const chip=button('',null,()=>{view.group=view.group===id?'':id;render();},'sheet-chip stage-'+(id||'all'));
      chip.append(node('strong',String(count)),node('span',label));chip.setAttribute('aria-pressed',String(view.group===id));bar.append(chip);
    }
    return bar;
  }
  function columnMenu(){
    const menu=node('details',undefined,'sheet-columns');menu.append(node('summary','Colonne'));
    const box=node('div',undefined,'sheet-columns-list');
    for(const [key,label]of columns){
      const l=node('label'),c=node('input');c.type='checkbox';c.checked=!hidden().has(key);
      c.onchange=()=>{if(c.checked)hidden().delete(key);else hidden().add(key);saveHidden();render();root.querySelector('.sheet-columns').open=true;};
      l.append(c,document.createTextNode(' '+label));box.append(l);
    }
    menu.append(box);return menu;
  }
  function filterCell(key,kind){
    const th=node('th',undefined,'sheet-filter');
    if(kind==='link')return th;
    if(kind==='fav'){
      const select=node('select');select.setAttribute('aria-label','Filtra i preferiti');
      for(const [v,t]of [['','Tutti'],['yes','★'],['no','Altri']]){const o=node('option',t);o.value=v;select.append(o);}
      select.value=view.filters.favorite||'';select.onchange=()=>{view.filters.favorite=select.value;render();};th.append(select);return th;
    }
    if(kind==='stage'){
      const select=node('select');select.setAttribute('aria-label','Filtra la colonna Fase');
      for(const [v,t]of [['','Tutte'],...Object.entries(stages)]){const o=node('option',t);o.value=v;select.append(o);}
      select.value=view.filters.stage||'';select.onchange=()=>{view.filters.stage=select.value;render();};th.append(select);return th;
    }
    const input=node('input');input.type='search';input.placeholder='filtra';input.value=view.filters[key]||'';
    input.dataset.filter=key;input.setAttribute('aria-label','Filtra la colonna '+columns.find(c=>c[0]===key)[1]);
    input.oninput=()=>keepFocus(`input[data-filter="${key}"]`,()=>{view.filters[key]=input.value;render();});
    th.append(input);return th;
  }
  let root=null;
  function render(target){
    root=target||root;if(!root)return;const list=rows(),cols=shown(),old=root.querySelector('.sheet-wrap'),scroll=old?[old.scrollLeft,old.scrollTop]:[0,0];
    root.replaceChildren(summary());
    const bar=node('div',undefined,'sheet-toolbar');
    const search=node('input');search.type='search';search.placeholder='Cerca in tutte le colonne';search.value=view.query;search.setAttribute('aria-label','Cerca nel tracker');search.className='sheet-search';
    search.oninput=()=>keepFocus('.sheet-search',()=>{view.query=search.value;render();});
    const all=node('label',undefined,'sheet-toggle'),box=node('input');box.type='checkbox';box.checked=view.all;box.onchange=()=>{view.all=box.checked;render();};all.append(box,document.createTextNode(' Includi annunci non tracciati'));
    const reset=button('Azzera filtri','x',()=>{view.query='';view.group='';view.filters={};render();});
    reset.hidden=!(view.query||view.group||Object.values(view.filters).some(Boolean));
    const exp=button('Esporta CSV (Excel)','download',()=>saveBlob(csv(list),`candidature_${todayISO()}.csv`,'text/csv;charset=utf-8'));
    bar.append(search,columnMenu(),all,reset,exp,node('span',list.length===1?'1 riga':`${list.length} righe`,'muted'));root.append(bar);
    const wrap=node('div',undefined,'sheet-wrap'),table=node('table',undefined,'sheet'),head=node('tr'),filters=node('tr');
    for(const [key,label,kind,width]of cols){
      const th=node('th');th.style.minWidth=width+'px';th.setAttribute('aria-sort',view.sort===key?(view.dir>0?'ascending':'descending'):'none');
      const b=node('button',label+(view.sort===key?(view.dir>0?' ▲':' ▼'):''));b.type='button';b.title='Ordina per '+label;
      b.onclick=()=>{if(view.sort===key)view.dir=-view.dir;else{view.sort=key;view.dir=['updated','score','submitted_on','follow_up'].includes(key)?-1:1;}render();};
      th.append(b);head.append(th);filters.append(filterCell(key,kind));
    }
    const thead=node('thead');thead.append(head,filters);const tbody=node('tbody');
    for(const row of list){
      const tr=node('tr');for(const [key,,kind]of cols)tr.append(cell(row,key,kind));
      const first=tr.querySelector('td:not(.sheet-fav)')||tr.firstChild;first.classList.add('sheet-open');first.tabIndex=0;first.title='Apri scheda completa';first.onclick=()=>showDetail(row);first.onkeydown=e=>{if(e.key==='Enter')showDetail(row);};
      markRow(tr,row);tbody.append(tr);
    }
    table.append(thead,tbody);wrap.append(table);root.append(wrap);[wrap.scrollLeft,wrap.scrollTop]=scroll;
    if(!list.length)root.append(node('p','Nessuna candidatura con questi filtri.','muted'));
    const legend=node('p',undefined,'sheet-legend muted');
    for(const [id,label]of groups){const s=node('span',label,'legend-dot stage-'+id);legend.append(s);}
    legend.append(node('span','Follow-up scaduto','legend-dot cell-overdue'),node('span','Scadenza entro 3 giorni','legend-dot cell-urgent'));
    root.append(legend,node('p','Clic sull’azienda per la scheda completa; clic sull’intestazione per ordinare; le modifiche si salvano cifrate.','muted sheet-help'));
    icons();
  }
  return {render,csv,rows,view,groupOf};
})();
