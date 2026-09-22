const vm=require('vm'),fs=require('fs'),assert=require('assert/strict');const js=fs.readFileSync('dist/app.js','utf8');const ctx=vm.createContext({Intl,Date,Number,Math,Map,console});
vm.runInContext(js.slice(js.indexOf('const HOME_TZ'),js.indexOf('const requestFailures'))+js.slice(js.indexOf('function detailBuckets'),js.indexOf('async function loadDetail')),ctx);
const run=s=>vm.runInContext(s,ctx);
ctx.day='2026-09-21';ctx.start=run('localMidnight(day)/1000');ctx.end=ctx.start+86400;
ctx.points=Array.from({length:289},(_,i)=>[ctx.start+i*300,1000+i*10]);assert(Math.abs(run('detailSum(detailBuckets(points,day,end,"Wh"))')-2.88)<1e-9);
ctx.points=[[ctx.start,50],[ctx.start+300,51],[ctx.start+600,0],[ctx.start+900,2]];ctx.end=ctx.start+900;assert.equal(run('detailBuckets(points,day,end)[0]'),3);
ctx.points=[[ctx.start+300,0],[ctx.start+600,1]];assert.equal(run('detailBuckets(points,day,end)[0]'),null);
ctx.points=[[ctx.start,0],[ctx.start+900,5]];assert.equal(run('detailBuckets(points,day,end)[0]'),null);
assert.equal(run('detailDerived([1],[2],[4],[1]).house[0]'),6);assert.equal(run('detailDerived([1],[2],[null],[1]).house[0]'),null);assert.equal(run('detailDerived([1],[2],[1],[4]).house[0]'),null);
assert.equal(run('detailTotalComplete([1,null,2],3)'),null);
for(const [day,n]of [['2026-03-29',23],['2026-10-25',25]]){ctx.day=day;ctx.end=run('localMidnight(shiftDay(day,1))/1000');assert.equal(run('detailBuckets([],day,end).length'),n);}
console.log('PASS: Wh conversion, counter reset, missing data, energy balance, incomplete totals, DST.');
ctx.day='2026-09-21';ctx.start=run('localMidnight(day)/1000');ctx.end=ctx.start+3600;ctx.points=Array.from({length:13},(_,i)=>[ctx.start+i*300,100+i*10]);assert.equal(run('detailBuckets(points,day,end,"Wh",300).length'),288);assert(Math.abs(run('detailSum(detailBuckets(points,day,end,"Wh",300))')-run('detailSum(detailBuckets(points,day,end,"Wh"))'))<1e-9);console.log('PASS: 5-minute/hourly energy conservation.');
