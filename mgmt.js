/* Management: CBD's O&M contract as the project owner sees it — operating cost against the approved budget, billing to
   the owner and to the buildings, cost recovery, SLA compliance and the issues that need management action.
   SAMPLE DATA: no finance, contract or CMMS records are connected to this dashboard yet, so every figure comes from the
   deterministic sample records below (C, CATS, CLAIMS, SLA and the invoice generator). Live plant alarms are the only live
   input. Replace the sample records with real ones before using any figure for decisions.
   Money rules: CBD revenue = the O&M fee + approved variations billed to the owner (R0). Operating costs are the owner's,
   spent by CBD against the approved budget. R1/R2 recharges recover part of those costs from the buildings for the owner —
   they are not CBD revenue, and a cost is only rebilled when a rule covers it. Nothing is counted twice. */
(function(){
  const {S,$,f0,esc}=UI;
  const D=864e5;
  const hr=n=>{n|=0;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;};
  const seedOf=s=>[...s].reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0)|0,7);
  const NOW=new Date(), Y=NOW.getFullYear(), AMC=Y*12+NOW.getMonth(); // months are counted as year*12+month
  const FRAC=NOW.getDate()/new Date(Y,NOW.getMonth()+1,0).getDate();
  const am2d=(a,d=1)=>new Date(Math.floor(a/12),a%12,d);
  const mName=a=>am2d(a).toLocaleDateString('en-GB',{month:'short'});
  const mLong=a=>am2d(a).toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  const fdt=d=>d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const days=(a,b)=>Math.floor((b-a)/D);
  const sum=(arr,k)=>arr.reduce((s,x)=>s+(typeof k==='function'?k(x):x[k]),0);
  const M=v=>(v/1e6).toFixed(2);
  const egp=v=>Math.abs(v)>=1e6?`EGP ${M(v)} M`:`EGP ${f0(v/1e3)} k`;
  const pct=(v,d=1)=>`${(v*100).toFixed(d)}%`;
  const sp=v=>`${v>0?'+':v<0?'−':''}${Math.abs(v*100).toFixed(1)}%`;

  // ---------- sample contract records ----------
  const C={start:new Date(2025,0,1),months:60,fee:4.35e6,ownerTerms:45,tenantTerms:30,metered:.965,
    vo:[{no:'VO-01',desc:'Cooling tower fill replacement, CT-01 to CT-03',amount:3.8e6,a:AMC-7,day:15,paidAfter:40},
        {no:'VO-02',desc:'Integration of D06–D10 energy meters into the BMS',amount:2.15e6,a:AMC-2,day:10,disputed:true}]};
  const RULES=[['R0','O&M service fee + approved variations','CBD → project owner','CBD revenue'],
    ['R1','Chilled-water energy & water recharge','CBD → buildings, for the owner','Electricity + water & treatment cost × metered TR·h share. Network losses (3.5%) are not billable'],
    ['R2','Tenant-caused damage','CBD → building, for the owner','Repair cost, only with a signed joint incident report'],
    ['—','Spares, specialist services, other repairs','Not rebilled','Owner operating cost, managed by CBD within the approved budget']];
  const SEAS=[.62,.62,.72,.85,1,1.15,1.25,1.27,1.15,.98,.8,.66];
  const CATS=[{k:'elec',name:'Electricity (CUC plant)',base:14.2e6,seas:1,rule:'R1'},{k:'water',name:'Water & chemical treatment',base:1.55e6,seas:.35,rule:'R1'},
    {k:'spares',name:'Spares & consumables',base:.92e6,seas:0},{k:'svc',name:'Specialist services',base:1.08e6,seas:0},{k:'repair',name:'Reactive repairs',base:.36e6,seas:0,rule:'R2 (part)'}];
  const CLAIMS=[{id:'DC-01',bld:'C04',a:AMC-5,desc:'AHU-02 coil damaged during tenant fit-out works',amount:186000,signed:true,payAfter:25},
    {id:'DC-02',bld:'D03',a:AMC-2,desc:'ETS strainer blocked by tenant fit-out debris',amount:74500,signed:true},
    {id:'DC-03',bld:'C12',a:AMC,desc:'Chilled-water leak above tenant ceiling — cause not yet agreed',amount:132000,signed:false}];
  const SLA=[{k:'avail',name:'Plant availability',tgt:'≥ 99.5%',ok:v=>v>=99.5,u:'%',base:99.8,sp:.25},
    {k:'chws',name:'CHW supply within 5.5 ± 0.5 °C',tgt:'≥ 98% of hours',ok:v=>v>=98,u:'%',base:99.1,sp:1.2},
    {k:'resp',name:'Critical fault response',tgt:'≤ 2.0 h',ok:v=>v<=2,u:' h',base:1.1,sp:.7},
    {k:'pm',name:'Planned maintenance completed',tgt:'≥ 95%',ok:v=>v>=95,u:'%',base:97.5,sp:2.5},
    {k:'comp',name:'Comfort complaints closed ≤ 48 h',tgt:'≥ 90%',ok:v=>v>=90,u:'%',base:94,sp:4},
    {k:'rep',name:'Monthly O&M report submitted',tgt:'by day 5',ok:v=>v<=5,u:'',base:3,sp:2}];
  const SLA_MISS={[`pm|${AMC-2}`]:93.1,[`resp|${AMC-1}`]:2.6};
  const slaVal=(s,a)=>s.k==='rep'&&a===AMC?null:SLA_MISS[`${s.k}|${a}`]??+(s.base+(hr(seedOf(s.k)+a*53)-.5)*s.sp).toFixed(s.k==='rep'?0:1);

  // ---------- cost model ----------
  const budget=(c,a)=>c.base*(1-c.seas+c.seas*SEAS[a%12]);
  const bias=(k,a)=>k==='elec'&&a>=AMC-1?.075:k==='spares'&&a===AMC?.16:0;
  const full=(c,a)=>budget(c,a)*(1+(hr(seedOf(c.k)+a*977)-.5)*.07+bias(c.k,a));
  const trend=c=>[1,2,3].reduce((s,i)=>s+full(c,AMC-i)/budget(c,AMC-i)-1,0)/3;
  // actual for complete months, month-to-date for this month (bMtd = budget to date), forecast for the rest of the year
  function cost(c,a){ const b=budget(c,a);
    if(a<AMC) return {b,bp:b,act:full(c,a),fc:full(c,a)};
    if(a===AMC) return {b,bp:b*FRAC,act:full(c,a)*FRAC,fc:full(c,a)};
    return {b,bp:0,act:0,fc:b*(1+trend(c))}; }
  const recoverable=a=>full(CATS[0],a)+full(CATS[1],a);

  // ---------- buildings / zones ----------
  const TW=S.towers, TOT=sum(TW,'design');
  const grp=t=>t.use.split(' ·')[0];
  const tName=id=>id==='ICON'?'Iconic Tower':(TW.find(t=>t.id===id)||{name:id}).name;
  const ZONES=[['all','Whole site'],['g:Office','Office towers'],['g:Residential','Residential towers'],['g:Hotel','Hotels'],...TW.map(t=>[t.id,tName(t.id)])];

  // ---------- invoices ----------
  const INV=[];
  function inv(o){
    o.due=new Date(+o.issued+o.terms*D); o.im=o.issued.getFullYear()*12+o.issued.getMonth(); // month issued
    o.paid=o.paidAt&&o.paidAt<=NOW?Math.round(o.amount*(o.paidFrac||1)):0;
    o.out=o.amount-o.paid;
    o.late=o.out>0&&NOW>o.due?days(o.due,NOW):0;
    o.status=o.disputed?'disp':o.out<1?'paid':o.paid>0?'part':o.late?'over':'open';
    if(o.issued<=NOW) INV.push(o);
  }
  const yymm=a=>`${String(Math.floor(a/12)).slice(2)}${String(a%12+1).padStart(2,'0')}`;
  for(let a=C.start.getFullYear()*12+C.start.getMonth();a<AMC;a++){ const issued=am2d(a+1);
    inv({no:`CBD-OF-${yymm(a)}`,side:'owner',entity:'Project owner',desc:`O&M service fee · ${mLong(a)}`,rule:'R0',a,amount:C.fee,issued,terms:C.ownerTerms,
      paidAt:new Date(+issued+(36+hr(a*7919)*20)*D)}); }
  C.vo.forEach(v=>{ const issued=am2d(v.a,v.day);
    inv({no:`CBD-${v.no}`,side:'owner',entity:'Project owner',desc:`${v.no} · ${v.desc}`,rule:'R0',a:v.a,amount:v.amount,issued,terms:C.ownerTerms,
      paidAt:v.paidAfter?new Date(+issued+v.paidAfter*D):null,disputed:!!v.disputed}); });
  const SLOW=['D07','C10'];
  for(let a=AMC-12;a<AMC;a++) TW.forEach(t=>{ const issued=am2d(a+1,3), h=hr(seedOf(t.id)+a*31);
    inv({no:`CBD-TR-${yymm(a)}-${t.id==='ICON'?'ICN':t.id}`,side:'tenant',bld:t.id,entity:`${tName(t.id)} · building mgmt`,desc:`Chilled-water recharge · ${mLong(a)}`,rule:'R1',a,
      amount:Math.round(recoverable(a)*t.design/TOT*C.metered),issued,terms:C.tenantTerms,
      paidAt:SLOW.includes(t.id)&&a>=AMC-3?null:new Date(+issued+(14+h*30)*D),paidFrac:hr(seedOf(t.id)+a*7)<.05&&a>=AMC-6&&a<=AMC-2?.5:1}); });
  CLAIMS.filter(c=>c.signed&&c.a<AMC).forEach(c=>{ const issued=am2d(c.a+1,5);
    inv({no:`CBD-TD-${c.id}`,side:'tenant',bld:c.bld,entity:`${tName(c.bld)} · building mgmt`,desc:`${c.id} · ${c.desc}`,rule:'R2',a:c.a,amount:c.amount,issued,terms:C.tenantTerms,
      paidAt:c.payAfter?new Date(+issued+c.payAfter*D):null}); c.inv=`CBD-TD-${c.id}`; });
  const ownerInv=INV.filter(i=>i.side==='owner');
  const contractValue=C.months*C.fee+sum(C.vo,'amount');

  // ---------- state ----------
  const PER=[['mtd','This month'],['last','Last month'],['q','Last 3 months'],['ytd','Year to date']];
  const ROLES=[['mgmt','Management'],['fin','Finance'],['ops','Operations']];
  const STATUS=[['open','Open'],['prog','In progress'],['esc','Escalated'],['done','Resolved']];
  const ld=(k,d)=>{try{const v=localStorage.getItem(k); return v?JSON.parse(v):d;}catch(e){return d;}};
  const sv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
  const st={per:'ytd',zone:'all',side:'all',open:false,dd:null,role:ld('cuc-role','mgmt'),iss:ld('cuc-mg-status',{})};
  if(!ROLES.some(r=>r[0]===st.role)) st.role='mgmt';
  let built=false, sig='';

  const range=()=>({mtd:[AMC,AMC],last:[AMC-1,AMC-1],q:[AMC-3,AMC-1],ytd:[Y*12,AMC]})[st.per];
  const perText=()=>{const [a,b]=range(); return a===b?(a===AMC?`${mLong(a)} to date`:mLong(a)):`${mName(a)}–${b===AMC?mName(b)+' to date':mLong(b)}`;};
  const inZ=id=>{const z=st.zone; if(z==='all') return true; if(!id) return false; const t=TW.find(x=>x.id===id); return z.startsWith('g:')?!!t&&grp(t)===z.slice(2):id===z;};
  const zShare=()=>st.zone==='all'?1:sum(TW.filter(t=>inZ(t.id)),'design')/TOT;
  const zText=()=>(ZONES.find(z=>z[0]===st.zone)||ZONES[0])[1];
  const canEdit=()=>st.role==='mgmt';

  // ---------- calculations (all from the records above) ----------
  function calc(){
    const [r0,r1]=range(), zs=zShare(), months=[]; for(let a=r0;a<=r1;a++) months.push(a);
    const done=months.filter(a=>a<AMC), inR=a=>a>=r0&&a<=r1;
    const cat=CATS.map(c=>{let b=0,act=0; months.forEach(a=>{const x=cost(c,a); b+=x.bp; act+=x.act;}); return {c,b:b*zs,act:act*zs};});
    const year=CATS.map(c=>{let b=0,fc=0; for(let a=Y*12;a<Y*12+12;a++){const x=cost(c,a); b+=x.b; fc+=x.fc;} return {c,b:b*zs,fc:fc*zs};});
    const vis=i=>i.side==='owner'||inZ(i.bld);
    const side=s=>{const P=INV.filter(i=>i.side===s&&vis(i)&&inR(i.im)), O=INV.filter(i=>i.side===s&&vis(i)&&i.out>0);
      return {inv:sum(P,'amount'),col:sum(P,'paid'),out:sum(O,'out'),over:sum(O.filter(i=>i.late),'out'),n:P.length,open:O};};
    const own=side('owner'), ten=side('tenant');
    // cost recovery: complete months only — a month is recharged after it closes
    const r1e=sum(done,a=>recoverable(a))*zs;
    const r2e=sum(CLAIMS.filter(c=>c.signed&&done.includes(c.a)&&inZ(c.bld)),'amount');
    const rInv=INV.filter(i=>i.side==='tenant'&&done.includes(i.a)&&inZ(i.bld));
    const rec={r1e,r2e,elig:r1e+r2e,r1i:sum(rInv.filter(i=>i.rule==='R1'),'amount'),r2i:sum(rInv.filter(i=>i.rule==='R2'),'amount'),col:sum(rInv,'paid'),
      losses:r1e*(1-C.metered),held:CLAIMS.filter(c=>!c.signed&&inR(c.a)&&inZ(c.bld))};
    rec.inv=rec.r1i+rec.r2i; rec.rate=rec.elig?rec.inv/rec.elig:null;
    const sla=[]; months.forEach(a=>SLA.forEach(s=>{const v=slaVal(s,a); if(v!==null) sla.push({s,a,v,ok:s.ok(v)});}));
    return {months,done,zs,cat,ob:sum(cat,'b'),oa:sum(cat,'act'),year,yb:sum(year,'b'),yf:sum(year,'fc'),own,ten,rec,sla,met:sla.filter(x=>x.ok).length};
  }

  function critical(){
    const L=[];
    [...S.alarms.values()].filter(x=>x.sev==='crit'&&(x.asset==='CUC'||inZ(x.asset))).forEach(x=>
      L.push({src:'Live',kind:'Plant',text:`${x.asset==='ICON'?'Iconic':x.asset}${x.eq&&x.eq!=='ZONE'?' '+x.eq:''} — ${x.text}`,who:'Plant Operations Manager',age:`open ${Math.max(1,Math.round((Date.now()-x.since)/6e4))} min`,alarm:true}));
    const by=new Map();
    INV.filter(i=>i.out>0&&(i.status==='disp'||i.late>30)&&(i.side==='owner'||inZ(i.bld))).forEach(i=>{const k=i.status==='disp'?i.no:i.entity, g=by.get(k)||{i,n:0,out:0,late:0}; g.n++; g.out+=i.out; g.late=Math.max(g.late,i.late); by.set(k,g);});
    by.forEach((g,k)=>L.push({src:'Sample',kind:'Commercial',text:g.i.status==='disp'?`${g.i.no} disputed by the owner — ${egp(g.out)} on hold`:`${k}: ${g.n} invoice${g.n>1?'s':''} over 30 days overdue — ${egp(g.out)}`,
      who:g.i.side==='owner'?'O&M Contract Manager':'Finance Manager',age:g.i.status==='disp'?`since ${fdt(g.i.issued)}`:`${g.late} days overdue`}));
    const zs=zShare();
    CATS.forEach(c=>{let b=0,fc=0; for(let a=Y*12;a<Y*12+12;a++){const x=cost(c,a); b+=x.b; fc+=x.fc;}
      if(fc>b*1.02) L.push({src:'Sample',kind:'Budget',text:`${c.name}: year-end forecast ${sp(fc/b-1)} over the approved budget (${egp((fc-b)*zs)})`,who:c.k==='elec'?'Plant Operations Manager':'O&M Contract Manager',age:`forecast ${Y}`});});
    [AMC-1,AMC].forEach(a=>SLA.forEach(s=>{const v=slaVal(s,a); if(v!==null&&!s.ok(v)) L.push({src:'Sample',kind:'SLA',text:`${s.name}: ${v}${s.u} in ${mLong(a)} (target ${s.tgt})`,who:'O&M Contract Manager',age:'corrective action plan due'});}));
    return L;
  }

  // ranked: an open critical plant alarm first, then by financial impact. Owner-side items are site-wide.
  function attention(){
    const A=[], site=st.zone==='all';
    const al=[...S.alarms.values()].filter(x=>x.sev==='crit'&&(x.asset==='CUC'||inZ(x.asset)));
    if(al.length) A.push({id:'alarm',score:Infinity,title:`${al.length} critical plant alarm${al.length>1?'s':''} open`,impact:'SLA response clock ≤ 2 h',sev:'crit',
      who:'Plant Operations Manager',action:`Dispatch, restore and log response times — ${esc(al.map(x=>x.asset+(x.eq&&x.eq!=='ZONE'?' '+x.eq:'')).slice(0,3).join(', '))}`,def:'prog',go:'alarms'});
    const od=INV.filter(i=>i.side==='tenant'&&i.late&&inZ(i.bld));
    if(od.length){ const by={}; od.forEach(i=>by[i.bld]=(by[i.bld]||0)+i.out); const top=Object.entries(by).sort((a,b)=>b[1]-a[1]);
      A.push({id:'tenant-ar',score:sum(od,'out'),title:'Overdue building recharges',impact:`${egp(sum(od,'out'))} overdue`,sev:od.some(i=>i.late>30)?'crit':'warn',
        who:'Finance Manager',action:`Statements and reminders to ${top.slice(0,3).map(([b])=>b==='ICON'?'Iconic':b).join(', ')}${top.length>3?` +${top.length-3}`:''}; escalate to the owner after 60 days`,def:'esc'}); }
    const zs=zShare();
    CATS.forEach(c=>{let b=0,fc=0; for(let a=Y*12;a<Y*12+12;a++){const x=cost(c,a); b+=x.b; fc+=x.fc;}
      if(fc>b*1.01) A.push({id:`budget-${c.k}`,score:(fc-b)*zs,title:`${c.name} above approved budget`,impact:`${egp((fc-b)*zs)} year-end overrun (${sp(fc/b-1)})`,sev:fc>b*1.03?'crit':'warn',
        who:c.k==='elec'?'Plant Operations Manager':'O&M Contract Manager',action:c.k==='elec'?'Run chillers at best kW/TR, shift tower and pump load off-peak, agree tariff review with the owner':'Review open orders, defer non-critical purchases, report variance to the owner',def:'prog'});});
    if(site){
      const oo=ownerInv.filter(i=>i.late&&i.status!=='disp');
      if(oo.length) A.push({id:'owner-ar',score:sum(oo,'out'),title:`Owner payment overdue — ${oo.map(i=>i.no).join(', ')}`,impact:`${egp(sum(oo,'out'))} · ${Math.max(...oo.map(i=>i.late))} days late`,sev:'warn',
        who:'O&M Contract Manager',action:'Confirm certification with the owner\'s engineer and request payment date',def:'open'});
      ownerInv.filter(i=>i.status==='disp').forEach(i=>A.push({id:`disp-${i.no}`,score:i.out,title:`${i.no} disputed`,impact:`${egp(i.out)} on hold`,sev:'warn',
        who:'O&M Contract Manager',action:'Joint scope and quantity review with the owner\'s engineer',def:'open'}));
    }
    CLAIMS.filter(c=>!c.signed&&inZ(c.bld)).forEach(c=>A.push({id:`claim-${c.id}`,score:c.amount,title:`Damage claim ${c.id} not yet billable`,impact:`${egp(c.amount)} recoverable once signed (R2)`,sev:'warn',
      who:'O&M Contract Manager',action:`Get the joint incident report signed by ${tName(c.bld)} — ${c.desc.toLowerCase()}`,def:'open'}));
    A.forEach(x=>x.status=st.iss[x.id]||x.def);
    return A.sort((a,b)=>b.score-a.score);
  }

  // ---------- chart: monthly operating cost vs budget, forecast for the rest of the year ----------
  function chart(zs,[r0,r1]){
    const A=[...Array(12)].map((_,i)=>Y*12+i).map(a=>{let b=0,act=0,fc=0; CATS.forEach(c=>{const x=cost(c,a); b+=x.b; act+=x.act; fc+=x.fc;}); return {a,b:b*zs,act:act*zs,fc:fc*zs};});
    const W=520,H=166,L=34,B=18,T=18, raw=Math.max(...A.map(d=>Math.max(d.b,d.fc)))*1.06, mag=Math.pow(10,Math.floor(Math.log10(raw))),
      max=[1,1.5,2,2.5,3,4,5,6,8,10].map(m=>m*mag).find(m=>m>=raw), y=v=>H-B-(v/max)*(H-B-T), bw=(W-L)/12;
    const grid=[0,.5,1].map(k=>`<line x1="${L}" x2="${W}" y1="${y(max*k)}" y2="${y(max*k)}" class="g"/><text x="${L-5}" y="${y(max*k)+3.5}" text-anchor="end">${(max*k/1e6).toFixed(max>=2e7?0:1)}</text>`).join('');
    const bars=A.map((d,i)=>{const x=L+i*bw+bw*.18, w=bw*.64, dim=d.a<r0||d.a>r1?' dim':'', over=d.fc>d.b*1.02?' over':'';
      const r=(v,cls)=>`<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0,H-B-y(v)).toFixed(1)}" class="${cls}${dim}"/>`;
      const tip=d.a<AMC?`actual ${egp(d.act)}`:d.a===AMC?`to date ${egp(d.act)}, forecast ${egp(d.fc)}`:`forecast ${egp(d.fc)}`;
      return `<g><title>${mLong(d.a)} — ${tip} · budget ${egp(d.b)}</title>${d.a<AMC?r(d.act,'bar'+over):r(d.fc,'bar fc'+over)+(d.a===AMC?r(d.act,'bar'+over):'')}
        <line x1="${(x-3).toFixed(1)}" x2="${(x+w+3).toFixed(1)}" y1="${y(d.b).toFixed(1)}" y2="${y(d.b).toFixed(1)}" class="bud${dim}"/>
        <text x="${(x+w/2).toFixed(1)}" y="${H-5}" text-anchor="middle"${d.a===AMC?' class="now"':''}>${mName(d.a).slice(0,3)}</text></g>`;}).join('');
    return `<figure class="mg-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly operating cost against approved budget, ${Y}, EGP million">
      <defs><pattern id="mgHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="hatch"/></pattern></defs>
      <text x="0" y="8" class="u">EGP M</text>${grid}${bars}</svg>
      <figcaption class="mt-key"><span><i class="k-act"></i>Actual</span><span><i class="k-over"></i>Over budget</span><span><i class="k-fc"></i>Forecast</span><span><i class="k-bud"></i>Approved budget</span></figcaption></figure>`;
  }

  // ---------- build ----------
  function build(){
    $('#mgmt').innerHTML=`
      <div class="an-head"><button class="btn back" id="mgBack">← Site map</button>
        <div class="dname"><span class="label">O&amp;M contract · CBD, operator &amp; maintainer</span><h2>Management</h2></div>
        <span class="mg-sample" title="No finance or contract system is connected yet. Figures come from sample records in mgmt.js; only plant alarms are live.">Sample data</span>
        <div class="mg-ctl">
          <div class="seg" id="mgPer" role="group" aria-label="Reporting period">${PER.map(([k,l])=>`<button data-per="${k}">${l}</button>`).join('')}</div>
          <select class="mg-sel" id="mgZone" aria-label="Building or zone"><option value="all">Whole site</option><optgroup label="Zones">${ZONES.slice(1,4).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</optgroup><optgroup label="Buildings">${ZONES.slice(4).map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</optgroup></select>
          <label class="mg-role"><span>Viewing as</span><select class="mg-sel" id="mgRole" aria-label="Viewing as role">${ROLES.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label>
          <button class="btn" id="mgCsv">Invoices CSV</button><button class="btn pri" id="mgPdf">Export report</button>
        </div></div>
      <div class="an-tiles mg-tiles" id="mgTiles"></div>
      <div class="mg-body" id="mgBody"></div>
      <div class="mg-scrim" id="mgScrim" hidden></div>
      <aside class="mg-dd" id="mgDD" hidden aria-modal="true" role="dialog" aria-labelledby="mgDDt"></aside>`;
    const root=$('#mgmt');
    root.addEventListener('click',e=>{
      const t=e.target;
      const per=t.closest('[data-per]'), dd=t.closest('[data-dd]'), side=t.closest('[data-side]'), go=t.closest('[data-go]');
      if(per){ st.per=per.dataset.per; render(true); return; }
      if(dd){ openDD(dd.dataset.dd); return; }
      if(side){ st.side=side.dataset.side; render(true); return; }
      if(go){ if(go.dataset.go==='alarms') UI.openAlarms(); return; }
      if(t.closest('#mgDDx')||t.closest('#mgScrim')){ closeDD(); return; }
      if(t.closest('#mgShowOpen')){ st.open=true; st.side='all'; closeDD(); render(true); return; }
    });
    root.addEventListener('change',e=>{
      const t=e.target;
      if(t.id==='mgZone'){ st.zone=t.value; render(true); }
      else if(t.id==='mgRole'){ st.role=t.value; sv('cuc-role',st.role); closeDD(); render(true); }
      else if(t.id==='mgOpen'){ st.open=t.checked; render(true); }
      else if(t.dataset.iss){ st.iss[t.dataset.iss]=t.value; sv('cuc-mg-status',st.iss); render(true); }
    });
    $('#mgBack').addEventListener('click',()=>UI.setView('map'));
    $('#mgCsv').addEventListener('click',csv);
    $('#mgPdf').addEventListener('click',()=>UI.savePdf(curPdf(),fileStem(),$('#mgPdf'),printFallback));
    // Escape closes the drill-down first instead of leaving the view
    window.addEventListener('keydown',e=>{ if(e.key==='Escape'&&UI.view==='mgmt'&&st.dd){ e.stopImmediatePropagation(); closeDD(); } },true);
    built=true;
  }

  const tile=(k,l,v,u,d,cls)=>`<button class="kpi mg-k ${cls||''}${st.dd===k?' on':''}" data-dd="${k}" aria-haspopup="dialog"><span class="label">${l}<em>Details →</em></span><span class="v">${v}<small>${u}</small></span><span class="d">${d}</span></button>`;
  const dl=rows=>`<dl class="mg-dl">${rows.map(([k,v,c])=>`<dt>${k}</dt><dd${c?` class="${c}"`:''}>${v}</dd>`).join('')}</dl>`;
  const STL={paid:['done','Paid'],part:['wip','Part paid'],open:['plan','Not due'],over:['over','Overdue'],disp:['wip','Disputed']};
  const chip=s=>`<span class="mt-s ${STL[s][0]}">${STL[s][1]}</span>`;
  const SEVC={crit:'var(--crit)',warn:'var(--warn)'};

  function render(force){
    if(UI.view!=='mgmt') return;
    if(!built) build();
    const crit=critical(), live=crit.filter(c=>c.alarm).length;
    const s=[st.per,st.zone,st.side,st.open,st.role,st.dd,JSON.stringify(st.iss),crit.map(c=>c.text).join('|')].join('#');
    if(!force&&s===sig) return;
    sig=s;
    document.querySelectorAll('#mgPer [data-per]').forEach(b=>b.classList.toggle('on',b.dataset.per===st.per));
    $('#mgZone').value=st.zone; $('#mgRole').value=st.role;
    const locked=st.role==='ops';
    $('#mgCsv').disabled=locked; $('#mgPdf').disabled=locked;
    if(locked){
      $('#mgTiles').innerHTML=''; $('#mgTiles').hidden=true;
      $('#mgBody').innerHTML=`<div class="mg-lock"><div><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        <h3>Management &amp; finance only</h3><p>Contract values, invoices and cost recovery are restricted to authorised CBD management and finance users. The technical views (map, Performance incl. <b>Operations &amp; energy</b>, Reports, Maintenance, Alarms) stay available.</p>
        <p class="mg-note">The role selector is a front-end preview. In production, access must be enforced at sign-in on the server, not in the browser.</p></div></div>`;
      return;
    }
    $('#mgTiles').hidden=false;
    const R=calc(), site=st.zone==='all', sw=site?'':' · site-wide';
    const left=Math.max(0,C.months-(AMC-(C.start.getFullYear()*12+C.start.getMonth())));
    const billed=sum(ownerInv,'amount'), ratio=R.ob?R.oa/R.ob:0;
    $('#mgTiles').innerHTML=[
      tile('contract','O&M contract value',(contractValue/1e6).toFixed(1),'EGP M',`${pct(billed/contractValue,0)} billed · ${left} months left${sw}`),
      tile('opex','Operating cost vs budget',(ratio*100).toFixed(1),'% of budget',`${egp(R.oa)} of ${egp(R.ob)}`,ratio>1.03?'mt-bad':ratio>1?'mg-warn':''),
      tile('out','Outstanding invoices',M(R.own.out+R.ten.out),'EGP M',`Owner ${M(R.own.out)} M · Buildings ${M(R.ten.out)} M`,R.own.over+R.ten.over>0?'mg-warn':''),
      tile('rec','Cost recovery rate',R.rec.rate==null?'—':(R.rec.rate*100).toFixed(1),R.rec.rate==null?'':'%',R.rec.rate==null?'billed after month end':`${egp(R.rec.inv)} of ${egp(R.rec.elig)} eligible`),
      tile('sla','SLA compliance',R.sla.length?(R.met/R.sla.length*100).toFixed(1):'—','%',`${R.met} of ${R.sla.length} clause-months met${sw}`,R.met<R.sla.length?'mg-warn':''),
      tile('crit','Critical open issues',crit.length,'',`${live} live alarm${live===1?'':'s'} · ${crit.length-live} contract / finance`,crit.length?'mt-bad':'')].join('');

    // financial performance
    const alerts=[];
    R.cat.filter(x=>x.b&&x.act>x.b*1.03).forEach(x=>alerts.push(['crit',`${x.c.name} ${sp(x.act/x.b-1)} over budget in the period (${egp(x.act-x.b)})`]));
    R.year.filter(x=>x.fc>x.b*1.01).forEach(x=>alerts.push([x.fc>x.b*1.03?'crit':'warn',`${x.c.name}: year-end forecast ${sp(x.fc/x.b-1)} (${egp(x.fc-x.b)})`]));
    const fin=`<div class="an-card-h"><h3>Financial performance</h3><span class="label">${perText()}${site?'':' · '+esc(zText())}</span></div>
      <div class="mg-in">
        ${chart(R.zs,range())}
        <div class="mg-sum">
          <div><span>Actual · period</span><b>${egp(R.oa)}</b></div><div><span>Approved budget</span><b>${egp(R.ob)}</b></div><div><span>Variance</span><b class="${R.oa>R.ob?'mg-amb':'mg-ok'}">${sp(ratio-1)}</b></div>
          <div><span>Forecast ${Y}</span><b>${egp(R.yf)}</b></div><div><span>Annual budget</span><b>${egp(R.yb)}</b></div><div><span>Year-end</span><b class="${R.yf>R.yb?'mg-amb':'mg-ok'}">${sp(R.yf/R.yb-1)}</b></div>
        </div>
        <div class="mg-alerts"><h4 class="mg-h4">Overspending alerts <small>${alerts.length||'none'}</small></h4>${alerts.length?alerts.slice(0,3).map(([s,t])=>`<div class="mg-alert" style="--c:${SEVC[s]}"><i>!</i><span>${esc(t)}</span></div>`).join('')
          +(alerts.length>3?`<button class="al-link" data-dd="opex">${alerts.length-3} more →</button>`:''):'<p class="mt-none">All cost lines within budget.</p>'}</div>
        ${site?'':'<p class="mg-note">Plant costs allocated to the selection by metered (design-load) share.</p>'}
      </div>`;

    // billing & cost recovery
    let rows=INV.filter(i=>(i.side==='owner'||inZ(i.bld))&&(st.side==='all'||i.side===st.side));
    const [r0,r1]=range();
    rows=st.open?rows.filter(i=>i.out>0):rows.filter(i=>i.im>=r0&&i.im<=r1);
    rows.sort((a,b)=>(b.late-a.late)||(b.due-a.due));
    const sideDl=(x,n)=>dl([['Invoiced',egp(x.inv)],['Collected',egp(x.col)],['Outstanding',egp(x.out)],['Overdue',egp(x.over),x.over?'mg-bad':'']]);
    const rr=R.rec;
    const bill=`<div class="an-card-h"><h3>Billing &amp; cost recovery</h3><span class="label">Invoiced in ${perText()}</span></div>
      <div class="mg-in mg-billin">
        <div class="mg-split">
          <div class="mg-side"><h4 class="mg-h4">Owner billing <small>CBD revenue (R0)</small></h4>${sideDl(R.own)}</div>
          <div class="mg-side"><h4 class="mg-h4">Buildings / tenants <small>recovered for owner (R1, R2)</small></h4>${sideDl(R.ten)}</div>
        </div>
        <button class="mg-recov" data-dd="rec"><span class="mg-rh"><b>Recoverable costs</b><span>${rr.rate==null?'billed after month end':`${egp(rr.inv)} invoiced of ${egp(rr.elig)} eligible · ${pct(rr.rate)}`}</span></span>
          <span class="mg-meter"><i style="width:${rr.rate==null?0:Math.min(100,rr.rate*100)}%"></i></span>
          <small>Not billable: network losses ${egp(rr.losses)}${rr.held.length?` · ${rr.held.map(c=>`${c.id} ${egp(c.amount)} awaiting signed report`).join(', ')}`:''}</small></button>
        <div class="mg-invh"><div class="seg" role="group" aria-label="Billing entity">${[['all','All'],['owner','Owner'],['tenant','Buildings']].map(([k,l])=>`<button data-side="${k}" class="${st.side===k?'on':''}">${l}</button>`).join('')}</div>
          <label class="mg-chk"><input type="checkbox" id="mgOpen"${st.open?' checked':''}> Open only (any date)</label><span class="label">${rows.length} invoice${rows.length===1?'':'s'}</span></div>
        <div class="an-table-wrap mg-invw">${rows.length?`<table class="an-table mg-tbl"><thead><tr><th>Invoice</th><th>Billing entity</th><th class="r">Amount</th><th>Due</th><th class="r">Outstanding</th><th>Status</th></tr></thead><tbody>${
          rows.slice(0,300).map(i=>`<tr title="${esc(i.desc)} · rule ${i.rule}"><td class="mono">${i.no}</td><td>${esc(i.entity)}</td><td class="r">${f0(i.amount)}</td><td>${fdt(i.due)}${i.late?`<small class="mg-bad"> +${i.late} d</small>`:''}</td><td class="r">${i.out?f0(i.out):'—'}</td><td>${chip(i.status)}</td></tr>`).join('')}</tbody></table>`
          :'<p class="mt-none mg-pad">No invoices for this selection.</p>'}</div>
      </div>`;

    // management attention
    const A=attention().filter(x=>x.status!=='done'), top=A.slice(0,3);
    const att=`<div class="an-card-h"><h3>Management attention</h3><span class="label">Top 3 of ${A.length}</span></div>
      <div class="mg-in">${top.length?top.map((x,i)=>`<article class="mg-iss" style="--c:${SEVC[x.sev]}">
          <h5><b>${i+1}</b><span>${esc(x.title)}</span></h5>
          <div class="mg-imp">${esc(x.impact)}</div>
          <dl class="mg-meta"><dt>Owner</dt><dd>${x.who} <small>(CBD)</small></dd><dt>Action</dt><dd>${x.action}</dd></dl>
          <div class="mg-isf"><label><span class="label">Status</span>${canEdit()?`<select class="mg-sel" data-iss="${x.id}">${STATUS.map(([k,l])=>`<option value="${k}"${x.status===k?' selected':''}>${l}</option>`).join('')}</select>`
            :`<span class="mt-s ${x.status==='esc'?'over':x.status==='prog'?'wip':'plan'}">${STATUS.find(s=>s[0]===x.status)[1]}</span>`}</label>${x.go?`<button class="btn" data-go="${x.go}">Open alarms →</button>`:''}</div>
        </article>`).join(''):'<p class="mt-none">Nothing needs management action.</p>'}
        <p class="mg-note">Ranked by financial impact; open critical plant alarms first. Responsible = CBD role.${canEdit()?' Mark an item Resolved to move the next one up.':' Status changes: Management role.'}</p>
      </div>`;
    $('#mgBody').innerHTML=`<section class="an-card mg-fin">${fin}</section><section class="an-card mg-bill">${bill}</section><section class="an-card mg-att">${att}</section>`;
    if(st.dd) $('#mgDD').innerHTML=ddHtml(st.dd,R,crit);
  }

  // ---------- drill-downs ----------
  function openDD(k){ st.dd=k; $('#mgDD').hidden=false; $('#mgScrim').hidden=false; render(true); const x=$('#mgDDx'); if(x) x.focus(); }
  function closeDD(){ if(!st.dd) return; const k=st.dd; st.dd=null; $('#mgDD').hidden=true; $('#mgScrim').hidden=true; render(true); const b=document.querySelector(`#mgTiles [data-dd="${k}"]`); if(b) b.focus(); }
  const tb=(head,rows,foot)=>`<div class="an-table-wrap"><table class="an-table mg-tbl"><thead><tr>${head.map(h=>`<th${h[0]==='>'?' class="r"':''}>${h.replace(/^>/,'')}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r=>`<tr>${r.map((c,j)=>`<td${head[j][0]==='>'?' class="r"':''}>${c}</td>`).join('')}</tr>`).join('')}${foot?`<tr class="mg-tot">${foot.map((c,j)=>`<td${head[j][0]==='>'?' class="r"':''}>${c}</td>`).join('')}</tr>`:''}</tbody></table></div>`;

  function ddHtml(k,R,crit){
    const T={contract:'O&M contract value',opex:'Operating cost vs budget',out:'Outstanding invoices',rec:'Cost recovery',sla:'SLA compliance',crit:'Critical open issues'}[k];
    let b='';
    if(k==='contract'){
      const billed=sum(ownerInv,'amount'), end=new Date(C.start.getFullYear(),C.start.getMonth()+C.months,0);
      b=dl([['Term',`${fdt(C.start)} → ${fdt(end)} · ${C.months} months`],['Monthly O&M fee',egp(C.fee)],['Base contract value',egp(C.months*C.fee)],
        ...C.vo.map(v=>[`${v.no} (approved variation)`,egp(v.amount)]),['Total contract value',`<b>${egp(contractValue)}</b>`],['Billed to date',`${egp(billed)} · ${ownerInv.length} invoices`],['Remaining to bill',egp(contractValue-billed)]])
        +`<h4 class="mg-h4">Billing rules — what is billed, to whom</h4>`+tb(['Rule','Item','Billed','Basis'],RULES.map(r=>[`<b>${r[0]}</b>`,r[1],r[2],r[3]]))
        +`<p>CBD's revenue is R0 only. Operating costs belong to the owner and are spent by CBD against the approved budget; R1 and R2 recharges recover part of them from the buildings for the owner. They are not CBD revenue, and a cost is only rebilled when a rule covers it, so nothing is counted twice.</p>`;
    }
    if(k==='opex'){
      b=`<p>${perText()} · ${esc(zText())}${st.zone==='all'?'':' (allocated by metered share)'}. This month is month-to-date against budget-to-date.</p>`
        +tb(['Cost line','>Budget','>Actual','>Variance','Rebill rule'],R.cat.map(x=>[x.c.name,egp(x.b),egp(x.act),`<span class="${x.act>x.b*1.03?'mg-bad':x.act>x.b?'mg-amb':'mg-ok'}">${sp(x.b?x.act/x.b-1:0)}</span>`,x.c.rule||'—']),
          ['<b>Total</b>',`<b>${egp(R.ob)}</b>`,`<b>${egp(R.oa)}</b>`,`<b>${sp(R.ob?R.oa/R.ob-1:0)}</b>`,''])
        +`<h4 class="mg-h4">Year-end forecast ${Y}</h4>`+tb(['Cost line','>Annual budget','>Forecast','>Variance'],R.year.map(x=>[x.c.name,egp(x.b),egp(x.fc),`<span class="${x.fc>x.b*1.03?'mg-bad':x.fc>x.b?'mg-amb':'mg-ok'}">${sp(x.fc/x.b-1)}</span>`]),
          ['<b>Total</b>',`<b>${egp(R.yb)}</b>`,`<b>${egp(R.yf)}</b>`,`<b>${sp(R.yf/R.yb-1)}</b>`])
        +`<p>Forecast = actual to date + remaining months at budget × the last 3 months' average variance.</p>`;
    }
    if(k==='out'){
      const bk=[['Not yet due',i=>!i.late&&i.status!=='disp'],['1–30 days overdue',i=>i.late>0&&i.late<=30&&i.status!=='disp'],['31–60 days',i=>i.late>30&&i.late<=60&&i.status!=='disp'],['Over 60 days',i=>i.late>60&&i.status!=='disp'],['Disputed',i=>i.status==='disp']];
      const O=R.own.open, Tn=R.ten.open;
      b=`<p>Open balances today, ${fdt(NOW)}. Owner invoices are site-wide; building invoices follow the building filter.</p>`
        +tb(['Ageing','>Owner (CBD revenue)','>Buildings (recovery)'],bk.map(([l,f])=>[l,egp(sum(O.filter(f),'out')),egp(sum(Tn.filter(f),'out'))]),['<b>Total</b>',`<b>${egp(R.own.out)}</b>`,`<b>${egp(R.ten.out)}</b>`]);
      const by=new Map(); [...O,...Tn].forEach(i=>{const g=by.get(i.entity)||{n:0,out:0,late:0}; g.n++; g.out+=i.out; g.late=Math.max(g.late,i.late); by.set(i.entity,g);});
      b+=`<h4 class="mg-h4">Largest open balances</h4>`+tb(['Billing entity','>Invoices','>Outstanding','>Oldest overdue'],[...by].sort((a,b)=>b[1].out-a[1].out).slice(0,8).map(([e,g])=>[esc(e),g.n,egp(g.out),g.late?`<span class="${g.late>30?'mg-bad':'mg-amb'}">${g.late} d</span>`:'—']))
        +`<button class="btn" id="mgShowOpen">Show all open invoices in the table</button>`;
    }
    if(k==='rec'){
      const rr=R.rec;
      b=`<p>Complete months in ${perText()} · ${esc(zText())}. A month is recharged after it closes, so the current month is not counted yet.</p>`
        +tb(['Basis','>Eligible cost','>Invoiced','>Rate'],[['R1 · energy &amp; water recharge',egp(rr.r1e),egp(rr.r1i),rr.r1e?pct(rr.r1i/rr.r1e):'—'],['R2 · tenant damage (signed)',egp(rr.r2e),egp(rr.r2i),rr.r2e?pct(rr.r2i/rr.r2e):'—']],
          ['<b>Total</b>',`<b>${egp(rr.elig)}</b>`,`<b>${egp(rr.inv)}</b>`,`<b>${rr.rate==null?'—':pct(rr.rate)}</b>`])
        +dl([['Collected so far',egp(rr.col)],['Not billable — network losses (3.5% of R1)',egp(rr.losses)]])
        +`<h4 class="mg-h4">Damage claims (R2)</h4>`+(!CLAIMS.some(c=>inZ(c.bld))?'<p>No damage claims for this selection.</p>':tb(['Claim','Building','Description','>Amount','Billing'],CLAIMS.filter(c=>inZ(c.bld)).map(c=>[c.id,c.bld==='ICON'?'Iconic':c.bld,esc(c.desc),egp(c.amount),
          c.inv?`<span class="mono">${c.inv}</span>`:c.signed?'Billed after month end':'<span class="mg-amb">Not billed — incident report not signed</span>'])))
        +`<p>Costs without a matching rule (spares, specialist services, other repairs) stay with the owner and are never billed automatically.</p>`;
    }
    if(k==='sla'){
      const ms=R.months;
      b=`<p>${perText()} · site-wide. ${R.met} of ${R.sla.length} clause-months met. The O&amp;M report for the current month is due on day 5 of next month.</p>`
        +tb(['Clause','Target',...ms.map(a=>'>'+mName(a))],SLA.map(s=>[s.name,s.tgt,...ms.map(a=>{const v=slaVal(s,a); return v===null?'<span class="mg-dim">—</span>':`<span class="${s.ok(v)?'mg-ok':'mg-bad'}">${s.ok(v)?'✓':'✕'} ${v}${s.u}</span>`;})]));
    }
    if(k==='crit'){
      b=crit.length?`<div class="mg-crit">${crit.map(c=>`<div class="mg-alert" style="--c:${c.alarm?'var(--crit)':c.kind==='SLA'||c.kind==='Budget'?'var(--warn)':'var(--crit)'}"><i>!</i><span><b>${esc(c.text)}</b><small>${c.kind} · ${c.who} · ${esc(c.age)} · ${c.src==='Live'?'live':'sample'}</small></span></div>`).join('')}</div>`
        +(crit.some(c=>c.alarm)?'<button class="btn" data-go="alarms">Open alarm view →</button>':''):'<p>No critical issues open.</p>';
      b+=`<p>Counted: live critical plant alarms, invoices over 30 days overdue or disputed, cost lines forecast over 2% above the annual budget, and SLA misses in the last two months.</p>`;
    }
    return `<div class="mg-ddh"><h3 id="mgDDt">${T}</h3><span class="mg-sample">Sample data</span><button class="btn" id="mgDDx" aria-label="Close details">✕ Close</button></div><div class="mg-ddb">${b}</div>`;
  }

  // ---------- export ----------
  const fileStem=()=>{const d=NOW; return `CBD_management_${st.per}_${st.zone.replace('g:','')}_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const curPdf=()=>pdfHtml();
  function pdfHtml(){
    const R=calc(), crit=critical(), A=attention().filter(x=>x.status!=='done').slice(0,3);
    const t=(head,rows)=>`<table class="rp-t"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,j)=>`<td${j?' class="r"':''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const k=a=>`<div class="rp-k">${a.map(([l,v,u,bad])=>`<div${bad?' class="bad"':''}><span>${l}</span><b>${v}<small>${u||''}</small></b></div>`).join('')}</div>`;
    const open=[...R.own.open,...R.ten.open].sort((a,b)=>b.late-a.late||b.out-a.out).slice(0,14);
    return `<article class="rp-page"><header class="rp-hd"><div><div class="rp-brand">Center Utility Complex · CBD O&amp;M contract</div><h1>Management report</h1><div class="rp-sub">${esc(zText())} · SAMPLE DATA — not contract or finance records</div></div>
      <dl><dt>Period</dt><dd>${perText()}</dd><dt>Generated</dt><dd>${fdt(new Date())}</dd></dl></header>
      <h2>Headline</h2>${k([['Contract value',M(contractValue),' EGP M'],['Opex vs budget',(R.oa/R.ob*100).toFixed(1),' %',R.oa>R.ob],['Outstanding',M(R.own.out+R.ten.out),' EGP M',R.own.over+R.ten.over>0],
        ['Cost recovery',R.rec.rate==null?'—':(R.rec.rate*100).toFixed(1),R.rec.rate==null?'':' %'],['SLA compliance',R.sla.length?(R.met/R.sla.length*100).toFixed(1):'—',' %',R.met<R.sla.length],['Critical open issues',crit.length,'',crit.length>0]])}
      <h2>Operating cost vs approved budget</h2>${chart(R.zs,range())}
      ${t(['Cost line','Budget','Actual','Variance','Year-end forecast','Annual budget'],R.cat.map((x,i)=>[x.c.name,egp(x.b),egp(x.act),sp(x.b?x.act/x.b-1:0),egp(R.year[i].fc),egp(R.year[i].b)]).concat([['<b>Total</b>',`<b>${egp(R.ob)}</b>`,`<b>${egp(R.oa)}</b>`,`<b>${sp(R.oa/R.ob-1)}</b>`,`<b>${egp(R.yf)}</b>`,`<b>${egp(R.yb)}</b>`]]))}
      <h2>Billing &amp; cost recovery</h2>${t(['','Invoiced (period)','Collected','Outstanding','Overdue'],[['Owner — CBD revenue (R0)',egp(R.own.inv),egp(R.own.col),egp(R.own.out),egp(R.own.over)],['Buildings — recovered for owner (R1, R2)',egp(R.ten.inv),egp(R.ten.col),egp(R.ten.out),egp(R.ten.over)]])}
      <p class="rp-ft">Recoverable costs: ${R.rec.rate==null?'billed after month end':`${egp(R.rec.inv)} invoiced of ${egp(R.rec.elig)} eligible (${pct(R.rec.rate)})`}. Not billable: network losses ${egp(R.rec.losses)}${R.rec.held.length?`; ${R.rec.held.map(c=>c.id+' awaiting signed incident report').join(', ')}`:''}.</p>
      <h2>Management attention</h2>${t(['Issue','Impact','Responsible (CBD)','Status'],A.map(x=>[`<b>${esc(x.title)}</b><br>${x.action}`,esc(x.impact),x.who,STATUS.find(s=>s[0]===x.status)[1]]))}
      <h2>Open invoices</h2>${open.length?t(['Invoice','Billing entity','Amount','Due','Outstanding','Status'],open.map(i=>[i.no,esc(i.entity),f0(i.amount),fdt(i.due),f0(i.out),STL[i.status][1]+(i.late?` +${i.late} d`:'')])):'<p class="rp-none">None.</p>'}
      <div class="rp-ft">Sample data generated by the dashboard — no finance, contract or CMMS system is connected. Live plant alarms are the only live input. CBD revenue (R0) is shown separately from owner operating costs and from amounts recovered from buildings (R1, R2); costs are not rebilled without a rule.</div></article>`;
  }
  function printFallback(){
    let area=document.getElementById('printArea');
    if(!area){area=document.createElement('div');area.id='printArea';document.body.appendChild(area);}
    area.innerHTML=curPdf();
    const t=document.title; document.title=fileStem();
    try{ window.print(); }catch(e){}
    document.title=t;
  }
  function csv(){
    const q=v=>{const s=String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
    const rows=INV.filter(i=>i.side==='owner'||inZ(i.bld)).sort((a,b)=>b.issued-a.issued);
    const L=[['CBD O&M contract — invoice register'],['SAMPLE DATA — not finance records'],['Buildings',zText()],['Generated',fdt(new Date())],[],
      ['Invoice','Billing side','Billing entity','Description','Rule','Service month','Issued','Due','Amount (EGP)','Paid (EGP)','Outstanding (EGP)','Days overdue','Status']];
    rows.forEach(i=>L.push([i.no,i.side==='owner'?'Owner (CBD revenue)':'Building (recovery for owner)',i.entity,i.desc,i.rule,mLong(i.a),fdt(i.issued),fdt(i.due),i.amount,i.paid,i.out,i.late,STL[i.status][1]]));
    const blob=new Blob(['﻿'+L.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fileStem().replace('management','invoices')+'.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  }

  UI.renderMgmt=f=>render(f!==false);
})();
