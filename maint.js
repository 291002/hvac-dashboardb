/* Maintenance: planned (calendar + chiller run-hour) and corrective work for the CUC plant and the building AHUs / ETS.
   Plan dates come from a deterministic schedule per asset + task. Work in progress takes the unit out of service in the sim
   (enabled=false, maint=true) and a notice pops up when it finishes. Durations are compressed to minutes. All simulated. */
(function(){
  const {S,$,f0,esc}=UI;
  const D=864e5, EP=new Date(2026,0,1), RUNH=2500, SOON=7;
  const hr=n=>{n|=0;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;};
  const seedOf=s=>[...s].reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0)|0,7);
  const day0=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const dn=d=>Math.round((day0(d)-EP)/D);
  const dateOf=n=>new Date(EP.getFullYear(),EP.getMonth(),EP.getDate()+n);
  const fd=d=>d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  const fdy=d=>d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const ft=d=>d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const mmss=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const short=t=>t.id==='ICON'?'Iconic':t.id;
  const label=t=>t.id==='ICON'?'Iconic Tower':t.name;

  const TEAM={mech:'Mechanical team',elec:'Electrical team',wt:'Water treatment contractor',hvac:'Building HVAC team'};
  // [task, interval days, duration h, team]
  const TASKS={
    ch:[['Monthly inspection & log review',30,3,'mech'],['Oil & refrigerant analysis',90,4,'mech'],['Condenser tube brushing',180,10,'mech'],['Starter & control panel check',180,3,'elec']],
    ct:[['Basin clean & water treatment check',30,4,'wt'],['Fan belt & gearbox inspection',90,3,'mech'],['Fill & drift eliminator inspection',180,6,'mech']],
    pump:[['Bearing lubrication & vibration check',90,2,'mech'],['Mechanical seal & coupling inspection',180,4,'mech'],['VFD & motor insulation test',365,3,'elec']],
    ahu:[['Filter replacement',90,2,'hvac'],['Belt, bearing & motor check',90,2,'hvac'],['Coil cleaning',180,4,'hvac']],
    ets:[['Strainer cleaning',60,2,'hvac'],['PHE inspection & ΔT check',180,6,'mech']]
  };
  const GROUPS=[['all','All'],['ch','Chillers'],['ct','Cooling towers'],['pump','Pumps'],['ahu','AHUs'],['ets','ETS']];
  const GNAME={ch:'Chiller',ct:'Cooling tower',pump:'Pump',ahu:'AHU',ets:'ETS'};
  const STL={done:'Done',over:'Overdue',wip:'In progress',due:'Due today',plan:'Planned',corr:'Fault'};

  // ---------- asset register ----------
  const P=S.plant, AS=[];
  const add=(key,name,u,g,where)=>AS.push({key,name,u,g,where});
  P.chillers.forEach(u=>add(u.id,u.id,u,'ch','CUC · chiller hall'));
  P.towers.forEach(u=>add(u.id,u.id,u,'ct','CUC · cooling tower yard'));
  P.chwp.forEach(u=>add(u.id,u.id,u,'pump','CUC · primary CHW pumps'));
  P.cwp.forEach(u=>add(u.id,u.id,u,'pump','CUC · condenser water pumps'));
  P.dp.forEach(u=>add(u.id,u.id,u,'pump','CUC · secondary distribution'));
  S.towers.forEach(t=>{
    t.ahu.forEach(a=>add(`${t.id}-${a.id}`,`${short(t)} ${a.id}`,a,'ahu',label(t)));
    add(`${t.id}-ETS`,`${short(t)} ETS`,t.ets,'ets',label(t));
  });
  const byKey=new Map(AS.map(a=>[a.key,a]));

  const SCH=[];
  AS.forEach(a=>TASKS[a.g].forEach(([task,I,h,team],j)=>{
    const seed=seedOf(a.key+'|'+j);
    SCH.push({id:`${a.key}|${j}`,a,task,I,h,team,seed,ph:Math.floor(hr(seed)*I)});
  }));
  const schById=new Map(SCH.map(s=>[s.id,s]));
  const occDay=(s,k)=>{const n=s.ph+k*s.I; return dateOf(n).getDay()===5?n+1:n;}; // no planned work on Friday
  const missed=(s,k)=>hr(s.seed*7+k*131)<0.12;
  const lastK=(s,today)=>{let k=Math.floor((today-s.ph)/s.I)+1; while(occDay(s,k)>=today) k--; return k;};

  // session state
  const wip=new Map();   // asset key -> {a,s,k,task,team,h,corr,start,end}
  const done=new Map();  // occurrence id "sch#k" -> Date finished this session
  const log=[];          // finished this session, newest first
  const st={g:'all',day:null};
  let built=false, sig='';

  // ---------- status ----------
  function occStatus(s,k,today){
    const id=`${s.id}#${k}`, w=wip.get(s.a.key);
    if(w&&w.s===s&&w.k===k) return 'wip';
    if(done.has(id)) return 'done';
    const n=occDay(s,k);
    if(n<today) return k===lastK(s,today)&&today-n<=21&&missed(s,k)?'over':'done';
    return n===today?'due':'plan';
  }
  const doneAt=(s,k,today)=>done.get(`${s.id}#${k}`)||dateOf(Math.min(today,occDay(s,k)+(hr(s.seed+k)<0.3?1:0)));

  function corrective(){
    const out=[];
    AS.forEach(a=>{ if(a.u.fault) out.push({a,task:a.g==='ch'?'Trip — low evaporator pressure':a.g==='ahu'?'Supply fan tripped':a.g==='ets'?'PHE fouled — secondary CHWS high':'VFD fault',team:a.g==='ets'||a.g==='ch'?'mech':'elec',h:4,fix:()=>{a.u.fault=false}}); });
    P.chillers.forEach(c=>{const n=c.id.slice(-2);
      if((c.chwStr||1)>1) out.push({a:byKey.get(`CHWP-${n}`),task:'Suction strainer ΔP high — clean strainer',team:'mech',h:2,fix:()=>{c.chwStr=1}});
      if((c.cwStr||1)>1) out.push({a:byKey.get(`CWP-${n}`),task:'Suction strainer ΔP high — clean strainer',team:'mech',h:2,fix:()=>{c.cwStr=1}}); });
    return out.filter(x=>x.a);
  }
  // chillers also get a major service every RUNH run-hours (≈18 run-h a day when in rotation)
  const runHour=c=>{const left=RUNH-c.hours%RUNH; return {left,due:dn(new Date())+Math.round(left/18)};};

  function model(){
    const today=dn(new Date()), inG=a=>st.g==='all'||a.g===st.g;
    const over=[], soon=[], corr=corrective().filter(x=>inG(x.a)&&!wip.has(x.a.key));
    SCH.forEach(s=>{
      if(!inG(s.a)) return;
      const k=lastK(s,today);
      if(occStatus(s,k,today)==='over') over.push({s,k,n:occDay(s,k)});
      const k2=k+1, n2=occDay(s,k2), st2=occStatus(s,k2,today);
      if(n2-today<=SOON&&(st2==='due'||st2==='plan')) soon.push({s,k:k2,n:n2});
    });
    P.chillers.forEach(c=>{ const a=byKey.get(c.id), r=runHour(c); if(inG(a)&&r.left<=300&&!wip.has(a.key)) soon.push({rh:true,a,c,n:r.due,left:r.left}); });
    over.sort((x,y)=>x.n-y.n); soon.sort((x,y)=>x.n-y.n);
    // month plan
    const now=new Date(), m0=dn(new Date(now.getFullYear(),now.getMonth(),1)), m1=dn(new Date(now.getFullYear(),now.getMonth()+1,1));
    const plan=[];
    SCH.forEach(s=>{
      if(!inG(s.a)) return;
      for(let k=Math.floor((m0-s.ph)/s.I)-1;k<=Math.floor((m1-s.ph)/s.I)+1;k++){
        const n=occDay(s,k); if(n<m0||n>=m1) continue;
        const status=occStatus(s,k,today);
        plan.push({s,k,n,status,at:status==='done'?doneAt(s,k,today):null});
      }
    });
    P.chillers.forEach(c=>{ const a=byKey.get(c.id), r=runHour(c); if(inG(a)&&r.due>=m0&&r.due<m1) plan.push({rh:true,a,c,n:r.due,left:r.left,status:wip.has(a.key)&&wip.get(a.key).rh?'wip':'plan'}); });
    plan.sort((x,y)=>x.n-y.n||(x.rh?x.a:x.s.a).name.localeCompare((y.rh?y.a:y.s.a).name));
    const w=[...wip.values()].filter(x=>inG(x.a));
    return {today,m0,m1,over,soon,corr,plan,wip:w,log:log.filter(x=>inG(x.a))};
  }

  // ---------- work orders ----------
  function start(job){
    const a=job.a; if(wip.has(a.key)) return;
    const secs=60+Math.round(hr(seedOf(a.key)+Date.now()%997)*90); // compressed duration so the finish is seen live
    const now=Date.now();
    wip.set(a.key,{...job,start:now,end:now+secs*1000});
    a.u.enabled=false; a.u.maint=true;
    UI.tick&&UI.tick(false);
    render(true);
  }
  function finish(w,manual){
    wip.delete(w.a.key);
    w.a.u.maint=false; w.a.u.enabled=true;
    if(w.fix) w.fix();
    if(w.rh) w.c.hours=Math.ceil(w.c.hours/RUNH)*RUNH+0.01;
    if(w.s) done.set(`${w.s.id}#${w.k}`,new Date());
    const at=new Date(); log.unshift({...w,at});
    toast(w,at,manual);
    UI.tick&&UI.tick(false);
    render(true);
  }
  const jobOf=x=>x.rh?{a:x.a,c:x.c,rh:true,task:`Run-hour major service (every ${f0(RUNH)} h)`,team:'mech',h:16}
    :x.s?{a:x.s.a,s:x.s,k:x.k,task:x.s.task,team:x.s.team,h:x.s.h}:x;

  // three jobs already on the tools when the dashboard opens, finishing within a few minutes
  [['CT-05',1,75],['CHWP-07',0,200],['C04-AHU-02',0,140]].forEach(([key,j,secs])=>{
    const s=schById.get(`${key}|${j}`); if(!s) return;
    const k=lastK(s,dn(new Date()))+1, now=Date.now();
    wip.set(key,{a:s.a,s,k,task:s.task,team:s.team,h:s.h,start:now-s.h*0.6*3.6e6,end:now+secs*1000});
    s.a.u.enabled=false; s.a.u.maint=true;
  });

  // ---------- notices ----------
  function toast(w,at,manual){
    let box=document.getElementById('toasts');
    if(!box){box=document.createElement('div');box.id='toasts';box.setAttribute('aria-live','polite');document.body.appendChild(box);}
    const el=document.createElement('div'); el.className='toast'; el.setAttribute('role','status');
    el.innerHTML=`<i aria-hidden="true">✓</i><div><b>Maintenance finished</b><span><b>${esc(w.a.name)}</b> · ${esc(w.task)}</span><small>${ft(at)} · ${manual?'Closed by operator':'Work order complete'} · back in service</small></div>
      <div class="toast-a"><button class="btn" data-go>View</button><button class="toast-x" data-x aria-label="Dismiss">✕</button></div>`;
    box.prepend(el);
    const close=()=>{el.classList.add('out'); setTimeout(()=>el.remove(),250);};
    el.querySelector('[data-x]').addEventListener('click',close);
    el.querySelector('[data-go]').addEventListener('click',()=>{close(); UI.setView('maint');});
    setTimeout(close,15000);
  }

  // ---------- view ----------
  const pillS=s=>`<span class="mt-s ${s}">${STL[s]}</span>`;
  const nameOf=x=>(x.rh?x.a:x.s?x.s.a:x.a);
  function row(x,kind,today){
    const a=nameOf(x);
    let task,meta,act='',c;
    if(kind==='wip'){ task=x.task; c='var(--warn)';
      meta=`${TEAM[x.team]} · started ${ft(new Date(x.start))} · <span class="mono" data-end="${x.end}">${mmss(Math.max(0,(x.end-Date.now())/1000))}</span> left`;
      act=`<button class="btn" data-fin="${esc(a.key)}">Complete now</button>`; }
    else if(kind==='corr'){ task=x.task; c='var(--crit)'; meta=`Corrective · ${TEAM[x.team]} · est. ${x.h} h`; act=`<button class="btn pri" data-start="corr" data-key="${esc(a.key)}">Start work</button>`; }
    else if(kind==='log'){ task=x.task; c='var(--ok)'; meta=`Finished ${ft(x.at)} · ${TEAM[x.team]}`; }
    else if(x.rh){ task=`Run-hour major service`; c='var(--se)'; meta=`${f0(x.left)} run-h to go (every ${f0(RUNH)} h) · ≈ ${fd(dateOf(x.n))}`; act=`<button class="btn" data-start="rh" data-key="${esc(a.key)}">Start</button>`; }
    else { task=x.s.task; const d=x.n-today;
      c=kind==='over'?'var(--crit)':'var(--se)';
      meta=`${kind==='over'?`<span class="mt-no">Overdue ${d===-1?'1 day':-d+' days'}</span> · was due ${fd(dateOf(x.n))}`:d===0?'Due today':`Due ${fd(dateOf(x.n))} · in ${d} day${d>1?'s':''}`} · every ${x.s.I} d · ${TEAM[x.s.team]} · ${x.s.h} h`;
      act=`<button class="btn${kind==='over'?' pri':''}" data-start="${x.s.id}" data-k="${x.k}">Start</button>`; }
    return `<div class="mt-row" style="--c:${c}"><div class="mt-a"><b>${esc(a.name)}</b><span>${esc(a.where)}</span></div><div class="mt-t"><span>${esc(task)}</span><small>${meta}</small></div>${act}</div>`;
  }
  const sec=(title,n,body,cls='')=>`<section class="mt-sec ${cls}"><h4><span>${title}</span><b>${n}</b></h4>${n?body:`<p class="mt-none">None</p>`}</section>`;

  function calendar(M){
    const now=new Date(), first=new Date(now.getFullYear(),now.getMonth(),1), days=M.m1-M.m0, lead=first.getDay();
    const by=new Map(); M.plan.forEach(p=>{ if(!by.has(p.n)) by.set(p.n,[]); by.get(p.n).push(p); });
    let cells='';
    for(let i=0;i<lead;i++) cells+='<span class="mt-blank"></span>';
    for(let d=0;d<days;d++){
      const n=M.m0+d, L=by.get(n)||[], c=s=>L.filter(p=>p.status===s).length;
      const segs=[['done',c('done')],['over',c('over')],['wip',c('wip')],['plan',c('plan')+c('due')]].filter(x=>x[1]);
      const fri=dateOf(n).getDay()===5;
      cells+=`<button class="mt-day${n===M.today?' today':''}${n===st.day?' sel':''}${fri?' fri':''}" data-day="${n}" aria-label="${fd(dateOf(n))}: ${L.length} tasks${c('over')?`, ${c('over')} overdue`:''}">
        <span class="mt-dn">${d+1}</span>${L.length?`<span class="mt-dc">${L.length}</span>`:''}
        <span class="mt-bar">${segs.map(([s,v])=>`<i class="${s}" style="flex:${v}"></i>`).join('')}</span></button>`;
    }
    return `<div class="mt-cal"><div class="mt-wk">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(w=>`<span>${w}</span>`).join('')}</div><div class="mt-grid">${cells}</div></div>`;
  }

  function dayList(M){
    const L=M.plan.filter(p=>p.n===st.day);
    if(!L.length) return `<p class="mt-none">No work planned on ${fd(dateOf(st.day))}${dateOf(st.day).getDay()===5?' (Friday — no planned work)':''}.</p>`;
    return `<table class="an-table mt-tbl"><thead><tr><th>Equipment</th><th>Task</th><th>Team</th><th class="r">Est. h</th><th>Status</th><th></th></tr></thead><tbody>${L.map(p=>{
      const a=nameOf(p), job=p.rh?'rh':p.s.id, can=(p.status==='over'||p.status==='due'||p.status==='plan')&&!wip.has(a.key)&&p.n<=M.today+SOON;
      return `<tr><td><b>${esc(a.name)}</b><br><small>${esc(a.where)}</small></td><td>${esc(p.rh?'Run-hour major service':p.s.task)}</td><td>${TEAM[p.rh?'mech':p.s.team]}</td><td class="r">${p.rh?16:p.s.h}</td>
        <td>${pillS(p.status)}${p.status==='done'&&p.at?` <small>${fd(p.at)}</small>`:''}</td><td>${can?`<button class="btn" data-start="${job}" data-k="${p.k??''}" data-key="${esc(a.key)}">Start</button>`:''}</td></tr>`;}).join('')}</tbody></table>`;
  }

  function build(){
    $('#maint').innerHTML=`
      <div class="an-head"><button class="btn back" id="mtBack">← Site map</button>
        <div class="dname"><span class="label" id="mtSub"></span><h2>Maintenance</h2></div>
        <div class="seg" id="mtG">${GROUPS.map(([k,l])=>`<button data-g="${k}">${l}</button>`).join('')}</div>
        <div class="mt-x"><button class="btn pri" id="mtPrint">Save as PDF</button><button class="btn" id="mtCsv">Download Excel (CSV)</button></div></div>
      <div class="an-tiles" id="mtTiles"></div>
      <div class="mt-body">
        <section class="an-card"><div class="an-card-h"><h3>Needs maintenance</h3><span class="label">Within ${SOON} days · live faults</span></div><div class="mt-list" id="mtNeed"></div></section>
        <section class="an-card mt-right"><div class="an-card-h"><h3 id="mtMonth"></h3><span class="mt-key"><span><i class="done"></i>Done</span><span><i class="over"></i>Overdue</span><span><i class="wip"></i>In progress</span><span><i class="plan"></i>Planned</span></span></div>
          <div class="mt-calwrap" id="mtCal"></div>
          <div class="mt-dayh"><h4 id="mtDayH"></h4></div>
          <div class="an-table-wrap mt-daylist" id="mtDay"></div></section>
      </div>`;
    const root=$('#maint');
    root.addEventListener('click',e=>{
      const g=e.target.closest('[data-g]'), d=e.target.closest('[data-day]'), s=e.target.closest('[data-start]'), f=e.target.closest('[data-fin]');
      if(g){st.g=g.dataset.g; render(true);}
      if(d){st.day=+d.dataset.day; render(true);}
      if(f){const w=wip.get(f.dataset.fin); if(w) finish(w,true);}
      if(s){
        const v=s.dataset.start;
        if(v==='corr'){const x=corrective().find(c=>c.a.key===s.dataset.key); if(x) start(x);}
        else if(v==='rh'){const c=P.chillers.find(c=>c.id===s.dataset.key); if(c) start(jobOf({rh:true,a:byKey.get(c.id),c}));}
        else {const sc=schById.get(v); if(sc) start(jobOf({s:sc,k:+s.dataset.k}));}
      }
    });
    $('#mtBack').addEventListener('click',()=>UI.setView('map'));
    $('#mtPrint').addEventListener('click',savePdf);
    $('#mtCsv').addEventListener('click',csv);
    built=true;
  }

  function render(force){
    if(UI.view!=='maint') return;
    if(!built) build();
    const M=model();
    if(st.day==null||st.day<M.m0||st.day>=M.m1) st.day=M.today;
    const s=[st.g,st.day,M.today,M.over.length,M.soon.length,M.corr.length,M.wip.length,log.length,M.soon.map(x=>x.rh?x.left|0:'').join()].join('|');
    if(!force&&s===sig){ // only the countdowns move
      document.querySelectorAll('#maint [data-end]').forEach(el=>el.textContent=mmss(Math.max(0,(+el.dataset.end-Date.now())/1000)));
      return;
    }
    sig=s;
    const monthName=new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    document.querySelectorAll('#mtG [data-g]').forEach(b=>b.classList.toggle('on',b.dataset.g===st.g));
    $('#mtSub').textContent=`Planned & corrective work · ${GROUPS.find(g=>g[0]===st.g)[1]==='All'?'all equipment':GROUPS.find(g=>g[0]===st.g)[1].toLowerCase()}`;
    $('#mtMonth').textContent=`${monthName} plan`;
    const md=M.plan.filter(p=>p.status==='done').length;
    const tiles=[['Overdue',M.over.length,'',M.over.length?'oldest '+(M.today-M.over[0].n)+' days':'none',M.over.length?'mt-bad':''],
      ['Due in 7 days',M.soon.length,'',M.soon.filter(x=>x.n===M.today).length+' due today'],
      ['Faults to fix',M.corr.length,'',M.corr.length?'corrective work':'no live faults',M.corr.length?'mt-bad':''],
      ['In progress',M.wip.length,'',M.wip.length?'units out of service':'nothing on the tools'],
      [`Done in ${new Date().toLocaleDateString('en-GB',{month:'short'})}`,md,`/ ${M.plan.length}`,`${M.plan.length?Math.round(md/M.plan.length*100):0}% of the month plan`]];
    $('#mtTiles').innerHTML=tiles.map(([l,v,u,d,c])=>`<div class="kpi ${c||''}"><span class="label">${l}</span><span class="v">${v}<small>${u}</small></span><span class="d">${esc(d)}</span></div>`).join('');
    $('#mtNeed').innerHTML=
      sec('In progress',M.wip.length,M.wip.map(x=>row(x,'wip',M.today)).join(''),'wip')+
      sec('Faults — corrective',M.corr.length,M.corr.map(x=>row(x,'corr',M.today)).join(''))+
      sec('Overdue',M.over.length,M.over.map(x=>row(x,'over',M.today)).join(''))+
      sec(`Due in the next ${SOON} days`,M.soon.length,M.soon.map(x=>row(x,'soon',M.today)).join(''))+
      (M.log.length?sec('Finished this session',M.log.length,M.log.map(x=>row(x,'log',M.today)).join('')):'');
    $('#mtCal').innerHTML=calendar(M);
    const dl=M.plan.filter(p=>p.n===st.day).length;
    $('#mtDayH').innerHTML=`${st.day===M.today?'Today · ':''}${dateOf(st.day).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})} <span class="label">${dl} task${dl===1?'':'s'}</span>`;
    $('#mtDay').innerHTML=dayList(M);
  }

  // ---------- export ----------
  function reportHTML(M){
    const now=new Date(), month=now.toLocaleDateString('en-GB',{month:'long',year:'numeric'}), scope=GROUPS.find(g=>g[0]===st.g)[1];
    const tbl=(head,rows)=>`<table class="rp-t"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,j)=>`<td${j&&j===r.length-1&&/^\d/.test(String(c))?' class="r"':''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const none='<p class="rp-none">None.</p>';
    const md=M.plan.filter(p=>p.status==='done').length;
    let h=`<header class="rp-hd"><div><div class="rp-brand">Center Utility Complex · CBD Cooling Plant</div><h1>Maintenance report</h1><div class="rp-sub">${esc(month)} · ${scope==='All'?'all equipment':esc(scope.toLowerCase())}</div></div>
      <dl><dt>Month</dt><dd>${esc(month)}</dd><dt>Generated</dt><dd>${fdy(now)} ${ft(now)}</dd></dl></header>`;
    h+=`<h2>Summary</h2><div class="rp-k">${[['Overdue',M.over.length,M.over.length>0],['Due in 7 days',M.soon.length],['Faults to fix',M.corr.length,M.corr.length>0],['In progress',M.wip.length],['Done this month',`${md} / ${M.plan.length}`],['Plan completion',`${M.plan.length?Math.round(md/M.plan.length*100):0} %`]]
      .map(([l,v,bad])=>`<div${bad?' class="bad"':''}><span>${l}</span><b>${v}</b></div>`).join('')}</div>`;
    h+=`<h2>In progress</h2>`+(M.wip.length?tbl(['Equipment','Location','Task','Team','Started'],M.wip.map(x=>[`<b>${esc(x.a.name)}</b>`,esc(x.a.where),esc(x.task),TEAM[x.team],ft(new Date(x.start))])):none);
    h+=`<h2>Faults — corrective work</h2>`+(M.corr.length?tbl(['Equipment','Location','Fault','Team','Est. h'],M.corr.map(x=>[`<b>${esc(x.a.name)}</b>`,esc(x.a.where),`<span class="rp-no">${esc(x.task)}</span>`,TEAM[x.team],x.h])):none);
    h+=`<h2>Overdue</h2>`+(M.over.length?tbl(['Equipment','Location','Task','Was due','Days late'],M.over.map(x=>[`<b>${esc(x.s.a.name)}</b>`,esc(x.s.a.where),esc(x.s.task),fdy(dateOf(x.n)),`<span class="rp-no">${M.today-x.n}</span>`])):none);
    h+=`<h2>Due in the next ${SOON} days</h2>`+(M.soon.length?tbl(['Equipment','Location','Task','Due','Team'],M.soon.map(x=>x.rh?[`<b>${esc(x.a.name)}</b>`,esc(x.a.where),`Run-hour major service (${f0(x.left)} h to go)`,fdy(dateOf(x.n)),TEAM.mech]:[`<b>${esc(x.s.a.name)}</b>`,esc(x.s.a.where),esc(x.s.task),fdy(dateOf(x.n)),TEAM[x.s.team]])):none);
    if(M.log.length) h+=`<h2>Finished this session</h2>`+tbl(['Equipment','Task','Team','Finished'],M.log.map(x=>[`<b>${esc(x.a.name)}</b>`,esc(x.task),TEAM[x.team],ft(x.at)]));
    h+=`<h2>${esc(month)} maintenance plan</h2>`+tbl(['Date','Equipment','Location','Task','Interval','Team','Est. h','Status'],
      M.plan.map(p=>{const a=nameOf(p); return [fd(dateOf(p.n)),`<b>${esc(a.name)}</b>`,esc(a.where),esc(p.rh?'Run-hour major service':p.s.task),p.rh?`${f0(RUNH)} run-h`:`${p.s.I} d`,TEAM[p.rh?'mech':p.s.team],p.rh?16:p.s.h,
        p.status==='over'?'<span class="rp-no">Overdue</span>':STL[p.status]+(p.status==='done'&&p.at?' '+fd(p.at):'')];}));
    return `<article class="rp-page">${h}<footer class="rp-ft">Schneider Electric · AVEVA — schedule and work orders are simulated, not read from a CMMS.</footer></article>`;
  }
  const stem=()=>{const d=new Date(); return `CUC_maintenance_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}${st.g==='all'?'':'_'+st.g}`;};

  function print(){
    let area=document.getElementById('printArea');
    if(!area){area=document.createElement('div');area.id='printArea';document.body.appendChild(area);}
    area.innerHTML=reportHTML(model());
    const t=document.title; document.title=stem();
    try{ window.print(); }catch(e){}
    document.title=t;
  }

  const savePdf=()=>UI.savePdf(reportHTML(model()),stem(),$('#mtPrint'),print);

  function csv(){
    const M=model(), q=v=>{const s=String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}, now=new Date();
    const L=[['Center Utility Complex — maintenance report'],['Month',now.toLocaleDateString('en-GB',{month:'long',year:'numeric'})],['Scope',GROUPS.find(g=>g[0]===st.g)[1]],['Generated',`${fdy(now)} ${ft(now)}`],['Values are simulated'],[],
      ['SUMMARY'],['Overdue',M.over.length],['Due in 7 days',M.soon.length],['Faults to fix',M.corr.length],['In progress',M.wip.length],['Done this month',M.plan.filter(p=>p.status==='done').length],['Planned this month',M.plan.length],[]];
    L.push(['NEEDS MAINTENANCE'],['Category','Equipment','Type','Location','Task','Due date','Days late / to go','Team','Est. h']);
    M.wip.forEach(x=>L.push(['In progress',x.a.name,GNAME[x.a.g],x.a.where,x.task,`started ${ft(new Date(x.start))}`,'',TEAM[x.team],x.h]));
    M.corr.forEach(x=>L.push(['Fault',x.a.name,GNAME[x.a.g],x.a.where,x.task,'now','',TEAM[x.team],x.h]));
    M.over.forEach(x=>L.push(['Overdue',x.s.a.name,GNAME[x.s.a.g],x.s.a.where,x.s.task,fdy(dateOf(x.n)),M.today-x.n,TEAM[x.s.team],x.s.h]));
    M.soon.forEach(x=>x.rh?L.push(['Due soon',x.a.name,'Chiller',x.a.where,`Run-hour major service (${f0(x.left)} h to go)`,fdy(dateOf(x.n)),x.n-M.today,TEAM.mech,16])
      :L.push(['Due soon',x.s.a.name,GNAME[x.s.a.g],x.s.a.where,x.s.task,fdy(dateOf(x.n)),x.n-M.today,TEAM[x.s.team],x.s.h]));
    if(M.log.length){ L.push([],['FINISHED THIS SESSION'],['Equipment','Task','Team','Finished']); M.log.forEach(x=>L.push([x.a.name,x.task,TEAM[x.team],`${fdy(x.at)} ${ft(x.at)}`])); }
    L.push([],['MONTH PLAN'],['Date','Weekday','Equipment','Type','Location','Task','Interval','Team','Est. h','Status','Completed']);
    M.plan.forEach(p=>{const a=nameOf(p), d=dateOf(p.n);
      L.push([fdy(d),d.toLocaleDateString('en-GB',{weekday:'short'}),a.name,GNAME[a.g],a.where,p.rh?'Run-hour major service':p.s.task,p.rh?`${RUNH} run-h`:`${p.s.I} d`,TEAM[p.rh?'mech':p.s.team],p.rh?16:p.s.h,STL[p.status],p.status==='done'&&p.at?fdy(p.at):'']);});
    const blob=new Blob(['﻿'+L.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=stem()+'.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  }

  // ---------- clock: finish jobs, keep the sidebar button current ----------
  function loop(){
    const now=Date.now();
    [...wip.values()].filter(w=>w.end<=now).forEach(w=>finish(w,false));
    const all=st.g; st.g='all'; const M=model(); st.g=all;
    const need=M.over.length+M.corr.length;
    const b=$('#mtBadge'); if(b){ b.textContent=need; b.hidden=!need; }
    const sub=$('#mtNav'); if(sub) sub.textContent=`${M.over.length} overdue · ${M.wip.length} in progress →`;
    render(false);
  }
  UI.renderMaint=()=>render(true);
  setInterval(loop,1000); setTimeout(loop,0);
})();
