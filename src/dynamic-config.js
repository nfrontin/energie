let energySourceConfig=[{id:'westic1hp',kind:'import',name:'Heures pleines',price:0.1727},{id:'westic1hc',kind:'import',name:'Heures creuses',price:0.1376},{id:'westic1inj',kind:'export',name:'Injection',price:0.1},{id:'energy_production_today_filtre',kind:'solar',name:'Solaire',price:null}],tariffHistory=[],configVersion='',configPending=false,electricityContract=null;
function updateAreaOptions(){
 for(const id of ['now-area','daily-flow-area']){const el=document.getElementById(id),selected=el.value;el.innerHTML='<option value="">Toutes les pièces</option>';for(const area of [...new Set(POWER_SOURCES.map(d=>d.area))].sort((a,b)=>a.localeCompare(b,'fr'))){const o=document.createElement('option');o.value=area;o.textContent=area;el.append(o);}if([...el.options].some(o=>o.value===selected))el.value=selected;}
}
async function syncEnergyConfig(){
 if(configPending)return false;configPending=true;
 try{
  const response=await fetch('/config/energy-config.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('configuration');const config=await response.json();
  if(config.schema!==1||!Array.isArray(config.devices)||!Array.isArray(config.sources)||!config.sources.length)throw Error('format');
  const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_]+$/.test(x);
  if(config.devices.some(d=>!validId(d.id)||typeof d.name!=='string'||typeof d.area!=='string'||d.power!==null&&!validId(d.power))||config.sources.some(s=>!validId(s.id)||!['import','export','solar'].includes(s.kind)))throw Error('format');
  const changed=configVersion!==config.version;
  if(changed){DETAIL_DEVICES.splice(0,DETAIL_DEVICES.length,...config.devices.map(d=>({id:d.id,name:d.name})));POWER_SOURCES.splice(0,POWER_SOURCES.length,...config.devices.map(d=>({energy:d.id,power:d.power,area:d.area})));energySourceConfig=config.sources;electricityContract=config.electricityContract||null;if(typeof renderElectricityContract==='function')renderElectricityContract();tariffHistory=config.tariffHistory||[];configVersion=config.version;updateAreaOptions();}
  const stale=Date.now()-Date.parse(config.syncedAt)>180000;
  document.getElementById('energy-config-status').textContent=stale?'Configuration Home Assistant ancienne : dernière synchronisation '+new Date(config.syncedAt).toLocaleString('fr-FR'):'Configuration synchronisée avec Home Assistant · '+config.devices.length+' appareils';return changed;
 }catch{document.getElementById('energy-config-status').textContent='Configuration Home Assistant inaccessible · dernière configuration connue utilisée';return false;}finally{configPending=false;}
}
function tariffAt(key,time){let record=null;for(const h of tariffHistory){if(Date.parse(h.observedAt)/1000<=time)record=h;else break;}return record?record.prices[key]??null:tariffHistory[0]?.prices[key]??energySourceConfig.find(s=>s.kind+':'+s.id===key)?.price??null;}
function tariffMean(key,start,end){const cuts=[start,...tariffHistory.map(h=>Date.parse(h.observedAt)/1000).filter(t=>t>start&&t<end),end];let cost=0;for(let i=1;i<cuts.length;i++){const p=tariffAt(key,cuts[i-1]);if(p===null)return null;cost+=p*(cuts[i]-cuts[i-1]);}return cost/(end-start);}
function sourceCost(source,values,day,end){let total=0;for(let i=0;i<values.length;i++){const start=localMidnight(day)/1000+i*3600,stop=Math.min(start+3600,end);if(stop<=start)continue;if(values[i]===null)return null;const price=tariffMean(source.kind+':'+source.id,start,stop);if(price===null)return null;total+=values[i]*price;}return source.kind==='export'?-total:total;}
(async()=>{await syncEnergyConfig();const view=location.hash.slice(1);showView(['now','detail','today','day','rolling','month','history'].includes(view)?view:'detail');})();
setInterval(async()=>{if(!document.hidden&&await syncEnergyConfig()){if(currentResource==='electric')showView(currentView);}},60000);
