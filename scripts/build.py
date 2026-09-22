from pathlib import Path
import re
from urllib.parse import quote
import os
os.chdir(Path(__file__).resolve().parents[1])
Path("dist").mkdir(exist_ok=True)
old=Path('src/legacy.html').read_text()
mock='<style>'+Path('src/base-theme.css').read_text()+'</style>'
css=old.split('<style>')[1].split('</style>')[0]+'\n'+mock.split('<style>')[1].split('</style>')[0]
css+='''
:root{color-scheme:light dark;--hp:#d69b4d;--hc:#5b7f92;--gas:#b47453;--sol:#668b52;--inj:#418576;--bg:light-dark(#f6f7f4,#151b19);--bg2:light-dark(#ffffff,#202824);--bg3:light-dark(#f6f7f4,#26312a);--border:light-dark(#e4e9e2,#37423c);--t1:light-dark(#202e28,#e6ede7);--t2:light-dark(#65716a,#a4b3aa);--t3:light-dark(#65716a,#a4b3aa)}
body{background:var(--bg)}#vt-design{max-width:1280px;margin:auto;border-radius:0;overflow:visible}#vt-design main{max-width:1180px;margin:auto}#vt-design .vt-head{position:static}#vt-design h1{font-size:30px;letter-spacing:-1.1px;font-weight:500;line-height:1.2;margin:6px 0 8px}#vt-design h2.panel-title{font-size:17px;letter-spacing:-.3px;font-weight:500;margin:0 0 5px}#vt-design .vt-stat-top{font-size:13px}#vt-design .vt-head .vt-caption{text-align:right}#vt-design .vt-main{padding-top:28px}.view-controls{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 18px}.view-button{border:1px solid transparent;background:transparent;padding:8px 13px;border-radius:7px;color:var(--t2);font:inherit;cursor:pointer}.view-button[aria-pressed=true]{background:var(--bg2);border-color:var(--border);color:var(--t1)}.compare-control{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--t2);min-height:35px;cursor:pointer}.compare-control input{accent-color:var(--vt-accent);width:16px;height:16px}.power-plot{height:290px;position:relative}.chart-note{margin:10px 0!important}.site-foot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;border-top:1px solid var(--border);padding-top:18px;margin-top:28px;color:var(--t2);font-size:11px}.gas-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}#view-loading{padding:5px 0 12px}#data-status{border:1px solid #b47453;border-radius:9px;padding:12px 16px;margin-bottom:18px;font-size:13px}.vt-dot.offline{background:#b47453!important}#vt-design .card{border-radius:14px;padding:22px}#vt-design .kv{border-radius:11px;padding:16px}#vt-design .kvv{font-size:25px;font-weight:500}#vt-design .kvl{font-size:12px}#vt-design .htb.on{background:var(--vt-accent);color:var(--bg2)}#vt-design .mnb,#vt-design .htb{min-height:35px}#vt-design .ct{font-size:12px;text-transform:none;letter-spacing:0}#vt-design .vt-brand-mark{font-size:24px}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--vt-accent);outline-offset:3px}
@media(max-width:600px){#vt-design .vt-head{padding:16px 18px}#vt-design .vt-intro{margin-bottom:16px}#vt-design h1{font-size:26px}#vt-design .vt-chart-head{gap:10px}.power-plot{height:245px}#vt-design .card{padding:15px}#vt-design .view-controls{gap:3px}.view-button{padding:8px 9px}.compare-control{min-height:44px}.site-foot{margin-top:20px}}
@media(max-width:420px){.gas-stats{grid-template-columns:1fr!important}#vt-design .vt-stat-top{font-size:12px}#vt-design .vt-number{font-size:27px}#vt-design .vt-main{padding-top:19px}}
'''
css+='\n'+Path('src/water.css').read_text()+'\n'+Path('src/detail.css').read_text()+'\n'+Path('src/now.css').read_text()+'\n'+Path('src/theme.css').read_text()+'\n'+Path('src/day-bars.css').read_text()
start=old.index('<!-- TODAY -->');end=old.index('\n</main>',start)
panes=old[start:end]
# Keep old gas nodes for legacy calculations, but present gas in its own view.
panes=re.sub(r'(<div class="kv")(?=><div class="kvl">Gaz)',r'\1 hidden',panes)
panes=re.sub(r'<span class="li"><span class="ld"[^>]*></span>Gaz(?: \(axe droit\))?</span>','',panes)
# Refresh only the Today and Day chart panels.
for view in ['today','day']:
    pattern=r'<div class="ct">Puissance consommée · Production</div>.*?<div style="position:relative;height:240px"><canvas id="chart-'+view+r'"></canvas></div>'
    panel='<div class="day-bar-controls"><div><h2 class="panel-title">Le rythme de la journée</h2><div class="vt-toggle" role="group" aria-label="Résolution '+view+'"><button data-bar-view="'+view+'" data-bar-step="3600" aria-pressed="true">Par heure</button><button data-bar-view="'+view+'" data-bar-step="300" aria-pressed="false">5 minutes</button></div></div><label class="compare-control"><input type="checkbox" id="'+view+'-bar-compare" checked> Comparer à la veille</label></div><div class="day-bar-plot"><canvas id="chart-'+view+'" role="img" aria-label="Consommations en barres verticales avec comparaison à la veille"></canvas></div><p class="vt-caption day-bar-note" id="'+view+'-bar-note"></p>'
    # Keep replacements scoped to their own section.
    startpane=panes.index('<section id="pane-'+view+'"');endpane=panes.index('</section>',startpane)
    section=panes[startpane:endpane];section=re.sub(pattern,panel,section,flags=re.S).replace('<div class="kvl">Total</div>','<div class="kvl">Réseau acheté</div>')
    panes=panes[:startpane]+section+panes[endpane:]
shell=Path('src/new-shell.html').read_text().replace('<!--EXISTING_PANES-->',panes).replace('role="status" hidden></div>','role="status" style="display:none"></div>')
js=old.split('<script>')[1].split('</script>')[0]
a=js.index('// ── Tabs');b=js.index('// ── Chart factory',a);js=js[:a]+js[b:]
a=js.index('let liveTimer');b=js.index('async function loadToday()',a);js=js[:a]+js[b:]
js=js.replace("const C   = { hp:'#d97706', hc:'#2563eb', gas:'#dc2626', sol:'#16a34a', inj:'#0ea5e9', base:'#7c3aed' };", "const C = {hp:'#d69b4d',hc:'#5b7f92',gas:'#b47453',sol:'#668b52',inj:'#418576',base:'#847199'};")
js=js.replace('function mkChart(id, type, labels, datasets, scalesExtra) {', "function mkChart(id, type, labels, datasets, scalesExtra) {\n  datasets = datasets.filter(d => d.label !== 'Gaz');\n  if(scalesExtra) delete scalesExtra.yr;\n  datasets.forEach(d=>{if(d.type !== 'line'){d.borderRadius=3;d.maxBarThickness=40;}});")
# Prevent rapid date/month navigation from applying a stale response to a new date.
js=js.replace('async function loadDay() {','async function loadDay() {\n  const requestedDay=curDay;')
js=js.replace("  const useBase = curDay < '2019-04-01';", "  if(requestedDay!==curDay)return;\n  const useBase = curDay < '2019-04-01';")
js=js.replace('async function loadMonth() {','async function loadMonth() {\n  const requestedMonth=curMonth;')
js=js.replace('  const dHP  = dailyDeltas', '  if(requestedMonth!==curMonth)return;\n  const dHP  = dailyDeltas')
# Clock in the location's timezone, not the visiting browser's timezone.
js=js.replace("{ hour: '2-digit', minute: '2-digit', second: '2-digit' }", "{timeZone:HOME_TZ,hour:'2-digit',minute:'2-digit',second:'2-digit'}")
js+='\n'+Path('src/new-runtime.js').read_text()+'\n'+Path('src/detail-config.js').read_text()+'\n'+Path('src/detail-runtime.js').read_text()+'\nconst POWER_SOURCES='+Path('src/power-sources.json').read_text()+';\n'+Path('src/now-runtime.js').read_text()+'\n'+Path('src/daily-flow-runtime.js').read_text()+'\n'+Path('src/daily-source-flow.js').read_text()+'\n'+Path('src/day-bars.js').read_text()+'\n'+Path('src/resource-hours.js').read_text()+'\n'+Path('src/dynamic-config.js').read_text()
js=js.replace('async function loadToday() {','async function legacyLoadToday() {').replace('async function loadDay() {','async function legacyLoadDay() {')
js=Path('src/themes.js').read_text()+'\n'+js+'\n'+Path('src/theme-controls.js').read_text()
js=js.replace("const C = {hp:'#d69b4d',hc:'#5b7f92',gas:'#b47453',sol:'#668b52',inj:'#418576',base:'#847199'};","const C = {...ENERGY_THEMES[activeTheme].colors};")
favicon='<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,'+quote(Path('src/favicon.svg').read_text(),safe='')+'">'
result='<!DOCTYPE html>\n<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maison VT · Énergie</title>'+favicon+'<style>'+css+'</style></head><body>'+shell+'\n<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script><script>\n'+js+'\n</script></body></html>'
Path('dist/index.html').write_text(result)
Path('dist/app.js').write_text(js)
