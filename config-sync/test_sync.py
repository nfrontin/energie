import unittest,tempfile,json,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('sync',Path(__file__).with_name('sync.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class SyncTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();r=Path(self.tmp.name);m.INPUT=r/'ha';m.INPUT.mkdir();m.OUTPUT=r/'out';m.STATE=r/'state'
  self.write('core.entity_registry',{'entities':[{'entity_id':'sensor.socket_energy','device_id':'dev','original_name':'Prise Énergie'},{'entity_id':'sensor.socket_power','device_id':'dev'}]});self.write('core.device_registry',{'devices':[{'id':'dev','area_id':'room'}]});self.write('core.area_registry',{'areas':[{'id':'room','name':'Cuisine'}]})
  self.conf={'device_consumption':[{'stat_consumption':'sensor.socket_energy','stat_rate':'sensor.socket_power'}],'energy_sources':[{'type':'grid','stat_energy_from':'sensor.import','number_energy_price':0.2,'stat_energy_to':'sensor.export','number_energy_price_export':0.1},{'type':'solar','stat_energy_from':'sensor.pv'}]};self.write('energy',self.conf)
 def tearDown(self):self.tmp.cleanup()
 def write(self,n,d):(m.INPUT/n).write_text(json.dumps({'data':d}))
 def test_devices_prices_and_safe_output(self):
  m.sync_once();a=json.loads((m.OUTPUT/'energy-config.json').read_text());self.assertEqual(a['devices'][0]['area'],'Cuisine');self.assertEqual(a['devices'][0]['name'],'Prise');self.assertEqual(len(a['sources']),3)
  self.conf['device_consumption'].append({'stat_consumption':'sensor.new_socket','name':'Nouvelle prise'});self.conf['energy_sources'][0]['number_energy_price']=0.3;self.write('energy',self.conf);m.sync_once();b=json.loads((m.OUTPUT/'energy-config.json').read_text());self.assertEqual(len(b['devices']),2);self.assertIsNone(b['devices'][1]['power']);self.assertEqual(len(b['tariffHistory']),2);self.assertEqual(b['tariffHistory'][0]['prices']['import:import'],0.2);self.assertEqual(b['tariffHistory'][1]['prices']['import:import'],0.3)
  m.sync_once();c=json.loads((m.OUTPUT/'energy-config.json').read_text());self.assertEqual(c['version'],b['version']);self.assertEqual(len(c['tariffHistory']),2);self.assertNotIn('device_id',str(c));self.assertNotIn('core.entity_registry',str(c))
 def test_failed_read_preserves_last_good_file(self):
  m.sync_once();p=m.OUTPUT/'energy-config.json';before=p.read_bytes();(m.INPUT/'energy').write_text('{broken')
  with self.assertRaises(json.JSONDecodeError):m.sync_once()
  self.assertEqual(p.read_bytes(),before)
 def test_device_prefixed_entity_name(self):
  self.write('core.entity_registry',{'entities':[{'entity_id':'sensor.socket_energy','device_id':'dev','original_name':'Énergie','has_entity_name':True},{'entity_id':'sensor.socket_power','device_id':'dev'}]});self.write('core.device_registry',{'devices':[{'id':'dev','area_id':'room','name':'Smart Plug','name_by_user':'Réfrigérateur'}]});m.sync_once();d=json.loads((m.OUTPUT/'energy-config.json').read_text());self.assertEqual(d['devices'][0]['name'],'Réfrigérateur')
 def test_removal_rename_area(self):
  self.conf['device_consumption'][0]['name']='Nouveau nom';self.write('energy',self.conf);self.write('core.area_registry',{'areas':[{'id':'room','name':'Bureau'}]});m.sync_once();d=json.loads((m.OUTPUT/'energy-config.json').read_text());self.assertEqual(d['devices'][0]['name'],'Nouveau nom');self.assertEqual(d['devices'][0]['area'],'Bureau');self.conf['device_consumption']=[];self.write('energy',self.conf);m.sync_once();self.assertEqual(json.loads((m.OUTPUT/'energy-config.json').read_text())['devices'],[])
if __name__=='__main__':unittest.main()
