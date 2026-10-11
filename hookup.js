/* Hookup (P&ID detail) for one piece of equipment: inlet and outlet runs with valves, strainers, pumps and live instruments. */
(function(){
  const {S,f0,f1,f2,esc}=UI;
  const TRK=3.517, CP=4.186, G=0.0981; // kW per TR, kJ/kg·K, bar per m head
  const sq=v=>v*v;
  const bar=v=>`${f2(Math.max(0,v))} bar`, dc=v=>`${f1(v)} °C`, ls=v=>`${f0(Math.max(0,v))} l/s`;
  const CHWS='var(--chw)', CHWR='#2c6f99', CWS='#c9a15a', CWR='var(--cw)', AIR='#6f8c80';
  const INST={pt:1,tt:1,ft:1,dpt:1,lt:1,fq:1,mt:1,at:1};
  const CX0=440, CX1=560;

  // ---------- hydraulics for one CUC bay (chiller i with its CWP/CHWP/CT)
  function bay(i){
    const p=S.plant, c=p.chillers[i], cap=c.cap, on=c.running, pe=p.chwp[i], pc=p.cwp[i];
    const re=on?c.flow/(cap*TRK/(CP*7.8)):0;
    const e={r:re,flow:on?c.flow:0,tin:p.chwr,tout:on?p.chws:p.chwr};
    e.str=0.1*sq(re)*(c.chwStr||1); e.suct=2.6-0.03*sq(re)-e.str;
    e.hz=pe.running?pe.hz:0; e.head=e.hz?22*sq(e.hz/50):0; e.dis=e.suct+e.head*G;
    e.inP=e.dis-0.12*sq(re); e.outP=e.inP-0.65*sq(re); e.kW=pe.kW||0;
    const fc=on?cap*(c.pct/100)*TRK*1.25/(CP*Math.max(p.cwr-p.cws,1)):0, rc=fc/(cap*TRK*1.25/(CP*5.5));
    const w={r:rc,flow:fc,tin:p.cws,tout:on?p.cwr:p.cws};
    w.str=0.12*sq(rc)*(c.cwStr||1); w.suct=1.4-0.04*sq(rc)-w.str;
    w.hz=pc.running?pc.hz:0; w.head=w.hz?28*sq(w.hz/50):0; w.dis=w.suct+w.head*G;
    w.inP=w.dis-0.12*sq(rc); w.outP=w.inP-0.7*sq(rc); w.kW=pc.kW||0;
    return {p,c,on,e,w,ct:p.towers[i]};
  }
  const flowSpeed=r=>r>0.02?20+60*Math.min(r,1.2):0;

  // ---------- specs
  function chillerSpec(i){
    const n=i+1, T=(k,r,s)=>`${k}-${n}${r}${s}`, id=`CH-0${n}`;
    return {title:`${id} chiller hookup`,vb:'0 52 1000 516', calc:()=>bay(i),
      rows:[
        {y:200,dir:-1,cin:CWS,cout:CWR,from:`From CT-0${n} basin`,to:`To CT-0${n}`,
          inlet:[{k:'hv',tag:T('HV',1,1)},{k:'str',tag:T('STR',1,1)},{k:'dpt',tag:T('DPT',1,1),name:'CW strainer ΔP',val:d=>bar(d.w.str),alarm:d=>d.w.str>0.35},
            {k:'pt',tag:T('PT',1,1),name:'CWP suction pressure',val:d=>bar(d.w.suct),alarm:d=>d.on&&d.w.suct<0.9},{k:'pump',tag:`CWP-0${n}`,eq:`CWP-0${n}`,val:d=>`${f1(d.w.hz)} Hz`},
            {k:'nrv',tag:T('NRV',1,1)},{k:'pt',tag:T('PT',1,2),name:'CWP discharge pressure',val:d=>bar(d.w.dis)},
            {k:'tt',tag:T('TT',1,1),name:'Condenser water in',val:d=>dc(d.w.tin)},{k:'pt',tag:T('PT',1,3),name:'Condenser inlet pressure',val:d=>bar(d.w.inP)}],
          outlet:[{k:'tt',tag:T('TT',1,2),name:'Condenser water out',val:d=>dc(d.w.tout)},{k:'pt',tag:T('PT',1,4),name:'Condenser outlet pressure',val:d=>bar(d.w.outP)},
            {k:'ft',tag:T('FT',1,1),name:'Condenser water flow',val:d=>ls(d.w.flow)},{k:'mov',tag:T('MOV',1,1),open:d=>d.on},{k:'hv',tag:T('HV',1,2)}]},
        {y:420,dir:1,cin:CHWR,cout:CHWS,from:'From CHW return header',to:'To CHW supply header',
          inlet:[{k:'hv',tag:T('HV',2,1)},{k:'str',tag:T('STR',2,1)},{k:'dpt',tag:T('DPT',2,1),name:'CHW strainer ΔP',val:d=>bar(d.e.str),alarm:d=>d.e.str>0.35},
            {k:'pt',tag:T('PT',2,1),name:'CHWP suction pressure',val:d=>bar(d.e.suct),alarm:d=>d.on&&d.e.suct<2.1},{k:'pump',tag:`CHWP-0${n}`,eq:`CHWP-0${n}`,val:d=>`${f1(d.e.hz)} Hz`},
            {k:'nrv',tag:T('NRV',2,1)},{k:'pt',tag:T('PT',2,2),name:'CHWP discharge pressure',val:d=>bar(d.e.dis)},
            {k:'tt',tag:T('TT',2,1),name:'Evaporator water in',val:d=>dc(d.e.tin)},{k:'pt',tag:T('PT',2,3),name:'Evaporator inlet pressure',val:d=>bar(d.e.inP)}],
          outlet:[{k:'tt',tag:T('TT',2,2),name:'Evaporator water out',val:d=>dc(d.e.tout)},{k:'pt',tag:T('PT',2,4),name:'Evaporator outlet pressure',val:d=>bar(d.e.outP)},
            {k:'ft',tag:T('FT',2,1),name:'Chilled water flow',val:d=>ls(d.e.flow)},{k:'mov',tag:T('MOV',2,1),open:d=>d.on},{k:'hv',tag:T('HV',2,2)}]}
      ],
      center:()=>{const m=310; return `<rect class="hk-box" x="${CX0}" y="158" width="120" height="304" rx="6"/>
        <rect x="${CX0}" y="178" width="120" height="44" style="fill:color-mix(in srgb,var(--cw) 18%,#13231e);stroke:var(--cw)"/><text class="hk-shell" x="500" y="216" text-anchor="middle">CONDENSER</text>
        <rect x="${CX0}" y="398" width="120" height="44" style="fill:color-mix(in srgb,var(--chw) 18%,#13231e);stroke:var(--chw)"/><text class="hk-shell" x="500" y="436" text-anchor="middle">EVAPORATOR</text>
        <text class="hk-title" x="500" y="252" text-anchor="middle">${id}</text>
        <g transform="translate(500,${m})"><circle r="19" class="hk-box"/><g data-rot="${id}"><path d="M0,-13L4,0L0,13L-4,0ZM-13,0L0,4L13,0L0,-4Z" fill="var(--muted)"/></g></g><text class="hk-sub" x="500" y="${m+34}" text-anchor="middle">Compressor</text>
        <text id="hk-c1" class="hk-sub hk-strong" x="500" y="${m+54}" text-anchor="middle">—</text><text id="hk-c2" class="hk-sub" x="500" y="${m+70}" text-anchor="middle">—</text>`},
      texts:d=>[['hk-c1',d.on?`${f0(d.c.pct)}% · ${f0(d.c.kW)} kW`:'Standby'],['hk-c2',d.on?`${f2(d.c.kwtr)} kW/TR`:'—']],
      speed:d=>({hk0:flowSpeed(d.w.r),hk1:flowSpeed(d.e.r)})};
  }

  function pumpSpec(i,side){ // side 'e' = CHWP, 'w' = CWP
    const n=i+1, r=side==='e'?2:1, T=(k,s)=>`${k}-${n}${r}${s}`, id=`${side==='e'?'CHWP':'CWP'}-0${n}`;
    const L=side==='e'?['From CHW return header',`To CH-0${n} evaporator`,CHWR]:[`From CT-0${n} basin`,`To CH-0${n} condenser`,CWS];
    return {title:`${id} pump hookup`,vb:'0 180 1000 270', calc:()=>{const b=bay(i); return {...b,x:b[side],pump:side==='e'?b.p.chwp[i]:b.p.cwp[i]}},
      rows:[{y:330,dir:-1,cin:L[2],cout:L[2],from:L[0],to:L[1],
        inlet:[{k:'hv',tag:T('HV',1)},{k:'str',tag:T('STR',1)},{k:'dpt',tag:T('DPT',1),name:'Strainer ΔP',val:d=>bar(d.x.str),alarm:d=>d.x.str>0.35},{k:'pt',tag:T('PT',1),name:'Suction pressure',val:d=>bar(d.x.suct)}],
        outlet:[{k:'nrv',tag:T('NRV',1)},{k:'pt',tag:T('PT',2),name:'Discharge pressure',val:d=>bar(d.x.dis)},{k:'ft',tag:T('FT',1),name:'Flow',val:d=>ls(d.x.flow)},{k:'hv',tag:T('HV',3)}]}],
      center:()=>pumpCenter(id),
      texts:d=>[['hk-c1',d.pump.running?`${f1(d.x.hz)} Hz · ${f0(d.x.kW)} kW`:d.pump.fault?'Tripped':'Off'],['hk-c2',d.pump.running?`Head ${f1(d.x.head)} m (${f2(d.x.head*G)} bar)`:'—']],
      speed:d=>({hk0:flowSpeed(d.x.r)})};
  }

  function dpSpec(k){
    const n=k+1, T=(t,s)=>`${t}-D${n}${s}`, id=`DP-0${n}`;
    const calc=()=>{const p=S.plant, u=p.dp[k], des=6500*TRK/(CP*8), r=u.running?u.flow/des:0;
      const x={r,flow:u.running?u.flow:0,hz:u.hz||0,kW:u.kW||0}; x.head=x.hz?40*sq(x.hz/50):0; x.str=0.08*sq(r); x.suct=3.3-x.str; x.dis=x.suct+x.head*G;
      return {x,pump:u,t:p.chws};};
    return {title:`${id} secondary pump hookup`,vb:'0 180 1000 270', calc,
      rows:[{y:330,dir:-1,cin:CHWS,cout:CHWS,from:'From CHW supply header',to:'To CBD loop',
        inlet:[{k:'hv',tag:T('HV',1)},{k:'str',tag:T('STR',1)},{k:'dpt',tag:T('DPT',1),name:'Strainer ΔP',val:d=>bar(d.x.str)},{k:'pt',tag:T('PT',1),name:'Suction pressure',val:d=>bar(d.x.suct)}],
        outlet:[{k:'nrv',tag:T('NRV',1)},{k:'pt',tag:T('PT',2),name:'Discharge pressure',val:d=>bar(d.x.dis)},{k:'tt',tag:T('TT',1),name:'Supply temperature',val:d=>dc(d.t)},{k:'ft',tag:T('FT',1),name:'Flow',val:d=>ls(d.x.flow)},{k:'hv',tag:T('HV',2)}]}],
      center:()=>pumpCenter(id),
      texts:d=>[['hk-c1',d.pump.running?`${f1(d.x.hz)} Hz · ${f0(d.x.kW)} kW`:d.pump.fault?'Tripped':'Off'],['hk-c2',d.pump.running?`Head ${f1(d.x.head)} m (${f2(d.x.head*G)} bar)`:'—']],
      speed:d=>({hk0:flowSpeed(d.x.r)})};
  }

  function towerSpec(i){
    const n=i+1, T=(k,r,s)=>`${k}-T${n}${r}${s}`, id=`CT-0${n}`;
    const calc=()=>{const b=bay(i), on=b.ct.running, r=on?Math.max(b.w.r,0.5):0;
      return {...b,ton:on,r,pin:on?0.35+0.6*sq(r):0,tin:on?b.p.cwr:b.p.cws,tout:b.p.cws,makeup:on?b.w.flow*3.6*0.013:0,
        level:on?71+3*Math.sin(Date.now()/9000):78,str:0.06*sq(r),vib:on?1.6+b.ct.fan/60:0};};
    return {title:`${id} cooling tower hookup`,vb:'0 60 1000 530', calc,
      rows:[
        {y:205,dir:-1,cin:CWR,from:`From CH-0${n} condenser`,
          inlet:[{k:'hv',tag:T('HV',1,1)},{k:'mov',tag:T('MOV',1,1),open:d=>d.ton},{k:'tt',tag:T('TT',1,1),name:'Hot water in',val:d=>dc(d.tin)},{k:'pt',tag:T('PT',1,1),name:'Distribution header pressure',val:d=>bar(d.pin)}]},
        {y:440,dir:1,cin:'#7fb7c9',cout:CWS,from:'Makeup water (city)',to:`To CWP-0${n} suction`,
          inlet:[{k:'hv',tag:T('HV',2,1)},{k:'fq',tag:T('FQ',2,1),name:'Makeup water flow',val:d=>`${f1(d.makeup)} m³/h`},{k:'mov',tag:T('LV',2,1),open:d=>d.makeup>0},{k:'lt',tag:T('LT',2,1),name:'Basin level',val:d=>`${f0(d.level)} %`}],
          outlet:[{k:'tt',tag:T('TT',2,1),name:'Basin water out',val:d=>dc(d.tout)},{k:'hv',tag:T('HV',2,2)},{k:'str',tag:T('STR',2,1)},{k:'dpt',tag:T('DPT',2,1),name:'Basin strainer ΔP',val:d=>bar(d.str)}]}
      ],
      center:()=>`<rect class="hk-box" x="480" y="96" width="40" height="54"/>
        <g transform="translate(500,112)"><circle r="24" class="hk-box"/><g data-rot="${id}">${[0,90,180,270].map(r=>`<path d="M0,0C6,-6 6,-16 0,-21C-4,-15 -3,-6 0,0Z" fill="var(--muted)" transform="rotate(${r})"/>`).join('')}</g></g>
        <path class="hk-box" d="M${CX0},150H${CX1}L${CX1+10},415H${CX0-10}Z"/>
        ${[0,1,2,3,4,5].map(k=>`<path d="M${CX0+6},${250+k*22}L${CX1-6},${236+k*22}" stroke="var(--line-2)" stroke-width="1.5"/>`).join('')}
        ${[0,1,2,3,4].map(k=>`<path d="M${458+k*21},212l-5,9h10z" fill="var(--chw)" opacity=".8"/>`).join('')}
        <rect x="${CX0-14}" y="415" width="148" height="52" rx="3" style="fill:color-mix(in srgb,var(--chw) 22%,#13231e);stroke:var(--line-2)"/>
        <text class="hk-title" x="500" y="188" text-anchor="middle">${id}</text><text class="hk-shell" x="500" y="404" text-anchor="middle">FILL</text><text class="hk-shell" x="500" y="460" text-anchor="middle">BASIN</text>
        <text class="hk-sub" x="600" y="104">Fan VFD</text><text id="hk-c1" class="hk-sub hk-strong" x="600" y="122">—</text><text id="hk-c2" class="hk-sub" x="600" y="138">—</text>`,
      texts:d=>[['hk-c1',d.ton?`${f0(d.ct.fan)}% · ${f1(d.ct.fan/2)} Hz · ${f1(d.ct.kW)} kW`:d.ct.fault?'Tripped':'Off'],['hk-c2',d.ton?`Vibration ${f1(d.vib)} mm/s · approach ${f1(d.p.approach)} K`:'—']],
      speed:d=>({hk0:flowSpeed(d.r),hk1:flowSpeed(d.r)})};
  }

  function etsSpec(t){
    const T=(k,r,s)=>`${k}-E${r}${s}`;
    const calc=()=>{const e=t.ets, v=(e.valve||0)/100;
      return {e,v,pIn:3.4,str:0.08*sq(v),hx:0.5*sq(v),cv:0.35*sq(v),sIn:2.9,sHx:0.4*sq(t.lf)};};
    return {title:`${t.id} ETS-1 hookup`,vb:'0 52 1000 516', calc,
      rows:[
        {y:200,dir:-1,cin:CHWS,cout:CHWR,from:'Primary CHWS from CUC',to:'Primary CHWR to CUC',
          inlet:[{k:'hv',tag:T('HV',1,1)},{k:'str',tag:T('STR',1,1)},{k:'dpt',tag:T('DPT',1,1),name:'Strainer ΔP',val:d=>bar(d.str)},{k:'tt',tag:T('TT',1,1),name:'Primary supply temp',val:d=>dc(d.e.priS)},{k:'pt',tag:T('PT',1,1),name:'Primary supply pressure',val:d=>bar(d.pIn-d.str)}],
          outlet:[{k:'tt',tag:T('TT',1,2),name:'Primary return temp',val:d=>dc(d.e.priR)},{k:'pt',tag:T('PT',1,2),name:'Primary return pressure',val:d=>bar(d.pIn-d.str-d.hx)},{k:'cv',tag:T('CV',1,1),val:d=>`${f0(d.e.valve)} %`},{k:'ft',tag:T('FT',1,1),name:'Primary flow',val:d=>ls(d.e.flow)},{k:'hv',tag:T('HV',1,2)}]},
        {y:420,dir:1,cin:CHWR,cout:CHWS,from:'Secondary CHWR from AHUs',to:'Secondary CHWS to AHUs',
          inlet:[{k:'hv',tag:T('HV',2,1)},{k:'str',tag:T('STR',2,1)},{k:'tt',tag:T('TT',2,1),name:'Secondary return temp',val:d=>dc(d.e.secR)},{k:'pt',tag:T('PT',2,1),name:'Secondary return pressure',val:d=>bar(d.sIn)}],
          outlet:[{k:'tt',tag:T('TT',2,2),name:'Secondary supply temp',val:d=>dc(d.e.secS),alarm:d=>d.e.fault},{k:'pt',tag:T('PT',2,2),name:'Secondary supply pressure',val:d=>bar(d.sIn-d.sHx)},{k:'hv',tag:T('HV',2,2)}]}
      ],
      center:()=>`<rect class="hk-box" x="${CX0+10}" y="160" width="100" height="300" rx="4"/>${Array.from({length:9},(_,k)=>`<line x1="${462+k*9.5}" x2="${462+k*9.5}" y1="176" y2="444" stroke="var(--line-2)" stroke-width="3"/>`).join('')}
        <rect x="462" y="292" width="76" height="40" rx="3" class="hk-box"/><text class="hk-title" x="500" y="318" text-anchor="middle">PHE</text><text id="hk-c1" class="hk-sub hk-strong" x="500" y="354" text-anchor="middle" style="paint-order:stroke;stroke:#13231e;stroke-width:4px">—</text>`,
      texts:d=>[['hk-c1',d.e.fault?'Fouled':`${f0(t.load)} TR`]],
      speed:d=>({hk0:flowSpeed(d.v),hk1:flowSpeed(d.v)})};
  }

  function ahuSpec(t,a){
    const no=a.id.slice(-2), T=(k,r,s)=>`${k}-A${+no}${r}${s}`;
    const calc=()=>{const e=t.ets, v=(a.valve||0)/100, on=a.running;
      return {a,on,v,tin:e.secS,tout:on?e.secS+0.5+5.5*v:e.secS,pin:3.1,coil:0.45*sq(v),flow:on?(t.design/t.ahus)*TRK/(CP*6)*v:0,
        oa:on?20+12*t.occ:0,rat:t.zoneT+0.8,airflow:on?(t.design/t.ahus)*0.045*a.fan/100:0};};
    return {title:`${t.id} ${a.id} hookup`,vb:'0 52 1000 516', calc,
      rows:[
        {y:200,dir:-1,cin:CHWS,cout:CHWR,from:'CHW supply riser',to:'CHW return riser',
          inlet:[{k:'hv',tag:T('HV',1,1)},{k:'str',tag:T('STR',1,1)},{k:'tt',tag:T('TT',1,1),name:'Coil CHW in',val:d=>dc(d.tin)},{k:'pt',tag:T('PT',1,1),name:'Coil inlet pressure',val:d=>bar(d.pin)}],
          outlet:[{k:'tt',tag:T('TT',1,2),name:'Coil CHW out',val:d=>dc(d.tout)},{k:'pt',tag:T('PT',1,2),name:'Coil outlet pressure',val:d=>bar(d.pin-d.coil)},{k:'cv',tag:T('PICV',1,1),val:d=>`${f0(d.a.valve||0)} %`},{k:'ft',tag:T('FT',1,1),name:'Coil CHW flow',val:d=>`${f1(d.flow)} l/s`},{k:'hv',tag:T('HV',1,2)}]},
        {y:420,dir:1,duct:true,cin:AIR,cout:AIR,from:'Return + outside air',to:'Supply air to floors',
          inlet:[{k:'cv',tag:T('OAD',2,1),val:d=>`${f0(d.oa)} %`},{k:'tt',tag:T('TT',2,1),name:'Return air temp',val:d=>dc(d.rat)},{k:'dpt',tag:T('DPT',2,1),name:'Filter ΔP',val:d=>d.on?`${f0(d.a.filterPa)} Pa`:'—'}],
          outlet:[{k:'tt',tag:T('TT',2,2),name:'Supply air temp',val:d=>dc(d.a.sat)},{k:'mt',tag:T('MT',2,1),name:'Supply humidity',val:d=>d.on?`${f0(d.a.rh)} %RH`:'—'},{k:'at',tag:T('AT',2,1),name:'CO₂',val:d=>`${f0(d.a.co2)} ppm`},{k:'ft',tag:T('FT',2,1),name:'Airflow',val:d=>`${f1(d.airflow)} m³/s`}]}
      ],
      center:()=>`<rect class="hk-box" x="${CX0-10}" y="150" width="140" height="320" rx="4"/>
        <rect x="${CX0}" y="178" width="120" height="44" style="fill:color-mix(in srgb,var(--chw) 18%,#13231e);stroke:var(--chw)"/>${[0,1,2,3,4,5,6,7].map(k=>`<line x1="${446+k*15}" y1="180" x2="${456+k*15}" y2="220" stroke="var(--chw)" opacity=".5"/>`).join('')}<text class="hk-shell" x="500" y="240" text-anchor="middle">CHW COIL</text>
        <text class="hk-title" x="500" y="282" text-anchor="middle">${a.id}</text><text id="hk-c1" class="hk-sub hk-strong" x="500" y="302" text-anchor="middle">—</text>
        ${[0,1,2,3,4].map(k=>`<path d="M${CX0+6+k*6},398l4,-10l4,10" fill="none" stroke="var(--muted)"/>`).join('')}<text class="hk-shell" x="${CX0+24}" y="450" text-anchor="middle">FILTER</text>
        <g transform="translate(528,420)"><circle r="20" class="hk-box"/><g data-rot="${a.id}">${[0,90,180,270].map(r=>`<path d="M0,0C5,-5 5,-13 0,-17C-3,-12 -3,-5 0,0Z" fill="var(--muted)" transform="rotate(${r})"/>`).join('')}</g></g><text class="hk-shell" x="528" y="456" text-anchor="middle">FAN</text>`,
      texts:d=>[['hk-c1',d.on?`Fan ${f0(d.a.fan)}% · ${f1(d.a.kW)} kW`:d.a.fault?'Tripped':'Off']],
      speed:d=>({hk0:flowSpeed(d.on?Math.max(d.v,0.2):0),hk1:d.on?30+0.6*d.a.fan:0})};
  }

  function pumpCenter(id){
    return `<rect class="hk-box" x="472" y="232" width="56" height="44" rx="3"/><text class="hk-title" x="500" y="260" text-anchor="middle">M</text><line x1="500" y1="276" x2="500" y2="290" stroke="var(--text)" stroke-width="3"/>
      <g transform="translate(500,330)"><circle r="40" class="hk-box"/><g data-rot="${id}"><path d="M0,-28L7,0L0,28L-7,0ZM-28,0L0,7L28,0L0,-7Z" fill="var(--muted)"/></g></g>
      <text class="hk-title" x="500" y="398" text-anchor="middle">${id}</text><text id="hk-c1" class="hk-sub hk-strong" x="500" y="418" text-anchor="middle">—</text><text id="hk-c2" class="hk-sub" x="500" y="434" text-anchor="middle">—</text>`;
  }

  function spec(assetId,eq){
    if(!eq) return null;
    const a=S.find(assetId);
    if(a.kind==='plant'){
      const i=+eq.slice(-2)-1;
      if(eq.startsWith('CH-')) return chillerSpec(i);
      if(eq.startsWith('CT-')) return towerSpec(i);
      if(eq.startsWith('CHWP-')) return pumpSpec(i,'e');
      if(eq.startsWith('CWP-')) return pumpSpec(i,'w');
      if(eq.startsWith('DP-')) return dpSpec(i);
      return null;
    }
    if(eq==='ETS-1') return etsSpec(a);
    const ahu=a.ahu.find(x=>x.id===eq);
    return ahu?ahuSpec(a,ahu):null;
  }

  // ---------- drawing
  function inline(it,x,y,dir,lv){
    const o=-dir, ly=y+o*(lv?35:22)+(o>0?4:0);
    const lab=`<text class="hk-tag" x="${x}" y="${ly}" text-anchor="middle">${esc(it.tag)}</text>`;
    const bow=(extra='')=>`<path d="M${x-10},${y-8}L${x+10},${y+8}V${y-8}L${x-10},${y+8}Z" class="hk-v"${extra}/>`;
    const act=(dome)=>{const ay=y+dir*22; return `<line x1="${x}" y1="${y}" x2="${x}" y2="${ay}" class="hk-l"/>`+(dome?`<path d="M${x-9},${ay}a9,9 0 0 ${dir<0?1:0} 18,0Z" class="hk-v"/>`:`<rect x="${x-8}" y="${dir<0?ay-10:ay}" width="16" height="10" class="hk-v"/><text class="hk-m" x="${x}" y="${dir<0?ay-2:ay+8}" text-anchor="middle">M</text>`)};
    switch(it.k){
      case 'hv': return bow()+lab;
      case 'nrv': return `<path d="M${x-10},${y-8}L${x},${y}L${x-10},${y+8}Z" class="hk-v"/><path d="M${x+10},${y-8}L${x},${y}L${x+10},${y+8}Z" class="hk-v" style="fill:var(--text)"/>`+lab;
      case 'str': return `<rect x="${x-12}" y="${y-7}" width="24" height="14" class="hk-v"/><line x1="${x-12}" y1="${y}" x2="${x+12}" y2="${y}" class="hk-l" stroke-dasharray="2 2"/><path d="M${x-2},${y+o*7}L${x+8},${y+o*17}" class="hk-l"/><path d="M${x+4},${y+o*17}h9" class="hk-l" stroke-width="3"/><text class="hk-tag" x="${x}" y="${y+o*33+(o>0?4:0)}" text-anchor="middle">${esc(it.tag)}</text>`;
      case 'mov': return bow(` id="hk-${it._id}"`)+act(false)+lab;
      case 'cv': return bow()+act(true)+lab+`<text id="hk-${it._id}" class="hk-tag hk-strong" x="${x}" y="${ly+o*12}" text-anchor="middle">—</text>`;
      case 'pump': return `<g class="eq hk-eq" data-eq="${it.eq}" tabindex="0" role="button" aria-label="Open ${it.eq} hookup"><circle cx="${x}" cy="${y}" r="15" class="box"/><g transform="translate(${x},${y})"><g data-rot="${it.eq}"><path d="M0,-9L3,0L0,9L-3,0ZM-9,0L0,3L9,0L0,-3Z" fill="var(--muted)"/></g></g></g>`+
        `<text class="hk-tag hk-strong" x="${x}" y="${y+dir*38+(dir>0?4:0)}" text-anchor="middle">${it.tag}</text><text id="hk-${it._id}" class="hk-tag" x="${x}" y="${y+dir*26+(dir>0?4:0)}" text-anchor="middle">—</text>`;
    }
    return '';
  }
  function bubble(it,x,y,dir,lv){
    const by=y+dir*(58+lv*46), vy=dir<0?by-25:by+33, [L,N]=it.tag.split('-');
    return `<g class="hk-i hk-${it.k}"><title>${esc(it.tag)} — ${esc(it.name)}</title><line x1="${x}" y1="${y}" x2="${x}" y2="${by-dir*17}" class="hk-stem"/><circle cx="${x}" cy="${y}" r="2.6" class="hk-tap"/>
      <circle cx="${x}" cy="${by}" r="17" class="hk-b"/><line x1="${x-17}" x2="${x+17}" y1="${by}" y2="${by}" class="hk-bl"/>
      <text x="${x}" y="${by-4}" class="hk-bt" text-anchor="middle">${L}</text><text x="${x}" y="${by+11}" class="hk-bn" text-anchor="middle">${N}</text>
      <text id="hk-${it._id}" x="${x}" y="${vy}" class="hk-val" text-anchor="middle">—</text></g>`;
  }

  function svg(sp){
    let s='', id=0;
    sp.rows.forEach((row,ri)=>{
      const w=row.duct?12:5, lp=`M20,${row.y}H${CX0}`, rp=`M${CX1},${row.y}H980`;
      s+=`<path class="pipe" d="${lp}" stroke="${row.cin}" stroke-width="${w}"/><path class="flow" data-flow="hk${ri}" d="${lp}"/>`;
      s+=`<text class="hk-end" x="20" y="${row.y+row.dir*12+(row.dir>0?8:0)}">${esc(row.from)} →</text>`;
      if(row.outlet){
        s+=`<path class="pipe" d="${rp}" stroke="${row.cout}" stroke-width="${w}"/><path class="flow" data-flow="hk${ri}" d="${rp}"/>`;
        s+=`<text class="hk-end" x="980" y="${row.y+row.dir*12+(row.dir>0?8:0)}" text-anchor="end">→ ${esc(row.to)}</text>`;
      }
    });
    s+=sp.center();
    sp.rows.forEach(row=>{
      const lay=(items,xa,xb)=>{let bl=0,il=0; items.forEach((it,k)=>{
        const x=items.length===1?(xa+xb)/2:xa+(xb-xa)*k/(items.length-1); it._id=id++;
        if(INST[it.k]){ s+=bubble(it,x,row.y,row.dir,bl%2); bl++; } else { s+=inline(it,x,row.y,row.dir,il%2); il++; }
      });};
      lay(row.inlet,70,CX0-36); if(row.outlet) lay(row.outlet,CX1+40,row.outlet.length>4?880:840);
    });
    return `<svg viewBox="${sp.vb||'0 0 1000 600'}" role="img" aria-label="${esc(sp.title)}">${s}</svg>`;
  }

  function update(sp){
    const d=sp.calc();
    sp.rows.forEach(row=>[...row.inlet,...(row.outlet||[])].forEach(it=>{
      const el=document.getElementById('hk-'+it._id); if(!el) return;
      if(it.val){ el.textContent=it.val(d); if(it.alarm) el.classList.toggle('hk-alarm',!!it.alarm(d)); }
      if(it.open) el.classList.toggle('closed',!it.open(d));
    }));
    (sp.texts?sp.texts(d):[]).forEach(([k,t])=>{const el=document.getElementById(k); if(el) el.textContent=t;});
    UI.hookSpeed=sp.speed(d);
  }

  UI.hook={spec,svg,update,
    legend:'<span><b>HV</b> isolation valve</span><span><b>STR</b> strainer</span><span><b>NRV</b> check valve</span><span><b>MOV</b> motorised valve</span><span><b>CV / PICV</b> control valve</span><span><b>PT</b> pressure</span><span><b>TT</b> temperature</span><span><b>FT</b> flow</span><span><b>DPT</b> diff. pressure</span><span>Filled valve = closed · amber value = out of range</span>'};
  UI.hookSpeed={};
})();
