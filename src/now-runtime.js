let nowPending=false,lastNow=0,nowDevices=[];
function powerWatts(s){if(!s)return null;const n=Number(s.value?.[1]),unit=s.metric?.unit_of_measurement;if(!Number.isFinite(n)||n<0||!['W','kW'].includes(unit))return null;return n*(unit==='kW'?1000:1);}
function powerLayout(rows,scaleTotal=null){
 const groups=new Map();for(const d of rows.filter(d=>d.watts>0)){if(!groups.has(d.area))groups.set(d.area,{name:d.area,total:0,devices:[]});const g=groups.get(d.area);g.total+=d.watts;g.devices.push(d);}
 const ordered=[...groups.values()].sort((a,b)=>b.total-a.total),total=ordered.reduce((n,g)=>n+g.total,0),scale=Math.max(total,scaleTotal||0)>0?390/Math.max(total,scaleTotal||0):0;
 let y=50;for(const g of ordered){g.devices.sort((a,b)=>b.watts-a.watts);const top=y;for(const d of g.devices){d.height=d.watts*scale;d.y=y+Math.max(0,(25-d.height)/2);y+=Math.max(25,d.height)+9;}g.height=g.total*scale;g.y=top+(y-9-top-g.height)/2;y+=24;}
 const height=Math.max(430,y+15),rootHeight=total*scale,rootY=(height-rootHeight)/2;return {groups:ordered,total,scale,height,rootHeight,rootY};
}
async function loadNow(){
 if(nowPending)return;nowPending=true;
 try{
 const names=POWER_SOURCES.filter(d=>d.power).map(d=>'sensor\\.'+d.power+'_value').join('|');
 const query='last_over_time({db="home_assistant",__name__=~"'+names.replaceAll('\\','\\\\')+'"}[30d])';
 if(!names){nowDevices=[];renderNow();return;}
 const result=await getJSON('/vm/api/v1/query?'+new URLSearchParams({query}));
 const byId=new Map((result.data.result||[]).map(s=>[s.metric.entity_id,s]));
 nowDevices=POWER_SOURCES.map(s=>({...s,name:DETAIL_DEVICES.find(d=>d.id===s.energy)?.name||s.power,watts:powerWatts(byId.get(s.power))}));
 renderNow();lastNow=Date.now();document.getElementById('now-caption').textContent='Puissances actives · relevées à '+new Date().toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit',second:'2-digit'})+' · '+nowDevices.filter(d=>d.watts!==null).length+'/'+nowDevices.length+' capteurs disponibles';reportRequest('vue-now',false);reportRequest('now',false);
 }catch(e){nowDevices=[];renderNow();document.getElementById('now-caption').textContent='Puissances indisponibles. Réessayez en sélectionnant Maintenant.';throw e;}finally{nowPending=false;}
}
function renderNow(){
 const area=document.getElementById('now-area').value,rows=nowDevices.filter(d=>!area||d.area===area),known=rows.filter(d=>d.watts!==null),layout=powerLayout(rows.map(d=>({...d}))),leader=known.filter(d=>d.watts>0).sort((a,b)=>b.watts-a.watts)[0];
 document.getElementById('now-total').textContent=fmt(known.length?layout.total:null,0)+' W';document.getElementById('now-count').textContent=known.filter(d=>d.watts>0).length+' / '+rows.length;document.getElementById('now-leader').textContent=leader?leader.name+' · '+fmt(leader.watts,0)+' W':known.length?'Aucun appareil actif':'—';
 document.getElementById('now-rows').innerHTML=[...rows].sort((a,b)=>a.area.localeCompare(b.area,'fr')||(b.watts??-1)-(a.watts??-1)).map(d=>'<tr><th scope="row">'+escapeHTML(d.area)+'</th><td>'+escapeHTML(d.name)+'</td><td>'+fmt(d.watts,1)+' W</td></tr>').join('');
 if(!layout.total){document.getElementById('now-diagram').innerHTML='<p class="vt-sub">'+(known.length?'Aucune puissance positive mesurée pour cette sélection.':'Aucune puissance disponible pour cette sélection.')+'</p>';return;}
 document.getElementById('now-diagram').innerHTML=renderFlowSVG(layout,'W','data-now-area');
}
function renderFlowSVG(layout,unit,areaAttribute){
 const digits=unit==='kWh'?3:1;
 const {groups,total,scale,height,rootHeight,rootY}=layout,colors=energyPalette();
 const ribbon=(x1,y1,x2,y2,h,color,title)=>'<path class="flow-link" tabindex="0" aria-label="'+escapeHTML(title)+'" fill="'+color+'" d="M'+x1+','+y1+' C'+(x1+(x2-x1)*.5)+','+y1+' '+(x2-(x2-x1)*.5)+','+y2+' '+x2+','+y2+' L'+x2+','+(y2+h)+' C'+(x2-(x2-x1)*.5)+','+(y2+h)+' '+(x1+(x2-x1)*.5)+','+(y1+h)+' '+x1+','+(y1+h)+' Z"><title>'+escapeHTML(title)+'</title></path>';
 let links='',nodes='',offset=rootY;
 groups.forEach((g,i)=>{const color=colors[[...new Set(POWER_SOURCES.map(d=>d.area))].sort().indexOf(g.name)%colors.length];links+=ribbon(40,offset,355,g.y,g.height,color,'Appareils suivis → '+g.name+' : '+fmt(g.total,digits)+' '+unit);offset+=g.height;let source=g.y;
 nodes+='<g '+areaAttribute+'="'+escapeHTML(g.name)+'" tabindex="0" role="button" aria-label="Afficher '+escapeHTML(g.name)+'"><rect x="355" y="'+g.y+'" width="12" height="'+g.height+'" fill="'+color+'"/><text class="flow-label" x="345" y="'+(g.y+g.height/2-3)+'" text-anchor="end">'+escapeHTML(g.name)+'</text><text class="flow-value" x="345" y="'+(g.y+g.height/2+14)+'" text-anchor="end">'+fmt(g.total,digits)+' '+unit+'</text></g>';
 for(const d of g.devices){links+=ribbon(367,source,680,d.y,d.height,color,g.name+' → '+d.name+' : '+fmt(d.watts,digits)+' '+unit);source+=d.height;nodes+='<rect x="680" y="'+d.y+'" width="9" height="'+Math.max(.5,d.height)+'" fill="'+color+'"/><text x="703" y="'+(d.y+d.height/2+4)+'">'+escapeHTML(d.name)+'</text><text class="flow-value" x="1030" y="'+(d.y+d.height/2+4)+'" text-anchor="end">'+fmt(d.watts,digits)+' '+unit+'</text>';}
 });
 return '<svg viewBox="0 0 1050 '+height+'" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Répartition de '+fmt(total,digits)+' '+unit+' entre les pièces et les appareils suivis"><text class="flow-value" x="28" y="20">Appareils suivis</text><text class="flow-value" x="345" y="20" text-anchor="end">Pièces</text><text class="flow-value" x="703" y="20">Appareils</text>'+links+'<rect x="28" y="'+rootY+'" width="12" height="'+rootHeight+'" fill="'+C.hc+'"/>'+nodes+'</svg>';
}

const nowArea=document.getElementById('now-area');for(const area of [...new Set(POWER_SOURCES.map(d=>d.area))].sort((a,b)=>a.localeCompare(b,'fr'))){const opt=document.createElement('option');opt.value=area;opt.textContent=area;nowArea.append(opt);}
nowArea.addEventListener('change',renderNow);
function selectFlowArea(e){const g=e.target.closest('[data-now-area]');if(g){nowArea.value=g.dataset.nowArea;renderNow();nowArea.focus();}}
document.getElementById('now-diagram').addEventListener('click',selectFlowArea);
document.getElementById('now-diagram').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectFlowArea(e);}});

// Initial view opens after daily flow initialization.
