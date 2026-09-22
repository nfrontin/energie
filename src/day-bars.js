const dayBarsState={today:{step:3600,revision:0},day:{step:3600,revision:0}};
async function loadToday(){return loadDayBars('today',localDate());}
async function loadDay(){return loadDayBars('day',curDay);}
async function loadDayBars(view,day){
 const state=dayBarsState[view],revision=++state.revision,step=state.step,id='chart-'+view,prefix=view==='today'?'t':'d',start=localMidnight(day)/1000,end=Math.min(Date.now()/1000,localMidnight(shiftDay(day,1))/1000);
 if(view==='day'){document.getElementById('d-label').textContent=dayLabel(day);dPicker.value=day;document.getElementById('d-next').disabled=day>=localDate();}
 const note=document.getElementById(view+'-bar-note');note.textContent='Chargement des relevés…';
 document.querySelectorAll('[data-bar-view="'+view+'"]').forEach(b=>{b.setAttribute('aria-pressed',String(+b.dataset.barStep===step));b.disabled=day<'2026-04-22';});
 document.getElementById(view+'-bar-compare').disabled=day<'2026-04-22';
 try{
 if(day<'2026-04-22'){
  await legacyLoadDay();if(revision!==state.revision)return;const chart=charts[id];if(chart){chart.data.datasets.forEach(d=>{d.data=d.data.map(v=>v===null?null:v/1000);d._unit='kW';d.spanGaps=false;});chart.options.plugins.legend={display:true,position:'bottom',labels:{color:TC,usePointStyle:true,boxWidth:8,padding:18}};chart.options.scales.y.ticks.callback=v=>fmt(v,1);chart.options.scales.y.title={display:true,text:'kW',color:TC};chart.update();}note.textContent='Archives · puissance estimée à partir des relevés disponibles. Le niveau de détail dépend de l’historique.';return;
 }
 const ids=[...new Set(energySourceConfig.map(s=>s.id))],names=ids.map(id=>'sensor\\.'+id+'_value').join('|'),query='last_over_time({db="home_assistant",__name__=~"'+names.replaceAll('\\','\\\\')+'"}[30d])';
 const [range,tail]=await Promise.all([getJSON('/vm/api/v1/query_range?'+new URLSearchParams({query,start:String(localMidnight(shiftDay(day,-1))/1000),end:String(end),step:'300'})),getJSON('/vm/api/v1/query?'+new URLSearchParams({query,time:String(end)}))]);if(revision!==state.revision)return;
 const data=new Map();for(const s of range.data.result||[]){if(!data.has(s.metric.entity_id))data.set(s.metric.entity_id,{unit:s.metric.unit_of_measurement,points:new Map()});for(const [t,v]of s.values)data.get(s.metric.entity_id).points.set(+t,+v);}for(const s of tail.data.result||[]){data.get(s.metric.entity_id)?.points.set(+s.value[0],+s.value[1]);}
 const read=(id,d,bucket)=>{const s=data.get(id);return detailBuckets(s?[...s.points]:[],d,end,s?.unit,bucket);};
 const make=(d,bucket)=>{const count=Math.round((localMidnight(shiftDay(d,1))-localMidnight(d))/1000/bucket);const group=filter=>{const a=energySourceConfig.filter(filter).map(s=>read(s.id,d,bucket));return Array.from({length:count},(_,i)=>localMidnight(d)/1000+i*bucket>=end?null:a.some(v=>v[i]===null)?null:a.reduce((n,v)=>n+v[i],0));};const hp=group(s=>s.kind==='import'&&s.id!=='westic1hc'),hc=group(s=>s.kind==='import'&&s.id==='westic1hc'),solar=group(s=>s.kind==='solar'),inj=group(s=>s.kind==='export');return {hp,hc,solar,inj,...detailDerived(hp,hc,solar,inj)};};
 const current=make(day,step),prevDay=shiftDay(day,-1),previous=make(prevDay,step),hourly=step===3600?current:make(day,3600),expected=Math.ceil((end-start)/3600);
 for(const [suffix,key]of [['hp','hp'],['hc','hc'],['tot','imported'],['inj','inj']])document.getElementById(prefix+'-'+suffix).innerHTML=numberHTML(detailTotalComplete(hourly[key],expected),'kWh',2);
 const timeLabel=t=>new Date(t*1000).toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit'}),labels=current.hp.map((_,i)=>timeLabel(start+i*step)),prevStart=localMidnight(prevDay)/1000;
 const value=(v,i,d)=>{if(v===null)return null;if(step===3600)return v;const length=Math.min(step,end-(localMidnight(d)/1000+i*step));return length>0?v*3600/length:null;};
 const previousByClock=new Map(previous.house.map((v,i)=>[timeLabel(prevStart+i*step),value(v,i,prevDay)]));
 const bars=(label,array,color)=>({label,data:array.map((v,i)=>value(v,i,day)),backgroundColor:color+'dc',borderColor:color,borderWidth:0,borderRadius:step===3600?4:1,borderSkipped:'middle',barPercentage:.94,categoryPercentage:step===3600?.84:1,stack:'energy',maxBarThickness:34});
 const hpLabel=energySourceConfig.filter(s=>s.kind==='import'&&s.id!=='westic1hc').map(s=>s.name).join(' + ')||'Réseau';
 const sets=[bars('Heures creuses',current.hc,C.hc),bars(hpLabel,current.hp,C.hp),bars('Solaire consommé',current.self,C.sol),bars('Injection',current.inj.map(v=>v===null?null:-v),C.inj),{type:'line',label:'Maison · veille',data:labels.map(l=>previousByClock.get(l)??null),borderColor:TC,borderDash:[5,4],borderWidth:1.5,pointRadius:0,spanGaps:false,stack:'comparison',hidden:!document.getElementById(view+'-bar-compare').checked}];
 charts[id]?.destroy();const unit=step===3600?'kWh':'kW';
 charts[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:sets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{color:TC,usePointStyle:true,boxWidth:8,padding:18}},tooltip:{callbacks:{title:items=>{const i=items[0].dataIndex,a=start+i*step;return timeLabel(a)+' – '+timeLabel(a>=end?a+step:Math.min(a+step,end));},label:c=>c.dataset.label+' : '+fmt(c.parsed.y,2)+' '+unit}}},scales:{x:{stacked:true,grid:{display:false},ticks:{color:TC,maxTicksLimit:12,maxRotation:0}},y:{stacked:true,beginAtZero:true,title:{display:true,text:unit,color:TC},grid:{color:c=>c.tick.value===0?TC:GC,lineWidth:c=>c.tick.value===0?1.3:1},ticks:{color:TC,maxTicksLimit:7}}}}});
 state.last=Date.now();reportRequest('barres-'+view,false);
 note.textContent=(step===3600?'Consommation par heure en kWh.':'Puissance moyenne sur 5 minutes en kW.')+' Barres positives : électricité consommée par la maison ; négatives : surplus injecté. '+(day===localDate()?'Journée et dernière barre en cours. ':'')+'Pointillés : veille complète. Cliquez sur une légende pour masquer une série.';
 }catch(e){if(revision===state.revision){note.textContent='Relevés indisponibles pour cette journée.';charts[id]?.destroy();delete charts[id];}reportRequest('barres-'+view,true);}
}
for(const view of ['today','day']){
 document.querySelectorAll('[data-bar-view="'+view+'"]').forEach(b=>b.addEventListener('click',()=>{dayBarsState[view].step=+b.dataset.barStep;view==='today'?loadToday():loadDay();}));
 document.getElementById(view+'-bar-compare').addEventListener('change',e=>{const c=charts['chart-'+view];if(c){c.setDatasetVisibility(c.data.datasets.length-1,e.target.checked);c.update();}});
}
