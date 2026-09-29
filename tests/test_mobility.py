import sys,unittest, tempfile,os,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('mobility',Path(__file__).resolve().parents[1]/'config-sync/mobility_server.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MobilityTests(unittest.TestCase):
 def test_tariff_boundary_and_reset(self):
  start=1790000100;end=start+1200
  data={m.COUNTER:{start:10000,start+300:11000,start+600:12000,start+900:10,start+1200:1010},m.POWER:{start:12000},m.RATE:{start:0,start+300:1,start+900:0},m.MILEAGE:{start:100,end:140},m.MINI_MILEAGE:{end:500}}
  conf={'sources':[{'id':'westic1hp','price':.2},{'id':'westic1hc','price':.1}]}
  d=m.analyse(data,start,end,conf)
  self.assertEqual(d['resets'],1);self.assertAlmostEqual(sum(s['kwh'] for s in d['sessions']),3);self.assertAlmostEqual(sum(s['cost'] for s in d['sessions']),.5);self.assertEqual(d['bmwKm'],40);self.assertIsNone(d['miniKm'])
 def test_unknown_tariff_not_zero(self):
  start=1790000100;d={m.COUNTER:{start:0,start+300:1000},m.POWER:{},m.RATE:{},m.MILEAGE:{},m.MINI_MILEAGE:{}}
  r=m.analyse(d,start,start+300,{})
  self.assertIsNone(r['sessions'][0]['cost'])
 def test_daily_kilometres_missing_reset_partial_and_dst(self):
  from datetime import datetime,timedelta
  day=datetime(2026,10,25,tzinfo=m.TZ)
  a=int(day.timestamp());b=int((day+timedelta(days=1)).timestamp());end=b+3600
  self.assertEqual(b-a,25*3600)
  data={m.MILEAGE:{a:1000,b:1123,end:1133},m.MINI_MILEAGE:{a+300:500,b:550,end:550}}
  result=m.daily_distances(data,a,end)
  self.assertEqual(result['2026-10-25']['bmw'],123)
  self.assertIsNone(result['2026-10-25']['mini'])
  self.assertEqual(result['2026-10-26'],{'bmw':10,'mini':0})
  data[m.MILEAGE][a+600]=900
  self.assertIsNone(m.daily_distances(data,a,end)['2026-10-25']['bmw'])
 def test_fuel_validation(self):
  base={'id':'a'*32,'date':'2026-09-01','cost':'56.23','litres':'30.5'}
  self.assertEqual(m.validate_fuel(base)[2],5623)
  for v in ['NaN','-1','Infinity','1001']:
   with self.assertRaises(ValueError):m.validate_fuel(dict(base,cost=v))
 def test_persistence_and_idempotence(self):
  with tempfile.TemporaryDirectory() as p:
   m.STATE=Path(p);m.init();row=m.validate_fuel({'id':'b'*32,'date':'2026-09-01','cost':60})
   for _ in range(2):
    with m.connect() as c:c.execute('INSERT INTO fuel VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET cents=excluded.cents',row)
   with m.connect() as c:self.assertEqual(c.execute('select count(*) from fuel').fetchone()[0],1);self.assertEqual(c.execute('pragma quick_check').fetchone()[0],'ok')
 def test_api_roundtrip(self):
  import threading,json,urllib.request,urllib.error
  with tempfile.TemporaryDirectory() as p:
   m.STATE=Path(p);m.init();server=m.ThreadingHTTPServer(('127.0.0.1',0),m.Handler)
   threading.Thread(target=server.serve_forever,daemon=True).start()
   base='http://127.0.0.1:'+str(server.server_address[1])
   def req(path,method='GET',data=None,auth=True):
    headers={'Content-Type':'application/json'}
    if auth:headers['X-Mobility-Request']='1'
    return urllib.request.urlopen(urllib.request.Request(base+path,method=method,headers=headers,data=json.dumps(data).encode() if data else None))
   try:
    with self.assertRaises(urllib.error.HTTPError) as error:req('/fuel','POST',{'id':'c'*32},auth=False)
    self.assertEqual(error.exception.code,403);error.exception.close()
    fuel={'id':'c'*32,'date':'2026-09-01','cost':70,'litres':40,'note':'Test privé'}
    for _ in range(2):self.assertEqual(req('/fuel','POST',fuel).status,200)
    data=json.load(req('/export'));self.assertEqual(len(data['fuel']),1);self.assertEqual(data['fuel'][0]['cents'],7000)
    fuel['cost']=71;req('/fuel','POST',fuel);self.assertEqual(json.load(req('/export'))['fuel'][0]['cents'],7100)
    req('/assignment','POST',{'session':'1790000100','vehicle':'mini'})
    self.assertEqual(json.load(req('/export'))['assignments'][0]['vehicle'],'mini')
    req('/fuel','DELETE',{'id':fuel['id']});self.assertEqual(json.load(req('/export'))['fuel'],[])
   finally:server.shutdown();server.server_close()
if __name__=='__main__':unittest.main()
