'use strict';
// Spreadsheet view of tracked applications: sortable, filterable, inline-editable, CSV export.
// Edits go through setApplicationRow, so the encrypted state and sync stay the single source.
const CareerSheet=(()=>{
  const view={sort:'updated',dir:-1,query:'',stage:'',all:false};
  const sources={job:'Annuncio',company:'Azienda / recruiter',agent:'AI Job Agent',archived:'Archivio'};
  const dates=['submitted_on','deadline','follow_up','interview_on'];
  // [key, heading, kind, width]; kind: text = editable text, date = editable date, ro = read only.
  const columns=[
    ['company','Azienda','ro',170],['role','Ruolo','ro',220],['place','Sede','ro',130],['source','Fonte','ro',110],
    ['stage','Fase','stage',150],['submitted_on','Data invio','date',130],['deadline','Scadenza','date',130],
    ['follow_up','Follow-up','date',130],['interview_on','Colloquio','date',130],['recruiter','Recruiter / contatto','text',170],
    ['channel','Canale','text',130],['cv_version','Versione CV','text',170],['outcome','Esito','text',160],
    ['score','Allin. /100','ro',90],['note','Note','text',240],['link','Annuncio','link',90],['updated','Aggiornata','ro',110]
  ];
  function value(row,key){
    const state=applicationState(row);
    switch(key){
      case'company':return row.company||row.name||'';
      case'role':return row.title||row.role||'';
      case'place':return row.location||row.place||'';
      case'source':return (row.sources||[row.kind]).map(s=>sources[s]||s).join(' · ');
      case'stage':return applicationStage(row);
      case'score':{const s=alignmentScore(row);return s===null?'':s;}
      case'link':return row.link||row.url||'';
      case'updated':return (state.updatedAt||'').slice(0,10);
      default:return state[key]||'';
    }
  }
  function display(row,key){const v=value(row,key);if(key==='stage')return stages[v]||v;if((dates.includes(key)||key==='updated')&&v)return new Date(v+'T00:00:00').toLocaleDateString('it-IT');return String(v);}
  function rows(){
    const q=view.query.toLocaleLowerCase('it');
    const list=applicationRows().filter(r=>r.kind!=='document'&&(view.all||tracked(r))).filter(r=>{
      if(view.stage==='due'?!isFollowUpDue(r):view.stage&&applicationStage(r)!==view.stage)return false;
      return !q||columns.some(([key])=>display(r,key).toLocaleLowerCase('it').includes(q));
    });
    const order=Object.keys(stages);
    return list.sort((a,b)=>{
      let x=value(a,view.sort),y=value(b,view.sort);
      if(view.sort==='stage'){x=order.indexOf(x);y=order.indexOf(y);}
      // Empty cells always sink to the bottom, whatever the direction.
      if(x===''||y==='')return (x==='')-(y==='');
      return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'it',{sensitivity:'base'}))*view.dir;
    });
  }
  function cell(row,key,kind){
    const td=node('td');td.dataset.key=key;
    if(kind==='stage'){const select=stageSelect(row);select.addEventListener('change',()=>render());td.append(select);return td;}
    if(kind==='link'){const url=value(row,'link');if(url)td.append(safeLink(url,'Apri'));return td;}
    if(kind==='ro'){td.textContent=display(row,key);td.title=td.textContent;return td;}
    const input=node('input');input.type=kind==='date'?'date':'text';input.value=value(row,key);input.maxLength=key==='note'?8000:512;
    input.setAttribute('aria-label',(columns.find(c=>c[0]===key)[1])+' – '+(row.company||row.name||''));
    input.addEventListener('change',()=>{setApplicationRow(row,{[key]:input.value});if(key==='follow_up')markDue(td.parentElement,row);});
    input.addEventListener('keydown',moveFocus);td.append(input);return td;
  }
  function markDue(tr,row){tr.classList.toggle('sheet-due',isFollowUpDue(row));}
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
    for(const row of list)lines.push(columns.map(([key])=>quote(key==='link'?value(row,key):display(row,key))).join(';'));
    return '﻿'+lines.join('\r\n');
  }
  let root=null;
  function render(target){
    root=target||root;if(!root)return;const list=rows(),old=root.querySelector('.sheet-wrap'),scroll=old?[old.scrollLeft,old.scrollTop]:[0,0];root.replaceChildren();
    const bar=node('div',undefined,'sheet-toolbar');
    const search=node('input');search.type='search';search.placeholder='Filtra in tutte le colonne';search.value=view.query;search.setAttribute('aria-label','Filtra il foglio');
    search.oninput=()=>{view.query=search.value;const pos=search.selectionStart;render();const s=root.querySelector('.sheet-toolbar input[type=search]');s.focus();s.setSelectionRange(pos,pos);};
    const stage=node('select');stage.setAttribute('aria-label','Filtra per fase');
    for(const [v,t]of [['','Tutte le fasi'],['due','Follow-up da fare'],...Object.entries(stages)]){const o=node('option',t);o.value=v;stage.append(o);}
    stage.value=view.stage;stage.onchange=()=>{view.stage=stage.value;render();};
    const all=node('label',undefined,'sheet-toggle'),box=node('input');box.type='checkbox';box.checked=view.all;box.onchange=()=>{view.all=box.checked;render();};all.append(box,document.createTextNode(' Includi annunci non tracciati'));
    const exp=button('Esporta CSV (Excel)','download',()=>saveBlob(csv(list),`candidature_${todayISO()}.csv`,'text/csv;charset=utf-8'));
    bar.append(search,stage,all,exp,node('span',list.length===1?'1 riga':`${list.length} righe`,'muted'));root.append(bar);
    const wrap=node('div',undefined,'sheet-wrap'),table=node('table',undefined,'sheet'),head=node('tr');
    for(const [key,label,,width]of columns){
      const th=node('th');th.style.minWidth=width+'px';th.setAttribute('aria-sort',view.sort===key?(view.dir>0?'ascending':'descending'):'none');
      const b=node('button',label+(view.sort===key?(view.dir>0?' ▲':' ▼'):''));b.type='button';
      b.onclick=()=>{if(view.sort===key)view.dir=-view.dir;else{view.sort=key;view.dir=['updated','score','submitted_on'].includes(key)?-1:1;}render();};
      th.append(b);head.append(th);
    }
    const thead=node('thead');thead.append(head);const tbody=node('tbody');
    for(const row of list){
      const tr=node('tr');for(const [key,,kind]of columns)tr.append(cell(row,key,kind));
      const first=tr.firstChild;first.classList.add('sheet-open');first.tabIndex=0;first.title='Apri scheda completa';first.onclick=()=>showDetail(row);first.onkeydown=e=>{if(e.key==='Enter')showDetail(row);};
      markDue(tr,row);tbody.append(tr);
    }
    table.append(thead,tbody);wrap.append(table);root.append(wrap);[wrap.scrollLeft,wrap.scrollTop]=scroll;
    if(!list.length)root.append(node('p','Nessuna candidatura con questi filtri. Segna un annuncio come “Mi interessa” o “Inviata” per vederlo qui.','muted'));
    root.append(node('p','Le modifiche si salvano cifrate come nel Tracker. Clic sull’azienda per la scheda completa; Invio o frecce ↑↓ per spostarsi tra le righe. Righe evidenziate: follow-up scaduto.','muted sheet-help'));
    icons();
  }
  return {render,csv,rows,view};
})();
