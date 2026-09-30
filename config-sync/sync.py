import json, os, time, hashlib, urllib.request, urllib.parse
from pathlib import Path
from datetime import datetime, timezone
INPUT=Path(os.environ.get('HA_STORAGE','/ha'))
OUTPUT=Path(os.environ.get('OUTPUT_DIR','/output'))
STATE=Path(os.environ.get('STATE_DIR','/state'))
VM=os.environ.get('VM_URL','http://10.1.2.20:8428')
def read(name): return json.loads((INPUT/name).read_text())['data']
def sensor_id(value):
    if isinstance(value,str) and value.startswith('sensor.') and all(c.isalnum() or c=='_' for c in value[7:]): return value[7:]
    return None
def price(item,export=False):
    suffix='_export' if export else ''
    n=item.get('number_energy_price'+suffix)
    if isinstance(n,(int,float)): return float(n)
    entity=item.get('entity_energy_price'+suffix)
    eid=sensor_id(entity)
    if not eid:return None
    query='last_over_time({db="home_assistant",__name__='+json.dumps('sensor.'+eid+'_value')+'}[30d])'
    url=VM+'/api/v1/query?'+urllib.parse.urlencode({'query':query})
    data=json.load(urllib.request.urlopen(url,timeout=10))
    rows=data.get('data',{}).get('result',[])
    if len(rows)!=1:return None
    unit=rows[0]['metric'].get('unit_of_measurement','')
    if unit not in ('EUR/kWh','€/kWh'):return None
    return float(rows[0]['value'][1])
def build_config():
    conf=read('energy');entities={x['entity_id']:x for x in read('core.entity_registry')['entities']};devices={x['id']:x for x in read('core.device_registry')['devices']};areas={x['id']:x['name'] for x in read('core.area_registry')['areas']}
    def name(entity,fallback):
        e=entities.get(entity,{})
        if e.get('name'):return e['name']
        original=e.get('original_name') or fallback
        device=devices.get(e.get('device_id'),{})
        prefix=device.get('name_by_user') or device.get('name')
        if e.get('has_entity_name') and prefix:return prefix+' '+original
        return original
    out=[]
    for d in conf.get('device_consumption',[]):
        entity=d.get('stat_consumption');eid=sensor_id(entity)
        if not eid:continue
        power=sensor_id(d.get('stat_rate'));e=entities.get(d.get('stat_rate'),{}) or entities.get(entity,{})
        dev=devices.get(e.get('device_id'),{});area=areas.get(e.get('area_id') or dev.get('area_id'),'Sans pièce attribuée')
        label=d.get('name') or name(entity,eid)
        out.append({'id':eid,'name':label.removesuffix(' Énergie'),'power':power,'area':area})
    sources=[]
    for s in conf.get('energy_sources',[]):
        if s.get('type')=='solar':
            eid=sensor_id(s.get('stat_energy_from'))
            if eid:sources.append({'id':eid,'kind':'solar','name':name(s['stat_energy_from'],'Solaire'),'price':None})
        if s.get('type')=='grid':
            for field,kind,exp in [('stat_energy_from','import',False),('stat_energy_to','export',True)]:
                eid=sensor_id(s.get(field))
                if eid:sources.append({'id':eid,'kind':kind,'name':name(s[field],eid),'price':price(s,exp)})
    if not sources:raise ValueError('No electrical energy sources in Home Assistant')
    # Do not double count a source configured more than once.
    return {'devices':list({d['id']:d for d in out}.values()),'sources':list({(s['kind'],s['id']):s for s in sources}.values())}
def atomic(path,data):
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,allow_nan=False));tmp.chmod(0o644);os.replace(tmp,path)
def apply_electricity_contract(config,history,now):
    contract=json.loads(Path(__file__).with_name('electricity-contract.json').read_text())
    config['electricityContract']=contract
    effective=contract['effectiveFrom']
    if datetime.fromisoformat(now)<datetime.fromisoformat(effective):return
    applicable={k:v for k,v in contract['prices'].items() if any(s['kind']+':'+s['id']==k for s in config['sources'])}
    if not applicable:return
    # Keep the original observations before the documented effective date.
    if not any(h.get('contractEffectiveFrom')==effective for h in history):
        before=[h for h in history if datetime.fromisoformat(h['observedAt'])<=datetime.fromisoformat(effective)]
        prices=dict(before[-1]['prices'] if before else {s['kind']+':'+s['id']:s['price'] for s in config['sources'] if s['kind']!='solar'})
        history.append({'observedAt':effective,'prices':{**prices,**applicable},'contractEffectiveFrom':effective})
    for h in history:
        if datetime.fromisoformat(h['observedAt'])>=datetime.fromisoformat(effective):h['prices'].update(applicable)
    history.sort(key=lambda h:datetime.fromisoformat(h['observedAt']))
    for source in config['sources']:
        key=source['kind']+':'+source['id']
        if key in applicable:source['price']=applicable[key]

def sync_once():
    config=build_config();now=datetime.now(timezone.utc).isoformat();STATE.mkdir(parents=True,exist_ok=True);OUTPUT.mkdir(parents=True,exist_ok=True)
    p=STATE/'tariffs.json';history=json.loads(p.read_text()) if p.exists() else []
    apply_electricity_contract(config,history,now)
    prices={s['kind']+':'+s['id']:s['price'] for s in config['sources'] if s['kind']!='solar'}
    if not history or history[-1]['prices']!=prices:
        history.append({'observedAt':now,'prices':prices});atomic(p,history)
    atomic(p,history)
    data={**config,'tariffHistory':history};version=hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
    atomic(OUTPUT/'energy-config.json',{'schema':1,'version':version,'syncedAt':now,**data})
if __name__=='__main__':
    if os.environ.get('MOBILITY_ENABLED')=='1':
        import mobility_server
        mobility_server.start()
    while True:
        try:sync_once();print('Configuration synchronized',flush=True)
        except Exception as e:print('Synchronization failed: '+type(e).__name__+'; previous configuration preserved',flush=True)
        time.sleep(60)
