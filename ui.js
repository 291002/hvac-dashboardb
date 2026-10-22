/* Site layer: map view with pins, hover popups, site KPIs, and view switching. */
(function(){
  const S=window.SIM, $=s=>document.querySelector(s);
  const f0=v=>Math.round(v).toLocaleString('en-US'), f1=v=>(+v).toFixed(1), f2=v=>(+v).toFixed(2);
  const ST={ok:['var(--ok)','Normal'],warn:['var(--crit)','Attention'],crit:['var(--crit)','Alarm'],off:['var(--off)','Off']};
  const pill=s=>`<span class="pill" style="--c:${ST[s][0]}">${ST[s][1]}</span>`;
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');

  function spark(vals,w,h,color,pad=3){
    if(vals.length<2) return '';
    let lo=Math.min(...vals), hi=Math.max(...vals); if(hi-lo<1e-6){hi+=1;lo-=1}
    const X=i=>i/(vals.length-1)*w, Y=v=>pad+(1-(v-lo)/(hi-lo))*(h-2*pad);
    const line=vals.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    return `<path d="${line}L${w},${h}L0,${h}Z" fill="${color}" fill-opacity=".14"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  }

  const UI={S,$,f0,f1,f2,pill,esc,spark,ST,hover:null,selected:'CUC',selEq:'CH-01',view:'map'};
  window.UI=UI;

  function renderSite(){
    const s=S.site,w=s.weather,p=S.plant;
    $('#wx').textContent=`${f1(w.db)} / ${f1(w.wb)} °C`;
    $('#clock').textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if(UI.view!=='map') return;
    const tiles=[
      ['Cooling',f0(s.produced),'TR'],
      ['Efficiency',f2(s.kwtr),'kW/TR'],
      ['CHWS / CHWR',`${f1(s.chws)} / ${f1(s.chwr)}`,'°C'],
      ['Chillers',`${p.run} / ${p.chillers.length}`,''],
      ['Zone avg',f1(s.zoneAvg),'°C'],
      ['Alarms',s.alarms,s.crit?`${s.crit} crit`:'',s.alarms?'alarm':'']
    ];
    // the Alarms tile is a button that opens the alarm view (location + history); the negative delay keeps its pulse
    // in step across the once-a-second re-render instead of restarting it
    $('#siteKpis').innerHTML=tiles.map(([l,v,u,c])=>l==='Alarms'
      ?`<button class="k ak ${c||''}" id="openAlarms" style="animation-delay:-${Date.now()%1400}ms" aria-label="${v} active alarms — open alarm view"><span class="label">${l} <em>View →</em></span><span class="v">${v}<small>${u}</small></span></button>`
      :`<div class="k ${c||''}"><span class="label">${l}</span><span class="v">${v}<small>${u}</small></span></div>`).join('');
    const all=[p,...S.towers], n=k=>all.filter(a=>a.status===k).length;
    $('#legendCount').textContent=`${n('ok')} of ${all.length} normal`;
  }

  // on/off state for the sidebar: running, standby (off), locked out, tripped
  function unitState(u){
    if(u.fault) return ['var(--crit)','Tripped'];
    if(u.maint) return ['var(--warn)','Maint.'];
    if(!u.enabled) return ['var(--warn)','Locked out'];
    return u.running?['var(--ok)','On']:['var(--off)','Off'];
  }
  function renderSide(){
    const p=S.plant;
    const on=arr=>arr.filter(c=>c.running).length;
    $('#sidePill').innerHTML=pill(p.status);
    // running counts live in each group heading
    const cnt=(arr,extra)=>`<b>${on(arr)}/${arr.length}</b> on · ${extra}`;
    $('#chCount').innerHTML=cnt(p.chillers,`${f0(p.produced)} TR`);
    $('#ctCount').innerHTML=cnt(p.towers,`${f1(p.approach)} K app.`);
    $('#ppCount').innerHTML=cnt(p.chwp,`${f0(p.flow||0)} l/s`);
    $('#spCount').innerHTML=cnt(p.dp,`${f2(p.remoteDP||0)} bar`);
    const tile=(c,extra)=>{const [col,lab]=unitState(c);
      return `<button class="eqrow" style="--c:${col}" data-eq="${c.id}"><b>${c.id}</b><span class="st">${lab}${c.running?` <span class="m" style="text-transform:none;letter-spacing:0">${extra(c)}</span>`:''}</span></button>`};
    $('#ppList').innerHTML=p.chwp.map(c=>tile(c,u=>`${f0(u.hz)} Hz`)).join('');
    // narrow 4-up tiles: a running pump shows only its speed; the green edge already says it is on
    $('#spList').innerHTML=p.dp.map(c=>{const [col,lab]=unitState(c); return `<button class="eqrow" style="--c:${col}" data-eq="${c.id}"><b>${c.id}</b><span class="st">${c.running?`${f0(c.hz)} Hz`:lab}</span></button>`}).join('');
    $('#chList').innerHTML=p.chillers.map(c=>{const [col,lab]=unitState(c);
      const m=c.running?`${f0(c.pct)}% · ${f2(c.kwtr)} kW/TR`:c.fault?'Low evap pressure':c.maint?'Planned maintenance':!c.enabled?'Operator lockout':'Standby · ready';
      return `<button class="eqrow" style="--c:${col}" data-eq="${c.id}"><b>${c.id}</b><span class="m">${m}</span><span class="st">${lab}</span></button>`}).join('');
    $('#ctList').innerHTML=p.towers.map(c=>{const [col,lab]=unitState(c);
      return `<button class="eqrow" style="--c:${col}" data-eq="${c.id}"><b>${c.id}</b><span class="st">${lab}${c.running?` <span class="m" style="text-transform:none;letter-spacing:0">${f0(c.fan)}%</span>`:''}</span></button>`}).join('');
  }
  // rows re-render every second, so open on pointerdown (mouse/touch) and on keyboard-triggered clicks
  document.addEventListener('pointerdown',e=>{const r=e.target.closest('.side .eqrow'); if(r&&e.button===0) open('CUC',r.dataset.eq);});
  document.addEventListener('click',e=>{const r=e.target.closest('.side .eqrow'); if(r&&e.detail===0) open('CUC',r.dataset.eq);});

  document.addEventListener('click',e=>{ if(e.target.closest('#openAnalytics')) setView('analytics'); if(e.target.closest('#openReports')) setView('reports'); if(e.target.closest('#openMaint')) setView('maint'); if(e.target.closest('#openMgmt')) setView('mgmt'); if(e.target.closest('#openAlarms')&&e.detail===0) UI.openAlarms(); });
  // the KPI bar re-renders every second, so open the alarm view on pointerdown
  document.addEventListener('pointerdown',e=>{ if(e.target.closest('#openAlarms')&&e.button===0) UI.openAlarms(); });

  function buildMap(){
    const stage=$('#stage');
    [S.plant,...S.towers].forEach(a=>{
      const b=document.createElement('button');
      b.className='hot'+(a.kind==='plant'?' zone':''); b.dataset.id=a.id;
      b.setAttribute('aria-label',`${a.name} — open KPIs`);
      Object.assign(b.style,{left:a.x+'%',top:a.y+'%'});
      if(a.kind==='plant') Object.assign(b.style,{width:a.w+'%',height:a.h+'%'});
      if(a.drawPin){ b.classList.add('drawn'); b.innerHTML=`<span class="cpin${a.unverified?' unverified':''}${a.id==='ICON'?' major':''}" aria-hidden="true">${a.id==='ICON'?'Iconic Tower':a.id}</span>`; }
      if(a.kind==='plant'&&a.drawPin) b.innerHTML=`<span class="cpin cuc" aria-hidden="true">CUC · Central Utilities</span>`;
      b.addEventListener('mouseenter',()=>setHover(a.id));
      b.addEventListener('focus',()=>setHover(a.id));
      b.addEventListener('mouseleave',()=>setHover(null));
      b.addEventListener('blur',()=>setHover(null));
      b.addEventListener('click',()=>open(a.id));
      stage.appendChild(b);
    });
  }

  function setHover(id){ UI.hover=id; renderPop(); }
  // re-position pins after their anchors move (the 3D view projects them from each roof)
  UI.placePins=function(){
    document.querySelectorAll('.hot').forEach(h=>{ const a=S.find(h.dataset.id); h.style.left=a.x+'%'; h.style.top=a.y+'%'; if(a.kind==='plant'){ h.style.width=a.w+'%'; h.style.height=a.h+'%'; } });
    if(UI.hover) renderPop();
  };
  function markPins(){
    document.querySelectorAll('.hot').forEach(h=>h.style.setProperty('--st',ST[S.find(h.dataset.id).status][0]));
  }

  function renderPop(){
    const pop=$('#pop'), a=UI.hover&&S.find(UI.hover);
    if(!a||UI.view!=='map'){pop.hidden=true;return}
    let rows;
    if(a.kind==='plant') rows=[['Delivered',`${f0(a.produced)} TR`],['Efficiency',`${f2(a.kwtr)} kW/TR`],['CHWS / CHWR',`${f1(a.chws)} / ${f1(a.chwr)}`],['Chillers',`${a.run} of ${a.chillers.length} running`],['Power',`${f0(a.kW)} kW`],['Cooling towers',`${a.ctRun} of ${a.towers.length}`]];
    else rows=[['Load',`${f0(a.load)} TR`],['Of design',`${f0(a.lf*100)}%`],['Zone temp',`${f1(a.zoneT)} °C`],['Comfort',`${f0(a.comfort)}%`],['ETS sec. supply',`${f1(a.ets.secS)} °C`],['AHUs on',`${a.ahu.filter(x=>x.running).length} of ${a.ahus}`]];
    const n=[...S.alarms.values()].filter(x=>x.asset===a.id).length;
    pop.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><div><h3>${esc(a.name)}</h3><div class="sub">${esc(a.use)}</div></div>${pill(a.status)}</div>
      <dl>${rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="go">${n?`${n} active alarm${n>1?'s':''} · `:''}Click to open KPIs →</div>`;
    pop.hidden=false;
    // the image may be cropped by its container: keep the popup inside the visible part
    const st=$('#stage'), W=st.clientWidth, H=st.clientHeight, pw=pop.offsetWidth, ph=pop.offsetHeight;
    const x0=Math.max(0,-st.offsetLeft), y0=Math.max(0,-st.offsetTop), x1=Math.min(W,x0+st.parentElement.clientWidth), y1=Math.min(H,y0+st.parentElement.clientHeight);
    const cx=a.x/100*W, cy=(a.kind==='plant'?a.y+a.h/2:a.y)/100*H;
    let left=a.kind==='plant'?cx-pw-12:(cx+30+pw<x1?cx+30:cx-30-pw);
    pop.style.left=Math.max(x0+4,Math.min(x1-pw-4,left))+'px';
    pop.style.top=Math.max(y0+4,Math.min(y1-ph-4,cy-ph/2))+'px';
  }

  function setView(v){
    const from=UI.view; UI.view=v;
    [['#mapView','map'],['#detail','detail'],['#analytics','analytics'],['#reports','reports'],['#maint','maint'],['#alarmView','alarms'],['#mgmt','mgmt']].forEach(([sel,name])=>{$(sel).classList.toggle('off',v!==name); $(sel).inert=v!==name;});
    if(v==='analytics') UI.renderAnalytics();
    if(v==='reports') UI.renderReports();
    if(v==='maint') UI.renderMaint();
    if(v==='alarms') UI.renderAlarms();
    if(v==='mgmt') UI.renderMgmt();
    if(v==='map'){
      UI.hover=null; renderPop(); renderSite(); renderSide();
      if(from==='detail'){const pin=document.querySelector(`.hot[data-id="${UI.selected}"]`); if(pin) pin.focus({preventScroll:true}); UI.hover=null; renderPop();}
      if(location.hash) history.replaceState(null,'',location.pathname+location.search);
    }
  }
  UI.setView=setView;

  function open(id,eq){
    if(!S.find(id)) return;
    UI.selected=id;
    UI.hookMode=!!eq; // opening a specific unit (e.g. from the sidebar) goes straight to its hookup
    UI.selEq=eq||(id==='CUC'?(S.plant.chillers.find(c=>c.running)||S.plant.chillers[0]).id:'ETS-1');
    UI.hover=null; renderPop();
    UI.buildDetail(); setView('detail');
    try{history.replaceState(null,'','#'+id)}catch(e){}
  }
  UI.open=open;

  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&UI.view!=='map') setView('map'); });

  function tick(step=true){
    if(step) S.step();
    renderSite(); markPins();
    if(UI.view==='map'){ renderSide(); if(UI.hover) renderPop(); }
    else if(UI.view==='detail') UI.updateDetail();
    else if(UI.view==='analytics') UI.renderAnalytics();
    else if(UI.view==='alarms') UI.renderAlarms(false);
    else if(UI.view==='mgmt') UI.renderMgmt(false);
  }
  UI.tick=tick;

  UI.start=function(){
    buildMap(); setView('map'); tick(false);
    const h=decodeURIComponent(location.hash.slice(1)); if(h&&S.find(h)) open(h);
    setInterval(tick,1000);
    window.addEventListener('resize',()=>UI.hover&&renderPop());
  };
  UI.reduce=reduce;

  // Save as PDF: builds the A4 file in the browser (html2pdf, loaded on first use) and downloads it straight away.
  // html = one or more .rp-page articles; each article starts a new page. Offline it falls back to the print dialog.
  let h2p=null;
  const loadH2P=()=>window.html2pdf?Promise.resolve():h2p||(h2p=new Promise((ok,no)=>{
    const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload=ok; s.onerror=()=>{h2p=null; no(new Error('html2pdf failed to load'));}; document.head.appendChild(s);}));
  UI.savePdf=async function(html,name,btn,fallback){
    if(btn.disabled) return;
    const label=btn.textContent; btn.disabled=true; btn.textContent='Saving…';
    const box=document.createElement('div'); box.className='pdf-src';
    // html2pdf clones what it is given, so the off-screen position stays on the outer box and the styles key off .pdf-doc
    box.innerHTML='<div class="pdf-doc">'+html.replace(/<\/article>\s*(?=<article)/g,'</article><div class="html2pdf__page-break"></div>')+'</div>';
    document.body.appendChild(box);
    // html2canvas draws an SVG as a standalone image: give it a fixed size and inline the stylesheet colours
    box.querySelectorAll('svg').forEach(svg=>{
      const r=svg.getBoundingClientRect(); svg.setAttribute('width',r.width); svg.setAttribute('height',r.height);
      svg.querySelectorAll('*').forEach(el=>{const cs=getComputedStyle(el);
        ['fill','stroke','stroke-width','stroke-dasharray','font-family','font-size','font-weight'].forEach(p=>el.style.setProperty(p,cs.getPropertyValue(p)));});
    });
    let ok=true;
    try{
      await loadH2P();
      await html2pdf().set({margin:[8,8,10,8],filename:name+'.pdf',image:{type:'jpeg',quality:0.95},
        html2canvas:{scale:2,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
        pagebreak:{mode:['css','legacy'],avoid:['tr','.rp-k','.rp-hd','.rp-chart']}}).from(box.firstElementChild).save();
    }catch(e){ ok=false; }
    box.remove();
    if(!ok){ btn.textContent=label; btn.disabled=false; fallback(); return; }
    btn.textContent='Saved ✓';
    setTimeout(()=>{btn.textContent=label; btn.disabled=false;},2000);
  };
})();
