let currentResource='electric',currentView='detail',livePending=false,rollingPending=false;
let lastRolling=0,lastGas=0,viewVersion=0;
function numberHTML(value,unit,digits=2){return fmt(value,digits)+' <small>'+unit+'</small>';}
async function loadLive(){
 if(livePending)return;livePending=true;
 try{
  const [wes,envoy]=await Promise.all([fetchWES(),fetchEnvoy()]);
  const production=envoy?.wattsNow ?? null,grid=envoy?.gridActiveW ?? null;
  document.getElementById('n-house').innerHTML=numberHTML(production!==null&&grid!==null?(production+grid)/1000:null,'kW');
  document.getElementById('n-solar').innerHTML=numberHTML(production===null?null:production/1000,'kW');
  document.getElementById('n-grid').innerHTML=numberHTML(grid===null?null:Math.abs(grid)/1000,'kW');
  document.getElementById('n-grid-title').textContent=grid===null?'Échange avec le réseau':grid<0?'Surplus vers le réseau':'Achat au réseau';
  document.getElementById('n-grid-note').textContent=grid===null?'Mesure indisponible':grid<0?'Électricité injectée':'Électricité soutirée';
  document.getElementById('n-flow').textContent=grid===null?'↔':grid<0?'→':'←';
  document.getElementById('n-solar-note').textContent=grid!==null&&grid<0?'Production supérieure à la consommation':'Production instantanée';
  document.getElementById('n-tariff').textContent=wes.ptec ? (/creuse|^hc/i.test(wes.ptec)?'Heures creuses':'Heures pleines'):'Tarif indisponible';
  document.getElementById('n-phases').innerHTML=[1,2,3].map(i=>'<span>Phase '+i+' · '+fmt(wes['iinst'+i])+' A / '+fmt(wes['tension'+i])+' V</span>').join('');
  document.getElementById('n-indexes').innerHTML=[['HP',wes.hpleine],['HC',wes.hcreuse],['Injection',wes.injection]].map(([label,v])=>'<span>'+label+' · '+fmt(v==null?null:v/1000,3)+' kWh</span>').join('')+'<span>Soutirage apparent · '+fmt(wes.pap)+' VA</span>';
  const order=[3,0,2,1],names=['Eau chaude','Arrosage','Piscine','Compteur général'];
  document.getElementById('water-cards').innerHTML=order.map(i=>'<div class="vt-stat"><div class="vt-stat-top">'+names[i]+'</div><div class="vt-number">'+numberHTML(wes.water?.[i]==null?null:wes.water[i]/1000,'m³',3)+'</div><div class="vt-sub">'+fmt(wes.water?.[i])+' litres</div></div>').join('');
  const ok=wes.pap!==null&&wes.pap!==undefined&&production!==null;
  document.getElementById('live-status').textContent=ok?'Compteurs actualisés à '+new Date().toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit'}):'Collecte partiellement indisponible';
  document.querySelector('.vt-dot').classList.toggle('offline',!ok);
 }finally{livePending=false;}
}
const POWER_QUERY='last_over_time(sensor.westic1pap_value{entity_id="westic1pap",friendly_name="Puissance Apparente Instantanée"}[24h])';
const TARIFF_QUERY='last_over_time(sensor.wesheurecreuse_value[24h])';
async function loadRolling(){
 if(rollingPending)return;rollingPending=true;
 try{
  const end=Math.floor(Date.now()/60000)*60,start=end-86400;
  const [power,tariff]=await Promise.all([vmR(POWER_QUERY,new Date((start-86400)*1000).toISOString(),new Date(end*1000).toISOString(),60),vmR(TARIFF_QUERY,new Date((start-86400)*1000).toISOString(),new Date(end*1000).toISOString(),60)]);
  const tariffByTime=new Map(tariff.map(([t,v])=>[+t,+v]));
  const current=power.filter(([t])=>+t>=start),previous=power.filter(([t])=>+t<start);
  const series=(label,points,color,extra={})=>({label,data:points,borderColor:color,borderWidth:1.8,pointRadius:0,pointHitRadius:8,spanGaps:false,...extra});
  const xy=(t,v)=>({x:+t*1000,y:+v/1000});
  // The arrays include gaps explicitly: charts must not bridge absent samples.
  const byTime=new Map(current.map(([t,v])=>[+t,+v]));
  const previousByTime=new Map(previous.map(([t,v])=>[+t,+v]));
  const hp=[],hc=[],unknown=[],prev=[];
  for(let t=start;t<=end;t+=60){
   const value=byTime.has(t)?byTime.get(t)/1000:null,rate=tariffByTime.get(t);
   hp.push({x:t*1000,y:rate===0?value:null});hc.push({x:t*1000,y:rate===1?value:null});unknown.push({x:t*1000,y:rate!==0&&rate!==1?value:null});
   prev.push({x:t*1000,y:previousByTime.has(t-86400)?previousByTime.get(t-86400)/1000:null});
  }
  if(charts['chart-rolling'])charts['chart-rolling'].destroy();
  const datasets=[series('Veille',prev,TC,{borderDash:[5,4],borderWidth:1.2,hidden:!document.getElementById('compare-yesterday').checked}),series('Heures pleines',hp,C.hp),series('Heures creuses',hc,C.hc)];
  if(unknown.some(p=>p.y!==null))datasets.push(series('Tarif indisponible',unknown,C.base));
  charts['chart-rolling']=new Chart(document.getElementById('chart-rolling'),{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',axis:'x',intersect:false},plugins:{legend:{position:'bottom',labels:{color:TC,usePointStyle:true,boxWidth:8,padding:18}},tooltip:{callbacks:{title:items=>new Date(items[0].parsed.x).toLocaleString('fr-FR',{timeZone:HOME_TZ,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),label:c=>c.dataset.label+' : '+fmt(c.parsed.y,2)+' kVA'}}},scales:{x:{type:'linear',min:start*1000,max:end*1000,grid:{display:false},ticks:{color:TC,maxTicksLimit:7,maxRotation:0,callback:t=>new Date(t).toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit'})}},y:{beginAtZero:true,title:{display:true,text:'kVA',color:TC},grid:{color:GC},ticks:{color:TC,maxTicksLimit:6}}}}});
  const time=t=>new Date(t*1000).toLocaleString('fr-FR',{timeZone:HOME_TZ,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  document.getElementById('rolling-range').textContent=time(start)+' → '+time(end)+' · soutirage réseau';
  document.getElementById('rolling-peak').textContent=current.length?'Pic sur 24 h : '+fmt(Math.max(...current.map(p=>+p[1]))/1000,2)+' kVA':'Pas de données disponibles pour cette période';
  document.getElementById('rolling-count').textContent='Pas de 1 minute · valeurs conservées entre changements';
  lastRolling=Date.now();
 }finally{rollingPending=false;}
}
async function loadGas(){
 const end=nowISO(),start=dayISO(shiftDay(localDate(),-29));
 const values=await vmR('sensor.gaz_en_kwh_value{db="home_assistant"}',start,end,300);
 const days=dailyDeltas(values,1),keys=Object.keys(days).sort();
 await loadGasHours();
 document.getElementById('gas-today').innerHTML=numberHTML(days[localDate()]??null,'kWh',1);
 const segments=values.intervals||[],last=segments.at(-1);
 const recent=last&&Date.now()/1000-last.end<=600&&last.end-last.start<=600;
 document.getElementById('gas-power').innerHTML=numberHTML(recent?last.delta*3600/(last.end-last.start):null,'kW',1);
 document.getElementById('gas-note').textContent=recent?'Estimation entre les deux derniers relevés':'Pas assez de relevés récents pour une puissance fiable';
 if(charts['chart-gas'])charts['chart-gas'].destroy();
 charts['chart-gas']=new Chart(document.getElementById('chart-gas'),{type:'bar',data:{labels:keys.map(d=>d.slice(8)+'/'+d.slice(5,7)),datasets:[{label:'Gaz',data:keys.map(d=>days[d]),backgroundColor:C.gas+'bb',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.parsed.y,1)+' kWh'}}},scales:{x:{grid:{display:false},ticks:{color:TC,maxTicksLimit:10}},y:{beginAtZero:true,title:{display:true,text:'kWh',color:TC},grid:{color:GC},ticks:{color:TC}}}}});lastGas=Date.now();
}
async function showView(name){
 currentView=name;history.replaceState(null,'','#'+name);const revision=++viewVersion;
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
 document.querySelectorAll('#electric .pane').forEach(p=>p.classList.toggle('on',p.id==='pane-'+name));
 document.getElementById('view-loading').hidden=false;
 try{await ({now:loadNow,detail:loadDetail,rolling:loadRolling,today:loadToday,day:loadDay,month:loadMonth,history:loadHistory})[name]();}
 catch(e){reportRequest('vue-'+name,true);console.error('Échec du chargement de la vue',name);}
 finally{if(revision===viewVersion)document.getElementById('view-loading').hidden=true;}
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.querySelectorAll('[data-resource]').forEach(b=>b.addEventListener('click',()=>{
 currentResource=b.dataset.resource;
 document.querySelectorAll('[data-resource]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));
 document.querySelectorAll('[role=tabpanel]').forEach(p=>p.hidden=p.id!==currentResource);
 if(currentResource==='electric'){Object.values(charts).forEach(c=>c.resize());showView(currentView);}
 if(currentResource==='gas')loadGas().catch(()=>reportRequest('gaz',true));
 if(currentResource==='water'){loadLive();loadWater().catch(()=>reportRequest('eau',true));}
}));
document.getElementById('compare-yesterday').addEventListener('change',e=>{const c=charts['chart-rolling'];if(c){c.setDatasetVisibility(0,e.target.checked);c.update();}});
function tick(){
 if(document.hidden)return;
 loadLive();
 if(currentResource==='electric'&&currentView==='rolling'&&Date.now()-lastRolling>60000)loadRolling().catch(()=>reportRequest('courbe',true));
 if(currentResource==='electric'&&['today','day'].includes(currentView)&&(currentView==='today'||curDay===localDate())&&Date.now()-(dayBarsState[currentView].last||0)>60000)loadDayBars(currentView,currentView==='today'?localDate():curDay);
 if(currentResource==='electric'&&currentView==='now'&&Date.now()-lastNow>25000)loadNow().catch(()=>reportRequest('now',true));
 if(currentResource==='electric'&&currentView==='detail'&&detailDay===localDate()&&Date.now()-lastDetail>60000)loadDetail().catch(()=>reportRequest('detail',true));
 if(currentResource==='water'&&Date.now()-lastWater>60000)loadWater().catch(()=>reportRequest('eau',true));
 if(currentResource==='gas'&&Date.now()-lastGas>60000)loadGas().catch(()=>reportRequest('gaz',true));
}
setInterval(tick,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
loadLive();
// Initial detailed view starts after its configuration is initialized.

const WATER_METERS=[{id:4,name:'Compteur général',short:'Général',color:C.hc},{id:1,name:'Eau chaude',short:'Eau chaude',color:C.hp},{id:3,name:'Piscine',short:'Piscine',color:C.inj},{id:2,name:'Arrosage',short:'Arrosage',color:C.sol}];
let waterPending=false,lastWater=0,waterPeriod=7,waterSelected=localDate(),waterDaily={},waterToday=localDate();
// State counters are held between changes, but a missing boundary or reset is unknown.
function waterDailyUse(values,firstDay,lastDay,endTime){
 const points=values.filter(([t,v])=>Number.isFinite(+t)&&Number.isFinite(+v)).map(([t,v])=>[+t,+v]).sort((a,b)=>a[0]-b[0]);
 const result={};let idx=0;
 for(let day=firstDay;day<=lastDay;day=shiftDay(day,1)){
  const start=localMidnight(day)/1000,end=Math.min(localMidnight(shiftDay(day,1))/1000,endTime);
  if(end<=start){result[day]=null;continue;}
  while(idx+1<points.length&&points[idx+1][0]<=start)idx++;
  const baseline=points[idx];
  if(!baseline||baseline[0]>start||start-baseline[0]>300){result[day]=null;continue;}
  let j=idx,reset=false;
  while(j+1<points.length&&points[j+1][0]<=end){if(points[j+1][1]<points[j][1])reset=true;j++;}
  const last=points[j];
  result[day]=!reset&&last[0]>start&&end-last[0]<=300?last[1]-baseline[1]:null;
 }
 return result;
}
async function readWaterMeter(meter,firstDay,end){
 const query=`last_over_time(sensor.wesimpulsion${meter.id}_value{db="home_assistant",entity_id="wesimpulsion${meter.id}",unit_of_measurement="L"}[30d])`;
 const start=dayISO(firstDay);
 const [range,tail]=await Promise.all([getJSON('/vm/api/v1/query_range?'+new URLSearchParams({query,start,end,step:'300'})),getJSON('/vm/api/v1/query?'+new URLSearchParams({query,time:end}))]);
 const results=range.data.result||[];
 // A renamed sensor retains the same meter: take newer label series on overlaps.
 const ordered=results.filter(s=>s.values?.length).sort((a,b)=>a.values[0][0]-b.values[0][0]);
 const merged=new Map();for(const s of ordered)for(const [t,v]of s.values)merged.set(+t,+v);
 for(const s of tail.data.result||[])merged.set(+s.value[0],+s.value[1]);
 return [...merged].sort((a,b)=>a[0]-b[0]);
}
async function loadWater(){
 if(waterPending)return;waterPending=true;document.getElementById('water-loading').hidden=false;
 try{
  const today=localDate(),first=shiftDay(today,-29),end=nowISO();
  if(waterSelected===waterToday)waterSelected=today;waterToday=today;
  const result=await Promise.allSettled(WATER_METERS.map(m=>readWaterMeter(m,shiftDay(first,-1),end)));
  waterHourEnd=Date.parse(end)/1000;
  WATER_METERS.forEach((m,i)=>{waterHourPoints[m.id]=result[i].status==='fulfilled'?result[i].value:[];});
  WATER_METERS.forEach((m,i)=>{waterDaily[m.id]=result[i].status==='fulfilled'?waterDailyUse(result[i].value,first,today,Date.parse(end)/1000):{};});
  const picker=document.getElementById('water-day');picker.min=first;picker.max=today;picker.value=waterSelected;
  renderWater();lastWater=Date.now();
 }finally{waterPending=false;document.getElementById('water-loading').hidden=true;}
}
function renderWaterCards(){
 renderWaterHours();
 const today=localDate();
 const dayName=new Date(waterSelected+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:HOME_TZ,weekday:'long',day:'numeric',month:'long'});
 document.getElementById('water-day-caption').textContent=dayName+(waterSelected===today?' · journée en cours':' · journée complète');
 document.getElementById('water-daily-cards').innerHTML=WATER_METERS.map(m=>{
  const value=waterDaily[m.id]?.[waterSelected];
  return '<div class="vt-stat"><div class="vt-stat-top">'+m.name+'</div><div class="vt-number">'+numberHTML(value,'L',1)+'</div><div class="vt-sub">'+(value==null?'Données insuffisantes':fmt(value/1000,3)+' m³'+(waterSelected===today?' · depuis minuit':''))+'</div></div>';
 }).join('');
}
function renderWater(){
 renderWaterCards();
 const today=localDate(),days=Array.from({length:waterPeriod},(_,i)=>shiftDay(today,i-waterPeriod+1));
 const existing=charts['chart-water'];
 const hidden=WATER_METERS.map((m,i)=>existing?!existing.isDatasetVisible(i):i!==0);
 if(existing)existing.destroy();
 charts['chart-water']=new Chart(document.getElementById('chart-water'),{type:'bar',data:{labels:days.map(d=>d.slice(8)+'/'+d.slice(5,7)),datasets:WATER_METERS.map((m,i)=>({label:m.short,data:days.map(d=>waterDaily[m.id]?.[d]??null),backgroundColor:m.color+'cc',borderRadius:4,maxBarThickness:36,hidden:hidden[i]}))},options:{responsive:true,maintainAspectRatio:false,animation:false,onClick:(event,elements)=>{if(elements.length){waterSelected=days[elements[0].index];document.getElementById('water-day').value=waterSelected;renderWaterCards();}},plugins:{legend:{position:'bottom',labels:{color:TC,usePointStyle:true,padding:16,boxWidth:8}},tooltip:{callbacks:{title:items=>days[items[0].dataIndex]+(days[items[0].dataIndex]===today?' · partiel':''),label:c=>c.dataset.label+' : '+fmt(c.parsed.y,1)+' L'}}},scales:{x:{grid:{display:false},ticks:{color:TC,maxTicksLimit:15,maxRotation:0}},y:{beginAtZero:true,title:{display:true,text:'Litres',color:TC},grid:{color:GC},ticks:{color:TC}}}}});
 document.getElementById('water-day-rows').innerHTML=[...days].reverse().map(day=>'<tr><th scope="row"><button type="button" data-water-day="'+day+'">'+day.slice(8)+'/'+day.slice(5,7)+(day===today?' · en cours':'')+'</button></th>'+WATER_METERS.map(m=>'<td>'+fmt(waterDaily[m.id]?.[day],1)+'</td>').join('')+'</tr>').join('');
 document.querySelectorAll('[data-water-period]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.waterPeriod===waterPeriod)));
}
document.getElementById('water-day').addEventListener('change',e=>{if(e.target.value>=e.target.min&&e.target.value<=e.target.max){waterSelected=e.target.value;renderWaterCards();}});
document.querySelectorAll('[data-water-period]').forEach(b=>b.addEventListener('click',()=>{waterPeriod=+b.dataset.waterPeriod;renderWater();}));
document.getElementById('water-day-rows').addEventListener('click',e=>{const b=e.target.closest('[data-water-day]');if(b){waterSelected=b.dataset.waterDay;document.getElementById('water-day').value=waterSelected;renderWaterCards();}});
