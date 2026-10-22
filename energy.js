/* Operations & energy (Management tab): what-if operating scenarios for the CUC plant and the building AHUs, the current
   plant sequence against an optimised one, load-based staging, and the few maintenance KPIs that drive cost.
   DECISION SUPPORT ONLY — nothing here writes to the simulation or to any equipment.
   Data classes shown on the page:
     LIVE  = the dashboard's plant simulation right now (no real plant or BMS is connected)
     CALC  = calculated by the model below from live or scenario inputs
     ILLUS = illustrative assumptions: scenario loads and weather, tariff, wear and repair rates
   The plant model uses the same equations as sim.js (chiller kW/TR curve, tower approach, pump affinity laws), so the
   current-sequence result for "Live now" matches the measured values. */
(function(){
  const {S,$,f0,f1,esc}=UI;
  const P=S.plant, CAP=3000;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const TARIFF=1.60;                                              // ILLUS: EGP per kWh, flat
  const WEAR={ch:85,ct:9,chwp:6,cwp:7,dp:10,ahu:4};               // ILLUS: wear-related maintenance accrual, EGP per run-hour
  const REPAIR={ch:185000,ct:42000,chwp:26000,cwp:26000,dp:38000};// ILLUS: corrective repair per failed unit, EGP
  const RATE={labour:900,pmParts:.35,corrMult:1.5,corrParts:{ch:55000,ct:12000,pump:8000,ahu:6000,ets:9000}}; // ILLUS: EGP per crew-hour, parts
  const RUNH=2500;                                                // chiller major service interval — same rule as maint.js
  const LIM={chMin:.30,chMaxCur:.90,chMaxOpt:.92,ctCell:.60,ctFanMin:25,cwpHz:[50,46,42,38],pumpHzMin:30,ahuMin:35,dpTR:6500};
  const TOTD=S.towers.reduce((a,t)=>a+t.design,0);
  const SC=[
    {k:'live',c:'var(--se)',name:'Live now',sub:'measured load & weather',tag:'LIVE'},
    {k:'high',c:'var(--cw)',name:'High load',sub:'August peak, 14:00–20:00 · 6 h',D:23800,wb:28.5,h:6,tag:'ILLUS'},
    {k:'normal',c:'var(--chw)',name:'Normal load',sub:'spring / autumn working day · 10 h',D:14000,wb:22,h:10,tag:'ILLUS'},
    {k:'low',c:'var(--mkup)',name:'Low load',sub:'winter night & weekend · 8 h',D:4300,wb:13,h:8,night:true,tag:'ILLUS'},
    {k:'fail',c:'var(--warn)',name:'Maintenance / failure',sub:'summer day, units out · 10 h',D:21500,wb:27,h:10,tag:'ILLUS'}];
  const FAIL0=['CH-03','CT-05','CHWP-07','DP-02'];
  const GROUPS=[['ch','Chillers',P.chillers],['ct','Cooling towers',P.towers],['chwp','Primary CHWP',P.chwp],['cwp','Condenser CWP',P.cwp],['dp','Secondary DP',P.dp]];
  const ok=u=>u.enabled&&!u.fault;
  const st={sc:'live',view:'opt',out:new Set(FAIL0)};
  let last=0, sig='', cache={key:''}, bound=false;

  // ---------- inputs ----------
  function inputs(sc){
    const liveOut=new Set(GROUPS.flatMap(([,,a])=>a.filter(u=>!ok(u)).map(u=>u.id)));
    const out=new Set(liveOut); if(sc.k==='fail') st.out.forEach(id=>out.add(id));
    const avail={}; GROUPS.forEach(([g,,a])=>avail[g]=a.filter(u=>!out.has(u.id)));
    avail.ch.sort((a,b)=>a.hours-b.hours); // rotation: lowest run-hours first, as the plant sequence does
    const nUse=Math.min(avail.ch.length,avail.chwp.length,avail.cwp.length);  // a chiller needs a CHWP and a CWP
    const live=sc.k==='live', hr=new Date().getHours();
    return {sc,live,out,liveOut,avail,nUse,h:sc.h||1,
      D:live?S.site.demand:sc.D, wb:live?S.site.weather.wb:sc.wb,
      night:live?hr<8||hr>=19:!!sc.night, bl:S.towers.map(t=>({t,lf:live?t.lf:clamp(sc.D/(TOTD*1.03),.15,1)}))};
  }

  // ---------- plant model (same equations as sim.js) ----------
  const kwtrCh=(p,cws,sp,cf)=>clamp(0.50+0.4*(p-0.82)**2+0.017*(cws-29)+0.028*(5.5-sp)+0.25*(1-cf)*p,0.42,1.2);
  function evalPlant(I,n,nCT,cwpHz,fanOff,sp,dpN){
    const prod=Math.min(I.D,n*CAP), part=n?prod/(n*CAP):0;
    const cell=nCT?Math.min(1,part*n/nCT):0, short=n&&nCT<n?(n-nCT)/n:0;  // fewer cells than chillers raises the approach
    const fan=nCT?clamp(clamp(32+58*cell+(I.wb-21)*3,25,100)+fanOff,LIM.ctFanMin,100):0;
    const app=n?clamp(2.1+4.2*cell*Math.pow(60/Math.max(fan,20),0.6)+short*5,1.5,12):0;
    const cws=Math.max(20,I.wb+app), cf=cwpHz/50, k=kwtrCh(part,cws,sp,cf);   // lower condenser flow costs chiller efficiency
    const chwpHz=30+20*part, dr=dpN?clamp(I.D/(dpN*LIM.dpTR),0,1):0, dpHz=dpN?30+20*dr:0;
    const r={n,nCT,cwpHz,fanOff,fan,sp,cws,app,part,k,dpN,dpHz,chwpHz,unmet:I.D-prod,prod,
      chKW:prod*k,ctKW:nCT*110*(fan/100)**3,chwpKW:n*130*(chwpHz/50)**3,cwpKW:n*180*cf**3,dpKW:dpN*360*(dpHz/50)**3};
    r.pumpKW=r.chwpKW+r.cwpKW+r.dpKW; r.plantKW=r.chKW+r.ctKW+r.pumpKW; r.kwtrPlant=prod?r.plantKW/prod:0;
    return r;
  }
  // the plant's present sequence: stage at 90 % loading, one tower per chiller, CWP at full speed, minimum DP count
  function curPlant(I){
    const n=Math.min(Math.max(1,Math.ceil(I.D/(CAP*LIM.chMaxCur))),I.nUse);
    return evalPlant(I,n,Math.min(n,I.avail.ct.length),50,0,5.5,Math.min(Math.max(1,Math.ceil(I.D/LIM.dpTR)),I.avail.dp.length));
  }
  // optimised: search chiller count, tower cells, CWP speed, tower fan offset and DP count for the lowest plant kW,
  // inside the limits — chiller 30 % minimum load and 92 % maximum, ≥ 60 % design flow per tower cell, CWP ≥ 38 Hz,
  // pumps ≥ 30 Hz, CHWS 5.5 °C (reset to 6.5 °C only at night / low load). More units can win: the search decides.
  function optPlant(I){
    const aCH=I.nUse, aCT=I.avail.ct.length, aDP=I.avail.dp.length, sp=I.night?6.5:5.5;
    const nLo=Math.min(aCH,Math.max(1,Math.ceil(I.D/(CAP*LIM.chMaxOpt)))), dpLo=Math.min(aDP,Math.max(1,Math.ceil(I.D/LIM.dpTR)));
    let best=null;
    for(let n=nLo;n<=aCH;n++){
      if(n>nLo&&I.D/(n*CAP)<LIM.chMin) break;
      for(let c=Math.min(n,aCT);c<=Math.min(aCT,Math.floor(n/LIM.ctCell));c++)
        for(const hz of LIM.cwpHz) for(const fo of [-10,0,10]) for(let d=dpLo;d<=aDP;d++){
          const r=evalPlant(I,n,c,hz,fo,sp,d); if(!best||r.plantKW<best.plantKW) best=r; }
    }
    return best||evalPlant(I,0,0,50,0,sp,0);
  }
  // AHUs: present practice runs every available AHU at the fixed fan schedule; optimised resets duct static pressure
  // (fan ≥ 35 % for ventilation) and, at night only, stops AHUs serving unoccupied office floors (≥ 1 kept per building)
  function ahus(I,opt){
    let kw=0,on=0,tot=0;
    I.bl.forEach(({t,lf})=>{
      const av=t.ahu.filter(ok).length; tot+=t.ahus;
      let m=av, fan=clamp(42+50*lf,20,100);
      if(opt){ fan=Math.max(LIM.ahuMin,fan-16*(1-lf)); if(I.night&&/^(Office|Mixed)/.test(t.use)) m=Math.max(Math.min(1,av),av-Math.floor(t.ahus*.4)); }
      on+=m; kw+=m*t.design/1000*28*(fan/100)**3;
    });
    return {kw,on,tot};
  }
  // which units run: chillers by run-hours; towers / CHWP / CWP paired by bay with a free healthy unit covering a missing partner
  const bay=u=>+u.id.slice(-2)-1;
  function pick(arr,avail,runCh,count){
    const okS=new Set(avail), bays=runCh.map(bay), chosen=[], sb=new Set();
    bays.forEach(i=>{ if(chosen.length<count&&okS.has(arr[i])) chosen.push(arr[i]); });
    const spare=arr.filter(u=>okS.has(u)&&!chosen.includes(u)&&!bays.includes(bay(u)));
    while(chosen.length<count&&spare.length){ const u=spare.shift(); if(chosen.length<runCh.length) sb.add(u.id); chosen.push(u); }
    return {run:new Set(chosen.map(u=>u.id)),sb};
  }
  function strategy(I,opt){
    let r, ah, runs={}, sb=new Set();
    if(I.live&&!opt){ // measured
      r={n:P.run,nCT:P.ctRun,dpN:P.dpRun,part:P.part,sp:P.chwsSP,cws:P.cws,cwpHz:50,prod:P.produced,unmet:P.unmet,
        plantKW:P.kW,chKW:P.chKW,ctKW:P.ctKW,pumpKW:P.pumpKW,kwtrPlant:P.kwtr,fan:P.towers.filter(c=>c.running).reduce((a,c)=>a+c.fan,0)/Math.max(1,P.ctRun)};
      GROUPS.forEach(([g,,a])=>runs[g]=new Set(a.filter(u=>u.running).map(u=>u.id)));
      r.nCHWP=runs.chwp.size; r.nCWP=runs.cwp.size;
      ah={kw:S.towers.reduce((a,t)=>a+(t.fanKW||0),0),on:S.towers.reduce((a,t)=>a+t.ahu.filter(x=>x.running).length,0),tot:S.towers.reduce((a,t)=>a+t.ahus,0)};
    } else {
      r=opt?optPlant(I):curPlant(I); ah=ahus(I,opt);
      const ch=I.avail.ch.slice(0,r.n); runs.ch=new Set(ch.map(u=>u.id));
      // chillers that only run because a preferred unit is out
      const pref=GROUPS[0][2].filter(u=>!I.liveOut.has(u.id)).sort((a,b)=>a.hours-b.hours).slice(0,r.n).map(u=>u.id);
      ch.forEach(u=>{ if(!pref.includes(u.id)) sb.add(u.id); });
      [['ct',r.nCT],['chwp',r.n],['cwp',r.n]].forEach(([g,c])=>{ const x=pick(GROUPS.find(G=>G[0]===g)[2],I.avail[g],ch,c); runs[g]=x.run; x.sb.forEach(id=>sb.add(id)); });
      runs.dp=new Set(I.avail.dp.slice(0,r.dpN).map(u=>u.id));
      if(I.out.size>I.liveOut.size){ const prefDP=P.dp.filter(u=>!I.liveOut.has(u.id)).slice(0,r.dpN).map(u=>u.id); runs.dp.forEach(id=>{ if(!prefDP.includes(id)) sb.add(id); }); }
      r.nCHWP=runs.chwp.size; r.nCWP=runs.cwp.size;
    }
    r.ahu=ah; r.runs=runs; r.sb=sb;
    r.totKW=r.plantKW+ah.kw; r.costH=r.totKW*TARIFF;
    r.wearH=WEAR.ch*r.n+WEAR.ct*r.nCT+WEAR.chwp*r.nCHWP+WEAR.cwp*r.nCWP+WEAR.dp*r.dpN+WEAR.ahu*ah.on;
    return r;
  }
  function scenario(sc){
    const I=inputs(sc), cur=strategy(I,false), opt=strategy(I,true);
    const aCap=I.nUse*CAP, crit=GROUPS.reduce((a,[,,arr])=>a+arr.length,0), av=GROUPS.reduce((a,[g])=>a+I.avail[g].length,0);
    const repair=sc.k==='fail'?[...st.out].reduce((a,id)=>a+REPAIR[id.startsWith('CHWP')?'chwp':id.startsWith('CWP')?'cwp':id.startsWith('CH')?'ch':id.startsWith('CT')?'ct':'dp'],0):0;
    return {sc,I,cur,opt,h:I.h,aCap,spare:aCap-I.D,n1:aCap-I.D>=CAP,avail:av/crit,availN:av,critN:crit,repair,
      dpOK:I.avail.dp.length*LIM.dpTR>=I.D,saveH:(cur.totKW-opt.totKW)*TARIFF,savePct:cur.totKW?1-opt.totKW/cur.totKW:0};
  }

  // ---------- maintenance KPIs (LIVE from the CMMS simulation in maint.js, costed with ILLUS rates) ----------
  function maintKPIs(){
    const M=UI.maintSnapshot?UI.maintSnapshot():null;
    const cg=g=>g==='chwp'||g==='cwp'||g==='dp'?'pump':g;
    let pm=0, corr=0;
    if(M){
      M.plan.forEach(x=>{ const h=x.rh?16:x.s.h; pm+=h*RATE.labour*(1+RATE.pmParts); });
      M.corr.forEach(x=>{ corr+=x.h*RATE.labour*RATE.corrMult+(RATE.corrParts[cg(x.a.g)]||8000); });
    }
    const all=GROUPS.flatMap(([,,a])=>a), avail=all.filter(ok).length;
    const runH=P.chillers.map(c=>{const left=RUNH-c.hours%RUNH; return {c,left,due:new Date(Date.now()+left/18*864e5)};}).sort((a,b)=>a.left-b.left);
    return {M,pm,corr,avail:avail/all.length,availN:avail,allN:all.length,runH,over:M?M.over.length:0,soon:M?M.soon.length:0,openCorr:M?M.corr.length:0};
  }
  function energyAlerts(){
    const A=[], I=inputs(SC[0]), o=optPlant(I);
    if(o.plantKW&&P.kW>o.plantKW*1.05) A.push(['warn',`Plant drawing ${f0(P.kW-o.plantKW)} kW (${((P.kW/o.plantKW-1)*100).toFixed(1)}%) above the optimised sequence at the current load — ≈ EGP ${f0((P.kW-o.plantKW)*TARIFF)}/h`]);
    const hot=P.towers.filter(c=>c.running&&c.fan>=99).map(c=>c.id);
    if(hot.length) A.push(['warn',`${hot.length>3?`${hot.length} tower fans`:hot.join(', ')} at 100% — approach ${f1(P.approach)} K at WB ${f1(S.site.weather.wb)} °C; no tower margin left, check fill and nozzles`]);
    P.chillers.forEach(c=>{const n=c.id.slice(-2);
      if((c.chwStr||1)>1) A.push(['warn',`CHWP-${n} suction strainer ΔP high — extra pump head and energy until cleaned`]);
      if((c.cwStr||1)>1) A.push(['warn',`CWP-${n} suction strainer ΔP high — extra pump head and energy until cleaned`]);});
    P.chillers.filter(c=>c.running&&c.pct<40).forEach(c=>A.push(['warn',`${c.id} at ${f0(c.pct)}% load — poor part-load efficiency, consider destaging`]));
    if(P.unmet>0) A.push(['crit',`Capacity shortfall ${f0(P.unmet)} TR — no standby chiller`]);
    return A;
  }

  // ---------- chart: plant kW/TR across load, current sequence vs optimised, with optimised chiller staging ----------
  function chart(I,X){
    const cap=I.nUse*CAP; if(!cap) return '<p class="mt-none">No chiller available.</p>';
    const key=[Math.round(I.wb*2),I.night,...['ch','ct','chwp','cwp','dp'].map(g=>I.avail[g].map(u=>u.id).join())].join('|');
    if(key!==cache.key){ const pts=[];
      for(let i=0;i<=24;i++){ const J={...I,D:cap*(0.06+0.94*i/24)}, c=curPlant(J), o=optPlant(J); pts.push({D:J.D,c:c.kwtrPlant,o:o.kwtrPlant,n:o.n,cn:c.n}); }
      cache={key,pts}; }
    const pts=cache.pts, W=520,H=196,L=40,R=8,T=20,B=30;
    let lo=Math.min(...pts.map(p=>Math.min(p.c,p.o)),X.cur.kwtrPlant||9,X.opt.kwtrPlant||9), hi=Math.max(...pts.map(p=>Math.max(p.c,p.o)));
    lo=Math.floor(lo*10)/10; hi=Math.ceil(Math.min(hi,1.6)*10)/10;
    const x=D=>L+(D/cap)*(W-L-R), y=v=>T+(1-(clamp(v,lo,hi)-lo)/(hi-lo))*(H-T-B);
    // bands where the optimised sequence runs the same number of chillers
    const bands=[]; pts.forEach((p,i)=>{ const b=bands[bands.length-1]; if(b&&b.n===p.n) b.j=i; else bands.push({n:p.n,i,j:i}); });
    const edge=i=>i<=0?pts[0].D:i>=pts.length?cap:(pts[i-1].D+pts[i].D)/2;
    const band=bands.map((b,k)=>{const x0=x(edge(b.i)), x1=x(edge(b.j+1)); return `<rect x="${x0.toFixed(1)}" y="${T}" width="${(x1-x0).toFixed(1)}" height="${H-T-B}" class="bd${k%2?' alt':''}"/>`
      +(x1-x0>16?`<text x="${((x0+x1)/2).toFixed(1)}" y="${T-6}" text-anchor="middle" class="bn">${b.n}</text>`:'');}).join('');
    const line=k=>pts.map((p,i)=>`${i?'L':'M'}${x(p.D).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
    const gy=[lo,(lo+hi)/2,hi].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${L-5}" y="${y(v)+3.5}" text-anchor="end">${v.toFixed(2)}</text>`).join('');
    const gx=[.25,.5,.75,1].map(f=>`<text x="${x(cap*f).toFixed(1)}" y="${H-B+13}" text-anchor="${f===1?'end':'middle'}">${f0(cap*f/1000)}k</text>`).join('');
    const mx=x(Math.min(X.I.D,cap));
    return `<figure class="mg-chart en-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Plant kW per TR across load: current sequence against optimised, with the number of chillers the optimised sequence runs">
      <text x="0" y="${T-6}" class="u">kW/TR</text>
      ${band}${gy}${gx}<text x="${(L+W-R)/2}" y="${H-3}" text-anchor="middle" class="u">Plant load, TR (available capacity ${f0(cap)} TR)</text>
      <path d="${line('c')}" class="lc"/><path d="${line('o')}" class="lo"/>
      <line x1="${mx.toFixed(1)}" x2="${mx.toFixed(1)}" y1="${T}" y2="${H-B}" class="mk"/>
      ${X.cur.kwtrPlant?`<circle cx="${mx.toFixed(1)}" cy="${y(X.cur.kwtrPlant).toFixed(1)}" r="4" class="dc"><title>Current: ${X.cur.kwtrPlant.toFixed(3)} kW/TR</title></circle>`:''}
      ${X.opt.kwtrPlant?`<circle cx="${mx.toFixed(1)}" cy="${y(X.opt.kwtrPlant).toFixed(1)}" r="4" class="do"><title>Optimised: ${X.opt.kwtrPlant.toFixed(3)} kW/TR</title></circle>`:''}
      </svg><figcaption class="mt-key"><span><i class="k-cur"></i>Current sequence</span><span><i class="k-opt"></i>Optimised</span><span><b class="en-bn">1–9</b> chillers on (optimised)</span><span><i class="k-mk"></i>${esc(X.sc.name)} · ${f0(X.I.D)} TR</span></figcaption></figure>`;
  }

  // ---------- render ----------
  const TAG={LIVE:'Live (sim)',CALC:'Calculated',ILLUS:'Illustrative'};
  const tag=t=>`<span class="en-tag ${t.toLowerCase()}" title="${t==='LIVE'?'Measured from the dashboard plant simulation — no real plant is connected':t==='CALC'?'Calculated by the model from live or scenario inputs':'Illustrative assumption or sample rate'}">${TAG[t]}</span>`;
  const kw=v=>`${f0(v)} kW`, egp=v=>`EGP ${f0(v)}`, egpk=v=>Math.abs(v)>=1e6?`EGP ${(v/1e6).toFixed(2)} M`:Math.abs(v)>=1e4?`EGP ${f0(v/1e3)} k`:`EGP ${f0(v)}`;
  const dlt=(a,b,lowGood=true,fmt=v=>f0(v))=>{const d=b-a; if(Math.abs(d)<.5) return '<span class="mg-dim">—</span>'; const good=lowGood?d<0:d>0; return `<span class="${good?'mg-ok':'mg-amb'}">${d>0?'+':'−'}${fmt(Math.abs(d))}</span>`;};

  function render(tiles,body,force){
    if(!bound) bind();
    const X=scenario(SC.find(s=>s.k===st.sc)), K=maintKPIs(), AL=energyAlerts();
    const s=[st.sc,st.view,[...st.out].join(),[...X.I.liveOut].join(),K.over,K.openCorr,AL.length].join('|');
    if(!force&&s===sig&&!(st.sc==='live'&&Date.now()-last>5000)) return;
    sig=s; last=Date.now();
    const cards=SC.map(sc=>{ const Y=sc.k===st.sc?X:scenario(sc);
      return `<button class="en-sc${sc.k===st.sc?' on':''}" data-sc="${sc.k}" style="--sc:${sc.c}" aria-pressed="${sc.k===st.sc}"><span class="en-scn">${esc(sc.name)} ${tag(sc.tag)}</span><small>${esc(sc.sub)}</small>
        <span class="en-scv">${f0(Y.I.D)} TR · WB ${f1(Y.I.wb)} °C</span><span class="en-scv">${Y.cur.n} chillers · ${(Y.cur.totKW/1000).toFixed(1)} MW · ${egpk(Y.cur.costH)}/h</span><span class="en-scv">${Y.saveH>0?`<b class="mg-ok">save ${egp(Y.saveH)}/h</b> <em>${(Y.savePct*100).toFixed(1)}%</em>`:'<b class="mg-dim">at optimum</b>'}</span>
        ${!Y.n1||Y.cur.unmet>1||!Y.dpOK?'<i class="en-risk">Risk</i>':''}</button>`;}).join('');
    tiles.innerHTML=`<div class="en-scs">${cards}<button class="btn en-reset" id="enReset"${st.sc==='live'&&st.view==='opt'&&setEq(st.out,FAIL0)?' disabled':''}>↺ Reset scenario</button></div>`;

    const c=X.cur, o=X.opt, h=X.h, curT=X.I.live?'LIVE':'CALC';
    const row=(l,a,b,d,cls)=>`<tr${cls?` class="${cls}"`:''}><th scope="row">${l}</th><td class="r">${a}</td><td class="r">${b}</td><td class="r">${d??''}</td></tr>`;
    const av=g=>X.I.avail[g].length;
    const checks=[
      [o.unmet<1&&X.dpOK,'Demand met',o.unmet>=1?`${f0(o.unmet)} TR short`:!X.dpOK?`distribution pumps short ≈ ${f0(X.I.D-X.I.avail.dp.length*LIM.dpTR)} TR`:''],
      [o.n<=1||o.part>=LIM.chMin,'Chiller ≥ 30% load',''],
      [true,'Tower cell ≥ 60% flow',''],[true,'CWP ≥ 38 Hz · pumps ≥ 30 Hz',''],[true,'AHU fan ≥ 35% (ventilation)',''],
      [true,o.sp>5.5?'CHWS reset to 6.5 °C (low load only)':'CHWS held at 5.5 °C',''],
      [X.n1,`N+1 standby capacity${X.I.nUse<X.I.avail.ch.length?` (${X.I.avail.ch.length-X.I.nUse} chiller without pumps)`:''}`,X.n1?`${f0(X.spare)} TR spare`:`only ${f0(Math.max(0,X.spare))} TR spare`],
      [true,'Min run 30 min / off 15 min on stage changes','']];
    const cmp=`<div class="an-card-h"><h3>Scenario comparison</h3><span class="label">${esc(X.sc.name)} · ${h} h · WB ${f1(X.I.wb)} °C ${tag(X.I.live?'LIVE':'ILLUS')}</span></div>
      <div class="mg-in">
        ${X.sc.k==='fail'?risk(X):''}
        <div class="an-table-wrap"><table class="an-table en-tbl"><thead><tr><th></th><th class="r">Current<br>${tag(curT)}</th><th class="r">Optimised<br>${tag('CALC')}</th><th class="r">Δ</th></tr></thead><tbody>
          ${row('Chillers run / avail.',`${c.n} / ${av('ch')}`,`${o.n} / ${av('ch')}`,dlt(c.n,o.n,true))}
          ${row('Tower cells · fan',`${c.nCT} · ${f0(c.fan)}%`,`${o.nCT} · ${f0(o.fan)}%`,dlt(c.nCT,o.nCT,false))}
          ${row('CHWP · CWP · CWP Hz',`${c.nCHWP} · ${c.nCWP} · ${c.cwpHz}`,`${o.nCHWP} · ${o.nCWP} · ${o.cwpHz}`)}
          ${row('Secondary DP',`${c.dpN} / ${av('dp')}`,`${o.dpN} / ${av('dp')}`,dlt(c.dpN,o.dpN,false))}
          ${row('AHUs running',`${c.ahu.on} / ${c.ahu.tot}`,`${o.ahu.on} / ${o.ahu.tot}`,dlt(c.ahu.on,o.ahu.on,true))}
          ${row('Chiller load · CWS',`${f0(c.part*100)}% · ${f1(c.cws)} °C`,`${f0(o.part*100)}% · ${f1(o.cws)} °C`)}
          ${row('Plant power',kw(c.plantKW),kw(o.plantKW),dlt(c.plantKW,o.plantKW))}
          ${row('AHU fan power',kw(c.ahu.kw),kw(o.ahu.kw),dlt(c.ahu.kw,o.ahu.kw))}
          ${row('Total demand',`<b>${kw(c.totKW)}</b>`,`<b>${kw(o.totKW)}</b>`,dlt(c.totKW,o.totKW),'en-key')}
          ${row('Plant kW/TR',`${c.kwtrPlant.toFixed(3)} /TR`,`${o.kwtrPlant.toFixed(3)} /TR`,dlt(c.kwtrPlant*1000,o.kwtrPlant*1000,true,v=>(v/1000).toFixed(3)))}
          ${row(`Cost ${tag('ILLUS')}`,`${egp(c.costH)}/h`,`${egp(o.costH)}/h`,dlt(c.costH,o.costH))}
          ${row(`Energy over ${h} h`,`${f0(c.totKW*h)} kWh`,`${f0(o.totKW*h)} kWh`,dlt(c.totKW*h,o.totKW*h))}
          ${row('Est. saving vs current','—',`<b class="${X.saveH>0?'mg-ok':''}">${egpk(X.saveH*h)}</b> <small>${(X.savePct*100).toFixed(1)}%</small>`,'','en-key')}
          ${row('Availability · N+1',`${(X.avail*100).toFixed(1)}% · ${X.n1?'OK':'<span class="mg-bad">lost</span>'}`,`${(X.avail*100).toFixed(1)}% · ${X.n1?'OK':'<span class="mg-bad">lost</span>'}`)}
          ${row(`Maint. cost ${tag('ILLUS')}`,egpk(c.wearH*h+X.repair),egpk(o.wearH*h+X.repair),dlt(c.wearH*h,o.wearH*h))}
        </tbody></table></div>
        <div class="en-checks">${checks.map(([okk,l,n])=>`<span class="en-ck ${okk?'ok':'bad'}">${okk?'✓':'✕'} ${l}${n?` <em>${n}</em>`:''}</span>`).join('')}</div>
        ${X.repair?`<p class="mg-note">Maintenance impact includes ${egpk(X.repair)} corrective repair for the units taken out (illustrative) plus run-hour wear.</p>`:''}
      </div>`;

    const showR=st.view==='opt'?o:c, editable=st.sc==='fail';
    const chips=GROUPS.map(([g,l,arr])=>`<div class="en-grp"><span class="label">${l}</span><div class="en-chips">${arr.map(u=>{
        const liveOut=X.I.liveOut.has(u.id), out=X.I.out.has(u.id), run=showR.runs[g]&&showR.runs[g].has(u.id), sbk=run&&showR.sb.has(u.id);
        const cls=out?(liveOut?'out live':'out'):sbk?'sb':run?'run':'stby', t=out?(liveOut?'Unavailable now (live)':'Taken out in this scenario'):sbk?'Standby started to cover':run?'Running':'Standby';
        return `<button class="en-chip ${cls}" ${editable&&!liveOut?`data-eqx="${u.id}"`:'tabindex="-1"'} title="${u.id} — ${t}${editable&&!liveOut?' · click to toggle availability':''}">${u.id.replace(/^(CHWP|CWP|CH|CT|DP)-/,'')}</button>`;}).join('')}</div></div>`).join('');
    const stage=`<div class="an-card-h"><h3>Load-based staging</h3><div class="seg en-view" role="group" aria-label="Show staging for">${[['cur','Current'],['opt','Optimised']].map(([k,l])=>`<button data-ev="${k}" class="${st.view===k?'on':''}">${l}</button>`).join('')}</div></div>
      <div class="mg-in">
        ${chart(X.I,X)}
        <div class="en-stage">${chips}</div>
        <div class="mt-key en-key"><span><i class="run"></i>Running</span><span><i class="sb"></i>Standby started</span><span><i class="stby"></i>Standby</span><span><i class="out"></i>Unavailable</span>${editable?'<span class="en-hint">Click a unit to take it out / back</span>':''}</div>
      </div>`;

    const nx=K.runH[0], oc=K.pm+K.corr;
    const mk=(l,v,u,d,t,cls)=>`<div class="en-k ${cls||''}"><span class="label">${l} ${tag(t)}</span><span class="v">${v}<small>${u}</small></span><span class="d">${d}</span></div>`;
    const maint=`<div class="an-card-h"><h3>Maintenance optimisation</h3><span class="label">${new Date().toLocaleDateString('en-GB',{month:'long'})}</span></div>
      <div class="mg-in">
        <div class="en-ks">
          ${mk('Maint. cost forecast',oc>=1e6?(oc/1e6).toFixed(2):f0(oc/1e3),oc>=1e6?' EGP M':' EGP k',`PM ${oc?f0(K.pm/oc*100):0}% · corrective ${oc?f0(K.corr/oc*100):0}%`,'CALC')}
          ${mk('Critical availability',(K.avail*100).toFixed(1),'%',`${K.availN} of ${K.allN} CUC units · ${X.I.live?(X.n1?'N+1 OK':'N+1 lost'):'live'}`,'LIVE',K.avail<.95?'mg-warn':'')}
          ${mk('Overdue PM',K.over,'',`${K.soon} due ≤ 7 d · ${K.openCorr} corrective open`,'LIVE',K.over?'mt-bad':'')}
          ${mk('Energy alerts',AL.length,'',AL.length?'see below':'none at present','CALC',AL.length?'mg-warn':'')}
        </div>
        <div><h4 class="mg-h4">Run-hours &amp; next major service <small>every ${f0(RUNH)} h</small></h4>
          <table class="an-table en-rh"><tbody>${K.runH.slice(0,4).map(x=>`<tr><td><b>${x.c.id}</b></td><td class="r">${f0(x.c.hours)} h</td><td class="r ${x.left<300?'mg-amb':''}">in ${f0(x.left)} h</td><td class="r">${x.due.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</td></tr>`).join('')}</tbody></table></div>
        <div class="mg-alerts"><h4 class="mg-h4">Abnormal energy alerts <small>${AL.length||'none'}</small></h4>${AL.length?AL.slice(0,4).map(([sv,t])=>`<div class="mg-alert" style="--c:${sv==='crit'?'var(--crit)':'var(--warn)'}"><i>!</i><span>${esc(t)}</span></div>`).join(''):'<p class="mt-none">Plant running within 5% of the optimised sequence.</p>'}</div>
        <p class="mg-note">Costs use illustrative rates (EGP ${f0(RATE.labour)}/crew-hour, parts allowances) on the live CMMS plan; replace with contract rates.</p>
      </div>`;

    body.innerHTML=`<section class="an-card en-cmp">${cmp}</section><section class="an-card en-stg">${stage}</section><section class="an-card en-mnt">${maint}</section>
      <p class="en-foot"><b>Decision support only — no commands are sent to equipment.</b> ${tag('LIVE')} dashboard plant simulation (no real plant connected) · ${tag('CALC')} model result · ${tag('ILLUS')} assumption: scenario load &amp; weather, tariff EGP ${TARIFF.toFixed(2)}/kWh, wear and repair rates. Savings are estimates against the current sequence, not measured results.</p>`;
  }
  // failure scenario: what is out, what standby started, and what one more trip would cost in capacity
  function risk(X){
    const sbs=[...X.opt.sb], next=Math.max(0,X.I.D-(X.I.nUse-1)*CAP), nextDP=X.I.avail.dp.length?Math.max(0,X.I.D-(X.I.avail.dp.length-1)*LIM.dpTR):X.I.D;
    const bad=!X.n1||!X.dpOK||X.opt.unmet>=1, c=bad?'var(--crit)':'var(--warn)';
    return `<div class="mg-alert" style="--c:${c}"><i>!</i><span><b>Operational risk — ${bad?'high':'reduced redundancy'}</b>
      <small>Out: ${[...X.I.out].join(', ')||'none'} · standby started: ${sbs.join(', ')||'none'}</small>
      <small>${!X.dpOK?`Distribution pumping covers ${f0(X.I.avail.dp.length*LIM.dpTR)} of ${f0(X.I.D)} TR — remote buildings at risk; return a DP first. `:''}A further chiller trip: ${next>0?`<b class="mg-bad">${f0(next)} TR unmet</b>`:'demand still covered'}${nextDP>0&&X.dpOK?`; a further DP trip ${f0(nextDP)} TR short`:''}.</small></span></div>`;
  }
  const setEq=(a,b)=>a.size===b.length&&b.every(x=>a.has(x));

  function bind(){
    bound=true;
    const root=$('#analytics');
    root.addEventListener('click',e=>{
      if(!document.querySelector('#pfEnBody .en-cmp')&&!e.target.closest('.en-scs')) return;
      const sc=e.target.closest('[data-sc]'), ev=e.target.closest('[data-ev]'), eq=e.target.closest('[data-eqx]');
      if(sc){ st.sc=sc.dataset.sc; }
      else if(ev){ st.view=ev.dataset.ev; }
      else if(eq){ const id=eq.dataset.eqx; st.out.has(id)?st.out.delete(id):st.out.add(id); }
      else if(e.target.closest('#enReset')){ st.sc='live'; st.view='opt'; st.out=new Set(FAIL0); }
      else return;
      UI.renderAnalytics(true);
    });
  }

  function pdf(){
    const X=scenario(SC.find(s=>s.k===st.sc)), K=maintKPIs(), AL=energyAlerts(), c=X.cur, o=X.opt, h=X.h;
    const t=(head,rows)=>`<table class="rp-t"><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,j)=>`<td${j?' class="r"':''}>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return `<article class="rp-page"><header class="rp-hd"><div><div class="rp-brand">Center Utility Complex · CBD O&amp;M</div><h1>Operations &amp; energy scenario</h1><div class="rp-sub">${esc(X.sc.name)} · ${f0(X.I.D)} TR · WB ${f1(X.I.wb)} °C · ${h} h — decision support, no commands sent to equipment</div></div>
      <dl><dt>Generated</dt><dd>${new Date().toLocaleString('en-GB')}</dd><dt>Tariff</dt><dd>EGP ${TARIFF.toFixed(2)}/kWh (illustrative)</dd></dl></header>
      <h2>Current sequence vs optimised</h2>${t(['','Current','Optimised'],[
        ['Chillers running / available',`${c.n} / ${X.I.avail.ch.length}`,`${o.n} / ${X.I.avail.ch.length}`],['Tower cells · fan',`${c.nCT} · ${f0(c.fan)}%`,`${o.nCT} · ${f0(o.fan)}%`],
        ['CHWP · CWP',`${c.nCHWP} · ${c.nCWP} @ ${c.cwpHz} Hz`,`${o.nCHWP} · ${o.nCWP} @ ${o.cwpHz} Hz`],['Secondary DP',c.dpN,o.dpN],['AHUs running',`${c.ahu.on} / ${c.ahu.tot}`,`${o.ahu.on} / ${o.ahu.tot}`],
        ['Plant power',kw(c.plantKW),kw(o.plantKW)],['AHU fan power',kw(c.ahu.kw),kw(o.ahu.kw)],['Total demand',kw(c.totKW),kw(o.totKW)],['Plant kW/TR',c.kwtrPlant.toFixed(3),o.kwtrPlant.toFixed(3)],
        ['Electricity cost',`${egp(c.costH)}/h`,`${egp(o.costH)}/h`],[`Energy over ${h} h`,`${f0(c.totKW*h)} kWh`,`${f0(o.totKW*h)} kWh`],
        ['Estimated saving','—',`${egpk(X.saveH*h)} (${(X.savePct*100).toFixed(1)}%)`],['Critical availability · N+1',`${(X.avail*100).toFixed(1)}% · ${X.n1?'OK':'lost'}`,`${(X.avail*100).toFixed(1)}% · ${X.n1?'OK':'lost'}`],
        ['Maintenance cost impact',egpk(c.wearH*h+X.repair),egpk(o.wearH*h+X.repair)]])}
      ${chart(X.I,X)}
      <h2>Maintenance</h2>${t(['KPI','Value'],[['Maintenance cost forecast (month)',`${egpk(K.pm+K.corr)} — PM ${egpk(K.pm)}, corrective ${egpk(K.corr)}`],['Critical equipment availability',`${(K.avail*100).toFixed(1)}%`],['Overdue PM',`${K.over} (${K.soon} due within 7 days)`],
        ...K.runH.slice(0,4).map(x=>[`${x.c.id} major service`,`in ${f0(x.left)} run-h (${x.due.toLocaleDateString('en-GB')})`])])}
      ${AL.length?`<h2>Energy alerts</h2>${t(['Alert'],AL.map(a=>[esc(a[1])]))}`:''}
      <div class="rp-ft">Live = dashboard plant simulation (no real plant connected). Calculated = model result. Illustrative = scenario loads/weather, tariff, wear and repair rates. Savings are estimates against the current control sequence, not measured results.</div></article>`;
  }

  UI.renderEnergy=render;
  UI.energyPdf=pdf;
})();
