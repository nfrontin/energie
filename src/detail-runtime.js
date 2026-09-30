let detailDay=localDate(),detailRevision=0,lastDetail=0,detailRows=[];
const detailPalette=energyPalette();
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Work on adjacent counter readings before grouping, so resets never produce negative energy.
function detailBuckets(points,day,end,unit='kWh',bucketSeconds=3600){
 const start=localMidnight(day)/1000,stop=Math.min(localMidnight(shiftDay(day,1))/1000,end),n=Math.round((localMidnight(shiftDay(day,1))-localMidnight(day))/(bucketSeconds*1000));
 const bins=Array(n).fill(null),scale=unit==='Wh'?1000:1;
 if(!['Wh','kWh'].includes(unit))return bins;
 const p=points.filter(p=>Number.isFinite(+p[0])&&Number.isFinite(+p[1])).map(p=>p.map(Number)).sort((a,b)=>a[0]-b[0]);
 for(let h=0;h<n;h++){
  const a=start+h*bucketSeconds,b=Math.min(a+bucketSeconds,stop);if(b<=a)continue;
  let i=p.findIndex(v=>v[0]>=a);if(i<0)continue;if(p[i][0]>a)i--;
  if(i<0||a-p[i][0]>300)continue;
  let total=0,valid=true,t=p[i][0];
  while(i+1<p.length&&p[i+1][0]<=b){const [nt,nv]=p[i+1];const delta=nv-p[i][1];if(nt-t>600)valid=false;total+=(delta>=-1e-8?Math.max(0,delta):Math.max(0,nv))/scale;t=nt;i++;}
  if(valid&&t>a&&b-t<=300)bins[h]=total;
 }
 return bins;
}
function detailSum(a){const known=a.filter(x=>x!==null&&Number.isFinite(x));return known.length?known.reduce((s,v)=>s+v,0):null;}
function detailCombine(a,b,fn){return a.map((v,i)=>v===null||b[i]==null?null:fn(v,b[i]));}
function detailDerived(hp,hc,solar,inj){
 const imported=detailCombine(hp,hc,(a,b)=>a+b);
 const self=detailCombine(solar,inj,(a,b)=>a-b<-.02?null:Math.max(0,a-b));
 return {imported,self,house:detailCombine(imported,self,(a,b)=>a+b)};
}
function detailTotalComplete(a,expected){return a.slice(0,expected).every(v=>v!==null)?detailSum(a):null;}
async function loadDetail(){
 clearDailyFlow();
 const revision=++detailRevision,day=detailDay,prev=shiftDay(day,-1),end=Math.min(Date.now()/1000,localMidnight(shiftDay(day,1))/1000),start=localMidnight(prev)/1000;
 document.getElementById('detail-date').max=localDate();document.getElementById('detail-date').value=day;document.getElementById('detail-next').disabled=day>=localDate();
 document.getElementById('detail-caption').textContent='Chargement du '+new Date(day+'T12:00:00Z').toLocaleDateString('fr-FR',{dateStyle:'long'})+'…';
 const ids=[...new Set([...energySourceConfig.map(s=>s.id),...DETAIL_DEVICES.map(d=>d.id)])];
 const names=ids.map(id=>'sensor\\.'+id+'_value').join('|');
 const query='last_over_time({db="home_assistant",__name__=~"'+names.replaceAll('\\','\\\\')+'"}[30d])';
 try{
 const [range,tail]=await Promise.all([getJSON('/vm/api/v1/query_range?'+new URLSearchParams({query,start:String(start),end:String(end),step:'300'})),getJSON('/vm/api/v1/query?'+new URLSearchParams({query,time:String(end)}))]);
 if(revision!==detailRevision)return;
 const data=new Map();
 for(const s of range.data.result||[]){const id=s.metric.entity_id;if(!data.has(id))data.set(id,{points:new Map(),unit:s.metric.unit_of_measurement});for(const p of s.values)data.get(id).points.set(+p[0],+p[1]);}
 for(const s of tail.data.result||[]){const id=s.metric.entity_id;if(data.has(id))data.get(id).points.set(+s.value[0],+s.value[1]);}
 const read=(id,d)=>{const s=data.get(id);return detailBuckets(s?[...s.points]:[],d,end,s?.unit);};
 const sumSources=(sources,d)=>{const arrays=sources.map(s=>read(s.id,d));const count=Math.round((localMidnight(shiftDay(d,1))-localMidnight(d))/3600000);if(!arrays.length)return Array.from({length:count},(_,i)=>localMidnight(d)/1000+i*3600<end?0:null);return arrays[0].map((_,i)=>arrays.some(a=>a[i]===null)?null:arrays.reduce((v,a)=>v+a[i],0));};
 const make=d=>{const imports=energySourceConfig.filter(s=>s.kind==='import'),hp=sumSources(imports.filter(s=>s.id!=='westic1hc'),d),hc=sumSources(imports.filter(s=>s.id==='westic1hc'),d),solar=sumSources(energySourceConfig.filter(s=>s.kind==='solar'),d),inj=sumSources(energySourceConfig.filter(s=>s.kind==='export'),d);return {hp,hc,solar,inj,...detailDerived(hp,hc,solar,inj)};};
 const current=make(day),previous=make(prev),expected=Math.ceil((end-localMidnight(day)/1000)/3600),total=a=>detailTotalComplete(a,expected);
 const totals=Object.fromEntries(Object.entries(current).map(([k,a])=>[k,total(a)]));
 detailRows=DETAIL_DEVICES.map(d=>({...d,values:read(d.id,day),previousValues:read(d.id,prev)})).map(d=>({...d,total:total(d.values),previous:detailTotalComplete(d.previousValues,d.previousValues.length)})).sort((a,b)=>(b.total??-1)-(a.total??-1));
 const costs=energySourceConfig.filter(s=>s.kind!=='solar').map(source=>({source,kwh:total(read(source.id,day)),cost:sourceCost(source,read(source.id,day),day,end)}));
 renderDetail(current,previous,totals,day,prev,end,costs);renderDailyFlow();reportRequest('detail',false);reportRequest('vue-detail',false);lastDetail=Date.now();
 }catch(e){if(revision===detailRevision){document.getElementById('daily-flow-diagram').textContent='Données indisponibles pour cette journée.';document.getElementById('detail-caption').textContent='Relevés indisponibles pour cette journée. Réessayez en sélectionnant la date.';document.getElementById('detail-kpis').textContent='Données indisponibles';for(const id of ['chart-detail','chart-detail-solar','chart-detail-devices']){charts[id]?.destroy();delete charts[id];}for(const id of ['detail-flows','detail-ratios','detail-totals','detail-device-rows'])document.getElementById(id).textContent='—';}throw e;}
}
function detailChart(id,labels,datasets){
 charts[id]?.destroy();
 charts[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{color:TC,usePointStyle:true,boxWidth:8,padding:14}},tooltip:{callbacks:{label:c=>c.dataset.label+' : '+fmt(c.parsed.y,3)+' kWh'}}},scales:{x:{stacked:true,grid:{display:false},ticks:{color:TC,maxTicksLimit:12,maxRotation:0}},y:{stacked:true,beginAtZero:true,title:{display:true,text:'kWh',color:TC},grid:{color:GC},ticks:{color:TC}}}}});
}
function renderDetail(a,p,t,day,prev,end,costs){
 dailyFlowTotals=t;
 const partial=day===localDate();
 document.getElementById('detail-caption').textContent=new Date(day+'T12:00:00Z').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+(partial?' · en cours, jusqu’à '+new Date(end*1000).toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit'}):' · journée complète');
 const cost=costs.length&&costs.every(c=>c.cost!==null)?costs.reduce((sum,c)=>sum+c.cost,0):null;
 const subscription=electricitySubscription(day),withSubscription=cost!==null&&subscription!==null?cost+subscription:null;
 const hpLabel=energySourceConfig.filter(s=>s.kind==='import'&&s.id!=='westic1hc').map(s=>s.name).join(' + ')||'Réseau';
 document.getElementById('detail-kpis').innerHTML=[['Maison',t.house,'kWh','Électricité consommée'],['Solaire',t.solar,'kWh','Production de la journée'],['Réseau acheté',t.imported,'kWh','Tous les compteurs d’achat'],['Coût net estimé',cost,'€','Achats − injection · hors abonnement']].map(([label,v,unit,note])=>'<div class="vt-stat"><div class="vt-stat-top">'+label+'</div><div class="vt-number">'+numberHTML(v,unit,2)+'</div><div class="vt-sub">'+note+'</div></div>').join('');
 const labels=a.hp.map((_,i)=>new Date(localMidnight(day)+i*3600000).toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit'}));
 // Align comparisons by local hour; DST days can contain 23 or 25 hours.
 const aligned=values=>labels.map(label=>{const idx=p.hp.findIndex((_,i)=>new Date(localMidnight(prev)+i*3600000).toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit'})===label);return idx<0?null:values[idx];});
 const bar=(label,data,color)=>({label,data,backgroundColor:color+'bb',borderRadius:3,maxBarThickness:30,stack:'energy'});
 const line=(label,data)=>({type:'line',label,data,borderColor:TC,borderDash:[4,4],borderWidth:1.6,pointRadius:0,spanGaps:false,stack:'comparison',hidden:!document.getElementById('detail-compare').checked});
 detailChart('chart-detail',labels,[bar('Heures creuses',a.hc,C.hc),bar(hpLabel,a.hp,C.hp),bar('Solaire consommé',a.self,C.sol),bar('Injection',a.inj.map(v=>v===null?null:-v),C.inj),line('Maison · veille',aligned(p.house))]);
 document.getElementById('detail-comparison').textContent='Veille : '+new Date(prev+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'long'})+' · journée complète'+(partial?' ; aujourd’hui est encore partiel.':'.');
 detailChart('chart-detail-solar',labels,[bar('Production',a.solar,C.sol),line('Production · veille',aligned(p.solar))]);
 document.getElementById('detail-flows').innerHTML=[['solar','Solaire → maison',t.self],['','Réseau → maison',t.imported],['export','Solaire → réseau',t.inj]].map(([cls,label,v])=>'<div class="detail-flow-row '+cls+'"><span>'+label+'</span><strong>'+fmt(v,2)+' <small>kWh</small></strong></div>').join('');
 document.getElementById('detail-ratios').innerHTML=[['Solaire autoconsommé',t.self,t.solar],['Autonomie de la maison',t.self,t.house]].map(([label,n,d])=>{const v=n!==null&&d>0?Math.min(100,100*n/d):null;return '<div class="detail-ratio"><div><span>'+label+'</span><strong>'+fmt(v,0)+' %</strong></div><div class="detail-bar"><span style="width:'+(v??0)+'%"></span></div></div>';}).join('');
 document.getElementById('detail-totals').innerHTML=[...costs.map(c=>[c.source.name,c.kwh,c.cost]),['Production solaire',t.solar,null],['Solaire consommé',t.self,null],['Bilan net réseau',t.imported!==null&&t.inj!==null?t.imported-t.inj:null,cost],['Abonnement TTC · journée',null,subscription],['Total net avec abonnement',null,withSubscription]].map(([n,v,c])=>'<tr><th scope="row">'+escapeHTML(n)+'</th><td>'+fmt(v,2)+'</td><td>'+fmt(c,2)+(c===null?'':' €')+'</td></tr>').join('');
 const first=tariffHistory.length?Date.parse(tariffHistory[0].observedAt)/1000:Infinity;
 document.getElementById('detail-prices').textContent='Tarifs synchronisés : '+energySourceConfig.filter(s=>s.kind!=='solar').map(s=>s.name+' '+(s.price===null?'non renseigné':fmt(s.price,4)+' €/kWh')).join(' · ')+'. Abonnement journalier au prorata des jours du mois, journée entière même en cours ; disponible à partir du 30/09/2026. '+(localMidnight(day)/1000<first?'Tarifs historiques inconnus avant le '+(Number.isFinite(first)?new Date(first*1000).toLocaleDateString('fr-FR'):'début du suivi')+' : premier tarif connu appliqué.':'Changements de tarifs pris en compte depuis leur observation.');
 const top=detailRows.filter(d=>d.total!==null).slice(0,6),rest=detailRows.filter(d=>d.total!==null).slice(6);
 const sets=top.map((d,i)=>bar(d.name,d.values,detailPalette[i]));if(rest.length)sets.push(bar('Autres appareils suivis',labels.map((_,h)=>{const vals=rest.map(d=>d.values[h]);return vals.some(v=>v===null)?null:vals.reduce((s,v)=>s+v,0);}),detailPalette[6]));
 detailChart('chart-detail-devices',labels,sets);renderDetailDevices();
}
function renderDetailDevices(){
 const search=document.getElementById('detail-search').value.toLocaleLowerCase('fr'),known=detailRows.filter(d=>d.total!==null),sum=known.reduce((s,d)=>s+d.total,0);
 document.getElementById('detail-device-caption').textContent=known.length+' / '+DETAIL_DEVICES.length+' appareils avec un relevé exploitable · comparaison à la veille complète';
 const rows=detailRows.filter(d=>d.name.toLocaleLowerCase('fr').includes(search));
 document.getElementById('detail-device-rows').innerHTML=rows.map(d=>{const delta=d.total!==null&&d.previous!==null?d.total-d.previous:null,share=d.total!==null&&sum>0?100*d.total/sum:null;return '<tr><th scope="row">'+escapeHTML(d.name)+'</th><td>'+fmt(d.total,3)+' kWh</td><td>'+fmt(d.previous,3)+' kWh</td><td>'+(delta>0?'+':'')+fmt(delta,3)+' kWh</td><td>'+fmt(share,1)+' %<div class="detail-bar"><span style="width:'+(share??0)+'%"></span></div></td></tr>';}).join('')||'<tr><td colspan="5">Aucun appareil trouvé.</td></tr>';
}
function changeDetailDay(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day>localDate())return;detailDay=day;showView('detail');}
document.getElementById('detail-date').addEventListener('change',e=>changeDetailDay(e.target.value));
document.getElementById('detail-prev').addEventListener('click',()=>changeDetailDay(shiftDay(detailDay,-1)));
document.getElementById('detail-next').addEventListener('click',()=>changeDetailDay(shiftDay(detailDay,1)));
document.getElementById('detail-today').addEventListener('click',()=>changeDetailDay(localDate()));
document.getElementById('detail-search').addEventListener('input',renderDetailDevices);
document.getElementById('detail-compare').addEventListener('change',e=>{for(const id of ['chart-detail','chart-detail-solar']){const c=charts[id];if(c){c.setDatasetVisibility(c.data.datasets.length-1,e.target.checked);c.update();}}});
// The initial view is opened after all views are initialized.
