"""Private mobility API. Standard library only; SQLite is included in Docker backups."""
import os, json, sqlite3, re, math, time, threading
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from urllib.request import urlopen
from urllib.parse import urlencode, urlparse, parse_qs
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
STATE=Path(os.environ.get('STATE_DIR','/state'))
VM=os.environ.get('VM_URL','http://10.1.2.20:8428')
TZ=ZoneInfo('Europe/Paris')
VEHICLES={'bmw':'BMW X3 30e','mini':'Mini Aceman','unknown':'Non attribuée'}
COUNTER='smart_energy_monitor_mconsume_4'
POWER='smart_energy_monitor_power_4'
RATE='wesheurecreuse'
MILEAGE='allee_x3_30e_xdrive_vehicle_mileage'
MINI_MILEAGE='allee_aceman_se_vehicle_mileage'
CACHE={}; LOCK=threading.Lock()
def connect():
 c=sqlite3.connect(STATE/'mobility.sqlite',timeout=10);c.row_factory=sqlite3.Row;return c

def init():
 STATE.mkdir(parents=True,exist_ok=True)
 with connect() as c:
  c.execute('CREATE TABLE IF NOT EXISTS fuel(id TEXT PRIMARY KEY,date TEXT NOT NULL,cents INTEGER NOT NULL,litres REAL,odometer REAL,note TEXT NOT NULL)')
  c.execute('CREATE TABLE IF NOT EXISTS assignments(session TEXT PRIMARY KEY,vehicle TEXT NOT NULL)')
 os.chmod(STATE/'mobility.sqlite',0o600)

def vm(path,params):
 with urlopen(VM+'/api/v1/'+path+'?'+urlencode(params),timeout=40) as f:d=json.load(f)
 if d.get('status')!='success':raise RuntimeError('Metrics unavailable')
 return d['data']['result']

def bounds(month):
 if not re.fullmatch(r'20\d\d-(0[1-9]|1[0-2])',month):raise ValueError('Mois invalide')
 start=datetime.strptime(month,'%Y-%m').replace(tzinfo=TZ)
 if start.year<2020 or start>datetime.now(TZ).replace(day=1,hour=0,minute=0,second=0,microsecond=0):raise ValueError('Mois hors période')
 end=(start.replace(day=28)+timedelta(days=4)).replace(day=1)
 return int(start.timestamp()),min(int(end.timestamp()),int(time.time())//300*300)

def series(start,end):
 ids=[COUNTER,POWER,RATE,MILEAGE,MINI_MILEAGE]
 result={i:{} for i in ids}
 # Seven days of context keep session identifiers stable across a month boundary.
 for entity in ids:
  lookback='30m' if entity==POWER else '30d'
  query='max(last_over_time(sensor.'+entity+'_value{db="home_assistant"}['+lookback+']))'
  for row in vm('query_range',{'query':query,'start':start-7*86400-300,'end':end,'step':300}):
   result[entity]={int(t):float(v) for t,v in row['values'] if math.isfinite(float(v))}
 return result

def price_at(config,kind,t):
 key='import:westic1'+kind
 history=config.get('tariffHistory',[])
 records=[h for h in history if datetime.fromisoformat(h['observedAt'].replace('Z','+00:00')).timestamp()<=t]
 if records:return records[-1]['prices'].get(key),False
 source=next((s for s in config.get('sources',[]) if s['id']=='westic1'+kind),{})
 return source.get('price'),True

def analyse(data,start,end,config):
 counter=data[COUNTER];power=data[POWER];rate=data[RATE]
 buckets=[];resets=0;unpriced=0;estimated=False;standby=0
 for t in range(start-7*86400,end+1,300):
  if t not in counter or t-300 not in counter:continue
  delta=counter[t]-counter[t-300]
  if delta<0:
   if t>start:resets+=1
   continue
  if delta==0:continue
  kwh=delta/1000
  if kwh<0.02 and max(power.get(t,0),power.get(t-300,0))<200:
   if t>start:standby+=kwh
   continue
  if kwh>4: # More than 48 kW on this domestic circuit: do not invent a session.
   if t>start:unpriced+=kwh
   continue
  tariff=rate.get(t-300)
  price,fallback=price_at(config,'hc' if tariff==1 else 'hp',t-300) if tariff in (0,1) else (None,False)
  if t>start:estimated|=fallback
  buckets.append({'t':t,'kwh':kwh,'cost':kwh*price if isinstance(price,(int,float)) else None,'tariff':'hc' if tariff==1 else 'hp' if tariff==0 else 'unknown'})
 sessions=[]
 for b in buckets:
  if not sessions or b['t']-sessions[-1]['end']>1800:
   sessions.append({'id':str(b['t']-300),'start':b['t']-300,'end':b['t'],'buckets':[]})
  s=sessions[-1];s['end']=b['t'];s['buckets'].append(b)
 output=[]
 for s in sessions:
  selected=[b for b in s.pop('buckets') if start<b['t']<=end]
  if not selected:continue
  s.update(kwh=sum(b['kwh'] for b in selected),cost=None if any(b['cost'] is None for b in selected) else sum(b['cost'] for b in selected),buckets=selected,partial=s['start']<start or end-s['end']<1800,peak=max((v/1000 for t,v in power.items() if s['start']<=t<=s['end']),default=None))
  output.append(s)
 mileage=data[MILEAGE];a=mileage.get(start);b=mileage.get(end)
 mini=data[MINI_MILEAGE];ma=mini.get(start);mb=mini.get(end)
 return {'missingIntervals':sum(t not in counter or t-300 not in counter for t in range(start+300,end+1,300)),'hasData':any(start<=t<=end for t in counter),'sessions':output,'standbyKwh':standby,'resets':resets,'excludedKwh':unpriced,'historicalTariffEstimated':estimated,'bmwKm':b-a if a is not None and b is not None and b>=a else None,'miniKm':mb-ma if ma is not None and mb is not None and mb>=ma else None,'odometers':{'bmw':b,'mini':mb},'power':[[t,v/1000] for t,v in sorted(power.items()) if max(start,end-86400)<=t<=end]}

def summary(month):
 start,end=bounds(month)
 with LOCK:
  cached=CACHE.get(month)
  if not cached or time.time()-cached[0]>180:
   config=json.loads(Path('/output/energy-config.json').read_text())
   raw=analyse(series(start,end),start,end,config);CACHE[month]=(time.time(),raw)
  raw=json.loads(json.dumps(CACHE[month][1]))
 with connect() as c:
  assignments=dict(c.execute('SELECT session,vehicle FROM assignments').fetchall())
  fuel=[dict(r) for r in c.execute('SELECT * FROM fuel WHERE substr(date,1,7)=? ORDER BY date DESC,id',(month,))]
 days={};totals={v:{'kwh':0,'cost':0,'sessions':0,'unpriced':0} for v in VEHICLES}
 for s in raw['sessions']:
  vehicle=assignments.get(s['id'],'unknown');s['vehicle']=vehicle
  tot=totals[vehicle];tot['kwh']+=s['kwh'];tot['sessions']+=1
  if s['cost'] is None:tot['unpriced']+=s['kwh']
  else:tot['cost']+=s['cost']
  for b in s.pop('buckets'):
   day=datetime.fromtimestamp(b['t']-1,TZ).strftime('%Y-%m-%d')
   days.setdefault(day,{v:0 for v in VEHICLES})[vehicle]+=b['kwh']
 raw.update(month=month,days=days,totals=totals,fuel=fuel,updatedAt=CACHE[month][0],fuelCost=sum(f['cents'] for f in fuel)/100,vehicles=VEHICLES)
 return raw

def validate_fuel(d):
 date=str(d.get('date',''));parsed=datetime.strptime(date,'%Y-%m-%d').date()
 if parsed>datetime.now(TZ).date() or parsed.year<2000:raise ValueError('Date invalide')
 cost=float(d.get('cost',0))
 if not math.isfinite(cost) or not 0<cost<=1000:raise ValueError('Montant attendu entre 0 et 1 000 €')
 def optional(k,maximum):
  x=d.get(k)
  if x in (None,''):return None
  x=float(x)
  if not math.isfinite(x) or not 0<x<=maximum:raise ValueError('Valeur incorrecte : '+k)
  return x
 note=str(d.get('note','')).strip()
 if len(note)>200:raise ValueError('Note trop longue')
 ident=str(d.get('id',''))
 if not re.fullmatch(r'[a-f0-9]{32}',ident):raise ValueError('Identifiant invalide')
 return (ident,date,round(cost*100),optional('litres',150),optional('odometer',2000000),note)

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def respond(self,status,d):
  body=json.dumps(d,ensure_ascii=False,allow_nan=False).encode();self.send_response(status)
  self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def handle_request(self):
  origin=self.headers.get('Origin')
  if origin and urlparse(origin).netloc!=self.headers.get('Host'):return self.respond(403,{'error':'Origine refusée'})
  if self.command!='GET' and (self.headers.get('Content-Type')!='application/json' or self.headers.get('X-Mobility-Request')!='1'):return self.respond(403,{'error':'Requête refusée'})
  path=urlparse(self.path)
  try:
   if self.command=='GET' and path.path=='/summary':return self.respond(200,summary(parse_qs(path.query).get('month',[''])[0]))
   if self.command=='GET' and path.path=='/export':
    with connect() as c:return self.respond(200,{'schema':1,'fuel':[dict(r) for r in c.execute('SELECT * FROM fuel')],'assignments':[dict(r) for r in c.execute('SELECT * FROM assignments')]})
   length=int(self.headers.get('Content-Length',0))
   if not 0<length<=4096:raise ValueError('Taille incorrecte')
   d=json.loads(self.rfile.read(length))
   with connect() as c:
    if self.command=='POST' and path.path=='/fuel':
     row=validate_fuel(d);c.execute('INSERT INTO fuel VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,cents=excluded.cents,litres=excluded.litres,odometer=excluded.odometer,note=excluded.note',row)
    elif self.command=='POST' and path.path=='/assignment':
     ident=str(d.get('session',''));vehicle=d.get('vehicle')
     if not re.fullmatch(r'\d{10}',ident) or vehicle not in VEHICLES:raise ValueError('Attribution incorrecte')
     c.execute('INSERT INTO assignments VALUES (?,?) ON CONFLICT(session) DO UPDATE SET vehicle=excluded.vehicle',(ident,vehicle))
    elif self.command=='DELETE' and path.path=='/fuel':
     c.execute('DELETE FROM fuel WHERE id=?',(str(d.get('id','')),))
    else:return self.respond(404,{'error':'Introuvable'})
   return self.respond(200,{'ok':True})
  except (ValueError,KeyError,TypeError):return self.respond(400,{'error':'Saisie invalide : vérifier la date et les montants.'})
  except Exception as e:
   print('Mobility API:',type(e).__name__,flush=True);return self.respond(503,{'error':'Données indisponibles, réessayer dans un instant.'})
 do_GET=handle_request;do_POST=handle_request;do_DELETE=handle_request

def start():
 init();server=ThreadingHTTPServer(('0.0.0.0',8081),Handler)
 threading.Thread(target=server.serve_forever,daemon=True).start()
