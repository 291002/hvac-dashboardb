/* Detail layer: per-building KPIs, animated plant schematic, equipment inspector & what-if controls. */
(function(){
  const {S,$,f0,f1,f2,esc,spark}=UI;
  const COL={ok:'var(--ok)',warn:'var(--warn)',crit:'var(--crit)',off:'var(--off)'};
  const asset=()=>S.find(UI.selected);

  function eqState(e){
    if(!e) return ['off','—'];
    if(e.kind==='tower') return [e.status,{ok:'Comfort OK',warn:'Drifting',crit:'Out of band'}[e.status]];
    if(e.fault) return ['crit',e.id==='ETS-1'?'Fouled':'Tripped'];
    if(e.maint) return ['warn','Maintenance'];
    if(e.enabled===false) return ['warn','Locked out'];
    if(e.id==='ETS-1') return ['ok','In service'];
    return e.running?['ok','Running']:['off','Standby'];
  }
  const pillOf=e=>{const [s,l]=eqState(e);return `<span class="pill" style="--c:${COL[s]}">${l}</span>`};

  function getEq(id){
    const a=asset();
    if(a.kind==='plant') return [...a.chillers,...a.towers,...a.chwp,...a.cwp,...a.dp].find(x=>x.id===id);
    if(id==='ETS-1') return a.ets; if(id==='ZONE') return a;
    return a.ahu.find(x=>x.id===id);
  }
  const typeOf=id=>id.startsWith('CH-')?'chiller':id.startsWith('CT-')?'tower':id.startsWith('CHWP')?'chwp':id.startsWith('CWP')?'cwp':id.startsWith('DP')?'dp':id==='ETS-1'?'ets':id==='ZONE'?'zone':'ahu';
  const TYPE_NAME={chiller:'Centrifugal water-cooled chiller · 3,000 TR',tower:'Induced-draft cooling tower · paired 1:1 with a chiller',chwp:'Primary chilled-water pump · VFD',cwp:'Condenser water pump · constant speed',dp:'Secondary chilled-water pump · VFD · to CBD loop',ets:'Energy transfer station · plate heat exchanger',ahu:'Air handling unit · VAV, CHW coil',zone:'Occupied zones & fan-coil units'};

  // ---------- SVG helpers
  const G=(id,inner)=>`<g class="eq" data-eq="${id}" tabindex="0" role="button" aria-label="Inspect ${id}">${inner}</g>`;
  const fan=(id,x,y,r=20)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="var(--box-2)" stroke="var(--line-2)"/><g transform="translate(${x},${y})"><g data-rot="${id}">${[0,90,180,270].map(k=>`<path d="M0,0C${r*.3},-${r*.3} ${r*.3},-${r*.8} 0,-${r*.92}C-${r*.2},-${r*.7} -${r*.15},-${r*.3} 0,0Z" fill="var(--muted)" transform="rotate(${k})"/>`).join('')}</g></g>`;
  const pump=(id,x,y,lab)=>G(id,`<circle class="box" cx="${x}" cy="${y}" r="15"/><g transform="translate(${x},${y})"><g data-rot="${id}"><path d="M0,-9L3,0L0,9L-3,0ZM-9,0L0,3L9,0L0,-3Z" fill="var(--muted)"/></g></g><circle id="q-d-${id}" cx="${x+11}" cy="${y-11}" r="4" fill="var(--off)"/>${lab(x,y+29,id)}`);
  const pipe=(d,color,k)=>`<path class="pipe" d="${d}" stroke="${color}"/><path class="flow" data-flow="${k}" d="${d}"/>`;
  const CHWS='var(--chw)',CHWR='var(--chwr)',CWS='var(--cws)',CWR='var(--cw)';

  // Bay layout follows the CUC drawings: one future bay, then 9 bays of cooling tower + CWP + chiller + CHWP.
  function plantSVG(p){
    let s='';
    const bayX=i=>50+(i+1)*100, fx=50; // i = 0..8 installed bays, fx = future bay
    const lab=(x,y,t)=>`<text class="s lbl" x="${x}" y="${y}" text-anchor="middle">${t}</text>`;
    // condenser headers
    s+=pipe('M110,125H990',CWR,'cw')+pipe('M990,147H110',CWS,'cw');
    p.towers.forEach((c,j)=>{const x=bayX(j); s+=`<path class="pipe" d="M${x-14},104V125" stroke="${CWR}"/><path class="pipe" d="M${x+14},104V147" stroke="${CWS}"/>`;});
    p.chillers.forEach((c,i)=>{const x=bayX(i);
      s+=`<path class="pipe" d="M${x-22},232V125" stroke="${CWR}"/><path class="pipe" d="M${x+22},232V147" stroke="${CWS}"/>`;
      s+=`<path class="pipe" d="M${x+22},340V455" stroke="${CHWS}"/><path class="pipe" d="M${x-22},340V480" stroke="${CHWR}"/>`;
    });
    // chilled water headers & distribution
    s+=pipe('M110,455H990',CHWS,'chw')+pipe('M990,480H110',CHWR,'chw');
    [0,1,2,3].forEach(k=>{const x=300+k*160; s+=`<path class="pipe" d="M${x},455V535" stroke="${CHWS}"/><path class="pipe" d="M${x},535V572" stroke="${CHWS}"/>`;});
    s+=pipe('M300,572H990',CHWS,'dist');
    s+=`<text x="985" y="592" text-anchor="end" fill="var(--muted)" font-size="12" font-family="var(--sans)">To CBD loop →</text><text x="112" y="500" fill="var(--muted)" font-size="12" font-family="var(--sans)">← Return from CBD</text>`;
    // future bay
    s+=`<g fill="none" stroke="var(--line-2)" stroke-dasharray="5 5"><rect x="${fx-42}" y="12" width="84" height="92" rx="3"/><rect x="${fx-42}" y="232" width="84" height="108" rx="3"/></g>
      <g fill="var(--faint)" font-family="var(--sans)" font-size="11" text-anchor="middle"><text x="${fx}" y="54">Space for</text><text x="${fx}" y="69">future CT</text><text x="${fx}" y="280">Space for</text><text x="${fx}" y="295">future CH</text></g>`;
    // cooling towers
    p.towers.forEach((c,j)=>{const x=bayX(j);
      s+=G(c.id,`<rect class="box" x="${x-42}" y="12" width="84" height="92" rx="3"/>${fan(c.id,x,44,20)}<circle id="q-d-${c.id}" cx="${x+34}" cy="20" r="4" fill="var(--off)"/><text x="${x}" y="80" text-anchor="middle" font-size="11">${c.id}</text><text class="s" id="q-v1-${c.id}" x="${x}" y="96" text-anchor="middle">—</text>`);
    });
    // chillers
    p.chillers.forEach((c,i)=>{const x=bayX(i),bx=x-42;
      s+=G(c.id,`<rect class="box" x="${bx}" y="232" width="84" height="108" rx="3"/><text class="t" x="${bx+8}" y="252">${c.id}</text><circle id="q-d-${c.id}" cx="${bx+74}" cy="247" r="4.5" fill="var(--off)"/>
        <rect x="${bx+8}" y="260" width="68" height="6" rx="2" fill="var(--line)"/><rect id="q-b-${c.id}" x="${bx+8}" y="260" width="0" height="6" rx="2" fill="var(--chw)"/>
        <text id="q-v1-${c.id}" x="${bx+8}" y="286" font-size="11">—</text><text class="s" id="q-v2-${c.id}" x="${bx+8}" y="304" font-size="10.5">—</text><text class="s" id="q-v3-${c.id}" x="${bx+8}" y="322" font-size="10.5">—</text>`);
    });
    p.cwp.forEach((c,i)=>{s+=pump(c.id,bayX(i)+22,190,lab)});
    p.chwp.forEach((c,i)=>{s+=pump(c.id,bayX(i)+22,395,lab)});
    p.dp.forEach((c,k)=>{s+=pump(c.id,300+k*160,535,lab)});
    return `<svg viewBox="0 0 1000 600" role="img" aria-label="CUC chiller plant schematic: 9 chiller bays and 1 future bay">${s}</svg>`;
  }

  function towerSVG(t){
    let s='';
    const n=t.ahus, slot=540/n, bh=Math.min(slot-14,82);
    s+=pipe('M20,250H150',CHWS,'chw')+pipe('M150,340H20',CHWR,'chw');
    s+=`<text x="22" y="240" fill="var(--muted)" font-size="12" font-family="var(--sans)">From CUC →</text><text x="22" y="362" fill="var(--muted)" font-size="12" font-family="var(--sans)">← To CUC</text>`;
    s+=pipe('M330,250H420V20',CHWS,'sec')+`<path class="pipe" d="M420,250V580" stroke="${CHWS}"/>`;
    s+=`<path class="pipe" d="M450,20V340H330" stroke="${CHWR}"/><path class="pipe" d="M450,340V580" stroke="${CHWR}"/>`;
    t.ahu.forEach((a,i)=>{const yc=30+slot*i+slot/2, y=yc-bh/2;
      s+=`<path class="pipe" d="M420,${yc-12}H500" stroke="${CHWS}"/><path class="pipe" d="M500,${yc+12}H450" stroke="${CHWR}"/>`;
      s+=`<path class="pipe" d="M800,${yc}H850" stroke="var(--line-2)" stroke-width="10"/><path class="flow" data-flow="air" d="M800,${yc}H850"/>`;
      s+=G(a.id,`<rect class="box" x="500" y="${y}" width="300" height="${bh}" rx="3"/>${fan(a.id,538,yc,Math.min(22,bh/2-6))}<text class="t" x="572" y="${yc-8}">${a.id}</text><circle id="q-d-${a.id}" cx="786" cy="${y+13}" r="4.5" fill="var(--off)"/><text id="q-v1-${a.id}" x="572" y="${yc+10}">—</text><text class="s" id="q-v2-${a.id}" x="572" y="${yc+26}">—</text>`);
    });
    s+=G('ETS-1',`<rect class="box" x="150" y="210" width="180" height="170" rx="3"/>${[0,1,2,3,4,5,6,7].map(k=>`<line x1="${176+k*9}" x2="${176+k*9}" y1="232" y2="290" stroke="var(--line-2)" stroke-width="3"/>`).join('')}<text class="t" x="252" y="236">ETS-1</text><text class="s" x="252" y="254">Plate HX</text><circle id="q-d-ETS-1" cx="316" cy="224" r="4.5" fill="var(--off)"/><text id="q-v1-ETS-1" x="166" y="316">—</text><text class="s" id="q-v2-ETS-1" x="166" y="336">—</text><text class="s" id="q-v3-ETS-1" x="166" y="356">—</text>`);
    s+=G('ZONE',`<rect class="box" x="850" y="20" width="130" height="560" rx="3"/><text class="t" x="864" y="46">Zones</text><text class="s" x="864" y="64">FCUs · VAV boxes</text><text id="q-v1-ZONE" x="864" y="280" style="font-family:var(--display);font-weight:600;font-size:34px">—</text><text class="s" id="q-v2-ZONE" x="864" y="302">—</text><text class="s" id="q-v3-ZONE" x="864" y="320">—</text><circle id="q-d-ZONE" cx="966" cy="34" r="4.5" fill="var(--off)"/>`);
    return `<svg viewBox="0 0 1000 600" role="img" aria-label="${esc(t.name)} HVAC schematic">${s}</svg>`;
  }

  // ---------- readings & controls
  function readings(id){
    const e=getEq(id), a=asset(), p=S.plant;
    switch(typeOf(id)){
      case 'chiller': return [['Load',f0(e.pct),'%'],['Cooling',f0(e.tr),'TR'],['Power',f0(e.kW),'kW'],['Efficiency',e.running?f2(e.kwtr):'—','kW/TR'],['COP',e.running?f2(e.cop):'—',''],['Evap in → out',`${f1(e.evapIn)} → ${f1(e.evapOut)}`,'°C'],['Cond in → out',`${f1(e.condIn)} → ${f1(e.condOut)}`,'°C'],['Evap flow',e.running?f0(e.flow):'0','l/s'],['Run hours',f0(e.hours),'h'],['Capacity','3,000','TR']];
      case 'tower': return [['Fan speed',f0(e.fan),'%'],['Fan power',f1(e.kW),'kW'],['Approach',f1(p.approach),'K'],['Wet bulb',f1(S.site.weather.wb),'°C'],['CW to chillers',f1(p.cws),'°C'],['CW return',f1(p.cwr),'°C'],['Mode',e.fanOverride==null?'Auto':'Manual',''],['Towers running',`${p.ctRun} / ${p.towers.length}`,'']];
      case 'chwp': case 'cwp': return [['Speed',f1(e.hz),'Hz'],['Power',f0(e.kW),'kW'],['Flow',f0(e.flow),'l/s'],['Head',e.running?f1(e.head):'0','m']];
      case 'dp': return [['Speed',f1(e.hz),'Hz'],['Power',f0(e.kW),'kW'],['Flow',f0(e.flow),'l/s'],['Head',e.running?f1(e.head):'0','m'],['Remote ΔP',f2(p.remoteDP),'bar'],['Mode',e.speedOverride==null?'Auto':'Manual','']];
      case 'ets': return [['Primary S / R',`${f1(e.priS)} / ${f1(e.priR)}`,'°C'],['Secondary S / R',`${f1(e.secS)} / ${f1(e.secR)}`,'°C'],['Control valve',f0(e.valve),'%'],['Primary flow',f0(e.flow),'l/s'],['HX approach',f1(e.secS-e.priS),'K'],['Heat transfer',f0(a.load),'TR']];
      case 'ahu': return [['Fan speed',f0(e.fan),'%'],['Fan power',f1(e.kW),'kW'],['Supply air',f1(e.sat),'°C'],['SAT setpoint',f1(a.satSP),'°C'],['CHW valve',f0(e.valve),'%'],['CO₂',f0(e.co2),'ppm'],['Humidity',e.running?f0(e.rh):'—','%RH'],['Filter ΔP',e.running?f0(e.filterPa):'—','Pa']];
      case 'zone': return [['Avg zone temp',f1(a.zoneT),'°C'],['Setpoint',f1(a.zoneSP),'°C'],['Comfort',f0(a.comfort),'%'],['Occupancy',f0(a.occ*100),'%'],['Cooling load',f0(a.load),'TR'],['Design load',f0(a.design),'TR']];
    }
  }
  const slider=(id,label,min,max,step,val,unit)=>`<div class="row"><label class="label" for="${id}">${label}</label><output id="${id}-o" for="${id}">${(+val).toFixed(step<1?1:0)} ${unit}</output><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" data-unit="${unit}"></div>`;

  function buildInspector(){
    const id=UI.selEq, e=getEq(id), a=asset(), type=typeOf(id), p=S.plant;
    let ctl='', note='';
    if(type==='chiller'){ctl=slider('ctl-chws','Plant CHWS setpoint',4.5,8,0.1,p.chwsSP,'°C');note='Raise the setpoint to watch kW/TR fall — and supply-air temperatures in the towers creep up.'}
    if(type==='tower'){ctl=slider('ctl-fan','Fan speed override',20,100,1,e.fanOverride??Math.round(e.fan||60),'%');note='Slowing fans raises the approach, warms condenser water and costs chiller efficiency.'}
    if(type==='dp'){ctl=slider('ctl-dp','Speed override',30,50,0.5,e.speedOverride??+(e.hz||40).toFixed(1),'Hz');note='Pump power follows the cube of speed — compare Hz to kW.'}
    if(type==='ahu'){ctl=slider('ctl-sat',`${a.id} SAT setpoint`,11,16,0.1,a.satSP,'°C')+slider('ctl-fan','Fan speed override',20,100,1,e.fanOverride??Math.round(e.fan||60),'%');note='Warmer supply air saves chilled water but pushes zones toward their limit.'}
    if(type==='zone'){ctl=slider('ctl-zone','Zone cooling setpoint',21,27,0.5,a.zoneSP,'°C');note='Each degree of setpoint changes this tower’s load by roughly 7% of design.'}
    if(type==='ets') note='Fouling cuts heat transfer: secondary supply rises and every AHU in the tower feels it.';
    const btns=[];
    if(type==='chiller'||type==='chwp'||type==='cwp'){
      const i=+id.slice(-2)-1, ch=p.chillers[i];
      const sides=type==='chwp'?[['chwStr','CHW']]:type==='cwp'?[['cwStr','CW']]:[['chwStr','CHW'],['cwStr','CW']];
      sides.forEach(([k,l])=>btns.push(`<button class="btn" data-str="${k}" data-i="${i}">${(ch[k]||1)>1?`Clean ${l} strainer`:`Clog ${l} strainer`}</button>`));
      note+=(note?' ':'')+'Clog a strainer to watch the gap between the PT before and the PT after it grow, and the pump suction pressure fall.';
    }
    if(type!=='zone'&&type!=='ets') btns.push(`<button class="btn" id="btn-en">${e.enabled?'Lock out':'Enable'}</button>`);
    if(type!=='zone') btns.push(`<button class="btn ${e.fault?'pri':'bad'}" id="btn-flt">${e.fault?(type==='ets'?'Clean heat exchanger':'Reset fault'):(type==='ets'?'Simulate fouling':'Inject trip')}</button>`);
    if(type==='tower'||type==='ahu'||type==='dp') btns.push(`<button class="btn" id="btn-auto">Return to auto</button>`);
    $('#insp').innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><div><h3>${id==='ZONE'?esc(a.name)+' zones':id}</h3><div class="sub">${TYPE_NAME[type]}</div></div><span id="eqPill">${pillOf(e)}</span></div>
      <div class="readings" id="readings"></div>
      <div class="ctl"><span class="label">Simulate</span>${ctl}${btns.length?`<div class="btns">${btns.join('')}</div>`:''}<div class="sub" style="margin:0">${note}</div></div>
      <div class="ctl"><span class="label" id="alarmHead">Alarms</span><ul class="alarms" id="alarmList"></ul></div>`;
    const on=(sel,ev,fn)=>{const el=$('#insp').querySelector(sel); if(el) el.addEventListener(ev,fn)};
    const out=el=>{$('#'+el.id+'-o').textContent=`${(+el.value).toFixed(+el.step<1?1:0)} ${el.dataset.unit}`};
    on('#ctl-chws','input',ev=>{p.chwsSP=+ev.target.value;out(ev.target);UI.tick()});
    on('#ctl-zone','input',ev=>{a.zoneSP=+ev.target.value;out(ev.target);UI.tick()});
    on('#ctl-sat','input',ev=>{a.satSP=+ev.target.value;out(ev.target);UI.tick()});
    on('#ctl-dp','input',ev=>{e.speedOverride=+ev.target.value;out(ev.target);UI.tick()});
    on('#ctl-fan','input',ev=>{e.fanOverride=+ev.target.value;out(ev.target);UI.tick()});
    on('#btn-en','click',()=>{e.enabled=!e.enabled;UI.tick();buildInspector()});
    on('#btn-flt','click',()=>{e.fault=!e.fault;UI.tick();buildInspector()});
    on('#btn-auto','click',()=>{if(type==='dp')e.speedOverride=null;else e.fanOverride=null;UI.tick();buildInspector()});
    $('#insp').querySelectorAll('[data-str]').forEach(b=>b.addEventListener('click',()=>{const ch=p.chillers[+b.dataset.i],k=b.dataset.str; ch[k]=(ch[k]||1)>1?1:6; UI.tick(); buildInspector();}));
    document.querySelectorAll('#detail .eq').forEach(g=>g.classList.toggle('sel',g.dataset.eq===id));
    updateInspector();
  }

  function updateInspector(){
    const id=UI.selEq, e=getEq(id);
    if(!$('#readings')) return;
    $('#readings').innerHTML=readings(id).map(([l,v,u])=>`<div><span class="label">${l}</span><strong>${v}<small>${u}</small></strong></div>`).join('');
    $('#eqPill').innerHTML=pillOf(e);
    const list=[...S.alarms.values()].filter(x=>x.asset===UI.selected).sort((x,y)=>(x.sev==='crit'?0:1)-(y.sev==='crit'?0:1));
    $('#alarmHead').textContent=`Alarms · ${asset().kind==='plant'?'CUC':UI.selected} (${list.length})`;
    $('#alarmList').innerHTML=list.length?list.map(x=>`<li style="--c:${COL[x.sev]}"><time>${x.since.toLocaleTimeString('en-GB')}</time><span>${esc(x.text)}</span></li>`).join(''):`<li style="--c:var(--ok)"><time>—</time><span>No active alarms. Try “Inject trip” to see the plant respond.</span></li>`;
  }

  // ---------- detail build / update
  UI.buildDetail=function(){
    const a=asset(), isP=a.kind==='plant';
    const eyebrow=isP?'Plant · 9 chillers × 3,000 TR · 9 cooling towers · 1 future bay':`${a.id==='ICON'?'Tower':'Tower · '+a.id} · ${a.use} · fed from CUC via ETS`;
    const chips=[S.plant,...S.towers].map(b=>`<button class="chip${b.id===a.id?' on':''}" data-go="${b.id}"><i id="cd-${b.id}"></i>${b.id==='ICON'?'Iconic':b.id}</button>`).join('');
    $('#detail').innerHTML=`<div class="dhead"><button class="btn back" id="back">← Site map</button>
        <div class="dname"><span class="label">${esc(eyebrow)}</span><h2>${esc(a.name)}</h2></div><span id="dPill"></span>
        <nav class="chips" aria-label="Switch building">${chips}</nav></div>
      <div class="dk" id="dk"></div>
      <div class="body"><div class="schem"><div class="schem-h" id="schemH"></div><div class="schem-fit" id="schemFit"></div><div class="legend" id="schemLegend"></div></div>
      <div class="insp" id="insp"></div></div>`;
    $('#back').addEventListener('click',()=>UI.setView('map'));
    document.querySelectorAll('#detail [data-go]').forEach(c=>c.addEventListener('click',()=>{ if(c.dataset.go!==UI.selected) UI.open(c.dataset.go); }));
    renderSchem(); buildInspector(); UI.updateDetail();
  };

  // overview schematic, or the hookup of the selected equipment
  function bindEq(sel,fn){
    document.querySelectorAll(sel).forEach(g=>{
      const go=()=>fn(g.dataset.eq);
      g.addEventListener('click',go); g.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();go()}});
    });
  }
  function renderSchem(){
    const a=asset(), isP=a.kind==='plant';
    const sp=UI.hookMode?UI.hook.spec(UI.selected,UI.selEq):null;
    UI.hookSpec=sp;
    if(sp){
      $('#schemH').innerHTML=`<button class="btn back" id="schemBack">← ${isP?'CUC plant':esc(a.name)} schematic</button><span class="label">Hookup · ${esc(sp.title)}</span>`;
      $('#schemFit').innerHTML=UI.hook.svg(sp);
      $('#schemLegend').innerHTML=UI.hook.legend;
      $('#schemBack').addEventListener('click',()=>{UI.hookMode=false;renderSchem();});
      bindEq('#schemFit .hk-eq',eq=>{UI.selEq=eq;UI.hookMode=true;renderSchem();buildInspector();});
      UI.hook.update(sp);
    }else{
      UI.hookSpeed={};
      $('#schemH').innerHTML=`<span class="label">Live schematic — click any equipment to open its hookup</span>`;
      $('#schemFit').innerHTML=isP?plantSVG(a):towerSVG(a);
      $('#schemLegend').innerHTML=`<span style="--c:var(--chw)"><i></i>Chilled water supply</span><span style="--c:var(--chwr)"><i></i>Chilled water return</span>${isP?'<span style="--c:var(--cws)"><i></i>Condenser water to chillers</span><span style="--c:var(--cw)"><i></i>Condenser water to towers</span>':'<span style="--c:var(--line-2)"><i></i>Supply air duct</span>'}`;
      bindEq('#schemFit .eq',eq=>{UI.selEq=eq;UI.hookMode=!!UI.hook.spec(UI.selected,eq);renderSchem();buildInspector();});
    }
    document.querySelectorAll('#detail .eq').forEach(g=>g.classList.toggle('sel',g.dataset.eq===UI.selEq));
  }

  function setT(id,txt){const el=document.getElementById(id); if(el) el.textContent=txt}
  function dot(e,id){const el=document.getElementById('q-d-'+id); if(el) el.setAttribute('fill',COL[eqState(e)[0]])}

  UI.updateDetail=function(){
    const a=asset(), isP=a.kind==='plant';
    if(!$('#dk')) return;
    $('#dPill').innerHTML=UI.pill(a.status);
    [S.plant,...S.towers].forEach(b=>{const d=document.getElementById('cd-'+b.id); if(d) d.style.background=COL[b.status]});
    let tiles;
    if(isP){const h=a.hist;
      tiles=[['Cooling delivered',f0(a.produced),'TR',spark(h.map(x=>x.load),200,26,'var(--chw)')],['Plant efficiency',f2(a.kwtr),'kW/TR',spark(h.map(x=>x.kwtr),200,26,'var(--se)')],['CHWS / CHWR',`${f1(a.chws)} / ${f1(a.chwr)}`,'°C',spark(h.map(x=>x.chws),200,26,'var(--chw)')],['Total power',f0(a.kW),'kW',`Chillers ${f0(a.chKW)} · pumps ${f0(a.pumpKW)} · fans ${f0(a.ctKW)}`],['Chillers online',`${a.run} / ${a.chillers.length}`,'',`${f0(a.part*100)}% each`],['Cooling towers',`${a.ctRun} / ${a.towers.length}`,'',`Approach ${f1(a.approach)} K`]];
    }else{
      tiles=[['Cooling load',f0(a.load),'TR',spark(a.hist,200,26,'var(--chw)')],['Of design',f0(a.lf*100),'%',`Design ${f0(a.design)} TR`],['Avg zone temp',f1(a.zoneT),'°C',`Setpoint ${f1(a.zoneSP)} °C`],['Comfort',f0(a.comfort),'%','Floor area in band'],['ETS primary S / R',`${f1(a.ets.priS)} / ${f1(a.ets.priR)}`,'°C',`${f0(a.ets.flow)} l/s`],['AHU fans',f0(a.fanKW),'kW',`${a.ahu.filter(x=>x.running).length} of ${a.ahus} running`]];
    }
    $('#dk').innerHTML=tiles.map(([l,v,u,d])=>`<div class="kpi"><span class="label">${l}</span><span class="v">${v}<small>${u}</small></span>${d.startsWith('<')?`<svg viewBox="0 0 200 26" preserveAspectRatio="none">${d}</svg>`:`<span class="d">${d}</span>`}</div>`).join('');

    if(isP){
      a.chillers.forEach(c=>{dot(c,c.id);setT('q-v1-'+c.id,c.running?`${f0(c.pct)}% load`:eqState(c)[1]);setT('q-v2-'+c.id,`${f0(c.kW)} kW`);setT('q-v3-'+c.id,c.running?`${f2(c.kwtr)} kW/TR`:'— kW/TR');
        const b=document.getElementById('q-b-'+c.id); if(b) b.setAttribute('width',(68*c.pct/100).toFixed(1));});
      a.towers.forEach(c=>{dot(c,c.id);setT('q-v1-'+c.id,c.running?`${f0(c.fan)}%`:eqState(c)[1])});
      [...a.chwp,...a.cwp,...a.dp].forEach(c=>dot(c,c.id));
    }else{
      a.ahu.forEach(x=>{dot(x,x.id);setT('q-v1-'+x.id,x.running?`SAT ${f1(x.sat)} °C · fan ${f0(x.fan)}%`:eqState(x)[1]);setT('q-v2-'+x.id,`CHW valve ${f0(x.valve)}% · CO₂ ${f0(x.co2)} ppm`)});
      const e=a.ets; dot(e,'ETS-1'); setT('q-v1-ETS-1',`Pri ${f1(e.priS)} → ${f1(e.priR)} °C`); setT('q-v2-ETS-1',`Sec ${f1(e.secS)} → ${f1(e.secR)} °C`); setT('q-v3-ETS-1',`Valve ${f0(e.valve)}%`);
      dot(a,'ZONE'); setT('q-v1-ZONE',`${f1(a.zoneT)} °C`); setT('q-v2-ZONE',`SP ${f1(a.zoneSP)} °C`); setT('q-v3-ZONE',`Comfort ${f0(a.comfort)}%`);
    }
    if(UI.hookSpec) UI.hook.update(UI.hookSpec);
    updateInspector();
  };

  // ---------- motion: fans, impellers, water flow
  const angles={}, offs={};
  let last=performance.now();
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  function frame(now){
    const dt=Math.min(0.1,(now-last)/1000); last=now;
    if(!reduce.matches&&UI.view==='detail'){
      const a=asset(), isP=a.kind==='plant';
      const stepped=new Set();
      document.querySelectorAll('#detail [data-rot]').forEach(el=>{
        const id=el.dataset.rot, e=getEq(id); if(!e) return;
        if(!stepped.has(id)){ stepped.add(id);
          const sp=!e.running?0:(e.fan!=null?e.fan*6:e.hz!=null?e.hz*10:(e.pct||0)*4);
          angles[id]=((angles[id]||0)+sp*dt)%360; }
        el.setAttribute('transform',`rotate(${angles[id].toFixed(1)})`);
      });
      const speed={chw:isP?(a.run?25+45*a.part:0):20+50*a.lf, cw:isP?(a.run?25+45*a.part:0):0, dist:isP?(a.dpRun?20+60*a.demand/27000:0):0, sec:isP?0:(a.ets.fault?8:20+50*a.lf), air:isP?0:30+0.6*(a.ahu.reduce((s,x)=>s+x.fan,0)/a.ahus)};
      document.querySelectorAll('#detail [data-flow]').forEach((el,i)=>{
        const k=el.dataset.flow, v=(k in (UI.hookSpeed||{}))?UI.hookSpeed[k]:(speed[k]||0); offs[i]=((offs[i]||0)-v*dt)%200; el.style.strokeDashoffset=offs[i];
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  UI.start();
})();
