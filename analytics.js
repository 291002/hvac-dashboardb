/* Performance: CUC plant vs published benchmarks + every tower on the loop with its comfort, IAQ and ΔT checks. */
(function(){
  const {S,$,f0,f1,f2,esc,spark,pill}=UI;
  const USE=[['Office','var(--cat1)'],['Residential','var(--cat2)'],['Hotel & mixed-use','var(--cat3)']];
  const useOf=t=>/^Office/.test(t.use)?0:/^Residential/.test(t.use)?1:2;
  const short=t=>t.id==='ICON'?'Iconic':t.id;
  const RATE={ex:['Excellent','var(--ok)','●'],gd:['Good','var(--ok)','●'],fr:['Fair','var(--warn)','▲'],pr:['Needs improvement','var(--crit)','■']};
  const SRC={
    hartman:['Hartman chiller-plant grading (MDPI Buildings, 2025)','https://www.mdpi.com/2075-5309/16/4/756'],
    ashrae:['ASHRAE 90.1-2019 Add. bd','https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/90_1_2019_bd_20220531.pdf'],
    edr:['Energy Design Resources — Chiller Plant Efficiency','https://datacenters.lbl.gov/sites/default/files/Design%20Brief_Chiller%20Efficiency.pdf']
  };

  // bands are [from, to, rating] along the axis, left to right
  const PLANT=[
    {t:'Whole-plant efficiency',u:'kW/TR',src:'hartman',dom:[0.4,1.2],fmt:f2,
      bands:[[0.4,0.70,'ex'],[0.70,0.88,'gd'],[0.88,1.0,'fr'],[1.0,1.2,'pr']],mark:1.0,markL:'Needs work above 1.0',
      get:p=>p.kwtr,note:'Chillers, pumps and tower fans together. ≤ 0.70 kW/TR is excellent.'},
    {t:'Chiller efficiency',u:'kW/TR',src:'ashrae',dom:[0.3,0.9],fmt:f2,
      bands:[[0.3,0.50,'ex'],[0.50,0.585,'gd'],[0.585,0.70,'fr'],[0.70,0.9,'pr']],mark:0.585,markL:'ASHRAE 90.1 limit 0.585',
      get:p=>p.produced?p.chKW/p.produced:0,note:'Running units. Full-load limit for water-cooled centrifugals ≥ 600 TR.'},
    {t:'Chilled-water ΔT',u:'K',src:'edr',dom:[2,10],fmt:f1,
      bands:[[2,4,'pr'],[4,5.6,'fr'],[5.6,7,'gd'],[7,10,'ex']],mark:5.6,markL:'10 °F design ΔT',
      get:p=>p.dT,note:'Doubling ΔT halves the water pumped per ton.'},
    {t:'Condenser water to chillers',u:'°C',src:'edr',dom:[20,34],fmt:f1,
      bands:[[20,24,'ex'],[24,27,'gd'],[27,29.4,'fr'],[29.4,34,'pr']],mark:29.4,markL:'85 °F rating',
      get:p=>p.cws,note:'Chillers gain about 1–2 % per °F below 85 °F.'},
    {t:'Cooling tower approach',u:'K',src:'edr',dom:[1,8],fmt:f1,
      bands:[[1,2.8,'ex'],[2.8,3.9,'gd'],[3.9,5.5,'fr'],[5.5,8,'pr']],mark:3.9,markL:'7 °F CTI rating',
      get:p=>p.approach,note:'Rated 95 → 85 °F at 78 °F wet bulb.'}
  ];
  const rateOf=(m,v)=>{const b=m.bands.find(([a,z])=>v>=a&&v<z)||(v<m.dom[0]?m.bands[0]:m.bands[m.bands.length-1]); return b[2];};
  const order={pr:0,fr:1,gd:2,ex:3};
  const rpill=r=>`<span class="pill" style="--c:${RATE[r][1]}">${RATE[r][0]}</span>`;

  // tower checks: [key, heading, value, pass test, format]
  const co2=t=>{const r=t.ahu.filter(a=>a.running); return r.length?r.reduce((s,a)=>s+a.co2,0)/r.length:0;};
  const CHECKS=[
    ['pct','% design ≤ 100',t=>t.lf*100,v=>v<=100,f0],
    ['zone','Zone 23–26 °C',t=>t.zoneT,v=>v>=23&&v<=26,f1],
    ['co2','CO₂ ≤ 1,100 ppm',co2,v=>v<=1100,f0],
    ['dt','ETS ΔT ≥ 5.6 K',t=>t.ets.priR-t.ets.priS,v=>v>=5.6,f1]
  ];
  const fails=t=>CHECKS.filter(c=>!c[3](c[2](t))).length;
  const COLS=[
    ['name','Building',t=>t.name,'l'],['load','Load TR',t=>t.load],
    ...CHECKS.map(c=>[c[0],c[1],c[2]]),
    ['trend','Load, 1 min',null,'l'],
    ['status','Status',t=>({crit:0,warn:1,ok:2})[t.status]*10-fails(t),'l']
  ];
  // bar-chart metrics: lim = [min, max] benchmark (null = open end); load is checked against each tower's own design load
  const METRICS=[
    {k:'load',l:'Load',u:'TR',get:t=>t.load,fmt:f0,refL:'Checked against each tower’s design load',ok:t=>t.lf<=1},
    {k:'pct',l:'% of design',u:'%',get:CHECKS[0][2],fmt:f0,lim:[null,100],refL:'Limit 100 %',ok:t=>CHECKS[0][3](CHECKS[0][2](t))},
    {k:'zone',l:'Zone temp',u:'°C',get:CHECKS[1][2],fmt:f1,lim:[23,26],center:24.5,refL:'Comfort band 23–26 °C · bars from mid-band 24.5 °C',ok:t=>CHECKS[1][3](CHECKS[1][2](t))},
    {k:'co2',l:'CO₂',u:'ppm',get:co2,fmt:f0,lim:[null,1100],refL:'Limit 1,100 ppm',ok:t=>CHECKS[2][3](co2(t))},
    {k:'dt',l:'ETS ΔT',u:'K',get:CHECKS[3][2],fmt:f1,lim:[5.6,null],refL:'Minimum 5.6 K',ok:t=>CHECKS[3][3](CHECKS[3][2](t))}
  ];
  const niceMax=v=>{const p=Math.pow(10,Math.floor(Math.log10(Math.max(v,1e-6)))); return [1,2,2.5,5,10].map(m=>m*p).find(m=>m>=v)};
  let sortKey='status', sortDir=1, metric='load', mode='chart', built=false;

  function build(){
    $('#analytics').innerHTML=`
      <div class="an-head"><button class="btn back" id="anBack">← Site map</button>
        <div class="dname"><span class="label">CUC plant and ${S.towers.length} buildings vs published benchmarks · live</span><h2>Performance</h2></div>
        <div class="bm-scale">${['ex','gd','fr','pr'].map(r=>`<span style="--c:${RATE[r][1]}"><i>${RATE[r][2]}</i>${RATE[r][0]}</span>`).join('')}</div></div>
      <div class="an-tiles pf-tiles" id="anTiles"></div>
      <div class="an-body">
        <section class="an-card bm-right"><div class="an-card-h"><h3>CUC plant</h3><span class="label">Marker = live · dashed = reference</span></div>
          <div class="bm-list" id="bmPlant"></div>
          <div class="bm-src pf-src"><span class="label">Sources</span>${Object.values(SRC).map(([n,u],i)=>`<a href="${u}" target="_blank" rel="noopener">[${i+1}] ${esc(n)}</a>`).join('')}
            <span class="bm-foot">Tower checks follow common ASHRAE 55 / 62.1 practice. Values are simulated.</span></div></section>
        <section class="an-card"><div class="an-card-h pf-th"><h3>Towers</h3>
            <div class="seg" id="pfMetric" role="group" aria-label="Bar chart metric">${METRICS.map(m=>`<button data-metric="${m.k}">${m.l}</button>`).join('')}</div>
            <span class="pf-use" hidden>${USE.map(([n,c])=>`<span><span class="use-dot" style="--c:${c}"></span>${n}</span>`).join('')}</span>
            <div class="seg pf-mode" role="group" aria-label="View"><button data-mode="chart">Chart</button><button data-mode="table">Table</button></div></div>
          <div class="pf-chart" id="pfChart"><div class="rk-axis" id="rkAxis"></div><div class="rk-rows" id="rkRows"></div><div class="pf-key" id="pfKey"></div></div>
          <div class="an-table-wrap" id="pfTable" hidden><table class="an-table"><thead><tr id="anHead"></tr></thead><tbody id="anRows"></tbody></table></div></section>
      </div><div class="an-tip" id="anTip" hidden></div>`;
    $('#analytics').addEventListener('click',e=>{
      const b=e.target.closest('[data-metric],[data-mode]'); if(!b) return;
      if(b.dataset.metric) metric=b.dataset.metric; else mode=b.dataset.mode;
      render();
    });
    const tip=$('#anTip');
    $('#analytics').addEventListener('mousemove',e=>{
      const r=e.target.closest('.rk-row'); if(!r){tip.hidden=true;return}
      const t=S.find(r.dataset.open);
      tip.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><b>${esc(t.id==='ICON'?'Iconic Tower':t.id)}</b>${pill(t.status)}</div><div class="sub">${esc(t.use)}</div>
        <dl><dt>Load</dt><dd>${f0(t.load)} of ${f0(t.design)} TR</dd>${METRICS.slice(1).map(m=>`<dt>${m.l}</dt><dd class="${m.ok(t)?'':'no'}">${m.ok(t)?'':'✕ '}${m.fmt(m.get(t))} ${m.u}</dd>`).join('')}</dl>
        <div class="sub">Click to open the building</div>`;
      tip.hidden=false;
      const w=tip.offsetWidth,h=tip.offsetHeight;
      tip.style.left=Math.min(innerWidth-w-8,e.clientX+16)+'px'; tip.style.top=Math.min(innerHeight-h-8,e.clientY+12)+'px';
    });
    $('#analytics').addEventListener('mouseleave',()=>{tip.hidden=true});
    $('#anBack').addEventListener('click',()=>UI.setView('map'));
    $('#anHead').addEventListener('click',e=>{const th=e.target.closest('[data-sort]'); if(!th) return;
      const k=th.dataset.sort; if(sortKey===k) sortDir*=-1; else {sortKey=k; sortDir=COLS.find(c=>c[0]===k)[3]==='l'?1:-1;} render();});
    // rows re-render every second, so open on pointerdown (mouse/touch) and keyboard clicks
    const openRow=e=>{const r=e.target.closest('[data-open]'); if(r) UI.open(r.dataset.open);};
    $('#analytics').addEventListener('pointerdown',e=>{ if(e.button===0) openRow(e); });
    $('#analytics').addEventListener('keydown',e=>{ if(e.key==='Enter') openRow(e); });
    built=true;
  }

  function render(){
    if(!built) build();
    const p=S.plant, T=S.towers, srcNo=k=>Object.keys(SRC).indexOf(k)+1;

    // plant vs benchmarks
    const rated=PLANT.map(m=>{const v=m.get(p); return {m,v,r:rateOf(m,v)};});
    $('#bmPlant').innerHTML=rated.map(({m,v,r})=>{
      const [a,z]=m.dom, pos=x=>Math.max(0,Math.min(100,(x-a)/(z-a)*100));
      const ticks=[a,...m.bands.slice(0,-1).map(b=>b[1]),z];
      return `<div class="bm">
        <div class="bm-h"><b>${m.t}</b><span class="bm-s">${esc(m.note)} <sup>[${srcNo(m.src)}]</sup></span></div>
        <div class="bm-v"><span class="bm-num">${m.fmt(v)}<small>${m.u}</small></span>${rpill(r)}</div>
        <div class="bm-bar" role="img" aria-label="${m.t}: ${m.fmt(v)} ${m.u}, rated ${RATE[r][0]}">
          ${m.bands.map(([b0,b1,br])=>`<i class="bm-band ${br}" style="left:${pos(b0)}%;width:${pos(b1)-pos(b0)}%"><span>${br==='pr'?'Needs work':RATE[br][0]}</span></i>`).join('')}
          <em class="bm-ref" style="left:${pos(m.mark)}%" title="${esc(m.markL)}"></em>
          <em class="bm-mk" style="left:${pos(v)}%"></em>
        </div>
        <div class="bm-ax">${ticks.map(x=>`<span style="left:${pos(x)}%">${m.fmt(x)}</span>`).join('')}<span class="bm-refl" style="left:${pos(m.mark)}%">${esc(m.markL)}</span></div>
      </div>`;}).join('');

    // headline tiles
    const total=T.reduce((a,t)=>a+t.load,0);
    const good=rated.filter(x=>order[x.r]>=2).length, worst=[...rated].sort((a,b)=>order[a.r]-order[b.r])[0];
    const miss=T.filter(t=>fails(t)||t.status!=='ok');
    const tiles=[
      ['Total tower load',f0(total),'TR',`${T.length} buildings · ${f0(total/Math.max(1,p.produced)*100)}% of CUC output`],
      ['Plant KPIs at benchmark',`${good}/${rated.length}`,'',good<rated.length?`Weakest: ${worst.m.t.toLowerCase()} · ${RATE[worst.r][0]}`:'All rated Excellent or Good',good<rated.length?'alarm':''],
      ['Towers needing attention',miss.length,'',miss.length?miss.slice(0,6).map(short).join(' · ')+(miss.length>6?' …':''):'All checks pass, no alarms',miss.length?'alarm':'']
    ];
    $('#anTiles').innerHTML=tiles.map(([l,v,u,d,c])=>`<div class="kpi ${c||''}"><span class="label">${l}</span><span class="v">${v}<small>${u}</small></span><span class="d">${esc(d)}</span></div>`).join('');

    // towers: chart or table
    document.querySelectorAll('#analytics [data-metric]').forEach(b=>b.classList.toggle('on',b.dataset.metric===metric));
    document.querySelectorAll('#analytics [data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode));
    $('#pfMetric').hidden=mode!=='chart'; $('.pf-use').hidden=mode!=='table';
    $('#pfChart').hidden=mode!=='chart'; $('#pfTable').hidden=mode!=='table';
    if(mode==='chart') renderChart(T); else { $('#anTip').hidden=true; renderTable(T); }
  }

  function renderChart(T){
    const m=METRICS.find(x=>x.k===metric);
    const vals=T.map(t=>[t,m.get(t),m.ok(t)]).sort((a,b)=>b[1]-a[1]);
    const [lo,hi]=m.lim||[], c=m.center;
    // bars grow from 0, or from the mid-band value for a two-sided band (zone temperature)
    let pos, bar, ticks;
    if(c!=null){
      const span=niceMax(Math.max(hi-c,...vals.map(v=>Math.abs(v[1]-c)))*1.15);
      pos=v=>Math.max(0,Math.min(100,50+(v-c)/span*50));
      bar=v=>v>=c?`left:50%;width:${pos(v)-50}%`:`left:${pos(v)}%;width:${50-pos(v)}%`;
      ticks=[0,.25,.5,.75,1].map(k=>[k,c+span*(2*k-1)]);
    }else{
      const max=niceMax(Math.max(...vals.map(v=>v[1]),...[lo,hi].filter(x=>x!=null))*1.04);
      pos=v=>Math.max(0,Math.min(100,v/max*100));
      bar=v=>`left:0;width:${pos(v)}%`;
      ticks=[0,.25,.5,.75,1].map(k=>[k,max*k]);
    }
    $('#rkAxis').innerHTML=`<span></span><span class="rk-ticks">${ticks.map(([k,x])=>`<em style="left:${k*100}%">${m.fmt(x)}</em>`).join('')}</span><span class="rk-unit">${m.u}</span>`;
    const band=lo!=null&&hi!=null?`<b class="pf-band" style="left:${pos(lo)}%;width:${pos(hi)-pos(lo)}%"></b>`:
      m.lim?`<b class="pf-ref" style="left:${pos(lo!=null?lo:hi)}%"></b>`:'';
    $('#rkRows').innerHTML=vals.map(([t,v,ok])=>`<div class="rk-row" data-open="${t.id}" tabindex="0" role="button" aria-label="${esc(t.name)}: ${m.fmt(v)} ${m.u}${ok?'':', outside benchmark'}, open building">
        <span class="rk-name"><span class="use-dot" style="--c:${USE[useOf(t)][1]}"></span>${short(t)}</span>
        <span class="rk-track${c!=null?' mid':''}">${band}<i class="${ok?'':'no'}${c!=null&&v<c?' neg':''}" style="${bar(v)}"></i></span>
        <span class="rk-val ${ok?'':'no'}">${ok?'':'✕ '}${m.fmt(v)}</span></div>`).join('');
    const miss=vals.filter(v=>!v[2]).length;
    $('#pfKey').innerHTML=`<span><i class="k-ok"></i>Within benchmark</span><span><i class="k-no"></i>✕ Outside benchmark${miss?` (${miss})`:''}</span>
      <span>${m.lim?`<i class="${lo!=null&&hi!=null?'k-band':'k-ref'}"></i>`:''}${m.refL}</span>
      <span class="pf-uses">${USE.map(([n,c])=>`<span><span class="use-dot" style="--c:${c}"></span>${n}</span>`).join('')}</span>`;
  }

  function renderTable(T){
    const col=COLS.find(c=>c[0]===sortKey);
    const rows=[...T].sort((a,b)=>{const x=col[2](a),y=col[2](b); return (typeof x==='string'?x.localeCompare(y):x-y)*sortDir||b.load-a.load;});
    $('#anHead').innerHTML=COLS.map(([k,l,fn,al])=>`<th class="label ${al==='l'?'':'r'}" ${fn?`data-sort="${k}" aria-sort="${k===sortKey?(sortDir>0?'ascending':'descending'):'none'}"`:''}>${l}${k===sortKey?(sortDir>0?' ↑':' ↓'):''}</th>`).join('');
    $('#anRows').innerHTML=rows.map(t=>`<tr data-open="${t.id}" tabindex="0">
      <td title="${USE[useOf(t)][0]}"><span class="use-dot" style="--c:${USE[useOf(t)][1]}"></span><b>${esc(t.id==='ICON'?'Iconic Tower':t.id)}</b></td>
      <td class="r">${f0(t.load)}</td>
      ${CHECKS.map(([,,get,ok,fmt])=>{const v=get(t),g=ok(v); return `<td class="r bm-cell ${g?'ok':'no'}"><i>${g?'✓':'✕'}</i>${fmt(v)}</td>`;}).join('')}
      <td><svg viewBox="0 0 80 20" preserveAspectRatio="none" aria-hidden="true">${spark(t.hist,80,20,'var(--chw)',2)}</svg></td><td>${pill(t.status)}</td></tr>`).join('');
  }

  UI.renderAnalytics=render;
})();
