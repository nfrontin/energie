const themePicker=document.getElementById('energy-theme');themePicker.value=activeTheme;
themePicker.addEventListener('change',()=>{
 if(!Object.hasOwn(ENERGY_THEMES,themePicker.value))return;activeTheme=themePicker.value;try{localStorage.setItem('maison-vt-theme',activeTheme);}catch{}
 Object.assign(C,ENERGY_THEMES[activeTheme].colors);detailPalette.splice(0,detailPalette.length,...energyPalette());
 WATER_METERS.forEach(m=>{m.color=({4:C.hc,1:C.hp,3:C.inj,2:C.sol})[m.id];});paintEnergyTheme();
 if(nowDevices.length)renderNow();if(dailyFlowReady)renderDailyFlow();
 if(currentResource==='electric')showView(currentView);else if(currentResource==='water')renderWater();else loadGas().catch(()=>reportRequest('gaz',true));
});
