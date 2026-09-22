let dailyFlowReady=false;
function clearDailyFlow(){dailyFlowReady=false;document.getElementById('daily-flow-diagram').innerHTML='<p class="vt-caption">Chargement de la journée…</p>';document.getElementById('daily-flow-caption').textContent='Consommation des appareils suivis · kWh';for(const id of ['daily-flow-total','daily-flow-count','daily-flow-leader'])document.getElementById(id).textContent='—';}
function renderDailyFlow(){
 dailyFlowReady=true;
 const area=document.getElementById('daily-flow-area').value;
 const rows=detailRows.map(d=>({...d,area:POWER_SOURCES.find(s=>s.energy===d.id)?.area||'Sans pièce attribuée',watts:d.total})).filter(d=>!area||d.area===area),known=rows.filter(d=>d.watts!==null),layout=powerLayout(rows.map(d=>({...d}))),leader=[...known].filter(d=>d.watts>0).sort((a,b)=>b.watts-a.watts)[0];
 document.getElementById('daily-flow-caption').textContent=document.getElementById('detail-caption').textContent+' · kWh';
 document.getElementById('daily-flow-total').textContent=fmt(known.length?layout.total:null,3)+' kWh';document.getElementById('daily-flow-count').textContent=known.length+' / '+rows.length;document.getElementById('daily-flow-leader').textContent=leader?leader.name+' · '+fmt(leader.watts,3)+' kWh':known.length?'Aucune consommation':'—';
 document.getElementById('daily-flow-diagram').innerHTML=layout.total?renderFlowSVG(layout,'kWh','data-daily-area'):'<p class="vt-sub">'+(known.length?'Aucune consommation positive mesurée pour cette sélection.':'Données insuffisantes pour cette journée et cette sélection.')+'</p>';
}
const dailyFlowArea=document.getElementById('daily-flow-area');
for(const area of [...new Set(POWER_SOURCES.map(d=>d.area))].sort((a,b)=>a.localeCompare(b,'fr'))){const opt=document.createElement('option');opt.value=area;opt.textContent=area;dailyFlowArea.append(opt);}
dailyFlowArea.addEventListener('change',()=>{if(dailyFlowReady)renderDailyFlow();});
function selectDailyFlowArea(e){const g=e.target.closest('[data-daily-area]');if(g&&dailyFlowReady){dailyFlowArea.value=g.dataset.dailyArea;renderDailyFlow();dailyFlowArea.focus();}}
document.getElementById('daily-flow-diagram').addEventListener('click',selectDailyFlowArea);
document.getElementById('daily-flow-diagram').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectDailyFlowArea(e);}});
// Configuration sync opens the initial view.
