/* Physics-lite district cooling model: CUC chiller plant feeding the CBD towers. */
(function(){
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const TR_KW=3.517, CP=4.186, CAP=3000;
  const walk=(o,k,s=0.02,lim=0.08)=>{o[k]=clamp((o[k]||0)+(Math.random()-.5)*s,-lim,lim);return o[k]};

  const TOWERS=[
    // Positions are % of the site image (cbd-site.png). Pins printed on the image need no drawn pin; C-series are drawn (drawPin).
    {id:'ICON',name:'Iconic Tower',use:'Mixed-use · 77 floors · 394 m',design:5200,ahus:6,x:6.3,y:30.7},
    {id:'C01',name:'Tower C01',use:'Office · 35 floors · 174 m',design:900,ahus:4,x:13.1,y:24.3,drawPin:true},
    {id:'C02',name:'Tower C02',use:'Office · 15 floors · 66 m',design:380,ahus:2,x:24.9,y:26.7,drawPin:true},
    {id:'C03',name:'Tower C03',use:'Office · 15 floors · 66 m',design:380,ahus:2,x:54.3,y:43.7,drawPin:true},
    {id:'C04',name:'Tower C04',use:'Office · 34 floors · 170 m',design:880,ahus:4,x:70.7,y:29.2,drawPin:true},
    {id:'C05',name:'Tower C05',use:'Office · 18 floors · 79 m',design:450,ahus:3,x:60.2,y:64.0,drawPin:true},
    {id:'C06',name:'Tower C06',use:'Office · 18 floors · 79 m',design:450,ahus:3,x:72.6,y:45.7,drawPin:true},
    {id:'C07',name:'Tower C07',use:'Office · 32 floors · 141 m',design:800,ahus:4,x:37.6,y:25.3,drawPin:true},
    {id:'C08',name:'Tower C08',use:'Office · 32 floors · 141 m',design:800,ahus:4,x:73.0,y:63.2,drawPin:true},
    {id:'C09',name:'Tower C09',use:'Hotel · 55 m',design:320,ahus:2,x:53.7,y:77.7,drawPin:true},
    {id:'C10',name:'Tower C10',use:'Hotel · 55 m',design:320,ahus:2,x:19.6,y:80.7,drawPin:true},
    {id:'C11',name:'Tower C11',use:'Office · 27 floors · 160 m',design:700,ahus:3,x:8.2,y:84.5,drawPin:true},
    {id:'C12',name:'Tower C12',use:'Office · 27 floors · 160 m',design:700,ahus:3,x:52.4,y:28.2,drawPin:true},
    {id:'D01',name:'Tower D01',use:'Residential · 49 floors · 196 m',design:1150,ahus:4,x:41.2,y:59.3},
    {id:'D02',name:'Tower D02',use:'Residential · 45 floors · 154 m',design:900,ahus:3,x:54.1,y:59.3},
    {id:'D03',name:'Tower D03',use:'Residential · 45 floors · 154 m',design:1400,ahus:4,x:64.3,y:42.8},
    {id:'D04',name:'Tower D04',use:'Residential · 39 floors · 133 m',design:950,ahus:3,x:59.8,y:23.8},
    {id:'D05',name:'Tower D05',use:'Residential · 37 floors · 127 m',design:800,ahus:3,x:29.1,y:23.8},
    {id:'D06',name:'Tower D06',use:'Office · 24 floors',design:1000,ahus:4,x:43.7,y:23.8},
    {id:'D07',name:'Tower D07',use:'Hotel · 18 floors',design:850,ahus:3,x:9.9,y:72.7},
    {id:'D08',name:'Tower D08',use:'Office · 26 floors',design:1050,ahus:4,x:31.2,y:73.6},
    {id:'D09',name:'Tower D09',use:'Residential · 22 floors',design:950,ahus:3,x:44.8,y:74.1},
    {id:'D10',name:'Tower D10',use:'Office · 18 floors',design:900,ahus:3,x:65.1,y:74.5}
  ];
  TOWERS.forEach(t=>{
    t.kind='tower'; t.zoneSP=24; t.satSP=13; t.n={};
    t.ahu=Array.from({length:t.ahus},(_,i)=>({id:`AHU-${String(i+1).padStart(2,'0')}`,enabled:true,fault:false,fanOverride:null,n:{}}));
    t.ets={id:'ETS-1',fault:false}; t.hist=[];
  });

  const plant={
    id:'CUC',kind:'plant',name:'Central Utilities Complex',use:'District cooling plant · 9 × 3,000 TR installed + 1 future bay',x:78.2,y:52.5,w:20.7,h:19.9,
    chwsSP:5.5,hist:[],n:{},
    chillers:Array.from({length:9},(_,i)=>({id:`CH-0${i+1}`,cap:CAP,enabled:true,fault:false,hours:[18420,17260,19110,16880,15320,20540,17940,16410,19680][i]})),
    towers:Array.from({length:9},(_,i)=>({id:`CT-${String(i+1).padStart(2,'0')}`,enabled:true,fault:false,fanOverride:null})),
    chwp:Array.from({length:9},(_,i)=>({id:`CHWP-0${i+1}`,enabled:true,fault:false})),
    cwp:Array.from({length:9},(_,i)=>({id:`CWP-0${i+1}`,enabled:true,fault:false})),
    dp:Array.from({length:4},(_,i)=>({id:`DP-0${i+1}`,enabled:true,fault:false,speedOverride:null}))
  };

  const alarms=new Map(); // key -> {sev,text,since,asset,eq,log}
  // alarm history: one entry per occurrence, closed (cleared) when the alarm goes away; newest last
  const alarmLog=[]; let logId=0;
  const eqOf=key=>{const r=key.split('-').slice(1).join('-'), m=r.match(/^(CH|CT|CHWP|CWP|DP|AHU)-\d+/);
    if(/-chwstr$/.test(r)) return 'CHWP-'+r.slice(3,5); if(/-cwstr$/.test(r)) return 'CWP-'+r.slice(3,5);
    return m?m[0]:r==='ets'?'ETS-1':r==='zone'?'ZONE':null;};
  function raise(key,sev,text,asset){
    if(!alarms.has(key)){ const e={id:++logId,key,sev,text,asset,eq:eqOf(key),since:new Date(),cleared:null}; alarmLog.push(e); if(alarmLog.length>600) alarmLog.shift(); alarms.set(key,{sev,text,asset,eq:e.eq,since:e.since,log:e}); }
    else { const x=alarms.get(key); Object.assign(x,{sev,text}); if(sev==='crit') x.log.sev='crit'; x.log.text=text; }
    return key; }

  const S={towers:TOWERS,plant,alarms,alarmLog,site:{},clamp};
  const weather={};

  function step(){
    const now=new Date(), h=now.getHours()+now.getMinutes()/60;
    weather.db=+(31+6*Math.sin((h-9)/24*2*Math.PI)+walk(weather,'n',0.1,0.6)).toFixed(1);
    weather.wb=+(weather.db-10.5+walk(weather,'m',0.06,0.4)).toFixed(1);
    const occ=(h>=8&&h<19)?0.9+0.1*Math.sin((h-8)/11*Math.PI):0.3;
    const live=new Set();

    // ---- Plant capacity comes from last tick's chw temp; towers compute demand first
    const chwsPrev=plant.chws??plant.chwsSP;
    let demand=0;
    TOWERS.forEach(t=>{
      const lf=clamp(0.34+0.42*occ+0.028*(weather.db-30)+(24-t.zoneSP)*0.07+walk(t.n,'l',0.015,0.06),0.18,1.05);
      t.occ=occ; t.lf=lf; t.load=t.design*lf; demand+=t.load;
    });
    demand*=1.03;
    plant.demand=demand;

    // ---- Chiller staging (lowest run-hours first among healthy, enabled units)
    const avail=plant.chillers.filter(c=>c.enabled&&!c.fault).sort((a,b)=>a.hours-b.hours);
    const need=Math.ceil(demand/(CAP*0.9));
    const runSet=new Set(avail.slice(0,Math.min(need,avail.length)));
    const run=runSet.size, capacity=run*CAP;
    const produced=Math.min(demand,capacity), unmet=Math.max(0,demand-capacity);
    const part=run?produced/capacity:0;
    plant.run=run; plant.part=part; plant.produced=produced; plant.unmet=unmet;

    // cooling towers
    // each bay pairs chiller i with cooling tower i, CWP i and CHWP i; a failed partner is covered by a free healthy unit
    const runIdx=plant.chillers.map((c,i)=>runSet.has(c)?i:-1).filter(i=>i>=0);
    const pickPaired=arr=>{
      const ok=u=>u.enabled&&!u.fault, chosen=[];
      runIdx.forEach(i=>{ if(ok(arr[i])) chosen.push(arr[i]); });
      const spares=arr.filter(u=>ok(u)&&!chosen.includes(u)&&!runIdx.includes(arr.indexOf(u)));
      while(chosen.length<runIdx.length&&spares.length) chosen.push(spares.shift());
      return chosen;
    };
    const ctSet=pickPaired(plant.towers);
    const ctRun=ctSet.length;
    let ctKW=0, fanSum=0;
    plant.towers.forEach(c=>{c.running=false;c.fan=0;c.kW=0});
    ctSet.forEach(c=>{
      c.running=true;
      c.fan=c.fanOverride??clamp(32+58*part+(weather.wb-21)*3,25,100);
      c.kW=110*Math.pow(c.fan/100,3); ctKW+=c.kW; fanSum+=c.fan;
    });
    const avgFan=ctRun?fanSum/ctRun:0;
    const cellShort=run?clamp((run-ctRun)/run,0,1):0;
    plant.approach=run?clamp(2.1+4.2*part*Math.pow(60/Math.max(avgFan,20),0.6)+cellShort*5,1.5,12):0;
    plant.cws=+(weather.wb+plant.approach).toFixed(2);
    plant.cwr=+(plant.cws+(run?5.4*part+0.4:0)).toFixed(2);

    // chilled water temps
    const overload=unmet>0?Math.min(4,unmet/CAP*3):0;
    plant.chws=run?plant.chwsSP+Math.max(0,part-0.97)*18+overload+walk(plant.n,'s',0.03,0.08):chwsPrev+0.25;
    plant.chws=clamp(plant.chws,3.5,15);
    plant.dT=run?7.2+0.9*part+walk(plant.n,'d',0.03,0.15):0.5;
    plant.chwr=plant.chws+plant.dT;

    let chKW=0;
    plant.chillers.forEach(c=>{
      c.running=runSet.has(c);
      if(!c.running){Object.assign(c,{tr:0,kW:0,pct:0,kwtr:0,evapIn:plant.chwr,evapOut:plant.chwr,condIn:plant.cws,condOut:plant.cws});return;}
      c.pct=part*100; c.tr=CAP*part; c.hours+=1/3600;
      c.kwtr=clamp(0.50+0.4*Math.pow(part-0.82,2)+0.017*(plant.cws-29)+0.028*(5.5-plant.chwsSP),0.42,1.2);
      c.kW=c.tr*c.kwtr; chKW+=c.kW;
      c.evapIn=plant.chwr; c.evapOut=plant.chws; c.condIn=plant.cws; c.condOut=plant.cwr;
      c.flow=c.tr*TR_KW/(CP*plant.dT);
      c.cop=TR_KW/c.kwtr;
    });

    let pumpKW=0;
    const pumpGroup=(arr,count,fn,paired)=>{
      const sel=paired?pickPaired(arr):arr.filter(p=>p.enabled&&!p.fault).slice(0,count);
      arr.forEach(p=>{p.running=false;p.hz=0;p.kW=0;p.flow=0});
      sel.forEach((p,i)=>{p.running=true;fn(p,i);pumpKW+=p.kW});
      return sel.length;
    };
    const chwpRun=pumpGroup(plant.chwp,run,p=>{p.hz=30+20*part;p.kW=130*Math.pow(p.hz/50,3);p.flow=CAP*part*TR_KW/(CP*plant.dT);p.head=22*Math.pow(p.hz/50,2)},true);
    const cwpRun=pumpGroup(plant.cwp,run,p=>{p.hz=50;p.kW=180;p.flow=CAP*part*TR_KW*1.2/(CP*Math.max(plant.cwr-plant.cws,1));p.head=28},true);
    const dpNeed=Math.max(1,Math.ceil(demand/6500));
    const dpRun=pumpGroup(plant.dp,dpNeed,p=>{const r=clamp(demand/(dpNeed*6500),0,1);p.hz=p.speedOverride??(30+20*r);p.kW=360*Math.pow(p.hz/50,3);p.flow=demand/dpNeed*TR_KW/(CP*plant.dT);p.head=40*Math.pow(p.hz/50,2)});
    plant.dpRun=dpRun; plant.ctRun=ctRun;
    plant.remoteDP=clamp(1.2*(plant.dp.filter(p=>p.running).reduce((a,p)=>a+p.hz,0)/Math.max(1,dpNeed*(30+20*clamp(demand/(dpNeed*6500),0,1)))),0,2)*(dpRun?1:0);

    plant.kW=chKW+ctKW+pumpKW; plant.chKW=chKW; plant.ctKW=ctKW; plant.pumpKW=pumpKW;
    plant.kwtr=produced?plant.kW/produced:0;
    plant.flow=produced*TR_KW/(CP*plant.dT);

    // shortfalls propagate to buildings
    const shortFrac=demand?unmet/demand:0;
    const pumpShort=dpRun<dpNeed?0.35:0;
    TOWERS.forEach(t=>{
      const priS=plant.chws+0.35, priDT=6.8+1.2*t.lf;
      const e=t.ets; e.priS=priS; e.priR=priS+priDT;
      e.secS=priS+1.1+(e.fault?6:0); e.secR=e.secS+6.5*t.lf; e.valve=e.fault?0:clamp(t.lf*88+walk(e,'v',0.8,3),5,100);
      e.flow=t.load*TR_KW/(CP*priDT);
      const starve=clamp(shortFrac*3+pumpShort+(e.fault?0.8:0),0,1);
      let fanKW=0, satSum=0, on=0;
      t.ahu.forEach((a,i)=>{
        if(!a.enabled||a.fault){Object.assign(a,{running:false,fan:0,kW:0,valve:0,sat:t.zoneT??t.zoneSP,co2:420+900*t.occ});return;}
        a.running=true; on++;
        a.fan=a.fanOverride??clamp(42+50*t.lf+walk(a.n,'f',0.6,3),20,100);
        a.valve=clamp(t.lf*90*(1+starve)+walk(a.n,'v',0.8,3),0,100);
        a.sat=t.satSP+Math.max(0,e.secS-6.6)*0.55+starve*5+walk(a.n,'s',0.04,0.2);
        a.kW=t.design/1000*28*Math.pow(a.fan/100,3); fanKW+=a.kW; satSum+=a.sat;
        a.co2=420+620*t.occ*Math.pow(60/Math.max(a.fan,25),0.9);
        a.filterPa=145+i*18; a.rh=48+walk(a.n,'h',0.3,6);
      });
      const offFrac=(t.ahus-on)/t.ahus;
      t.zoneT=t.zoneSP+starve*3.5+offFrac*3+Math.max(0,(on?satSum/on:20)-t.satSP)*0.35+walk(t.n,'z',0.03,0.25);
      t.fanKW=fanKW;
      t.comfort=clamp(100-Math.max(0,t.zoneT-t.zoneSP-0.5)*38,0,100);
      t.status=t.zoneT-t.zoneSP>2||e.fault?'crit':(t.zoneT-t.zoneSP>1||offFrac>0?'warn':'ok');
      t.hist.push(t.load); if(t.hist.length>60)t.hist.shift();

      t.ahu.forEach(a=>{ if(a.fault) live.add(raise(`${t.id}-${a.id}`,'crit',`${a.id} supply fan tripped`,t.id)); else if(!a.enabled) live.add(raise(`${t.id}-${a.id}-off`,'warn',a.maint?`${a.id} out of service for planned maintenance`:`${a.id} stopped by operator`,t.id)); });
      if(e.fault) live.add(raise(`${t.id}-ets`,'crit','ETS plate heat exchanger fouled — secondary CHWS high',t.id));
      if(t.zoneT-t.zoneSP>1) live.add(raise(`${t.id}-zone`,t.zoneT-t.zoneSP>2?'crit':'warn',`Zone temperature ${t.zoneT.toFixed(1)} °C above setpoint`,t.id));
    });

    plant.chillers.forEach(c=>{ if(c.fault) live.add(raise(`CUC-${c.id}`,'crit',`${c.id} tripped on low evaporator pressure`,'CUC')); else if(!c.enabled) live.add(raise(`CUC-${c.id}-off`,'warn',c.maint?`${c.id} out of service for planned maintenance`:`${c.id} locked out by operator`,'CUC'));
      const n=c.id.slice(-2);
      if((c.chwStr||1)>1) live.add(raise(`CUC-${c.id}-chwstr`,'warn',`Strainer ΔP high on CHWP-${n} suction (bay ${+n}) — clean strainer`,'CUC'));
      if((c.cwStr||1)>1) live.add(raise(`CUC-${c.id}-cwstr`,'warn',`Strainer ΔP high on CWP-${n} suction (bay ${+n}) — clean strainer`,'CUC')); });
    [...plant.towers,...plant.chwp,...plant.cwp,...plant.dp].forEach(p=>{ if(p.fault) live.add(raise(`CUC-${p.id}`,'crit',`${p.id} VFD fault`,'CUC')); else if(!p.enabled) live.add(raise(`CUC-${p.id}-off`,'warn',p.maint?`${p.id} out of service for planned maintenance`:`${p.id} disabled by operator`,'CUC')); });
    if(unmet>0) live.add(raise('CUC-short','crit',`Capacity shortfall ${Math.round(unmet).toLocaleString()} TR — no standby chiller`,'CUC'));
    if(plant.chws>plant.chwsSP+1) live.add(raise('CUC-chws','warn',`CHWS ${plant.chws.toFixed(1)} °C drifting above setpoint`,'CUC'));
    if(dpRun<dpNeed) live.add(raise('CUC-dp','crit','Distribution pumping below demand','CUC'));
    [...alarms.keys()].forEach(k=>{ if(!live.has(k)){ alarms.get(k).log.cleared=new Date(); alarms.delete(k); } });

    plant.status=[...alarms.values()].some(a=>a.asset==='CUC'&&a.sev==='crit')?'crit':([...alarms.values()].some(a=>a.asset==='CUC')?'warn':'ok');
    plant.hist.push({load:produced,kwtr:plant.kwtr,chws:plant.chws,kW:plant.kW}); if(plant.hist.length>120) plant.hist.shift();

    Object.assign(S.site,{weather,demand,produced,kW:plant.kW,kwtr:plant.kwtr,chws:plant.chws,chwr:plant.chwr,dT:plant.dT,
      zoneAvg:TOWERS.reduce((a,t)=>a+t.zoneT,0)/TOWERS.length,alarms:alarms.size,crit:[...alarms.values()].filter(a=>a.sev==='crit').length,
      comfort:TOWERS.reduce((a,t)=>a+t.comfort*t.design,0)/TOWERS.reduce((a,t)=>a+t.design,0)});
  }

  S.step=step;
  S.find=id=>id==='CUC'?plant:TOWERS.find(t=>t.id===id);
  // past 7 days of alarm history (simulated, same every load for a given day) so the log opens populated
  (function(){
    const R=n=>{n|=0;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;};
    const ids=TOWERS.map(t=>t.id), pick=(arr,r)=>arr[Math.floor(r*arr.length)], n2=r=>String(1+Math.floor(r*9)).padStart(2,'0');
    const TPL=[
      r=>{const n=n2(r);return ['CUC',`CH-${n}`,'crit',`CH-${n} tripped on low evaporator pressure`]},
      r=>{const n=n2(r);return ['CUC',`CHWP-${n}`,'warn',`Strainer ΔP high on CHWP-${n} suction (bay ${+n}) — clean strainer`]},
      r=>{const n=n2(r);return ['CUC',`CWP-${n}`,'warn',`Strainer ΔP high on CWP-${n} suction (bay ${+n}) — clean strainer`]},
      r=>{const n=n2(r);return ['CUC',`CT-${n}`,'crit',`CT-${n} VFD fault`]},
      r=>{const n=String(1+Math.floor(r*4)).padStart(2,'0');return ['CUC',`DP-${n}`,'crit',`DP-${n} VFD fault`]},
      r=>['CUC',null,'warn',`CHWS ${(6.6+r*1.2).toFixed(1)} °C drifting above setpoint`],
      r=>{const t=pick(ids,r);return [t,'ZONE',r>.7?'crit':'warn',`Zone temperature ${(25.1+r*2).toFixed(1)} °C above setpoint`]},
      r=>{const t=TOWERS[Math.floor(r*TOWERS.length)], a=String(1+Math.floor(R(r*1e6)*t.ahus)).padStart(2,'0');return [t.id,`AHU-${a}`,'crit',`AHU-${a} supply fan tripped`]},
      r=>{const t=pick(ids,r);return [t,'ETS-1','crit','ETS plate heat exchanger fouled — secondary CHWS high']},
      r=>{const t=TOWERS[Math.floor(r*TOWERS.length)], a=String(1+Math.floor(R(r*1e6)*t.ahus)).padStart(2,'0');return [t.id,`AHU-${a}`,'warn',`AHU-${a} stopped by operator`]}
    ];
    const now=Date.now(), d0=new Date(); d0.setHours(0,0,0,0); const base=Math.floor(d0/864e5), out=[];
    for(let d=7;d>=0;d--){ const day=base-d, cnt=5+Math.floor(R(day*7)*6);
      for(let i=0;i<cnt;i++){ const k=day*97+i*13, r=R(k), tpl=TPL[Math.floor(R(k+1)*TPL.length)](R(k+2));
        const t0=+d0-d*864e5+R(k+3)*864e5, dur=(4+R(k+4)**2*230)*6e4;
        if(t0+dur>now-6e4) continue;
        out.push({key:`${tpl[0]}-${tpl[1]||'sys'}`,asset:tpl[0],eq:tpl[1],sev:tpl[2],text:tpl[3],since:new Date(t0),cleared:new Date(t0+dur),past:true}); } }
    out.sort((a,b)=>a.since-b.since).forEach(e=>{e.id=++logId; alarmLog.push(e);});
  })();
  // warm the history so trends open populated
  for(let i=0;i<120;i++) step();
  window.SIM=S;
})();
