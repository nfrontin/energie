// Reconcile the measured house balance before linking sources to appliances.
function dailySourceModel(rows,t){
 if(!t||['house','solar','imported','inj','self'].some(k=>!Number.isFinite(t[k])||t[k]<0))return null;
 const known=rows.filter(d=>Number.isFinite(d.watts)&&d.watts>=0),measured=known.reduce((sum,d)=>sum+d.watts,0);
 if(measured>t.house+0.000001||Math.abs(t.imported+t.self-t.house)>.001||Math.abs(t.self+t.inj-t.solar)>.001)return null;
 const result=known.map(d=>({...d})),untracked=Math.max(0,t.house-measured);
 if(untracked>0)result.push({area:'Non réparti',name:'Consommation non suivie',watts:untracked,untracked:true});
 return {rows:result,untracked,measured,totals:t};
}
function renderDailySourceFlow(model){
 const t=model.totals,layout=powerLayout(model.rows,t.solar+t.imported),{groups,scale,height,rootY,rootHeight}=layout;
 if(!scale)return '<p class="vt-sub">Aucune consommation à répartir.</p>';
 const palette=energyPalette(),areas=[...new Set(POWER_SOURCES.map(d=>d.area))].sort();let defs='',links='',nodes='',seq=0;
 const label=(x,y,name,value,anchor='start')=>'<text class="flow-label" x="'+x+'" y="'+y+'" text-anchor="'+anchor+'">'+escapeHTML(name)+'</text><text class="flow-value" x="'+x+'" y="'+(y+19)+'" text-anchor="'+anchor+'">'+fmt(value,3)+' kWh</text>';
 const rect=(x,y,h,color)=>h>0?'<rect x="'+x+'" y="'+y+'" width="12" height="'+h+'" fill="'+color+'"/>':'';
 const ribbon=(x1,y1,x2,y2,h,from,to,title)=>{if(h<=0)return '';const id='daily-source-gradient-'+seq++;defs+='<linearGradient id="'+id+'"><stop stop-color="'+from+'"/><stop offset="1" stop-color="'+to+'"/></linearGradient>';return '<path class="flow-link" tabindex="0" aria-label="'+escapeHTML(title)+'" fill="url(#'+id+')" d="M'+x1+','+y1+' C'+((x1+x2)/2)+','+y1+' '+((x1+x2)/2)+','+y2+' '+x2+','+y2+' L'+x2+','+(y2+h)+' C'+((x1+x2)/2)+','+(y2+h)+' '+((x1+x2)/2)+','+(y1+h)+' '+x1+','+(y1+h)+' Z"><title>'+escapeHTML(title)+'</title></path>';};
 const houseX=325,areaX=670,deviceX=995,gridHeight=t.imported*scale,solarHeight=t.solar*scale,injHeight=t.inj*scale;
 const sourceTop=Math.max(55,(height-gridHeight-solarHeight-65)/2),gridY=sourceTop,solarY=gridY+gridHeight+65;
 const exportY=Math.max(rootY+rootHeight+55,solarY+t.self*scale),fullHeight=Math.max(height,exportY+injHeight+65);
 links+=ribbon(45,gridY,houseX,rootY,gridHeight,C.hc,C.hc,'Réseau → maison : '+fmt(t.imported,3)+' kWh');
 links+=ribbon(45,solarY,houseX,rootY+gridHeight,t.self*scale,C.sol,C.hc,'Solaire → maison : '+fmt(t.self,3)+' kWh');
 links+=ribbon(45,solarY+t.self*scale,houseX,exportY,injHeight,C.sol,C.inj,'Solaire → réseau : '+fmt(t.inj,3)+' kWh');
 nodes+=rect(33,gridY,gridHeight,C.hc)+label(52,gridY-28,'Réseau acheté',t.imported);
 nodes+=rect(33,solarY,solarHeight,C.sol)+label(52,solarY-28,'Production solaire',t.solar);
 nodes+=rect(houseX,rootY,rootHeight,C.hc)+label(houseX+20,rootY-28,'Maison',t.house);
 if(t.inj>0)nodes+=rect(houseX,exportY,injHeight,C.inj)+label(houseX+20,exportY+injHeight/2-3,'Injection réseau',t.inj);
 let rootOffset=rootY;
 const colorForDevice=d=>{let hash=0;for(const c of (d.id||d.name))hash=(hash*31+c.charCodeAt(0))>>>0;return palette[hash%palette.length];};
 for(const g of groups){const unknown=g.devices.every(d=>d.untracked),areaColor=unknown?'#87949f':palette[Math.max(0,areas.indexOf(g.name))%palette.length];
 links+=ribbon(houseX+12,rootOffset,areaX,g.y,g.height,C.hc,areaColor,'Maison → '+g.name+' : '+fmt(g.total,3)+' kWh');rootOffset+=g.height;
 nodes+='<g '+(unknown?'':'data-daily-area="'+escapeHTML(g.name)+'" tabindex="0" role="button" aria-label="Afficher '+escapeHTML(g.name)+'"')+'>'+rect(areaX,g.y,g.height,areaColor)+label(areaX-10,g.y+g.height/2-5,g.name,g.total,'end')+'</g>';
 let offset=g.y;for(const d of g.devices){const color=d.untracked?'#87949f':colorForDevice(d);links+=ribbon(areaX+12,offset,deviceX,d.y,d.height,areaColor,color,g.name+' → '+d.name+' : '+fmt(d.watts,3)+' kWh');offset+=d.height;nodes+=rect(deviceX,d.y,d.height,color)+'<g><title>'+escapeHTML(d.name)+'</title><text x="'+(deviceX+22)+'" y="'+(d.y+d.height/2+5)+'">'+escapeHTML(d.name.length>32?d.name.slice(0,31)+'…':d.name)+'</text><text class="flow-value" x="1390" y="'+(d.y+d.height/2+5)+'" text-anchor="end">'+fmt(d.watts,3)+' kWh</text></g>';}
 }
 return '<svg class="source-flow-svg" viewBox="0 0 1410 '+fullHeight+'" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Flux quotidiens du réseau et du solaire vers la maison, les pièces et les appareils"><defs>'+defs+'</defs><text class="flow-value" x="33" y="20">Sources</text><text class="flow-value" x="325" y="20">Destination</text><text class="flow-value" x="660" y="20" text-anchor="end">Pièces</text><text class="flow-value" x="1017" y="20">Appareils</text>'+links+nodes+'</svg>';
}
