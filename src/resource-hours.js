// Attribute counter increments to their observation interval. Gaps and resets stay unknown.
function resourceHourBuckets(intervals,day,end){
 const start=localMidnight(day)/1000,next=localMidnight(shiftDay(day,1))/1000;
 return Array.from({length:Math.round((next-start)/3600)},(_,i)=>{
  const a=start+i*3600,b=Math.min(a+3600,end);if(b<=a)return null;
  let value=0,covered=0;
  for(const s of intervals){const duration=s.end-s.start,overlap=Math.max(0,Math.min(b,s.end)-Math.max(a,s.start));
   if(overlap&&duration>0&&duration<=600&&Number.isFinite(s.delta)&&s.delta>=0){value+=s.delta*overlap/duration;covered+=overlap;}
  }
  return covered>=b-a-1?value:null;
 });
}
function resourceIntervals(points){return points.slice(1).map(([t,v],i)=>({start:+points[i][0],end:+t,delta:+v-Number(points[i][1])}));}
function renderResourceHours(kind,day,values,label,unit,color,previous=[]){
 if(kind==='gas'&&typeof renderGasCost==='function')renderGasCost(day,values);
 const start=localMidnight(day),labels=values.map((_,i)=>new Date(start+i*3600000).toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}));
 const prevDay=shiftDay(day,-1),prevStart=localMidnight(prevDay),clock=t=>new Date(t).toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit'}),byClock=new Map(previous.map((v,i)=>[clock(prevStart+i*3600000),v]));
 const id='chart-'+kind+'-hours';charts[id]?.destroy();
 charts[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:[{label,data:values,backgroundColor:color+'dc',borderColor:color,borderWidth:0,borderRadius:4,maxBarThickness:34,barPercentage:.94,categoryPercentage:.84},{type:'line',label:label+' · veille',data:values.map((_,i)=>byClock.get(clock(start+i*3600000))??null),borderColor:TC,borderDash:[5,4],borderWidth:1.5,pointRadius:0,spanGaps:false,hidden:!document.getElementById(kind+'-hours-compare').checked}]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{color:TC,usePointStyle:true,boxWidth:8,padding:18}},tooltip:{callbacks:{title:items=>labels[items[0].dataIndex]+' · tranche d’une heure',label:c=>c.dataset.label+' : '+fmt(c.parsed.y,2)+' '+unit}}},scales:{x:{grid:{display:false},ticks:{color:TC,maxRotation:0,maxTicksLimit:12,callback:(v,i)=>labels[i].split(' ')[0]}},y:{beginAtZero:true,title:{display:true,text:unit,color:TC},grid:{color:GC},ticks:{color:TC}}}}});
 document.getElementById(kind+'-hours-caption').textContent=new Date(day+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:HOME_TZ,dateStyle:'long'})+' · '+label+' · '+unit+' par heure';
 const elapsed=Math.max(0,Math.min(values.length,Math.ceil((Date.now()-start)/3600000))),missing=values.slice(0,elapsed).filter(v=>v===null).length;
 const known=values.slice(0,elapsed).filter(v=>v!==null),peak=known.length?Math.max(...known):null,peakIndex=peak===null||peak===0?-1:values.indexOf(peak);
 document.getElementById(kind+'-hours-summary').textContent='Total '+(missing?'connu ':'')+': '+fmt(known.length?known.reduce((a,b)=>a+b,0):null,2)+' '+unit+' · Heure de pointe : '+(peakIndex>=0?labels[peakIndex].split(' ')[0]+' ('+fmt(peak,2)+' '+unit+')':'—');
 document.getElementById(kind+'-hours-note').textContent=(day===localDate()?'Heure en cours partielle. ':'')+'Répartition entre les relevés, à 5 minutes près.'+(missing?' '+missing+' tranche(s) sans relevés suffisants : aucune consommation n’est inventée.':'');
}
let waterHourPoints={},waterHourEnd=0,gasHourDay=localDate(),gasHourToday=localDate(),gasHourRevision=0;
function renderWaterHours(){
 const meter=WATER_METERS.find(m=>String(m.id)===document.getElementById('water-hour-meter').value)||WATER_METERS[0];
 renderResourceHours('water',waterSelected,resourceHourBuckets(resourceIntervals(waterHourPoints[meter.id]||[]),waterSelected,waterHourEnd),meter.name,'L',meter.color,resourceHourBuckets(resourceIntervals(waterHourPoints[meter.id]||[]),shiftDay(waterSelected,-1),waterHourEnd));
}
async function loadGasHours(){
 const today=localDate();if(gasHourDay===gasHourToday)gasHourDay=today;gasHourToday=today;
 const picker=document.getElementById('gas-day');picker.max=today;picker.min=shiftDay(today,-29);picker.value=gasHourDay;
 const day=gasHourDay,revision=++gasHourRevision,end=Math.min(Date.now()/1000,localMidnight(shiftDay(day,1))/1000);
 document.getElementById('gas-hours-caption').textContent='Chargement des relevés…';
 if(typeof renderGasCost==='function')renderGasCost(day,[]);
 try{
 const points=await vmR('last_over_time(sensor.gaz_en_kwh_value{db="home_assistant"}[30d])',dayISO(shiftDay(day,-1)),new Date(end*1000).toISOString(),300);
 if(revision!==gasHourRevision)return;
 renderResourceHours('gas',day,resourceHourBuckets(points.intervals||[],day,end),'Gaz','kWh',C.gas,resourceHourBuckets(points.intervals||[],shiftDay(day,-1),end));
 }catch(e){if(revision===gasHourRevision){charts['chart-gas-hours']?.destroy();delete charts['chart-gas-hours'];document.getElementById('gas-hours-caption').textContent='Relevés indisponibles pour cette journée.';}throw e;}
}
document.getElementById('water-hour-meter').addEventListener('change',renderWaterHours);
document.getElementById('gas-day').addEventListener('change',e=>{if(e.target.value>=e.target.min&&e.target.value<=e.target.max){gasHourDay=e.target.value;loadGasHours().catch(()=>reportRequest('gaz-horaires',true));}});

for(const kind of ['water','gas'])document.getElementById(kind+'-hours-compare').addEventListener('change',e=>{const chart=charts['chart-'+kind+'-hours'];if(chart){chart.setDatasetVisibility(1,e.target.checked);chart.update();}});
