function electricitySubscription(day){
 const c=electricityContract;
 if(!c||day<c.effectiveFrom.slice(0,10))return null;
 const [year,month]=day.split('-').map(Number);
 return c.monthly/new Date(Date.UTC(year,month,0)).getUTCDate();
}
function renderElectricityContract(){
 const c=electricityContract,node=document.getElementById('electricity-contract');
 if(!node)return;node.hidden=!c;if(!c)return;
 node.innerHTML='<h2 class="panel-title">Votre contrat électricité</h2><p class="vt-sub">'+escapeHTML(c.supplier+' · '+c.offer)+' · '+c.kva+' kVA · HP / HC</p><div class="detail-kpis">'+[['Heures pleines',c.prices['import:westic1hp'],'€/kWh',4],['Heures creuses',c.prices['import:westic1hc'],'€/kWh',4],['Abonnement',c.monthly,'€/mois',2]].map(([label,v,unit,d])=>'<div class="vt-stat"><div class="vt-stat-top">'+label+' TTC</div><div class="vt-number">'+numberHTML(v,unit,d)+'</div></div>').join('')+'</div><p class="vt-caption">Heures creuses : '+escapeHTML(c.offPeak)+' (heure de Paris).<br>Contrat depuis le 28 novembre 2025 · facturation mensuelle. Grille TTC applicable au 30 septembre 2026 ; les tarifs antérieurs restent ceux du suivi.</p>';
}
