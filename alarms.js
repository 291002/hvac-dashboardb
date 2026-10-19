/* Alarms: active alarms located on the site map, plus the alarm history (raised / cleared / duration).
   Opened from the Alarms tile on the site overview. History before this page load is simulated. */
(function(){
  const {S,$,esc}=UI;
  const P=S.plant;
  const ft=d=>d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const fdt=d=>d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const dur=ms=>{const m=Math.max(0,Math.round(ms/6e4)); return m<1?'<1 min':m<60?`${m} min`:m<1440?`${Math.floor(m/60)} h ${m%60} min`:`${Math.floor(m/1440)} d ${Math.floor(m%1440/60)} h`;};
  const SEV={crit:['var(--crit)','Critical'],warn:['var(--warn)','Warning']};
  const PERIOD=[['24h','Last 24 h',864e5],['7d','7 days',7*864e5],['all','All',Infinity]];
  const st={sev:'all',per:'24h',asset:null,sel:null};
  let built=false, sig='';

  const aName=id=>{const a=S.find(id); return id==='CUC'?'Central Utilities Complex':id==='ICON'?'Iconic Tower':a?a.name:id;};
  const eqName=(e)=>{
    if(!e.eq) return e.asset==='CUC'?'Plant-wide':'Building-wide';
    if(e.eq==='ZONE') return 'Occupied zones';
    const t=e.eq.match(/^[A-Z]+/)[0], n=+e.eq.slice(-2);
    return ({CH:`Chiller hall · bay ${n}`,CT:`Cooling tower deck · cell ${n}`,CHWP:`Primary pump room · bay ${n}`,CWP:`Condenser pump room · bay ${n}`,DP:'Secondary pump room',AHU:'AHU plant room',ETS:'ETS room · basement'})[t]||'';
  };
  const where=e=>`${aName(e.asset)}${e.eq&&e.eq!=='ZONE'?' · '+e.eq:''}`;
  const pinOf=id=>{const a=S.find(id); return a.kind==='plant'?{x:a.x+a.w/2,y:a.y+a.h/2}:{x:a.x,y:a.y};};
  const active=()=>[...S.alarms.values()].map(a=>a.log).filter(Boolean).sort((a,b)=>(a.sev==='crit')===(b.sev==='crit')?b.since-a.since:a.sev==='crit'?-1:1);
  const okSev=e=>st.sev==='all'||e.sev===st.sev;
  const okAsset=e=>!st.asset||e.asset===st.asset;
  function history(){
    const lim=PERIOD.find(p=>p[0]===st.per)[2], now=Date.now();
    return S.alarmLog.filter(e=>now-(e.cleared||now)<=lim&&okSev(e)&&okAsset(e)).slice().reverse();
  }

  function build(){
    $('#alarmView').innerHTML=`
      <div class="an-head"><button class="btn back" id="alBack">← Site map</button>
        <div class="dname"><span class="label" id="alSub"></span><h2>Alarms</h2></div>
        <div class="seg" id="alSev"><button data-sev="all">All</button><button data-sev="crit">Critical</button><button data-sev="warn">Warning</button></div>
        <div class="mt-x"><button class="btn" id="alCsv">Download history (CSV)</button></div></div>
      <div class="an-tiles" id="alTiles"></div>
      <div class="al-body">
        <section class="an-card al-left">
          <div class="an-card-h"><h3>Where</h3><span class="label" id="alWhereL"></span></div>
          <div class="al-mapbox"><div class="al-map" id="alMap"><img src="cbd-site.png" alt="Site map with alarm locations" width="1528" height="1029"><div id="alPins"></div></div></div>
          <div class="an-card-h al-acth"><h3>Active</h3><span class="label" id="alActL"></span></div>
          <div class="al-list" id="alActive"></div>
        </section>
        <section class="an-card al-right">
          <div class="an-card-h"><h3>History</h3><div class="seg al-per" id="alPer">${PERIOD.map(([k,l])=>`<button data-per="${k}">${l}</button>`).join('')}</div></div>
          <div class="an-table-wrap al-hist" id="alHist"></div>
        </section>
      </div>`;
    const root=$('#alarmView');
    root.addEventListener('click',e=>{
      const sv=e.target.closest('[data-sev]'), pr=e.target.closest('[data-per]'), pin=e.target.closest('[data-pin]'),
        go=e.target.closest('[data-go]'), row=e.target.closest('[data-row]'), clr=e.target.closest('#alClear');
      if(go){ const x=S.alarmLog.find(a=>a.id===+go.dataset.go); if(x) UI.open(x.asset,x.eq&&x.eq!=='ZONE'?x.eq:undefined); return; }
      if(sv) st.sev=sv.dataset.sev;
      if(pr) st.per=pr.dataset.per;
      if(pin){ st.asset=st.asset===pin.dataset.pin?null:pin.dataset.pin; st.sel=null; }
      if(clr) st.asset=null;
      if(row){ const id=+row.dataset.row, x=S.alarmLog.find(a=>a.id===id); st.sel=st.sel===id?null:id; }
      if(sv||pr||pin||row||clr) render(true);
    });
    root.addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-row]')){ e.preventDefault(); e.target.click(); } });
    $('#alBack').addEventListener('click',()=>UI.setView('map'));
    $('#alCsv').addEventListener('click',csv);
    built=true;
  }

  function render(force){
    if(UI.view!=='alarms') return;
    if(!built) build();
    const act=active(), H=history();
    const s=[st.sev,st.per,st.asset,st.sel,act.map(a=>a.id+a.sev).join(),S.alarmLog.length,S.alarmLog.filter(e=>e.cleared).length].join('|');
    if(!force&&s===sig){ document.querySelectorAll('#alarmView [data-since]').forEach(el=>el.textContent=dur(Date.now()-el.dataset.since)); return; }
    sig=s;
    const now=Date.now(), day=S.alarmLog.filter(e=>now-e.since<=864e5), cl=day.filter(e=>e.cleared);
    const nc=act.filter(a=>a.sev==='crit').length;
    const sel=st.sel&&S.alarmLog.find(a=>a.id===st.sel);
    document.querySelectorAll('#alSev [data-sev]').forEach(b=>b.classList.toggle('on',b.dataset.sev===st.sev));
    document.querySelectorAll('#alPer [data-per]').forEach(b=>b.classList.toggle('on',b.dataset.per===st.per));
    $('#alSub').textContent=`Active & history · ${st.asset?aName(st.asset):'whole site'}`;
    const tiles=[['Active',act.length,'',act.length?`${new Set(act.map(a=>a.asset)).size} location${new Set(act.map(a=>a.asset)).size>1?'s':''}`:'all clear',nc?'mt-bad':''],
      ['Critical',nc,'',nc?'needs action now':'none',nc?'mt-bad':''],
      ['Warning',act.length-nc,'',act.length-nc?'monitor':'none'],
      ['Raised in 24 h',day.length,'',`${cl.length} cleared`],
      ['Avg. time to clear',cl.length?dur(cl.reduce((a,e)=>a+(e.cleared-e.since),0)/cl.length):'—','','last 24 h']];
    $('#alTiles').innerHTML=tiles.map(([l,v,u,d,c])=>`<div class="kpi ${c||''}"><span class="label">${l}</span><span class="v">${v}<small>${u}</small></span><span class="d">${esc(d)}</span></div>`).join('');

    // map: one marker per location with active alarms, plus the selected history alarm's location
    const by=new Map(); act.filter(okSev).forEach(a=>{const g=by.get(a.asset)||{n:0,crit:false}; g.n++; g.crit=g.crit||a.sev==='crit'; by.set(a.asset,g);});
    if(sel&&!by.has(sel.asset)) by.set(sel.asset,{n:0,crit:sel.sev==='crit',hist:true});
    $('#alPins').innerHTML=[...by].map(([id,g])=>{const p=pinOf(id), on=(sel&&sel.asset===id)||st.asset===id;
      return `<button class="al-pin${g.crit?' crit':''}${on?' on':''}${g.hist?' hist':''}" style="left:${p.x}%;top:${p.y}%" data-pin="${id}" title="${esc(aName(id))}${g.n?` — ${g.n} active`:''}" aria-label="${esc(aName(id))}, ${g.n} active alarms. Filter by this location"><b>${g.n||'!'}</b><span>${id==='ICON'?'Iconic':id}</span></button>`;}).join('');
    $('#alWhereL').innerHTML=sel?`<span class="al-selw">${esc(where(sel))} · ${esc(eqName(sel))}</span>`
      :st.asset?`${esc(aName(st.asset))} · <button class="al-link" id="alClear">show all</button>`:'Click a marker to filter';

    const shown=act.filter(a=>okSev(a)&&okAsset(a));
    $('#alActL').textContent=`${shown.length} shown`;
    $('#alActive').innerHTML=shown.length?shown.map(a=>`<div class="al-row${st.sel===a.id?' on':''}" style="--c:${SEV[a.sev][0]}" data-row="${a.id}" tabindex="0">
        <div class="al-t"><b>${esc(a.text)}</b><small>${esc(where(a))} · ${esc(eqName(a))}</small></div>
        <div class="al-m"><span class="al-sev ${a.sev}">${SEV[a.sev][1]}</span><small>since ${ft(a.since)} · <span data-since="${+a.since}">${dur(now-a.since)}</span></small></div>
        <button class="btn" data-go="${a.id}">Go to ${a.eq&&a.eq!=='ZONE'?esc(a.eq):'building'} →</button></div>`).join('')
      :`<p class="mt-none">No active alarms${st.asset||st.sev!=='all'?' for this filter':''}.</p>`;

    $('#alHist').innerHTML=H.length?`<table class="an-table al-tbl"><thead><tr><th>Raised</th><th>Cleared</th><th class="r">Duration</th><th>Severity</th><th>Location</th><th>Message</th><th></th></tr></thead><tbody>${
      H.slice(0,400).map(e=>`<tr class="${st.sel===e.id?'on':''}" data-row="${e.id}" tabindex="0"><td>${fdt(e.since)}</td><td>${e.cleared?fdt(e.cleared):'<span class="al-live">Active</span>'}</td>
        <td class="r">${e.cleared?dur(e.cleared-e.since):`<span data-since="${+e.since}">${dur(now-e.since)}</span>`}</td><td><span class="al-sev ${e.sev}">${SEV[e.sev][1]}</span></td>
        <td><b>${esc(e.asset==='ICON'?'Iconic':e.asset)}</b>${e.eq&&e.eq!=='ZONE'?' · '+esc(e.eq):''}<br><small>${esc(eqName(e))}</small></td><td class="al-msg">${esc(e.text)}</td>
        <td><button class="btn" data-go="${e.id}" title="Open ${esc(where(e))}">Open →</button></td></tr>`).join('')}</tbody></table>`
      :'<p class="mt-none al-pad">No alarms in this period.</p>';
  }

  function csv(){
    const q=v=>{const s=String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}, now=new Date();
    const L=[['Center Utility Complex — alarm history'],['Period',PERIOD.find(p=>p[0]===st.per)[1]],['Severity',st.sev==='all'?'All':SEV[st.sev][1]],['Location',st.asset?aName(st.asset):'Whole site'],['Generated',fdt(now)],['Values are simulated'],[],
      ['Raised','Cleared','Duration (min)','Severity','Location','Equipment','Area','Message']];
    history().forEach(e=>L.push([fdt(e.since),e.cleared?fdt(e.cleared):'Active',Math.round(((e.cleared||now)-e.since)/6e4),SEV[e.sev][1],aName(e.asset),e.eq&&e.eq!=='ZONE'?e.eq:'',eqName(e),e.text]));
    const blob=new Blob(['﻿'+L.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`CUC_alarm_history_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  }

  UI.renderAlarms=f=>render(f!==false);
  UI.openAlarms=()=>{ st.asset=null; st.sel=null; UI.setView('alarms'); };
})();
