import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {digest} from '../repair/engine.ts';
import {mapResponse as stockIde} from '../repair/recorded/stock-ide.ts';
import {supplemental} from '../repair/supplemental.ts';
const bundle=JSON.parse(readFileSync('web/public/evidence/repair-lab.json','utf8'));
for(const run of bundle.benchmark.runs) test(`replay recorded Bob candidate without changing registered expectations: ${run.id}`,async()=>{
  const path=`repair/recorded/${run.id}.ts`;
  assert.equal(digest(readFileSync(path)),run.candidateHash);
  const {mapResponse}=await import(`../repair/recorded/${run.id}.ts`);
  const contract=JSON.parse(readFileSync(`repair/examples/${run.caseId}.contract.json`,'utf8'));
  assert.equal(digest(readFileSync(`repair/examples/${run.caseId}.contract.json`)),run.contractHash);
  for(const check of contract.checks) {
    if('error' in check) assert.throws(()=>mapResponse(check.input),error=>error.message===check.error);
    else assert.deepEqual(mapResponse(check.input),check.expected);
  }
});
test('actual IDE repair preserves seven contracts and handles the separately disclosed review boundaries',()=>{
  const study=bundle.studies.find(row=>row.id==='stock');
  assert.equal(digest(readFileSync('repair/recorded/stock-ide.ts')),study.report.hashes['candidate.ts']);
  for(const row of supplemental.stock) assert.throws(()=>stockIde(row.input),error=>error.message===row.error);
  assert.deepEqual(stockIde({items:[]}),[]);
  assert.deepEqual(stockIde({items:[{sku:'CUSTOM',name:'Original',displayName:'New',available:0,availableUnits:9}]}),[{sku:'CUSTOM',label:'Original',available:0}]);
});
