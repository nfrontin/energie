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


'use strict';
const DK  = matchMedia('(prefers-color-scheme:dark)').matches;
const GC  = DK ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
const TC  = DK ? '#94a3b8' : '#64748b';
const C = {...ENERGY_THEMES[activeTheme].colors};
Chart.defaults.font.size = 11;
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const FR_M = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// All calendar boundaries use the home's timezone, including DST changes.
const HOME_TZ = 'Europe/Paris';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {timeZone: HOME_TZ, year:'numeric', month:'2-digit', day:'2-digit'});
function localDate(d = new Date()) {
  const p = Object.fromEntries(dateFormatter.formatToParts(d).map(p => [p.type,p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function shiftDay(day, n) {
  const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10);
}
function localMidnight(day) {
  const target = Date.parse(day + 'T00:00:00Z'); let t = target;
  const f = new Intl.DateTimeFormat('en-GB', {timeZone:HOME_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for (let i=0;i<3;i++) {
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map(p => [p.type,p.value]));
    const displayed = Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
    t += target - displayed;
  }
  return t;
}
function dayISO(day) { return new Date(localMidnight(day)).toISOString(); }
const requestFailures = new Map();
function reportRequest(key, failed) {
  if (failed) requestFailures.set(key, true); else requestFailures.delete(key);
  const el = document.getElementById('data-status');
  el.style.display = requestFailures.size ? 'block' : 'none';
  el.textContent = requestFailures.size ? 'Certaines données sont indisponibles. Les valeurs manquantes ne représentent pas une consommation nulle. Réessayez en sélectionnant la vue.' : '';
}
async function getJSON(url) {
  try {
    const r = await fetch(url, {signal: AbortSignal.timeout(30000)});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (d.status === 'error') throw new Error('Erreur de données');
    reportRequest(url.split('?')[0] + ':' + (new URL(url, location.origin).searchParams.get('query') || ''), false); return d;
  } catch(e) { reportRequest(url.split('?')[0] + ':' + (new URL(url, location.origin).searchParams.get('query') || ''), true); throw e; }
}

// ── Envoy helper (temps réel solaire + réseau actif) ────────────
async function fetchEnvoy() {
  try {
    const [rProd, rMeters] = await Promise.all([
      fetch('/envoy/api/v1/production', {signal:AbortSignal.timeout(15000)}),
      fetch('/envoy/ivp/meters/readings', {signal:AbortSignal.timeout(15000)}),
    ]);
    if (!rProd.ok || !rMeters.ok) throw new Error('Envoy indisponible');
    reportRequest('envoy', false);
    const prod = await rProd.json();
    let gridActiveW = null;
    if (rMeters.ok) {
      const meters = await rMeters.json();
      // eid 704643584 = compteur net-consumption (soutirage positif, injection négatif)
      const conso = meters.find(m => m.eid === 704643584);
      if (conso) gridActiveW = conso.activePower ?? null;
    }
    return {
      wattsNow:      prod.wattsNow      ?? null,
      wattHoursToday: prod.wattHoursToday ?? null,
      gridActiveW,   // W actifs réseau : >0 soutirage, <0 injection
    };
  } catch { reportRequest('envoy', true); return null; }
}

// ── WES helper ──────────────────────────────────────────────────
async function fetchWES() {
  try {
    const r = await fetch('/wes/data.cgx', {signal:AbortSignal.timeout(15000)});
    if (!r.ok) throw new Error('WES indisponible');
    const txt = await r.text();
    const doc = new DOMParser().parseFromString(txt, 'text/xml');
    if (doc.querySelector('parsererror') || !doc.querySelector('data')) throw new Error('Réponse WES invalide');
    reportRequest('wes', false);
    const g = tag => doc.getElementsByTagName(tag)[0]?.textContent ?? null;
    const n = tag => { const v = g(tag); return v !== null && v.trim() !== '' && Number.isFinite(+v) ? +v : null; };
    return {
      water: [1,2,3,4].map(i => n('INDEX' + i)),
      ptec:     g('PTEC'),
      pap:   n('PAP'),   // SINSTS : puissance app. soutirée (VA) — 0 si solaire ≥ conso
      papij: n('PAPIJ'), // SINSTI  : puissance app. injectée  (VA) — 0 si pas d'excédent (mode producteur)
      hpleine:   n('H_PLEINE'),  // index HP en Wh
      hcreuse:   n('H_CREUSE'),  // index HC en Wh
      injection: n('INJECTION'), // index injection en Wh
      iinst1:    n('IINST1'),
      iinst2:    n('IINST2'),
      iinst3:    n('IINST3'),
      tension1:  n('TENSION1'),
      tension2:  n('TENSION2'),
      tension3:  n('TENSION3'),
    };
  } catch { reportRequest('wes', true); return Object.fromEntries(['ptec','pap','papij','hpleine','hcreuse','injection','iinst1','iinst2','iinst3','tension1','tension2','tension3'].map(k => [k,null])); }
}

// ── VM helpers ──────────────────────────────────────────────────

// Derive consumption inside each series before combining it. Never subtract
// counter readings from different series (the April 2026 migration changed offsets).
function counterValues(series) {
  const intervals = new Map();
  const ordered = series.filter(s => s.values?.length).sort((a,b) =>
    Number(a.metric?.db === 'home_assistant') - Number(b.metric?.db === 'home_assistant') || +a.values[0][0] - +b.values[0][0]);
  for (const s of ordered) {
    const values = s.values.filter(([t,v]) => Number.isFinite(+t) && Number.isFinite(+v)).sort((a,b)=>a[0]-b[0]);
    for (let i=1;i<values.length;i++) {
      const [start, first] = values[i-1], [end,last] = values[i];
      const delta = +last - +first;
      if (+end > +start && delta >= 0) intervals.set(+end, {start:+start,end:+end,delta});
    }
  }
  const sorted = [...intervals.values()].sort((a,b)=>a.end-b.end);
  const result = []; let total = 0;
  for (const v of sorted) {
    if (!result.length || result.at(-1)[0] < v.start) result.push([v.start, String(total)]);
    total += v.delta; result.push([v.end,String(total)]);
  }
  result.intervals = sorted;
  return result;
}
async function vmR(query, start, end, step) {
  try {
    const counter = /westic1(?:hp|hc|inj)_value|gaz_en_kwh_value|elec_old_/.test(query);
    const d = await getJSON('/vm/api/v1/query_range?' + new URLSearchParams({query,start,end,step:String(step)}));
    const results = d.data.result;
    if (!results.length) return [];
    // Include the endpoint: a daily grid alone would omit today's partial day.
    if (counter) {
      const tail = await getJSON('/vm/api/v1/query?' + new URLSearchParams({query:step >= 86400 ? `last_over_time(${query}[2d])` : query,time:end}));
      for (const t of tail.data.result) {
        const key = m => JSON.stringify(Object.entries(m).sort());
        const s = results.find(s => key(s.metric) === key(t.metric));
        if (s && +t.value[0] > +s.values.at(-1)[0]) s.values.push(t.value);
      }
      return counterValues(results);
    }
    return results.reduce((best,cur)=>cur.values.length > best.values.length ? cur : best).values;
  } catch { return []; }
}
// Allocate measured deltas to Paris calendar periods. At coarse historical
// resolution, a boundary-crossing interval is apportioned by elapsed time.
function periodDeltas(values, divisor, monthly = false) {
  const intervals = values.intervals || values.slice(1).map(([end,last],i)=>({start:+values[i][0],end:+end,delta:+last-+values[i][1]}));
  const out = {};
  for (const v of intervals) {
    if (v.delta < 0 || v.end <= v.start) continue;
    let t = v.start;
    while (t < v.end) {
      const day = localDate(new Date(t*1000));
      const key = monthly ? day.slice(0,7) : day;
      let next;
      if (monthly) {
        const d = new Date(day.slice(0,7)+'-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth()+1);
        next = localMidnight(d.toISOString().slice(0,10))/1000;
      } else next = localMidnight(shiftDay(day,1))/1000;
      const until = Math.min(v.end,next);
      out[key] = (out[key] ?? 0) + v.delta*(until-t)/(v.end-v.start)/divisor;
      t = until;
    }
  }
  return out;
}
function monthlyDeltas(values, divisor) { return periodDeltas(values,divisor,true); }
function dailyDeltas(values, divisor) { return periodDeltas(values,divisor); }

function fmt(v, dec = 0) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return (+v).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function nowISO()  { return new Date().toISOString(); }
function todayISO()  {
  return dayISO(localDate());
}

// ── Header clock ────────────────────────────────────────────────
setInterval(() => {
  document.getElementById('htime').textContent =
    new Date().toLocaleTimeString('fr-FR', {timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit',second:'2-digit'});
}, 1000);

// ── Chart factory ────────────────────────────────────────────────
const charts = {};
function mkChart(id, type, labels, datasets, scalesExtra) {
  datasets = datasets.filter(d => d.label !== 'Gaz');
  if(scalesExtra) delete scalesExtra.yr;
  datasets.forEach(d=>{if(d.type !== 'line'){d.borderRadius=3;d.maxBarThickness=40;}});
  if (charts[id]) { charts[id].destroy(); }
  charts[id] = new Chart(document.getElementById(id), {
    type,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => {
          if (c.raw === null || c.raw === undefined) return null;
          return `${c.dataset.label}: ${(+c.raw).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${c.dataset._unit || 'kWh'}`;
        }}}
      },
      scales: Object.assign({
        x: { grid: { color: GC }, ticks: { color: TC, autoSkip: true, maxTicksLimit: 14, maxRotation: 0 } },
        y: { grid: { color: GC }, ticks: { color: TC, callback: v => v >= 1000 ? (v/1000) + 'k' : v } },
      }, scalesExtra || {}),
    }
  });
}

// ══════════════════════════════════════════════════════════════════
// LIVE
// ══════════════════════════════════════════════════════════════════
async function legacyLoadToday() {
  const start = todayISO();
  const end   = nowISO();

  const [vHP, vHC, vInj, vSol, vGas] = await Promise.all([
    vmR('sensor.westic1hp_value{entity_id="westic1hp"}', start, end, 300),
    vmR('sensor.westic1hc_value{entity_id="westic1hc"}', start, end, 300),
    vmR('sensor.westic1inj_value', start, end, 300),
    vmR('sensor.envoy_122204021247_current_power_production_value', start, end, 300),
    vmR('sensor.gaz_en_kwh_value{db="home_assistant"}', start, end, 300),
  ]);

  // Build HP/HC delta map: ts → W
  const hpM = new Map(vHP.map(([t, v]) => [+t, +v]));
  const hcM = new Map(vHC.map(([t, v]) => [+t, +v]));
  const hphcTs = [...new Set([...hpM.keys(), ...hcM.keys()])].sort((a, b) => a - b);
  const hpDelta = new Map(), hcDelta = new Map();
  for (let i = 1; i < hphcTs.length; i++) {
    const t = hphcTs[i], tp = hphcTs[i - 1];
    const dt = t - tp;
    if (dt <= 0 || dt > 1200) continue;
    const scale = 3600 / dt;
    const hp  = hpM.get(t)  ?? hpM.get(tp)  ?? 0;
    const hpP = hpM.get(tp) ?? hp;
    const hc  = hcM.get(t)  ?? hcM.get(tp)  ?? 0;
    const hcP = hcM.get(tp) ?? hc;
    hpDelta.set(t, Math.max(0, Math.round((hp - hpP) * scale)));
    hcDelta.set(t, Math.max(0, Math.round((hc - hcP) * scale)));
  }

  // Solar map: filter to daylight hours only (avoid stale night values)
  const todayMidnightLocal = new Date(localMidnight(localDate()));
  const minSolTs = Math.floor((+todayMidnightLocal + 5 * 3600 * 1000) / 1000);
  const maxSolTs = Math.floor((+todayMidnightLocal + 22 * 3600 * 1000) / 1000);
  const solM = new Map();
  for (const [t, v] of vSol) {
    const ts = +t;
    if (ts < +todayMidnightLocal/1000) continue;
    solM.set(ts, Math.round(+v * 100) / 100);
  }

  // Injection delta map: ts → −W (negative = power sent to grid)
  const injM2 = new Map(vInj.map(([t, v]) => [+t, +v]));
  const injTs2 = [...injM2.keys()].sort((a, b) => a - b);
  const injDelta = new Map();
  for (let i = 1; i < injTs2.length; i++) {
    const t = injTs2[i], tp = injTs2[i - 1];
    const dt = t - tp;
    if (dt <= 0 || dt > 1200) continue;
    const delta = Math.max(0, Math.round(((injM2.get(t) ?? 0) - (injM2.get(tp) ?? 0)) * 3600 / dt));
    if (delta > 0) injDelta.set(t, -delta);
  }

  // Gas delta map: ts → W (0 when boiler off, positive when firing)
  const gasM = new Map(vGas.map(([t, v]) => [+t, +v]));
  const gasAllTs = [...gasM.keys()].sort((a, b) => a - b);
  const gasDelta = new Map();
  for (let i = 1; i < gasAllTs.length; i++) {
    const t = gasAllTs[i], tp = gasAllTs[i - 1];
    const dt = t - tp;
    if (dt <= 0 || dt > 1200) continue;
    gasDelta.set(t, Math.max(0, Math.round((gasM.get(t) - gasM.get(tp)) * 3600 / dt * 1000)));
  }

  // Unified timeline: union of HP/HC + solar + injection + gas timestamps
  const allTs = [...new Set([...hpDelta.keys(), ...solM.keys(), ...injDelta.keys(), ...gasDelta.keys()])].sort((a, b) => a - b);
  const labels = [], pwHP = [], pwHC = [], pwSolLine = [], pwInj = [], pwGas = [];
  for (const t of allTs) {
    labels.push(new Date(t * 1000).toLocaleTimeString('fr-FR', { timeZone:HOME_TZ, hour: '2-digit', minute: '2-digit' }));
    pwHP.push(hpDelta.has(t) ? hpDelta.get(t) : null);
    pwHC.push(hcDelta.has(t) ? hcDelta.get(t) : null);
    pwSolLine.push(solM.has(t) ? solM.get(t) : null);
    pwInj.push(injDelta.has(t) ? injDelta.get(t) : null);
    // Gas: 0 when not in gasDelta but gas data exists → flat zero line between bursts
    pwGas.push(gasDelta.size > 0 ? (gasDelta.has(t) ? gasDelta.get(t) : 0) : null);
  }

  // Daily totals
  const kwhOf = (v) => v.length > 1 ? Math.max(0, Math.round((+v.at(-1)[1] - +v[0][1]) / 100) / 10) : null;
  const hpD  = kwhOf(vHP);
  const hcD  = kwhOf(vHC);
  const injD = kwhOf(vInj);
  const gasD = vGas.length > 1 ? Math.max(0, Math.round((+vGas.at(-1)[1] - +vGas[0][1]) * 10) / 10) : null;
  document.getElementById('t-hp').innerHTML  = fmt(hpD, 1)  + '<span class="kvu"> kWh</span>';
  document.getElementById('t-hc').innerHTML  = fmt(hcD, 1)  + '<span class="kvu"> kWh</span>';
  document.getElementById('t-tot').innerHTML = (hpD !== null && hcD !== null ? fmt(Math.round((hpD + hcD) * 10) / 10, 1) : '—') + '<span class="kvu"> kWh</span>';
  document.getElementById('t-inj').innerHTML = fmt(injD, 1) + '<span class="kvu"> kWh</span>';
  document.getElementById('t-gas').innerHTML = (gasD !== null ? fmt(gasD, 1) : '—') + '<span class="kvu"> kWh</span>';

  const hasSol = pwSolLine.some(v => v !== null && v > 0);
  const hasInj = injDelta.size > 0;
  const hasGas = gasDelta.size > 0;
  const datasetsToday = [
    { label: 'HP', data: pwHP, backgroundColor: C.hp + 'cc', stack: 'p', _unit: 'W' },
    { label: 'HC', data: pwHC, backgroundColor: C.hc + 'cc', stack: 'p', _unit: 'W' },
  ];
  if (hasInj) {
    datasetsToday.push({ label: 'Injection', data: pwInj, backgroundColor: C.inj + 'bb', stack: 'p', _unit: 'W' });
  }
  if (hasSol) {
    datasetsToday.push({
      label: 'Solaire', data: pwSolLine.map(v => v !== null ? Math.round(v * 1000) : null),
      type: 'line', stack: 'sol', borderColor: C.sol, borderWidth: 2,
      pointRadius: 0, tension: 0.3, fill: false, spanGaps: true, _unit: 'W',
    });
  }
  if (hasGas) {
    datasetsToday.push({
      label: 'Gaz', data: pwGas, type: 'line', stack: 'gas',
      borderColor: C.gas, borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: false, spanGaps: false, _unit: 'W',
    });
  }
  mkChart('chart-today', 'bar', labels, datasetsToday, {
    x: { stacked: true, grid: { color: GC }, ticks: { color: TC, maxTicksLimit: 12, maxRotation: 0 } },
    y: { stacked: true, grid: { color: GC }, ticks: { color: TC, callback: v => Math.abs(v) >= 1000 ? (v/1000)+'kW' : v+'W' } },
  });
}

// ══════════════════════════════════════════════════════════════════
// DAY
// ══════════════════════════════════════════════════════════════════
let curDay = localDate();

function dayLabel(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const dPicker = document.getElementById('d-picker');
dPicker.max = localDate();
dPicker.min = '2016-01-01';
dPicker.value = curDay;
dPicker.addEventListener('change', () => {
  const v = dPicker.value;
  if (v && v <= localDate()) {
    curDay = v;
    loadDay();
  }
});

document.getElementById('d-prev').addEventListener('click', () => {
  const d = new Date(curDay + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  curDay = d.toISOString().slice(0, 10);
  dPicker.value = curDay;
  loadDay();
});
document.getElementById('d-next').addEventListener('click', () => {
  const d = new Date(curDay + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  const next = d.toISOString().slice(0, 10);
  if (next <= localDate()) {
    curDay = next;
    dPicker.value = curDay;
    loadDay();
  }
});

async function legacyLoadDay() {
  const requestedDay=curDay;
  document.getElementById('d-label').textContent = dayLabel(curDay);
  document.getElementById('d-picker').value = curDay;

  // Fetch from previous day (for first-point delta) to end of selected day
  const prev = new Date(curDay + 'T12:00:00Z');
  prev.setUTCDate(prev.getUTCDate() - 1);
  const fetchStart = dayISO(prev.toISOString().slice(0, 10));
  const today = localDate();
  const isToday = curDay === today;
  const fetchEnd = isToday ? new Date().toISOString() : dayISO(shiftDay(curDay,1));

  const [vHP, vHC, vBase, vInj, vSol, vGas] = await Promise.all([
    vmR('sensor.westic1hp_value{entity_id="westic1hp"}', fetchStart, fetchEnd, 300),
    vmR('sensor.westic1hc_value{entity_id="westic1hc"}', fetchStart, fetchEnd, 300),
    vmR('elec_old_base',                                  fetchStart, fetchEnd, 300),
    vmR('sensor.westic1inj_value',                        fetchStart, fetchEnd, 300),
    vmR('sensor.envoy_122204021247_current_power_production_value', fetchStart, fetchEnd, 300),
    vmR('sensor.gaz_en_kwh_value{db="home_assistant"}',  fetchStart, fetchEnd, 300),
  ]);

  if(requestedDay!==curDay)return;
  const useBase = curDay < '2019-04-01';

  const hpSrc   = useBase ? [] : vHP;
  const hcSrc   = useBase ? [] : vHC;
  const baseSrc = useBase ? vBase : [];

  const hpM   = new Map(hpSrc.map(([t, v])   => [+t, +v]));
  const hcM   = new Map(hcSrc.map(([t, v])   => [+t, +v]));
  const baseM = new Map(baseSrc.map(([t, v]) => [+t, +v]));

  const dayStart = localMidnight(curDay) / 1000;
  const dayEnd   = new Date(dayISO(shiftDay(curDay,1))).getTime() / 1000;

  // Timestamps within the selected day
  const tsList = [...new Set([...hpM.keys(), ...hcM.keys(), ...baseM.keys()])]
    .filter(t => t >= dayStart && t <= dayEnd).sort((a, b) => a - b);

  // Previous-day last point for first delta
  const prevTAll = [...new Set([...hpM.keys(), ...hcM.keys(), ...baseM.keys()])].filter(t => t < dayStart);
  const prevT = prevTAll.length ? Math.max(...prevTAll) : null;

  // Compute deltas
  const hpDelta = new Map(), hcDelta = new Map(), baseDelta = new Map();
  const allForDelta = prevT ? [prevT, ...tsList] : tsList;
  for (let i = 1; i < allForDelta.length; i++) {
    const t = allForDelta[i], tp = allForDelta[i - 1];
    if (t < dayStart) continue;
    const dt = t - tp;
    if (dt <= 0 || dt > 1200) continue;
    const scale = 3600 / dt;
    const hp   = hpM.get(t)   ?? hpM.get(tp)   ?? 0;
    const hpP  = hpM.get(tp)  ?? hp;
    const hc   = hcM.get(t)   ?? hcM.get(tp)   ?? 0;
    const hcP  = hcM.get(tp)  ?? hc;
    const base  = baseM.get(t)  ?? baseM.get(tp)  ?? 0;
    const baseP = baseM.get(tp) ?? base;
    hpDelta.set(t, Math.max(0, Math.round((hp - hpP) * scale)));
    hcDelta.set(t, Math.max(0, Math.round((hc - hcP) * scale)));
    baseDelta.set(t, Math.max(0, Math.round((base - baseP) * scale)));
  }

  // Solar line: filter to daylight hours of selected day
  const dayLocalMidnight = new Date(localMidnight(curDay)); // local midnight
  const minSolTs = Math.floor((+dayLocalMidnight + 5 * 3600 * 1000) / 1000);
  const maxSolTs = Math.floor((+dayLocalMidnight + 22 * 3600 * 1000) / 1000);
  const solM = new Map();
  for (const [t, v] of vSol) {
    const ts = +t;
    if (ts < dayStart || ts > dayEnd) continue;
    solM.set(ts, Math.round(+v * 100) / 100);
  }

  // Injection delta map: ts → −W
  const injM2 = new Map(vInj.map(([t, v]) => [+t, +v]));
  const injTs2 = [...injM2.keys()].filter(t => t >= dayStart && t <= dayEnd).sort((a, b) => a - b);
  // include one prev-day point for first delta
  const injPrevTs = [...injM2.keys()].filter(t => t < dayStart);
  const injPrevT  = injPrevTs.length ? Math.max(...injPrevTs) : null;
  const injForDelta = injPrevT ? [injPrevT, ...injTs2] : injTs2;
  const injDelta = new Map();
  for (let i = 1; i < injForDelta.length; i++) {
    const t = injForDelta[i], tp = injForDelta[i - 1];
    if (t < dayStart) continue;
    const dt = t - tp;
    if (dt <= 0 || dt > 1200) continue;
    const delta = Math.max(0, Math.round(((injM2.get(t) ?? 0) - (injM2.get(tp) ?? 0)) * 3600 / dt));
    if (delta > 0) injDelta.set(t, -delta);
  }

  // Gas delta map for this day: ts → W (0 when off, positive when firing)
  const gasM = new Map(vGas.map(([t, v]) => [+t, +v]));
  const gasAllTs = [...gasM.keys()].sort((a, b) => a - b);
  const gasDelta = new Map();
  for (let i = 1; i < gasAllTs.length; i++) {
    const t = gasAllTs[i], tp = gasAllTs[i - 1];
    const dt = t - tp;
    if (dt <= 0 || dt > 1200) continue;
    if (t >= dayStart && t <= dayEnd)
      gasDelta.set(t, Math.max(0, Math.round((gasM.get(t) - gasM.get(tp)) * 3600 / dt * 1000)));
  }

  // Unified timeline: union of delta timestamps + solar + injection + gas timestamps
  const deltaTs = useBase ? [...baseDelta.keys()] : [...new Set([...hpDelta.keys(), ...hcDelta.keys()])];
  const allTs = [...new Set([...deltaTs, ...solM.keys(), ...injDelta.keys(), ...gasDelta.keys()])].sort((a, b) => a - b);

  const labels = [], pwHP = [], pwHC = [], pwBase = [], pwSolLine = [], pwInj = [], pwGas = [];
  for (const t of allTs) {
    labels.push(new Date(t * 1000).toLocaleTimeString('fr-FR', { timeZone:HOME_TZ, hour: '2-digit', minute: '2-digit' }));
    pwHP.push(hpDelta.has(t) ? hpDelta.get(t) : null);
    pwHC.push(hcDelta.has(t) ? hcDelta.get(t) : null);
    pwBase.push(baseDelta.has(t) ? baseDelta.get(t) : null);
    pwSolLine.push(solM.has(t) ? solM.get(t) : null);
    pwInj.push(injDelta.has(t) ? injDelta.get(t) : null);
    // Gas: 0 for non-gas timestamps when gas data exists → flat zero line between bursts
    pwGas.push(gasDelta.size > 0 ? (gasDelta.has(t) ? gasDelta.get(t) : 0) : null);
  }

  // Daily totals
  const kwhOf = arr => dailyDeltas(arr,1000)[curDay] ?? null;
  const hpD  = useBase ? null : kwhOf(vHP);
  const hcD  = useBase ? null : kwhOf(vHC);
  const baseD = useBase ? kwhOf(vBase) : null;
  const injD = kwhOf(vInj);
  const totD = useBase ? baseD : ((hpD !== null && hcD !== null) ? Math.round((hpD + hcD) * 10) / 10 : null);
  // Gas total for the day
  const gasD = dailyDeltas(vGas,1)[curDay] ?? null;

  document.getElementById('d-hp').innerHTML  = useBase
    ? (baseD !== null ? `${fmt(baseD, 1)}<span class="kvu"> kWh (BASE)</span>` : '—<span class="kvu"> kWh</span>')
    : fmt(hpD, 1) + '<span class="kvu"> kWh</span>';
  document.getElementById('d-hc').innerHTML  = useBase ? '—<span class="kvu"> kWh</span>' : fmt(hcD, 1) + '<span class="kvu"> kWh</span>';
  document.getElementById('d-tot').innerHTML = fmt(totD, 1) + '<span class="kvu"> kWh</span>';
  document.getElementById('d-inj').innerHTML = fmt(injD, 1) + '<span class="kvu"> kWh</span>';
  document.getElementById('d-gas').innerHTML = (gasD !== null ? fmt(gasD, 1) : '—') + '<span class="kvu"> kWh</span>';

  const hasSol = pwSolLine.some(v => v !== null && v > 0);
  const hasInj = injDelta.size > 0;
  const hasGas = gasDelta.size > 0;
  const datasets = [];
  if (!useBase) {
    datasets.push({ label: 'HP', data: pwHP, backgroundColor: C.hp + 'cc', stack: 'p', _unit: 'W' });
    datasets.push({ label: 'HC', data: pwHC, backgroundColor: C.hc + 'cc', stack: 'p', _unit: 'W' });
  } else {
    datasets.push({ label: 'BASE', data: pwBase, backgroundColor: C.base + 'cc', stack: 'p', _unit: 'W' });
  }
  if (hasInj) {
    datasets.push({ label: 'Injection', data: pwInj, backgroundColor: C.inj + 'bb', stack: 'p', _unit: 'W' });
  }
  if (hasSol) {
    datasets.push({
      label: 'Solaire', data: pwSolLine.map(v => v !== null ? Math.round(v * 1000) : null),
      type: 'line', stack: 'sol', borderColor: C.sol, borderWidth: 2,
      pointRadius: 0, tension: 0.3, fill: false, spanGaps: true, _unit: 'W',
    });
  }
  const scalesD = {
    x: { stacked: true, grid: { color: GC }, ticks: { color: TC, maxTicksLimit: 12, maxRotation: 0 } },
    y: { stacked: true, grid: { color: GC }, ticks: { color: TC, callback: v => Math.abs(v) >= 1000 ? (v/1000)+'kW' : v+'W' } },
  };
  if (hasGas) {
    datasets.push({
      label: 'Gaz', data: pwGas, type: 'line', stack: 'gas',
      borderColor: C.gas, borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: false, spanGaps: false, _unit: 'W',
    });
  }
  mkChart('chart-day', 'bar', labels, datasets, scalesD);
}

// ══════════════════════════════════════════════════════════════════
// MONTH
// ══════════════════════════════════════════════════════════════════
let curMonth = localDate().slice(0,7);

document.getElementById('m-prev').addEventListener('click', () => {
  const d = new Date(curMonth + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1);
  curMonth = d.toISOString().slice(0, 7);
  loadMonth();
});
document.getElementById('m-next').addEventListener('click', () => {
  const d = new Date(curMonth + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  if (d.toISOString().slice(0, 7) <= localDate().slice(0,7)) {
    curMonth = d.toISOString().slice(0, 7);
    loadMonth();
  }
});

async function loadMonth() {
  const requestedMonth=curMonth;
  const [y, mo] = curMonth.split('-');
  document.getElementById('m-label').textContent = `${FR_M[+mo - 1]} ${y}`;

  // Fetch from 1 day before the month for first-day delta
  const monthStart = curMonth + '-01';
  const fetchStart = dayISO(monthStart);
  const nextMonth = new Date(curMonth+'-01T12:00:00Z'); nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
  const fetchEnd = dayISO(nextMonth.toISOString().slice(0,10));
  const today = localDate();
  const capEnd = new Date(Math.min(Date.parse(fetchEnd),Date.now())).toISOString();

  const [vHP, vHC, vInj, vGas] = await Promise.all([
    vmR('sensor.westic1hp_value{entity_id="westic1hp"}', fetchStart, capEnd, 300),
    vmR('sensor.westic1hc_value{entity_id="westic1hc"}', fetchStart, capEnd, 300),
    vmR('sensor.westic1inj_value', fetchStart, capEnd, 300),
    vmR('sensor.gaz_en_kwh_value{db="home_assistant"}',  fetchStart, capEnd, 300),
  ]);

  if(requestedMonth!==curMonth)return;
  const dHP  = dailyDeltas(vHP,  1000);
  const dHC  = dailyDeltas(vHC,  1000);
  const dInj = dailyDeltas(vInj, 1000);
  const dGas = dailyDeltas(vGas, 1);   // already kWh

  const daysInMonth = new Date(+y, +mo, 0).getDate();
  const labels = [], hp = [], hc = [], inj = [], gas = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = `${y}-${mo}-${String(d).padStart(2, '0')}`;
    if (dt > today) break;
    labels.push(d);
    hp.push(dHP[dt]  ?? null);
    hc.push(dHC[dt]  ?? null);
    inj.push(dInj[dt] ?? null);
    gas.push(dGas[dt] ?? null);
  }

  const sum = arr => arr.some(v=>v!==null) ? arr.reduce((a,v)=>a+(v??0),0) : null;
  document.getElementById('m-hp').innerHTML  = fmt(sum(hp))  + '<span class="kvu"> kWh</span>';
  document.getElementById('m-hc').innerHTML  = fmt(sum(hc))  + '<span class="kvu"> kWh</span>';
  document.getElementById('m-tot').innerHTML = fmt(sum(hp) === null || sum(hc) === null ? null : sum(hp)+sum(hc)) + '<span class="kvu"> kWh</span>';
  document.getElementById('m-inj').innerHTML = fmt(sum(inj)) + '<span class="kvu"> kWh</span>';
  document.getElementById('m-gas').innerHTML = fmt(sum(gas)) + '<span class="kvu"> kWh</span>';

  mkChart('chart-month', 'bar', labels, [
    { label: 'HP',        data: hp,  backgroundColor: C.hp + 'cc', stack: 'e' },
    { label: 'HC',        data: hc,  backgroundColor: C.hc + 'cc', stack: 'e' },
    { label: 'Injection', data: inj, type: 'line', borderColor: C.inj, backgroundColor: C.inj + '20', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true },
    { label: 'Gaz',       data: gas, type: 'line', yAxisID: 'yr', borderColor: C.gas, borderWidth: 2, pointRadius: 2, tension: 0.3 },
  ], {
    x:  { stacked: true, grid: { color: GC }, ticks: { color: TC, autoSkip: false, maxRotation: 0 } },
    y:  { stacked: true, grid: { color: GC }, ticks: { color: TC },
          title: { display: true, text: 'Élec · Injection (kWh)', color: TC, font: { size: 10 } } },
    yr: { position: 'right', grid: { drawOnChartArea: false },
          ticks: { color: C.gas }, title: { display: true, text: 'Gaz (kWh)', color: C.gas, font: { size: 10 } } },
  });
}

// ══════════════════════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════════════════════
let histData = null, histMode = 'monthly', histYear = +localDate().slice(0,4);

document.getElementById('h-monthly').addEventListener('click', () => {
  histMode = 'monthly';
  document.getElementById('h-monthly').classList.add('on');
  document.getElementById('h-annual').classList.remove('on');
  document.getElementById('h-year-row').style.display = 'flex';
  renderHist();
});
document.getElementById('h-annual').addEventListener('click', () => {
  histMode = 'annual';
  document.getElementById('h-annual').classList.add('on');
  document.getElementById('h-monthly').classList.remove('on');
  document.getElementById('h-year-row').style.display = 'none';
  renderHist();
});

async function loadHistory() {

  const today = nowISO();
  const [vHPn, vHCn, vBase, vHPo, vHCo, vGas, vInj] = await Promise.all([
    vmR('sensor.westic1hp_value{entity_id="westic1hp"}', '2019-03-01', today, 86400),
    vmR('sensor.westic1hc_value{entity_id="westic1hc"}', '2019-03-01', today, 86400),
    vmR('elec_old_base',  '2016-10-01', '2019-04-30', 86400),
    vmR('elec_old_hp',    '2010-01-01', '2016-11-30', 86400),
    vmR('elec_old_hc',    '2010-01-01', '2016-11-30', 86400),
    vmR('sensor.gaz_en_kwh_value{db="home_assistant"}', '2016-01-01', today, 86400),
    vmR('sensor.westic1inj_value', '2019-03-01', today, 86400),
  ]);

  const mHPn  = monthlyDeltas(vHPn,  1000);
  const mHCn  = monthlyDeltas(vHCn,  1000);
  const mBase = monthlyDeltas(vBase, 1000);
  const mHPo  = monthlyDeltas(vHPo,  1000);
  const mHCo  = monthlyDeltas(vHCo,  1000);
  const mGas  = monthlyDeltas(vGas,  1);
  const mInj  = monthlyDeltas(vInj,  1000);

  const rows = [];
  const d = new Date('2016-01-01T00:00:00Z');
  const nowM = localDate().slice(0,7);
  while (d.toISOString().slice(0, 7) <= nowM) {
    const m = d.toISOString().slice(0, 7);
    let hp = null, hc = null, base = null;
    if (m >= '2019-04')      { hp = mHPn[m]  ?? null; hc = mHCn[m]  ?? null; }
    else if (m >= '2016-11') { base = mBase[m] ?? null; }
    else                     { hp = mHPo[m]  ?? null; hc = mHCo[m]  ?? null; }
    rows.push({ m, hp, base, hc, gas: mGas[m] ?? null, inj: mInj[m] ?? null });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }

  histData = rows;

  // Build year buttons
  const years = [...new Set(rows.map(r => r.m.slice(0, 4)))].sort();
  const yearRow = document.getElementById('h-year-row');
  yearRow.innerHTML = '';
  for (const y of years) {
    const btn = document.createElement('button');
    btn.className = 'htb' + (parseInt(y) === histYear ? ' on' : '');
    btn.textContent = y;
    btn.addEventListener('click', () => {
      histYear = parseInt(y);
      yearRow.querySelectorAll('.htb').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      renderHist();
    });
    yearRow.appendChild(btn);
  }
  // Scroll to current year button
  const activeBtn = yearRow.querySelector('.htb.on');
  if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', inline: 'center' });

  renderHist();
}

function renderHist() {
  if (!histData) return;

  if (histMode === 'monthly') {
    // Build all 12 months for selected year (null for future/missing)
    const byM = Object.fromEntries(histData.map(r => [r.m, r]));
    const today = localDate().slice(0,7);
    const data = [];
    for (let mo = 1; mo <= 12; mo++) {
      const key = `${histYear}-${String(mo).padStart(2, '0')}`;
      if (key > today) { data.push({ m: key, hp: null, hc: null, base: null, gas: null, inj: null }); }
      else             { data.push(byM[key] ?? { m: key, hp: null, hc: null, base: null, gas: null, inj: null }); }
    }
    const lbl = data.map(d => FR_M[parseInt(d.m.slice(5)) - 1].slice(0, 3));
    mkChart('chart-history', 'bar', lbl, [
      { label: 'HP',        data: data.map(d => d.hp),   backgroundColor: C.hp   + 'cc', stack: 'e' },
      { label: 'BASE',      data: data.map(d => d.base), backgroundColor: C.base + 'cc', stack: 'e' },
      { label: 'HC',        data: data.map(d => d.hc),   backgroundColor: C.hc   + 'cc', stack: 'e' },
      { label: 'Injection', data: data.map(d => d.inj), type: 'line', borderColor: C.inj, backgroundColor: C.inj + '20', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true },
      { label: 'Gaz',       data: data.map(d => d.gas), type: 'line', yAxisID: 'yr', borderColor: C.gas, borderWidth: 2, pointRadius: 0, tension: 0.3 },
    ], {
      x:  { stacked: true, grid: { color: GC }, ticks: { color: TC, maxTicksLimit: 18, maxRotation: 45 } },
      y:  { stacked: true, grid: { color: GC }, ticks: { color: TC, callback: v => v >= 1000 ? (v/1000)+'k' : v } },
      yr: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: C.gas, callback: v => v >= 1000 ? (v/1000)+'k' : v } },
    });

  } else {
    const byY = {};
    for (const d of histData) {
      const y = d.m.slice(0, 4);
      if (!byY[y]) byY[y] = { hp: null, base: null, hc: null, gas: null, inj: null };
      if (d.hp !== null) byY[y].hp = (byY[y].hp ?? 0) + d.hp;
      if (d.base !== null) byY[y].base = (byY[y].base ?? 0) + d.base;
      if (d.hc !== null) byY[y].hc = (byY[y].hc ?? 0) + d.hc;
      if (d.gas !== null) byY[y].gas = (byY[y].gas ?? 0) + d.gas;
      if (d.inj !== null) byY[y].inj = (byY[y].inj ?? 0) + d.inj;
    }
    const years = Object.keys(byY).sort();
    mkChart('chart-history', 'bar', years, [
      { label: 'HP',        data: years.map(y => byY[y].hp   ?? null), backgroundColor: C.hp   + 'cc', stack: 'e' },
      { label: 'BASE',      data: years.map(y => byY[y].base ?? null), backgroundColor: C.base + 'cc', stack: 'e' },
      { label: 'HC',        data: years.map(y => byY[y].hc   ?? null), backgroundColor: C.hc   + 'cc', stack: 'e' },
      { label: 'Injection', data: years.map(y => byY[y].inj  ?? null), type: 'line', borderColor: C.inj, backgroundColor: C.inj + '20', borderWidth: 2, pointRadius: 4, tension: 0.3, fill: true },
      { label: 'Gaz',       data: years.map(y => byY[y].gas  ?? null), type: 'line', yAxisID: 'yr', borderColor: C.gas, borderWidth: 2, pointRadius: 4, tension: 0.3 },
    ], {
      x:  { stacked: true, grid: { color: GC }, ticks: { color: TC } },
      y:  { stacked: true, grid: { color: GC }, ticks: { color: TC, callback: v => v >= 1000 ? (v/1000)+'k' : v } },
      yr: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: C.gas, callback: v => v >= 1000 ? (v/1000)+'k' : v } },
    });
  }
}

let currentResource='electric',currentView='detail',livePending=false,rollingPending=false;
let lastRolling=0,lastGas=0,viewVersion=0;
function numberHTML(value,unit,digits=2){return fmt(value,digits)+' <small>'+unit+'</small>';}
async function loadLive(){
 if(livePending)return;livePending=true;
 try{
  const [wes,envoy]=await Promise.all([fetchWES(),fetchEnvoy()]);
  const production=envoy?.wattsNow ?? null,grid=envoy?.gridActiveW ?? null;
  document.getElementById('n-house').innerHTML=numberHTML(production!==null&&grid!==null?(production+grid)/1000:null,'kW');
  document.getElementById('n-solar').innerHTML=numberHTML(production===null?null:production/1000,'kW');
  document.getElementById('n-grid').innerHTML=numberHTML(grid===null?null:Math.abs(grid)/1000,'kW');
  document.getElementById('n-grid-title').textContent=grid===null?'Échange avec le réseau':grid<0?'Surplus vers le réseau':'Achat au réseau';
  document.getElementById('n-grid-note').textContent=grid===null?'Mesure indisponible':grid<0?'Électricité injectée':'Électricité soutirée';
  document.getElementById('n-flow').textContent=grid===null?'↔':grid<0?'→':'←';
  document.getElementById('n-solar-note').textContent=grid!==null&&grid<0?'Production supérieure à la consommation':'Production instantanée';
  document.getElementById('n-tariff').textContent=wes.ptec ? (/creuse|^hc/i.test(wes.ptec)?'Heures creuses':'Heures pleines'):'Tarif indisponible';
  document.getElementById('n-phases').innerHTML=[1,2,3].map(i=>'<span>Phase '+i+' · '+fmt(wes['iinst'+i])+' A / '+fmt(wes['tension'+i])+' V</span>').join('');
  document.getElementById('n-indexes').innerHTML=[['HP',wes.hpleine],['HC',wes.hcreuse],['Injection',wes.injection]].map(([label,v])=>'<span>'+label+' · '+fmt(v==null?null:v/1000,3)+' kWh</span>').join('')+'<span>Soutirage apparent · '+fmt(wes.pap)+' VA</span>';
  const order=[3,0,2,1],names=['Eau chaude','Arrosage','Piscine','Compteur général'];
  document.getElementById('water-cards').innerHTML=order.map(i=>'<div class="vt-stat"><div class="vt-stat-top">'+names[i]+'</div><div class="vt-number">'+numberHTML(wes.water?.[i]==null?null:wes.water[i]/1000,'m³',3)+'</div><div class="vt-sub">'+fmt(wes.water?.[i])+' litres</div></div>').join('');
  const ok=wes.pap!==null&&wes.pap!==undefined&&production!==null;
  document.getElementById('live-status').textContent=ok?'Compteurs actualisés à '+new Date().toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit'}):'Collecte partiellement indisponible';
  document.querySelector('.vt-dot').classList.toggle('offline',!ok);
 }finally{livePending=false;}
}
const POWER_QUERY='last_over_time(sensor.westic1pap_value{entity_id="westic1pap",friendly_name="Puissance Apparente Instantanée"}[24h])';
const TARIFF_QUERY='last_over_time(sensor.wesheurecreuse_value[24h])';
async function loadRolling(){
 if(rollingPending)return;rollingPending=true;
 try{
  const end=Math.floor(Date.now()/60000)*60,start=end-86400;
  const [power,tariff]=await Promise.all([vmR(POWER_QUERY,new Date((start-86400)*1000).toISOString(),new Date(end*1000).toISOString(),60),vmR(TARIFF_QUERY,new Date((start-86400)*1000).toISOString(),new Date(end*1000).toISOString(),60)]);
  const tariffByTime=new Map(tariff.map(([t,v])=>[+t,+v]));
  const current=power.filter(([t])=>+t>=start),previous=power.filter(([t])=>+t<start);
  const series=(label,points,color,extra={})=>({label,data:points,borderColor:color,borderWidth:1.8,pointRadius:0,pointHitRadius:8,spanGaps:false,...extra});
  const xy=(t,v)=>({x:+t*1000,y:+v/1000});
  // The arrays include gaps explicitly: charts must not bridge absent samples.
  const byTime=new Map(current.map(([t,v])=>[+t,+v]));
  const previousByTime=new Map(previous.map(([t,v])=>[+t,+v]));
  const hp=[],hc=[],unknown=[],prev=[];
  for(let t=start;t<=end;t+=60){
   const value=byTime.has(t)?byTime.get(t)/1000:null,rate=tariffByTime.get(t);
   hp.push({x:t*1000,y:rate===0?value:null});hc.push({x:t*1000,y:rate===1?value:null});unknown.push({x:t*1000,y:rate!==0&&rate!==1?value:null});
   prev.push({x:t*1000,y:previousByTime.has(t-86400)?previousByTime.get(t-86400)/1000:null});
  }
  if(charts['chart-rolling'])charts['chart-rolling'].destroy();
  const datasets=[series('Veille',prev,TC,{borderDash:[5,4],borderWidth:1.2,hidden:!document.getElementById('compare-yesterday').checked}),series('Heures pleines',hp,C.hp),series('Heures creuses',hc,C.hc)];
  if(unknown.some(p=>p.y!==null))datasets.push(series('Tarif indisponible',unknown,C.base));
  charts['chart-rolling']=new Chart(document.getElementById('chart-rolling'),{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',axis:'x',intersect:false},plugins:{legend:{position:'bottom',labels:{color:TC,usePointStyle:true,boxWidth:8,padding:18}},tooltip:{callbacks:{title:items=>new Date(items[0].parsed.x).toLocaleString('fr-FR',{timeZone:HOME_TZ,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),label:c=>c.dataset.label+' : '+fmt(c.parsed.y,2)+' kVA'}}},scales:{x:{type:'linear',min:start*1000,max:end*1000,grid:{display:false},ticks:{color:TC,maxTicksLimit:7,maxRotation:0,callback:t=>new Date(t).toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit'})}},y:{beginAtZero:true,title:{display:true,text:'kVA',color:TC},grid:{color:GC},ticks:{color:TC,maxTicksLimit:6}}}}});
  const time=t=>new Date(t*1000).toLocaleString('fr-FR',{timeZone:HOME_TZ,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  document.getElementById('rolling-range').textContent=time(start)+' → '+time(end)+' · soutirage réseau';
  document.getElementById('rolling-peak').textContent=current.length?'Pic sur 24 h : '+fmt(Math.max(...current.map(p=>+p[1]))/1000,2)+' kVA':'Pas de données disponibles pour cette période';
  document.getElementById('rolling-count').textContent='Pas de 1 minute · valeurs conservées entre changements';
  lastRolling=Date.now();
 }finally{rollingPending=false;}
}
async function loadGas(){
 const end=nowISO(),start=dayISO(shiftDay(localDate(),-29));
 const values=await vmR('sensor.gaz_en_kwh_value{db="home_assistant"}',start,end,300);
 const days=dailyDeltas(values,1),keys=Object.keys(days).sort();
 await loadGasHours();
 document.getElementById('gas-today').innerHTML=numberHTML(days[localDate()]??null,'kWh',1);
 const segments=values.intervals||[],last=segments.at(-1);
 const recent=last&&Date.now()/1000-last.end<=600&&last.end-last.start<=600;
 document.getElementById('gas-power').innerHTML=numberHTML(recent?last.delta*3600/(last.end-last.start):null,'kW',1);
 document.getElementById('gas-note').textContent=recent?'Estimation entre les deux derniers relevés':'Pas assez de relevés récents pour une puissance fiable';
 if(charts['chart-gas'])charts['chart-gas'].destroy();
 charts['chart-gas']=new Chart(document.getElementById('chart-gas'),{type:'bar',data:{labels:keys.map(d=>d.slice(8)+'/'+d.slice(5,7)),datasets:[{label:'Gaz',data:keys.map(d=>days[d]),backgroundColor:C.gas+'bb',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.parsed.y,1)+' kWh'}}},scales:{x:{grid:{display:false},ticks:{color:TC,maxTicksLimit:10}},y:{beginAtZero:true,title:{display:true,text:'kWh',color:TC},grid:{color:GC},ticks:{color:TC}}}}});lastGas=Date.now();
}
async function showView(name){
 currentView=name;history.replaceState(null,'','#'+name);const revision=++viewVersion;
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
 document.querySelectorAll('#electric .pane').forEach(p=>p.classList.toggle('on',p.id==='pane-'+name));
 document.getElementById('view-loading').hidden=false;
 try{await ({now:loadNow,detail:loadDetail,rolling:loadRolling,today:loadToday,day:loadDay,month:loadMonth,history:loadHistory})[name]();}
 catch(e){reportRequest('vue-'+name,true);console.error('Échec du chargement de la vue',name);}
 finally{if(revision===viewVersion)document.getElementById('view-loading').hidden=true;}
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.querySelectorAll('[data-resource]').forEach(b=>b.addEventListener('click',()=>{
 currentResource=b.dataset.resource;
 document.querySelectorAll('[data-resource]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));
 document.querySelectorAll('[role=tabpanel]').forEach(p=>p.hidden=p.id!==currentResource);
 if(currentResource==='electric'){Object.values(charts).forEach(c=>c.resize());showView(currentView);}
 if(currentResource==='gas')loadGas().catch(()=>reportRequest('gaz',true));
 if(currentResource==='water'){loadLive();loadWater().catch(()=>reportRequest('eau',true));}
}));
document.getElementById('compare-yesterday').addEventListener('change',e=>{const c=charts['chart-rolling'];if(c){c.setDatasetVisibility(0,e.target.checked);c.update();}});
function tick(){
 if(document.hidden)return;
 loadLive();
 if(currentResource==='electric'&&currentView==='rolling'&&Date.now()-lastRolling>60000)loadRolling().catch(()=>reportRequest('courbe',true));
 if(currentResource==='electric'&&['today','day'].includes(currentView)&&(currentView==='today'||curDay===localDate())&&Date.now()-(dayBarsState[currentView].last||0)>60000)loadDayBars(currentView,currentView==='today'?localDate():curDay);
 if(currentResource==='electric'&&currentView==='now'&&Date.now()-lastNow>25000)loadNow().catch(()=>reportRequest('now',true));
 if(currentResource==='electric'&&currentView==='detail'&&detailDay===localDate()&&Date.now()-lastDetail>60000)loadDetail().catch(()=>reportRequest('detail',true));
 if(currentResource==='water'&&Date.now()-lastWater>60000)loadWater().catch(()=>reportRequest('eau',true));
 if(currentResource==='gas'&&Date.now()-lastGas>60000)loadGas().catch(()=>reportRequest('gaz',true));
}
setInterval(tick,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
loadLive();
// Initial detailed view starts after its configuration is initialized.

const WATER_METERS=[{id:4,name:'Compteur général',short:'Général',color:C.hc},{id:1,name:'Eau chaude',short:'Eau chaude',color:C.hp},{id:3,name:'Piscine',short:'Piscine',color:C.inj},{id:2,name:'Arrosage',short:'Arrosage',color:C.sol}];
let waterPending=false,lastWater=0,waterPeriod=7,waterSelected=localDate(),waterDaily={},waterToday=localDate();
// State counters are held between changes, but a missing boundary or reset is unknown.
function waterDailyUse(values,firstDay,lastDay,endTime){
 const points=values.filter(([t,v])=>Number.isFinite(+t)&&Number.isFinite(+v)).map(([t,v])=>[+t,+v]).sort((a,b)=>a[0]-b[0]);
 const result={};let idx=0;
 for(let day=firstDay;day<=lastDay;day=shiftDay(day,1)){
  const start=localMidnight(day)/1000,end=Math.min(localMidnight(shiftDay(day,1))/1000,endTime);
  if(end<=start){result[day]=null;continue;}
  while(idx+1<points.length&&points[idx+1][0]<=start)idx++;
  const baseline=points[idx];
  if(!baseline||baseline[0]>start||start-baseline[0]>300){result[day]=null;continue;}
  let j=idx,reset=false;
  while(j+1<points.length&&points[j+1][0]<=end){if(points[j+1][1]<points[j][1])reset=true;j++;}
  const last=points[j];
  result[day]=!reset&&last[0]>start&&end-last[0]<=300?last[1]-baseline[1]:null;
 }
 return result;
}
async function readWaterMeter(meter,firstDay,end){
 const query=`last_over_time(sensor.wesimpulsion${meter.id}_value{db="home_assistant",entity_id="wesimpulsion${meter.id}",unit_of_measurement="L"}[30d])`;
 const start=dayISO(firstDay);
 const [range,tail]=await Promise.all([getJSON('/vm/api/v1/query_range?'+new URLSearchParams({query,start,end,step:'300'})),getJSON('/vm/api/v1/query?'+new URLSearchParams({query,time:end}))]);
 const results=range.data.result||[];
 // A renamed sensor retains the same meter: take newer label series on overlaps.
 const ordered=results.filter(s=>s.values?.length).sort((a,b)=>a.values[0][0]-b.values[0][0]);
 const merged=new Map();for(const s of ordered)for(const [t,v]of s.values)merged.set(+t,+v);
 for(const s of tail.data.result||[])merged.set(+s.value[0],+s.value[1]);
 return [...merged].sort((a,b)=>a[0]-b[0]);
}
async function loadWater(){
 if(waterPending)return;waterPending=true;document.getElementById('water-loading').hidden=false;
 try{
  const today=localDate(),first=shiftDay(today,-29),end=nowISO();
  if(waterSelected===waterToday)waterSelected=today;waterToday=today;
  const result=await Promise.allSettled(WATER_METERS.map(m=>readWaterMeter(m,shiftDay(first,-1),end)));
  waterHourEnd=Date.parse(end)/1000;
  WATER_METERS.forEach((m,i)=>{waterHourPoints[m.id]=result[i].status==='fulfilled'?result[i].value:[];});
  WATER_METERS.forEach((m,i)=>{waterDaily[m.id]=result[i].status==='fulfilled'?waterDailyUse(result[i].value,first,today,Date.parse(end)/1000):{};});
  const picker=document.getElementById('water-day');picker.min=first;picker.max=today;picker.value=waterSelected;
  renderWater();lastWater=Date.now();
 }finally{waterPending=false;document.getElementById('water-loading').hidden=true;}
}
function renderWaterCards(){
 renderWaterHours();
 const today=localDate();
 const dayName=new Date(waterSelected+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:HOME_TZ,weekday:'long',day:'numeric',month:'long'});
 document.getElementById('water-day-caption').textContent=dayName+(waterSelected===today?' · journée en cours':' · journée complète');
 document.getElementById('water-daily-cards').innerHTML=WATER_METERS.map(m=>{
  const value=waterDaily[m.id]?.[waterSelected];
  return '<div class="vt-stat"><div class="vt-stat-top">'+m.name+'</div><div class="vt-number">'+numberHTML(value,'L',1)+'</div><div class="vt-sub">'+(value==null?'Données insuffisantes':fmt(value/1000,3)+' m³'+(waterSelected===today?' · depuis minuit':''))+'</div></div>';
 }).join('');
}
function renderWater(){
 renderWaterCards();
 const today=localDate(),days=Array.from({length:waterPeriod},(_,i)=>shiftDay(today,i-waterPeriod+1));
 const existing=charts['chart-water'];
 const hidden=WATER_METERS.map((m,i)=>existing?!existing.isDatasetVisible(i):i!==0);
 if(existing)existing.destroy();
 charts['chart-water']=new Chart(document.getElementById('chart-water'),{type:'bar',data:{labels:days.map(d=>d.slice(8)+'/'+d.slice(5,7)),datasets:WATER_METERS.map((m,i)=>({label:m.short,data:days.map(d=>waterDaily[m.id]?.[d]??null),backgroundColor:m.color+'cc',borderRadius:4,maxBarThickness:36,hidden:hidden[i]}))},options:{responsive:true,maintainAspectRatio:false,animation:false,onClick:(event,elements)=>{if(elements.length){waterSelected=days[elements[0].index];document.getElementById('water-day').value=waterSelected;renderWaterCards();}},plugins:{legend:{position:'bottom',labels:{color:TC,usePointStyle:true,padding:16,boxWidth:8}},tooltip:{callbacks:{title:items=>days[items[0].dataIndex]+(days[items[0].dataIndex]===today?' · partiel':''),label:c=>c.dataset.label+' : '+fmt(c.parsed.y,1)+' L'}}},scales:{x:{grid:{display:false},ticks:{color:TC,maxTicksLimit:15,maxRotation:0}},y:{beginAtZero:true,title:{display:true,text:'Litres',color:TC},grid:{color:GC},ticks:{color:TC}}}}});
 document.getElementById('water-day-rows').innerHTML=[...days].reverse().map(day=>'<tr><th scope="row"><button type="button" data-water-day="'+day+'">'+day.slice(8)+'/'+day.slice(5,7)+(day===today?' · en cours':'')+'</button></th>'+WATER_METERS.map(m=>'<td>'+fmt(waterDaily[m.id]?.[day],1)+'</td>').join('')+'</tr>').join('');
 document.querySelectorAll('[data-water-period]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.waterPeriod===waterPeriod)));
}
document.getElementById('water-day').addEventListener('change',e=>{if(e.target.value>=e.target.min&&e.target.value<=e.target.max){waterSelected=e.target.value;renderWaterCards();}});
document.querySelectorAll('[data-water-period]').forEach(b=>b.addEventListener('click',()=>{waterPeriod=+b.dataset.waterPeriod;renderWater();}));
document.getElementById('water-day-rows').addEventListener('click',e=>{const b=e.target.closest('[data-water-day]');if(b){waterSelected=b.dataset.waterDay;document.getElementById('water-day').value=waterSelected;renderWaterCards();}});

const DETAIL_DEVICES=[{"id": "ar_cui_cave_vin_energie", "name": "Cave à vin", "unit": "kWh"}, {"id": "smart_plug_mini_energie_20", "name": "Lave-linge", "unit": "kWh"}, {"id": "ar_cui_m_cafe_energie", "name": "Machine à café", "unit": "kWh"}, {"id": "ar_cui_pr_congel_energie", "name": "Congélateur", "unit": "kWh"}, {"id": "ar_cui_pr_robot_petrin_ml_energie", "name": "Robot pâtissier", "unit": "kWh"}, {"id": "shelly_1pm_mini_gen4_energie_10", "name": "Éclairage · bureau", "unit": "kWh"}, {"id": "bur_pr_hifi_energie", "name": "Hi-fi · bureau", "unit": "kWh"}, {"id": "bur_pr_info_energie", "name": "Informatique · bureau", "unit": "kWh"}, {"id": "shelly_1pm_mini_gen4_energie_11", "name": "Éclairage · chambre Alex", "unit": "kWh"}, {"id": "ch_par_pr_droite_lit_energie", "name": "Prise droite du lit · parents", "unit": "kWh"}, {"id": "shelly_1pm_mini_gen4_energie_12", "name": "Éclairage · chambre Val", "unit": "kWh"}, {"id": "shelly_1pm_mini_gen4_energie_14", "name": "Éclairage · cuisine", "unit": "kWh"}, {"id": "shelly_1pm_mini_gen4_energie_13", "name": "Éclairage · table cuisine", "unit": "kWh"}, {"id": "cui_pr_dyson_energie", "name": "Dyson", "unit": "kWh"}, {"id": "cui_pr_frigo_energie", "name": "Réfrigérateur", "unit": "kWh"}, {"id": "cui_pr_gp_bouil_energie", "name": "Bouilloire", "unit": "kWh"}, {"id": "cui_pr_rice_cooker_energie", "name": "Cuiseur à riz", "unit": "kWh"}, {"id": "cui_pr_lv_energie", "name": "Lave-vaisselle", "unit": "kWh"}, {"id": "cui_pr_micro_onde_energie", "name": "Micro-ondes", "unit": "kWh"}, {"id": "etg_bur_pr_tv_energie", "name": "Télévision · bureau étage", "unit": "kWh"}, {"id": "eth_sdb_pr_radiateur_energie", "name": "Radiateur · salle de bains", "unit": "kWh"}, {"id": "gar_pr_chargeurs_energie_2", "name": "Chargeurs · garage", "unit": "kWh"}, {"id": "gar_pr_chaudiere_energie", "name": "Chaudière", "unit": "kWh"}, {"id": "gar_pr_chauffe_eau_energie", "name": "Chauffe-eau", "unit": "kWh"}, {"id": "gar_pr_evier1_energie", "name": "Évier 1 · garage", "unit": "kWh"}, {"id": "gar_pr_evier2_energie", "name": "Évier 2 · garage", "unit": "kWh"}, {"id": "gar_pr_info_energie", "name": "Informatique · garage", "unit": "kWh"}, {"id": "gar_pr_pompe_drain_energie", "name": "Pompe de drainage", "unit": "kWh"}, {"id": "gar_pr_pompe_relevage_energie", "name": "Pompe de relevage", "unit": "kWh"}, {"id": "smart_energy_monitor_consumption_1", "name": "Piscine", "unit": "Wh"}, {"id": "shelly_1pm_mini_gen4_energie_17", "name": "Éclairage · canapé", "unit": "kWh"}, {"id": "sal_pr_hifi_energie", "name": "Hi-fi · salon", "unit": "kWh"}, {"id": "sal_pr_tv_energie", "name": "Télévision · salon", "unit": "kWh"}, {"id": "smart_energy_monitor_consumption_4", "name": "Borne de recharge", "unit": "Wh"}, {"id": "smart_energy_monitor_25032457422352740703c4e7ae152176_consumption_1", "name": "Plaque à induction", "unit": "Wh"}, {"id": "smart_energy_monitor_25032457422352740703c4e7ae152176_consumption_2", "name": "Four", "unit": "Wh"}, {"id": "smart_energy_monitor_25032457422352740703c4e7ae152176_consumption_4", "name": "Climatisation · coin jour", "unit": "Wh"}, {"id": "smart_energy_monitor_consumption_2", "name": "Climatisation · nuit", "unit": "Wh"}, {"id": "smart_plug_mini_energie_25", "name": "Climatisation mobile · garage", "unit": "kWh"}];
const DETAIL_PRICES={hp:0.1727,hc:0.1376,export:0.1};

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
 document.getElementById('detail-totals').innerHTML=[...costs.map(c=>[c.source.name,c.kwh,c.cost]),['Production solaire',t.solar,null],['Solaire consommé',t.self,null],['Bilan net réseau',t.imported!==null&&t.inj!==null?t.imported-t.inj:null,cost]].map(([n,v,c])=>'<tr><th scope="row">'+escapeHTML(n)+'</th><td>'+fmt(v,2)+'</td><td>'+fmt(c,2)+(c===null?'':' €')+'</td></tr>').join('');
 const first=tariffHistory.length?Date.parse(tariffHistory[0].observedAt)/1000:Infinity;
 document.getElementById('detail-prices').textContent='Tarifs synchronisés : '+energySourceConfig.filter(s=>s.kind!=='solar').map(s=>s.name+' '+(s.price===null?'non renseigné':fmt(s.price,4)+' €/kWh')).join(' · ')+'. Hors abonnement. '+(localMidnight(day)/1000<first?'Tarifs historiques inconnus avant le '+(Number.isFinite(first)?new Date(first*1000).toLocaleDateString('fr-FR'):'début du suivi')+' : premier tarif connu appliqué.':'Changements de tarifs pris en compte depuis leur observation.');
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

const POWER_SOURCES=[{"energy": "ar_cui_cave_vin_energie", "power": "ar_cui_cave_vin_puissance", "area": "Arrière-Cuisine"}, {"energy": "smart_plug_mini_energie_20", "power": "smart_plug_mini_puissance_20", "area": "Arrière-Cuisine"}, {"energy": "ar_cui_m_cafe_energie", "power": "ar_cui_m_cafe_puissance", "area": "Arrière-Cuisine"}, {"energy": "ar_cui_pr_congel_energie", "power": "ar_cui_pr_congel_puissance", "area": "Arrière-Cuisine"}, {"energy": "ar_cui_pr_robot_petrin_ml_energie", "power": "ar_cui_pr_robot_petrin_ml_puissance", "area": "Arrière-Cuisine"}, {"energy": "shelly_1pm_mini_gen4_energie_10", "power": "shelly_1pm_mini_gen4_puissance_10", "area": "Bureau"}, {"energy": "bur_pr_hifi_energie", "power": "bur_pr_hifi_puissance", "area": "Bureau"}, {"energy": "bur_pr_info_energie", "power": "bur_pr_info_puissance", "area": "Bureau"}, {"energy": "shelly_1pm_mini_gen4_energie_11", "power": "shelly_1pm_mini_gen4_puissance_11", "area": "Chambre Alex"}, {"energy": "ch_par_pr_droite_lit_energie", "power": "ch_par_pr_droite_lit_puissance", "area": "Chambre Parents"}, {"energy": "shelly_1pm_mini_gen4_energie_12", "power": "shelly_1pm_mini_gen4_puissance_12", "area": "Chambre Valentine"}, {"energy": "shelly_1pm_mini_gen4_energie_14", "power": "shelly_1pm_mini_gen4_puissance_14", "area": "Cuisine"}, {"energy": "shelly_1pm_mini_gen4_energie_13", "power": "shelly_1pm_mini_gen4_puissance_13", "area": "Cuisine"}, {"energy": "cui_pr_dyson_energie", "power": "cui_pr_dyson_puissance", "area": "Cuisine"}, {"energy": "cui_pr_frigo_energie", "power": "cui_pr_frigo_puissance", "area": "Cuisine"}, {"energy": "cui_pr_gp_bouil_energie", "power": "cui_pr_gp_bouil_puissance", "area": "Cuisine"}, {"energy": "cui_pr_rice_cooker_energie", "power": "cui_pr_rice_cooker_puissance", "area": "Cuisine"}, {"energy": "cui_pr_lv_energie", "power": "cui_pr_lv_puissance", "area": "Cuisine"}, {"energy": "cui_pr_micro_onde_energie", "power": "cui_pr_micro_onde_puissance", "area": "Cuisine"}, {"energy": "etg_bur_pr_tv_energie", "power": "etg_bur_pr_tv_puissance", "area": "Bureau Etage"}, {"energy": "eth_sdb_pr_radiateur_energie", "power": "eth_sdb_pr_radiateur_puissance", "area": "Salle de Bain Etage"}, {"energy": "gar_pr_chargeurs_energie_2", "power": "gar_pr_chargeurs_puissance_2", "area": "Garage"}, {"energy": "gar_pr_chaudiere_energie", "power": "gar_pr_chaudiere_puissance", "area": "Garage"}, {"energy": "gar_pr_chauffe_eau_energie", "power": "gar_pr_chauffe_eau_puissance", "area": "Garage"}, {"energy": "gar_pr_evier1_energie", "power": "gar_pr_evier1_puissance", "area": "Garage"}, {"energy": "gar_pr_evier2_energie", "power": "gar_pr_evier2_puissance", "area": "Garage"}, {"energy": "gar_pr_info_energie", "power": "gar_pr_info_puissance", "area": "Garage"}, {"energy": "gar_pr_pompe_drain_energie", "power": "gar_pr_pompe_drain_puissance", "area": "Garage"}, {"energy": "gar_pr_pompe_relevage_energie", "power": "gar_pr_pompe_relevage_puissance", "area": "Garage"}, {"energy": "smart_energy_monitor_consumption_1", "power": "smart_energy_monitor_power_1", "area": "Garage"}, {"energy": "shelly_1pm_mini_gen4_energie_17", "power": "shelly_1pm_mini_gen4_puissance_17", "area": "Salon"}, {"energy": "sal_pr_hifi_energie", "power": "sal_pr_hifi_puissance", "area": "Salon"}, {"energy": "sal_pr_tv_energie", "power": "sal_pr_tv_puissance", "area": "Salon"}, {"energy": "smart_energy_monitor_consumption_4", "power": "smart_energy_monitor_power_4", "area": "Garage"}, {"energy": "smart_energy_monitor_25032457422352740703c4e7ae152176_consumption_1", "power": "smart_energy_monitor_25032457422352740703c4e7ae152176_power_1", "area": "Garage"}, {"energy": "smart_energy_monitor_25032457422352740703c4e7ae152176_consumption_2", "power": "smart_energy_monitor_25032457422352740703c4e7ae152176_power_2", "area": "Garage"}, {"energy": "smart_energy_monitor_25032457422352740703c4e7ae152176_consumption_4", "power": "smart_energy_monitor_25032457422352740703c4e7ae152176_power_4", "area": "Garage"}, {"energy": "smart_energy_monitor_consumption_2", "power": "smart_energy_monitor_power_2", "area": "Garage"}, {"energy": "smart_plug_mini_energie_25", "power": "smart_plug_mini_puissance_25", "area": "Garage"}]
;
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

let dailyFlowReady=false,dailyFlowTotals=null;
function clearDailyFlow(){dailyFlowReady=false;dailyFlowTotals=null;document.getElementById('daily-flow-diagram').innerHTML='<p class="vt-caption">Chargement de la journée…</p>';document.getElementById('daily-flow-caption').textContent='Consommation des appareils suivis · kWh';for(const id of ['daily-flow-total','daily-flow-count','daily-flow-leader'])document.getElementById(id).textContent='—';}
function renderDailyFlow(){
 dailyFlowReady=true;
 const area=document.getElementById('daily-flow-area').value;
 const rows=detailRows.map(d=>({...d,area:POWER_SOURCES.find(s=>s.energy===d.id)?.area||'Sans pièce attribuée',watts:d.total})).filter(d=>!area||d.area===area),known=rows.filter(d=>d.watts!==null),layout=powerLayout(rows.map(d=>({...d}))),leader=[...known].filter(d=>d.watts>0).sort((a,b)=>b.watts-a.watts)[0];
 document.getElementById('daily-flow-caption').textContent=document.getElementById('detail-caption').textContent+' · kWh';
 document.getElementById('daily-flow-total').textContent=fmt(known.length?layout.total:null,3)+' kWh';document.getElementById('daily-flow-count').textContent=known.length+' / '+rows.length;document.getElementById('daily-flow-leader').textContent=leader?leader.name+' · '+fmt(leader.watts,3)+' kWh':known.length?'Aucune consommation':'—';
 const sourceModel=!area?dailySourceModel(rows,dailyFlowTotals):null;
 document.getElementById('daily-source-note').textContent=area?'Vue filtrée : les sources ne sont pas attribuées à une pièce particulière.':sourceModel?'Réseau et solaire alimentent la maison ; le surplus solaire repart vers le réseau. Non réparti : différence entre le total maison et les appareils suivis, y compris les relevés manquants.':"Le bilan global est incomplet ou les appareils dépassent le total maison : seules leurs consommations sont représentées.";
 document.getElementById('daily-flow-diagram').innerHTML=sourceModel?renderDailySourceFlow(sourceModel):layout.total?renderFlowSVG(layout,'kWh','data-daily-area'):'<p class="vt-sub">'+(known.length?'Aucune consommation positive mesurée pour cette sélection.':'Données insuffisantes pour cette journée et cette sélection.')+'</p>';
}
const dailyFlowArea=document.getElementById('daily-flow-area');
for(const area of [...new Set(POWER_SOURCES.map(d=>d.area))].sort((a,b)=>a.localeCompare(b,'fr'))){const opt=document.createElement('option');opt.value=area;opt.textContent=area;dailyFlowArea.append(opt);}
dailyFlowArea.addEventListener('change',()=>{if(dailyFlowReady)renderDailyFlow();});
function selectDailyFlowArea(e){const g=e.target.closest('[data-daily-area]');if(g&&dailyFlowReady){dailyFlowArea.value=g.dataset.dailyArea;renderDailyFlow();dailyFlowArea.focus();}}
document.getElementById('daily-flow-diagram').addEventListener('click',selectDailyFlowArea);
document.getElementById('daily-flow-diagram').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectDailyFlowArea(e);}});
// Configuration sync opens the initial view.

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
 const t=model.totals,layout=powerLayout(model.rows,t.solar+t.imported),{groups,scale,height,rootHeight}=layout,rootY=80;
 if(!scale)return '<p class="vt-sub">Aucune consommation à répartir.</p>';
 const palette=energyPalette(),areas=[...new Set(POWER_SOURCES.map(d=>d.area))].sort();let defs='',links='',nodes='',seq=0;
 const label=(x,y,name,value,anchor='start')=>'<text class="flow-label" x="'+x+'" y="'+y+'" text-anchor="'+anchor+'">'+escapeHTML(name)+'</text><text class="flow-value" x="'+x+'" y="'+(y+19)+'" text-anchor="'+anchor+'">'+fmt(value,3)+' kWh</text>';
 const rect=(x,y,h,color)=>h>0?'<rect x="'+x+'" y="'+y+'" width="12" height="'+h+'" fill="'+color+'"/>':'';
 const ribbon=(x1,y1,x2,y2,h,from,to,title)=>{if(h<=0)return '';const id='daily-source-gradient-'+seq++;defs+='<linearGradient id="'+id+'"><stop stop-color="'+from+'"/><stop offset="1" stop-color="'+to+'"/></linearGradient>';return '<path class="flow-link" tabindex="0" aria-label="'+escapeHTML(title)+'" fill="url(#'+id+')" d="M'+x1+','+y1+' C'+((x1+x2)/2)+','+y1+' '+((x1+x2)/2)+','+y2+' '+x2+','+y2+' L'+x2+','+(y2+h)+' C'+((x1+x2)/2)+','+(y2+h)+' '+((x1+x2)/2)+','+(y1+h)+' '+x1+','+(y1+h)+' Z"><title>'+escapeHTML(title)+'</title></path>';};
 const houseX=325,areaX=670,deviceX=995,gridHeight=t.imported*scale,solarHeight=t.solar*scale,injHeight=t.inj*scale;
 const sourceTop=80,gridY=sourceTop,solarY=gridY+gridHeight+65;
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

// Attribute counter increments to their observation interval. Gaps and resets stay unknown.
function resourceHourBuckets(intervals,day,end){
 const start=localMidnight(day)/1000,next=localMidnight(shiftDay(day,1))/1000;
 return Array.from({length:Math.round((next-start)/3600)},(_,i)=>{
  const a=start+i*3600,b=Math.min(a+3600,end);if(b<=a)return null;
  let value=0,covered=0;
  for(const s of intervals){const duration=s.end-s.start,overlap=Math.max(0,Math.min(b,s.end)-Math.max(a,s.start));
   if(overlap&&duration>0&&duration<=600&&Number.isFinite(s.delta)&&s.delta>=0){value+=s.delta*overlap/duration;covered+=overlap;}
  }
  return covered>=b-a-1?value:null;
 });
}
function resourceIntervals(points){return points.slice(1).map(([t,v],i)=>({start:+points[i][0],end:+t,delta:+v-Number(points[i][1])}));}
function renderResourceHours(kind,day,values,label,unit,color,previous=[]){
 const start=localMidnight(day),labels=values.map((_,i)=>new Date(start+i*3600000).toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}));
 const prevDay=shiftDay(day,-1),prevStart=localMidnight(prevDay),clock=t=>new Date(t).toLocaleTimeString('fr-FR',{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit'}),byClock=new Map(previous.map((v,i)=>[clock(prevStart+i*3600000),v]));
 const id='chart-'+kind+'-hours';charts[id]?.destroy();
 charts[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:[{label,data:values,backgroundColor:color+'dc',borderColor:color,borderWidth:0,borderRadius:4,maxBarThickness:34,barPercentage:.94,categoryPercentage:.84},{type:'line',label:label+' · veille',data:values.map((_,i)=>byClock.get(clock(start+i*3600000))??null),borderColor:TC,borderDash:[5,4],borderWidth:1.5,pointRadius:0,spanGaps:false,hidden:!document.getElementById(kind+'-hours-compare').checked}]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{color:TC,usePointStyle:true,boxWidth:8,padding:18}},tooltip:{callbacks:{title:items=>labels[items[0].dataIndex]+' · tranche d’une heure',label:c=>c.dataset.label+' : '+fmt(c.parsed.y,2)+' '+unit}}},scales:{x:{grid:{display:false},ticks:{color:TC,maxRotation:0,maxTicksLimit:12,callback:(v,i)=>labels[i].split(' ')[0]}},y:{beginAtZero:true,title:{display:true,text:unit,color:TC},grid:{color:GC},ticks:{color:TC}}}}});
 document.getElementById(kind+'-hours-caption').textContent=new Date(day+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:HOME_TZ,dateStyle:'long'})+' · '+label+' · '+unit+' par heure';
 const elapsed=Math.max(0,Math.min(values.length,Math.ceil((Date.now()-start)/3600000))),missing=values.slice(0,elapsed).filter(v=>v===null).length;
 const known=values.slice(0,elapsed).filter(v=>v!==null),peak=known.length?Math.max(...known):null,peakIndex=peak===null||peak===0?-1:values.indexOf(peak);
 document.getElementById(kind+'-hours-summary').textContent='Total '+(missing?'connu ':'')+': '+fmt(known.length?known.reduce((a,b)=>a+b,0):null,2)+' '+unit+' · Heure de pointe : '+(peakIndex>=0?labels[peakIndex].split(' ')[0]+' ('+fmt(peak,2)+' '+unit+')':'—');
 document.getElementById(kind+'-hours-note').textContent=(day===localDate()?'Heure en cours partielle. ':'')+'Répartition entre les relevés, à 5 minutes près.'+(missing?' '+missing+' tranche(s) sans relevés suffisants : aucune consommation n’est inventée.':'');
}
let waterHourPoints={},waterHourEnd=0,gasHourDay=localDate(),gasHourToday=localDate(),gasHourRevision=0;
function renderWaterHours(){
 const meter=WATER_METERS.find(m=>String(m.id)===document.getElementById('water-hour-meter').value)||WATER_METERS[0];
 renderResourceHours('water',waterSelected,resourceHourBuckets(resourceIntervals(waterHourPoints[meter.id]||[]),waterSelected,waterHourEnd),meter.name,'L',meter.color,resourceHourBuckets(resourceIntervals(waterHourPoints[meter.id]||[]),shiftDay(waterSelected,-1),waterHourEnd));
}
async function loadGasHours(){
 const today=localDate();if(gasHourDay===gasHourToday)gasHourDay=today;gasHourToday=today;
 const picker=document.getElementById('gas-day');picker.max=today;picker.min=shiftDay(today,-29);picker.value=gasHourDay;
 const day=gasHourDay,revision=++gasHourRevision,end=Math.min(Date.now()/1000,localMidnight(shiftDay(day,1))/1000);
 document.getElementById('gas-hours-caption').textContent='Chargement des relevés…';
 try{
 const points=await vmR('last_over_time(sensor.gaz_en_kwh_value{db="home_assistant"}[30d])',dayISO(shiftDay(day,-1)),new Date(end*1000).toISOString(),300);
 if(revision!==gasHourRevision)return;
 renderResourceHours('gas',day,resourceHourBuckets(points.intervals||[],day,end),'Gaz','kWh',C.gas,resourceHourBuckets(points.intervals||[],shiftDay(day,-1),end));
 }catch(e){if(revision===gasHourRevision){charts['chart-gas-hours']?.destroy();delete charts['chart-gas-hours'];document.getElementById('gas-hours-caption').textContent='Relevés indisponibles pour cette journée.';}throw e;}
}
document.getElementById('water-hour-meter').addEventListener('change',renderWaterHours);
document.getElementById('gas-day').addEventListener('change',e=>{if(e.target.value>=e.target.min&&e.target.value<=e.target.max){gasHourDay=e.target.value;loadGasHours().catch(()=>reportRequest('gaz-horaires',true));}});

for(const kind of ['water','gas'])document.getElementById(kind+'-hours-compare').addEventListener('change',e=>{const chart=charts['chart-'+kind+'-hours'];if(chart){chart.setDatasetVisibility(1,e.target.checked);chart.update();}});

let energySourceConfig=[{id:'westic1hp',kind:'import',name:'Heures pleines',price:0.1727},{id:'westic1hc',kind:'import',name:'Heures creuses',price:0.1376},{id:'westic1inj',kind:'export',name:'Injection',price:0.1},{id:'energy_production_today_filtre',kind:'solar',name:'Solaire',price:null}],tariffHistory=[],configVersion='',configPending=false;
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
  if(changed){DETAIL_DEVICES.splice(0,DETAIL_DEVICES.length,...config.devices.map(d=>({id:d.id,name:d.name})));POWER_SOURCES.splice(0,POWER_SOURCES.length,...config.devices.map(d=>({energy:d.id,power:d.power,area:d.area})));energySourceConfig=config.sources;tariffHistory=config.tariffHistory||[];configVersion=config.version;updateAreaOptions();}
  const stale=Date.now()-Date.parse(config.syncedAt)>180000;
  document.getElementById('energy-config-status').textContent=stale?'Configuration Home Assistant ancienne : dernière synchronisation '+new Date(config.syncedAt).toLocaleString('fr-FR'):'Configuration synchronisée avec Home Assistant · '+config.devices.length+' appareils';return changed;
 }catch{document.getElementById('energy-config-status').textContent='Configuration Home Assistant inaccessible · dernière configuration connue utilisée';return false;}finally{configPending=false;}
}
function tariffAt(key,time){let record=null;for(const h of tariffHistory){if(Date.parse(h.observedAt)/1000<=time)record=h;else break;}return record?record.prices[key]??null:tariffHistory[0]?.prices[key]??energySourceConfig.find(s=>s.kind+':'+s.id===key)?.price??null;}
function tariffMean(key,start,end){const cuts=[start,...tariffHistory.map(h=>Date.parse(h.observedAt)/1000).filter(t=>t>start&&t<end),end];let cost=0;for(let i=1;i<cuts.length;i++){const p=tariffAt(key,cuts[i-1]);if(p===null)return null;cost+=p*(cuts[i]-cuts[i-1]);}return cost/(end-start);}
function sourceCost(source,values,day,end){let total=0;for(let i=0;i<values.length;i++){const start=localMidnight(day)/1000+i*3600,stop=Math.min(start+3600,end);if(stop<=start)continue;if(values[i]===null)return null;const price=tariffMean(source.kind+':'+source.id,start,stop);if(price===null)return null;total+=values[i]*price;}return source.kind==='export'?-total:total;}
(async()=>{await syncEnergyConfig();const view=location.hash.slice(1);showView(['now','detail','today','day','rolling','month','history'].includes(view)?view:'detail');})();
setInterval(async()=>{if(!document.hidden&&await syncEnergyConfig()){if(currentResource==='electric')showView(currentView);}},60000);

const themePicker=document.getElementById('energy-theme');themePicker.value=activeTheme;
themePicker.addEventListener('change',()=>{
 if(!Object.hasOwn(ENERGY_THEMES,themePicker.value))return;activeTheme=themePicker.value;try{localStorage.setItem('maison-vt-theme',activeTheme);}catch{}
 Object.assign(C,ENERGY_THEMES[activeTheme].colors);detailPalette.splice(0,detailPalette.length,...energyPalette());
 WATER_METERS.forEach(m=>{m.color=({4:C.hc,1:C.hp,3:C.inj,2:C.sol})[m.id];});paintEnergyTheme();
 if(nowDevices.length)renderNow();if(dailyFlowReady)renderDailyFlow();
 if(currentResource==='electric')showView(currentView);else if(currentResource==='water')renderWater();else loadGas().catch(()=>reportRequest('gaz',true));
});
