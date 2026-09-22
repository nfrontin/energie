const vm=require('vm'),fs=require('fs'),assert=require('assert/strict'),js=fs.readFileSync('dist/app.js','utf8');
const c=vm.createContext({Intl,Date,Number,Math});vm.runInContext(js.slice(js.indexOf('const HOME_TZ'),js.indexOf('const requestFailures'))+js.slice(js.indexOf('function resourceHourBuckets'),js.indexOf('function renderResourceHours')),c);const run=s=>vm.runInContext(s,c);
c.day='2026-09-22';c.start=run('localMidnight(day)/1000');c.end=c.start+3900;c.points=Array.from({length:14},(_,i)=>[c.start+i*300,100+i*2]);
let a=run('resourceHourBuckets(resourceIntervals(points),day,end)');assert.equal(a[0],24);assert.equal(a[1],2);assert.equal(a[2],null);
c.points[4][1]=0;assert.equal(run('resourceHourBuckets(resourceIntervals(points),day,end)[0]'),null);
c.points=[[c.start,0],[c.start+900,10]];assert.equal(run('resourceHourBuckets(resourceIntervals(points),day,end)[0]'),null);
for(const [day,n] of [['2026-03-29',23],['2026-10-25',25]]){c.day=day;assert.equal(run('resourceHourBuckets([],day,end).length'),n);}
console.log('PASS: hourly gas/water conservation, partial/future hours, resets, missing readings, DST.');
