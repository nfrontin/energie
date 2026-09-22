const ENERGY_THEMES={
 lagon:{name:'Lagon',accent:'#087e8b',soft:'#e0f5f4',bg:'#f1f8fa',colors:{hp:'#f59e0b',hc:'#168bea',sol:'#10b981',inj:'#8b5cf6',gas:'#f97316',base:'#ec4899'},palette:['#168bea','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#6366f1']},
 aurore:{name:'Aurore',accent:'#8b3bbe',soft:'#f2e7fc',bg:'#faf5fc',colors:{hp:'#f97316',hc:'#8b5cf6',sol:'#eab308',inj:'#ec4899',gas:'#ef4444',base:'#14b8a6'},palette:['#8b5cf6','#ec4899','#f97316','#14b8a6','#eab308','#3b82f6','#ef4444','#a855f7']},
 tropical:{name:'Tropical',accent:'#087b54',soft:'#def7e7',bg:'#f3faf4',colors:{hp:'#ff8b24',hc:'#0ea5e9',sol:'#22c55e',inj:'#e94393',gas:'#ef5a39',base:'#8855ef'},palette:['#22c55e','#0ea5e9','#ff8b24','#e94393','#8855ef','#14b8a6','#ef5a39','#b2a100']},
 sauge:{name:'Sauge',accent:'#285945',soft:'#e7eee7',bg:'#f6f7f4',colors:{hp:'#d69b4d',hc:'#5b7f92',sol:'#668b52',inj:'#418576',gas:'#b47453',base:'#847199'},palette:['#5b7f92','#668b52','#d69b4d','#418576','#847199','#b47453','#7b9289','#a2916c']}
};
let activeTheme='lagon';try{const saved=localStorage.getItem('maison-vt-theme');if(Object.hasOwn(ENERGY_THEMES,saved))activeTheme=saved;}catch{}
function energyPalette(){return [...ENERGY_THEMES[activeTheme].palette];}
function paintEnergyTheme(){
 const t=ENERGY_THEMES[activeTheme],root=document.documentElement.style,host=document.getElementById('vt-design');
 for(const [k,v]of Object.entries(t.colors)){root.setProperty('--'+k,v);host.style.setProperty('--vt-'+k,v);}
 root.setProperty('--bg','light-dark('+t.bg+',#151b22)');host.style.setProperty('--vt-bg','light-dark('+t.bg+',#151b22)');host.style.setProperty('--vt-accent','light-dark('+t.accent+',#b7ddf6)');host.style.setProperty('--vt-soft','light-dark('+t.soft+',#293444)');host.style.setProperty('--flow-opacity',activeTheme==='sauge'?'.35':'.57');
}
paintEnergyTheme();
