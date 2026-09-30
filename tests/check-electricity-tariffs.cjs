const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const contract=JSON.parse(fs.readFileSync('config-sync/electricity-contract.json'));
const ctx=vm.createContext({electricityContract:contract,Date});
vm.runInContext(fs.readFileSync('src/electricity-tariffs.js','utf8'),ctx);
assert.equal(vm.runInContext("electricitySubscription('2026-09-29')",ctx),null);
assert.equal(vm.runInContext("electricitySubscription('2026-09-30')",ctx),53.79/30);
assert.equal(vm.runInContext("electricitySubscription('2026-10-01')",ctx),53.79/31);
assert.equal(vm.runInContext("electricitySubscription('2028-02-29')",ctx),53.79/29);
console.log('PASS: electricity subscription date boundary and calendar proration.');
