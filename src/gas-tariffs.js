// Contract-specific TTC rates supplied by the owner; no personal contract data.
const GAS_CONTRACT={supplier:'Alterna énergie',offer:'Énergie moins chère ensemble 2024',option:'T2',effectiveFrom:'2025-09-01',kwh:0.0875,monthly:27.56};
function gasDayCost(day,kwh){
 if(day<GAS_CONTRACT.effectiveFrom)return null;
 const [year,month]=day.split('-').map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate();
 const subscription=GAS_CONTRACT.monthly/days;
 return {energy:Number.isFinite(kwh)&&kwh>=0?kwh*GAS_CONTRACT.kwh:null,subscription,total:Number.isFinite(kwh)&&kwh>=0?kwh*GAS_CONTRACT.kwh+subscription:null};
}
function renderGasCost(day,values){
 const start=localMidnight(day)/1000,next=localMidnight(shiftDay(day,1))/1000,stop=Math.min(Date.now()/1000,next);
 const elapsed=Math.max(0,Math.min(values.length,Math.ceil((stop-start)/3600)));
 const readings=values.slice(0,elapsed),complete=readings.length>0&&readings.every(v=>Number.isFinite(v));
 const cost=gasDayCost(day,complete?readings.reduce((sum,v)=>sum+v,0):null),euros=v=>fmt(v,2)+' €';
 document.getElementById('gas-cost-date').textContent='Journée du '+new Date(day+'T12:00:00Z').toLocaleDateString('fr-FR');
 document.getElementById('gas-energy-cost').textContent=cost?.energy==null?'—':euros(cost.energy);
 document.getElementById('gas-subscription-cost').textContent=cost?euros(cost.subscription):'—';
 document.getElementById('gas-total-cost').textContent=cost?.total==null?'—':euros(cost.total);
 document.getElementById('gas-cost-note').textContent=(day===localDate()?'Consommation à ce stade de la journée ; abonnement compté pour la journée entière. ':'')+'Abonnement réparti sur les jours du mois.'+(!complete?' Relevés incomplets : coût de consommation indisponible.':'')+(!cost?' Aucun tarif renseigné avant le 01/09/2025.':'');
}
document.getElementById('gas-rate-kwh').textContent=fmt(GAS_CONTRACT.kwh,4)+' €/kWh TTC';
document.getElementById('gas-rate-month').textContent=fmt(GAS_CONTRACT.monthly,2)+' €/mois TTC';
document.getElementById('gas-rate-year').textContent=fmt(GAS_CONTRACT.monthly*12,2)+' €/an à tarif constant';
