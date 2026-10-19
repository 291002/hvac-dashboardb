/* Extract report: pick the overall site report and/or any towers, a period and the sections, then preview, print/PDF or download CSV.
   Period values are rebuilt hour by hour from a deterministic model (same tower + hour always gives the same numbers); all simulated. */
(function(){
  const {S,$,f0,f1,f2,esc,pill}=UI;
  const TR_KW=3.517;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const USE=[['Office',/^Office/],['Residential',/^Residential/],['Hotel & mixed-use',/^(Hotel|Mixed)/]];
  const PERIODS=[['today','Today'],['yesterday','Yesterday'],['7d','Last 7 days'],['30d','Last 30 days'],['custom','Custom']];
  const PARTS=[['summary','Summary KPIs'],['profile','Load profile chart'],['comfort','Comfort & IAQ'],['ets','ETS / chilled water'],['equip','AHUs & active alarms']];
  const short=t=>t.id==='ICON'?'Iconic':t.id;
  const label=t=>t.id==='ICON'?'Iconic Tower':t.name;

  // stable pseudo-random in [0,1) from an integer
  const hr=n=>{n|=0;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;};
  const seedOf=s=>[...s].reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0)|0,7);

  const st={overall:true,sel:new Set(),period:'today',from:'',to:'',parts:new Set(PARTS.map(p=>p[0]))};
  let built=false, last=null;

  // ---------- period model ----------
  function range(){
    const now=new Date(), day=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const H=3.6e6, D=864e5;
    let a,b;
    if(st.period==='today'){a=day;b=now}
    else if(st.period==='yesterday'){a=new Date(day-D);b=day}
    else if(st.period==='7d'){a=new Date(now-7*D);b=now}
    else if(st.period==='30d'){a=new Date(now-30*D);b=now}
    else{
      const p=s=>{const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d)};
      if(!st.from||!st.to) return {err:'Pick a start and end date.'};
      a=p(st.from); b=new Date(+p(st.to)+D); if(b>now) b=now;
      if(a>=b) return {err:'The start date must be on or before the end date, and not in the future.'};
      if(b-a>92*D) return {err:'Custom range is limited to 92 days.'};
    }
    const h0=Math.floor(+a/H), h1=Math.max(h0+1,Math.floor(+b/H));
    return {a:new Date(h0*H),b:new Date(h1*H),h0,h1};
  }

  function towerHour(t,k,i){
    const d=new Date(i*3.6e6), h=d.getHours(), wd=d.getDay(), weekend=wd===5||wd===6; // Fri/Sat weekend
    const kind=/^Office/.test(t.use)?'off':/^Residential/.test(t.use)?'res':'hot';
    const work=h>=8&&h<19, eve=h>=17||h<1;
    let occ=kind==='off'?(work?0.9+0.1*Math.sin((h-8)/11*Math.PI):0.25)*(weekend?0.45:1)
           :kind==='res'?(eve?0.85:work?0.45:0.6)*(weekend?1.1:1)
           :0.6+0.25*Math.sin((h-14)/24*2*Math.PI);
    occ=clamp(occ,0.1,1);
    const dayN=Math.floor(i/24);
    const db=31+6*Math.sin((h-9)/24*2*Math.PI)+(hr(dayN*977)-0.5)*3;
    const n=x=>hr(k*1000003+i*31+x)-0.5;
    const lf=clamp(0.34+0.42*occ+0.028*(db-30)+n(1)*0.08,0.18,1.05);
    const trait=hr(k+11), dtLoss=hr(k+23)*1.6, down=hr(k+37);
    const ev=hr(k*7+dayN*131)<0.05+0.12*trait && h>=12&&h<16; // afternoon excursion day
    const zone=24+Math.max(0,lf-0.92)*9+n(2)*0.7+(ev?1.6+2*hr(k+dayN):0);
    const fan=42+50*lf;
    const co2=420+620*occ*Math.pow(60/fan,0.9)*(1+n(3)*0.25)+(ev?180:0);
    const dT=6.8+1.2*lf-dtLoss*(0.6+0.4*lf)+n(4)*0.5;
    const ahuOff=hr(k*13+dayN)<0.06*down?1:0;
    return {i,load:t.design*lf,lf,zone,co2,dT,ahuOff,db};
  }

  function towerStats(t,R){
    const k=seedOf(t.id), H=[];
    for(let i=R.h0;i<R.h1;i++) H.push(towerHour(t,k,i));
    const n=H.length, sum=f=>H.reduce((a,x)=>a+f(x),0);
    const pk=H.reduce((a,x)=>x.load>a.load?x:a,H[0]);
    const zOut=H.filter(x=>x.zone<23||x.zone>26).length;
    let events=0; H.forEach((x,j)=>{ if((x.zone>26)&&!(j&&H[j-1].zone>26)) events++; });
    const ahuHours=n*t.ahus, ahuOff=sum(x=>x.ahuOff);
    return {t,H,n,trh:sum(x=>x.load),avg:sum(x=>x.load)/n,peak:pk.load,peakAt:new Date(pk.i*3.6e6),peakPct:pk.load/t.design*100,
      zAvg:sum(x=>x.zone)/n,zMax:Math.max(...H.map(x=>x.zone)),zOut,events,comply:100-zOut/n*100,
      co2Avg:sum(x=>x.co2)/n,co2Max:Math.max(...H.map(x=>x.co2)),co2Out:H.filter(x=>x.co2>1100).length,
      dtAvg:sum(x=>x.dT)/n,dtLow:H.filter(x=>x.dT<5.6).length,avail:100-ahuOff/ahuHours*100};
  }

  function plantStats(all,R){
    const n=R.h1-R.h0, rows=[];
    for(let j=0;j<n;j++){
      const demand=all.reduce((a,s)=>a+s.H[j].load,0)*1.03, i=R.h0+j, db=all[0].H[j].db;
      const run=Math.ceil(demand/(3000*0.9)), part=demand/(run*3000);
      const wb=db-10.5, cws=wb+2.1+4.2*part*0.85;
      const kwtr=clamp(0.50+0.4*Math.pow(part-0.82,2)+0.017*(cws-29),0.42,1.2)+0.14+0.02*(hr(i*3)-0.5);
      rows.push({i,demand,run,kW:demand*kwtr,chws:5.5+Math.max(0,part-0.97)*18+(hr(i*5)-0.5)*0.15,dT:7.2+0.9*part});
    }
    const sum=f=>rows.reduce((a,x)=>a+f(x),0), pk=rows.reduce((a,x)=>x.demand>a.demand?x:a,rows[0]);
    const trh=sum(x=>x.demand), kwh=sum(x=>x.kW);
    return {rows,trh,kwh,kwtr:kwh/trh,peak:pk.demand,peakAt:new Date(pk.i*3.6e6),runH:sum(x=>x.run),chws:sum(x=>x.chws)/n,dT:sum(x=>x.dT)/n};
  }

  // ---------- formatting ----------
  const fd=d=>d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const ft=d=>d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const fdt=d=>`${fd(d)} ${ft(d)}`;
  const mwh=trh=>trh*TR_KW/1000;
  const periodText=R=>`${fdt(R.a)} → ${fdt(R.b)} · ${f0(R.h1-R.h0)} h`;
  const tbl=(head,rows,cls='')=>`<table class="rp-t ${cls}"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,j)=>`<td${j?' class="r"':''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const tiles=a=>`<div class="rp-k">${a.map(([l,v,u,bad])=>`<div${bad?' class="bad"':''}><span>${l}</span><b>${v}<small>${u||''}</small></b></div>`).join('')}</div>`;
  const flag=(bad,txt)=>bad?`<span class="rp-no">✕ ${txt}</span>`:txt;

  // bars per hour (≤ 2 days) or per day, with the design line
  function chart(vals,design,R,refL='Design'){
    const hourly=R.h1-R.h0<=48, B=[];
    if(hourly) vals.forEach((v,j)=>B.push([new Date((R.h0+j)*3.6e6),v,1]));
    else vals.forEach((v,j)=>{const d=new Date((R.h0+j)*3.6e6), key=d.toDateString(), b=B[B.length-1];
      if(b&&b[3]===key){b[1]=Math.max(b[1],v);b[2]++} else B.push([d,v,1,key]);});
    const W=720,Hh=150,L=44,Bm=22, raw=Math.max(design||0,...B.map(b=>b[1]))*1.08, mag=Math.pow(10,Math.floor(Math.log10(raw))), max=[1,1.5,2,2.5,3,4,5,6,8,10].map(m=>m*mag).find(m=>m>=raw), bw=(W-L)/B.length;
    const y=v=>Hh-Bm-(v/max)*(Hh-Bm-8);
    const step=Math.ceil(B.length/12);
    const grid=[0,.25,.5,.75,1].map(k=>`<line x1="${L}" x2="${W}" y1="${y(max*k)}" y2="${y(max*k)}" class="g"/><text x="${L-6}" y="${y(max*k)+4}" text-anchor="end">${f0(max*k)}</text>`).join('');
    const bars=B.map((b,j)=>`<rect x="${(L+j*bw+bw*.15).toFixed(1)}" y="${y(b[1]).toFixed(1)}" width="${(bw*.7).toFixed(1)}" height="${(Hh-Bm-y(b[1])).toFixed(1)}" class="${design&&b[1]>design?'over':''}"><title>${hourly?fdt(b[0]):fd(b[0])}: ${f0(b[1])} TR</title></rect>`
      +(j%step?'':`<text x="${(L+j*bw+bw/2).toFixed(1)}" y="${Hh-6}" text-anchor="middle">${hourly?String(b[0].getHours()).padStart(2,'0'):b[0].getDate()+'/'+(b[0].getMonth()+1)}</text>`)).join('');
    const dl=design?`<line x1="${L}" x2="${W}" y1="${y(design)}" y2="${y(design)}" class="ds"/><text x="${W}" y="${y(design)-4}" text-anchor="end" class="dl">${refL} ${f0(design)} TR</text>`:'';
    return `<figure class="rp-chart"><figcaption>${hourly?'Hourly load':'Daily peak load'}, TR</figcaption><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${hourly?'Hourly':'Daily peak'} load chart">${grid}${bars}${dl}</svg></figure>`;
  }

  function head(title,sub,R){
    return `<header class="rp-hd"><div><div class="rp-brand">Center Utility Complex · CBD Cooling Plant</div><h1>${esc(title)}</h1><div class="rp-sub">${esc(sub)}</div></div>
      <dl><dt>Period</dt><dd>${periodText(R)}</dd><dt>Generated</dt><dd>${fdt(new Date())}</dd></dl></header>`;
  }

  // ---------- report pages ----------
  function overallPage(P,all,R){
    const p=S.plant, has=k=>st.parts.has(k);
    const issues=all.filter(s=>s.comply<95||s.co2Out>0||s.dtAvg<5.6);
    let h=head('Overall site report',`CUC plant and all ${all.length} buildings on the district cooling loop`,R);
    if(has('summary')) h+=`<h2>Summary</h2>`+tiles([
      ['Cooling delivered',f0(P.trh),'TR·h'],['Thermal energy',f0(mwh(P.trh)),'MWh'],['Plant electricity',f0(P.kwh/1000),'MWh'],
      ['Plant efficiency',f2(P.kwtr),'kW/TR',P.kwtr>0.88],['Peak demand',f0(P.peak),'TR'],['Peak at',fdt(P.peakAt),''],
      ['Chiller run-hours',f0(P.runH),'h'],['Avg CHWS / ΔT',`${f1(P.chws)} / ${f1(P.dT)}`,'°C / K'],['Towers with issues',issues.length,'',issues.length>0]]);
    if(has('profile')) h+=chart(P.rows.map(r=>r.demand),p.chillers.length*3000,R,'Installed');
    h+=`<h2>Buildings</h2>`+tbl(['Building','Energy TR·h','Avg TR','Peak TR','Peak % design','Time in comfort band','CO₂ > 1,100 h','Avg ETS ΔT','Status now'],
      all.map(s=>[`<b>${esc(label(s.t))}</b>`,f0(s.trh),f0(s.avg),f0(s.peak),flag(s.peakPct>100,f0(s.peakPct)+'%'),flag(s.comply<95,f1(s.comply)+'%'),flag(s.co2Out>0,f0(s.co2Out)),flag(s.dtAvg<5.6,f1(s.dtAvg)+' K'),pill(s.t.status)])
      .concat([[`<b>Total</b>`,`<b>${f0(all.reduce((a,s)=>a+s.trh,0))}</b>`,'','','','','','','']]));
    if(has('equip')){
      h+=`<h2>CUC equipment now</h2>`+tbl(['Group','Running','Locked out','Tripped'],
        [['Chillers',p.chillers],['Cooling towers',p.towers],['Primary CHWP',p.chwp],['Condenser CWP',p.cwp],['Secondary DP',p.dp]].map(([n,a])=>[n,`${a.filter(x=>x.running).length} / ${a.length}`,a.filter(x=>!x.enabled).length,a.filter(x=>x.fault).length]));
      h+=alarmList('CUC');
    }
    return `<article class="rp-page">${h}${foot()}</article>`;
  }

  function towerPage(s,R){
    const t=s.t, has=k=>st.parts.has(k);
    let h=head(label(t),`${t.use} · design ${f0(t.design)} TR · ${t.ahus} AHUs`,R);
    h+=`<div class="rp-now">Status now ${pill(t.status)} <span>Load ${f0(t.load)} TR · zone ${f1(t.zoneT)} °C · ${t.ahu.filter(a=>a.running).length}/${t.ahus} AHUs running</span></div>`;
    if(has('summary')) h+=`<h2>Summary</h2>`+tiles([
      ['Cooling energy',f0(s.trh),'TR·h'],['Thermal energy',f1(mwh(s.trh)),'MWh'],['Average load',f0(s.avg),'TR'],
      ['Peak load',f0(s.peak),'TR',s.peakPct>100],['Peak % design',f0(s.peakPct),'%',s.peakPct>100],['Peak at',fdt(s.peakAt),'']]);
    if(has('profile')) h+=chart(s.H.map(x=>x.load),t.design,R);
    if(has('comfort')) h+=`<h2>Comfort &amp; indoor air</h2>`+tbl(['Check','Result','Benchmark'],[
      ['Average zone temperature',f1(s.zAvg)+' °C','23–26 °C'],['Highest zone temperature',flag(s.zMax>26,f1(s.zMax)+' °C'),'≤ 26 °C'],
      ['Hours outside comfort band',flag(s.zOut>0,`${f0(s.zOut)} h of ${f0(s.n)}`),'0 h'],['Over-temperature events',flag(s.events>0,s.events),'0'],
      ['Time in comfort band',flag(s.comply<95,f1(s.comply)+' %'),'≥ 95 %'],
      ['Average CO₂',f0(s.co2Avg)+' ppm','≤ 1,100 ppm'],['Peak CO₂',flag(s.co2Max>1100,f0(s.co2Max)+' ppm'),'≤ 1,100 ppm'],['Hours CO₂ above limit',flag(s.co2Out>0,f0(s.co2Out)+' h'),'0 h']]);
    if(has('ets')) h+=`<h2>ETS / chilled water</h2>`+tbl(['Check','Result','Benchmark'],[
      ['Average primary ΔT',flag(s.dtAvg<5.6,f1(s.dtAvg)+' K'),'≥ 5.6 K'],['Hours with low ΔT',flag(s.dtLow>0,`${f0(s.dtLow)} h (${f0(s.dtLow/s.n*100)} %)`),'0 h'],
      ['Primary supply now',f1(t.ets.priS)+' °C','—'],['Secondary supply now',flag(t.ets.secS>7.5,f1(t.ets.secS)+' °C'),'≤ 7.5 °C'],['Control valve now',f0(t.ets.valve)+' %','—']]);
    if(has('equip')){
      h+=`<h2>AHUs</h2>`+tbl(['Unit','State now','Fan %','Supply air °C','Period availability'],t.ahu.map(a=>[a.id,a.fault?'<span class="rp-no">Tripped</span>':!a.enabled?'Stopped':'Running',a.running?f0(a.fan):'—',a.running?f1(a.sat):'—',f1(s.avail)+' %']));
      h+=alarmList(t.id);
    }
    return `<article class="rp-page">${h}${foot()}</article>`;
  }

  function alarmList(id){
    const a=[...S.alarms.values()].filter(x=>x.asset===id);
    return `<h2>Active alarms</h2>`+(a.length?tbl(['Severity','Alarm','Since'],a.map(x=>[x.sev==='crit'?'<span class="rp-no">Alarm</span>':'Attention',esc(x.text),fdt(x.since)])):'<p class="rp-none">No active alarms.</p>');
  }
  const foot=()=>`<footer class="rp-ft">Schneider Electric · AVEVA — values are simulated, not read from a BMS.</footer>`;

  // ---------- build & render ----------
  function build(){
    const T=S.towers;
    $('#reports').innerHTML=`
      <div class="an-head"><button class="btn back" id="rpBack">← Site map</button>
        <div class="dname"><span class="label">Choose what to include, then print or download</span><h2>Reports</h2></div></div>
      <div class="rp">
        <aside class="rp-side">
          <section><div class="rp-sh"><span class="label">Report scope</span></div>
            <label class="rp-ck big"><input type="checkbox" id="rpOverall"> <span><b>Overall site report</b><small>CUC plant + summary of every building</small></span></label></section>
          <section><div class="rp-sh"><span class="label">Tower reports</span><span class="label" id="rpCount"></span></div>
            <div class="rp-q"><button data-q="all">All</button>${USE.map(([n],i)=>`<button data-q="${i}">${n.split(' ')[0]}</button>`).join('')}<button data-q="none">None</button></div>
            <div class="rp-towers">${T.map(t=>`<label class="rp-ck"><input type="checkbox" data-t="${t.id}"> <span>${esc(short(t))}</span></label>`).join('')}</div></section>
          <section><div class="rp-sh"><span class="label">Period</span></div>
            <div class="seg rp-seg" id="rpPeriod">${PERIODS.map(([k,l])=>`<button data-p="${k}">${l}</button>`).join('')}</div>
            <div class="rp-dates" id="rpDates"><label>From <input type="date" id="rpFrom"></label><label>To <input type="date" id="rpTo"></label></div></section>
          <section><div class="rp-sh"><span class="label">Sections</span></div>
            ${PARTS.map(([k,l])=>`<label class="rp-ck"><input type="checkbox" data-part="${k}" checked> <span>${l}</span></label>`).join('')}</section>
          <div class="rp-act"><button class="btn pri" id="rpPrint">Save as PDF</button><button class="btn" id="rpCsv">Download Excel (CSV)</button></div>
          <p class="rp-msg" id="rpMsg" role="status"></p>
        </aside>
        <div class="rp-prev" id="rpPrev" aria-label="Report preview"></div>
      </div>`;
    const today=new Date(), iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    st.to=iso(today); st.from=iso(new Date(+today-6*864e5));
    $('#rpFrom').value=st.from; $('#rpTo').value=st.to; $('#rpFrom').max=$('#rpTo').max=iso(today);
    const root=$('#reports');
    root.addEventListener('change',e=>{
      const x=e.target;
      if(x.id==='rpOverall') st.overall=x.checked;
      else if(x.dataset.t) x.checked?st.sel.add(x.dataset.t):st.sel.delete(x.dataset.t);
      else if(x.dataset.part) x.checked?st.parts.add(x.dataset.part):st.parts.delete(x.dataset.part);
      else if(x.id==='rpFrom') st.from=x.value; else if(x.id==='rpTo') st.to=x.value;
      render();
    });
    root.addEventListener('click',e=>{
      const q=e.target.closest('[data-q]'), p=e.target.closest('[data-p]');
      if(q){const v=q.dataset.q;
        if(v==='all') T.forEach(t=>st.sel.add(t.id)); else if(v==='none') st.sel.clear();
        else T.filter(t=>USE[+v][1].test(t.use)).forEach(t=>st.sel.add(t.id));
        render();}
      if(p){st.period=p.dataset.p; render();}
    });
    $('#rpBack').addEventListener('click',()=>UI.setView('map'));
    $('#rpPrint').addEventListener('click',()=>{ if(last) UI.savePdf($('#rpPrev').innerHTML,fileStem(),$('#rpPrint'),print); });
    $('#rpCsv').addEventListener('click',csv);
    built=true;
  }

  function render(){
    if(!built) build();
    $('#rpOverall').checked=st.overall;
    document.querySelectorAll('#reports [data-t]').forEach(c=>c.checked=st.sel.has(c.dataset.t));
    document.querySelectorAll('#rpPeriod [data-p]').forEach(b=>b.classList.toggle('on',b.dataset.p===st.period));
    $('#rpDates').hidden=st.period!=='custom';
    $('#rpCount').textContent=`${st.sel.size} of ${S.towers.length}`;
    $('#rpMsg').textContent='';
    const R=range(), none=!st.overall&&!st.sel.size;
    $('#rpPrint').disabled=$('#rpCsv').disabled=!!(R.err||none);
    if(R.err){ $('#rpPrev').innerHTML=`<p class="rp-empty">${esc(R.err)}</p>`; last=null; return; }
    if(none){ $('#rpPrev').innerHTML=`<p class="rp-empty">Tick <b>Overall site report</b> or at least one tower to build a report.</p>`; last=null; return; }
    const all=S.towers.map(t=>towerStats(t,R)), P=plantStats(all,R);
    const picked=all.filter(s=>st.sel.has(s.t.id));
    last={R,all,P,picked};
    $('#rpPrev').innerHTML=(st.overall?overallPage(P,all,R):'')+picked.map(s=>towerPage(s,R)).join('');
  }

  function fileStem(){
    const R=last.R, d=x=>x.toISOString().slice(0,10);
    return `CUC_report_${d(R.a)}_to_${d(new Date(+R.b-1))}`;
  }

  function print(){
    if(!last) return;
    let area=document.getElementById('printArea');
    if(!area){area=document.createElement('div');area.id='printArea';document.body.appendChild(area);}
    area.innerHTML=$('#rpPrev').innerHTML;
    const t=document.title; document.title=fileStem();
    try{ window.print(); }catch(e){ $('#rpMsg').textContent='Printing is blocked here — open the dashboard in its own browser tab.'; }
    document.title=t;
  }

  function csv(){
    if(!last) return;
    const {R,all,P,picked}=last, q=v=>{const s=String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
    const L=[['Center Utility Complex — cooling report'],['Period',fdt(R.a),fdt(R.b),`${R.h1-R.h0} h`],['Generated',fdt(new Date())],['Values are simulated'],[]];
    if(st.overall){
      L.push(['OVERALL SITE'],['Cooling delivered (TR·h)',P.trh.toFixed(0)],['Thermal energy (MWh)',mwh(P.trh).toFixed(1)],['Plant electricity (MWh)',(P.kwh/1000).toFixed(1)],
        ['Plant efficiency (kW/TR)',P.kwtr.toFixed(3)],['Peak demand (TR)',P.peak.toFixed(0)],['Peak at',fdt(P.peakAt)],['Chiller run-hours',P.runH.toFixed(0)],
        ['Avg CHWS (°C)',P.chws.toFixed(2)],['Avg ΔT (K)',P.dT.toFixed(2)],[]);
    }
    const rows=st.overall?all:picked;
    L.push(['Building','Use','Design TR','Energy TR·h','Energy MWh','Avg TR','Peak TR','Peak % design','Peak at','Zone avg °C','Zone max °C','Hours outside 23–26 °C','Time in band %','Over-temp events','CO₂ avg ppm','CO₂ max ppm','Hours CO₂ > 1100','ETS ΔT avg K','Hours ΔT < 5.6 K','AHU availability %','Status now','In tower selection']);
    rows.forEach(s=>L.push([label(s.t),s.t.use,s.t.design,s.trh.toFixed(0),mwh(s.trh).toFixed(2),s.avg.toFixed(0),s.peak.toFixed(0),s.peakPct.toFixed(1),fdt(s.peakAt),s.zAvg.toFixed(2),s.zMax.toFixed(2),s.zOut,s.comply.toFixed(1),s.events,s.co2Avg.toFixed(0),s.co2Max.toFixed(0),s.co2Out,s.dtAvg.toFixed(2),s.dtLow,s.avail.toFixed(1),UI.ST[s.t.status][1],st.sel.has(s.t.id)?'Yes':'No']));
    if(picked.length){
      L.push([],['HOURLY LOAD (TR)'],['Hour',...picked.map(s=>label(s.t))]);
      for(let j=0;j<R.h1-R.h0;j++) L.push([fdt(new Date((R.h0+j)*3.6e6)),...picked.map(s=>s.H[j].load.toFixed(0))]);
    }
    // BOM so Excel reads °, ₂ and · correctly
    const blob=new Blob(['﻿'+L.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fileStem()+'.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    $('#rpMsg').textContent=`Downloaded ${a.download}`;
  }

  UI.renderReports=render;
})();
