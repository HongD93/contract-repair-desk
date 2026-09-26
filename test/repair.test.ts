import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareJob, checkJob } from '../repair/engine.ts';
import { parseContract } from '../repair/contract.ts';

async function job(fn: (directory:string)=>Promise<void>) {
  const root=mkdtempSync(join(tmpdir(),'repair-test-'));const directory=join(root,'job');
  prepareJob(resolve('repair/examples/stock.contract.json'),resolve('repair/examples/stock.consumer.ts'),directory);
  try{await fn(directory);}finally{rmSync(root,{recursive:true,force:true});}
}
const repair=`export function mapResponse(payload) {
 const fail=()=>{throw new Error('Unsupported stock response')};
 if(!payload || !Array.isArray(payload.items))return fail();
 return payload.items.map(item=>{
  if(!item || typeof item.sku!=='string' || !item.sku.trim())return fail();
  const label=typeof item.name==='string' && item.name.trim()?item.name:item.displayName;
  const available=Object.hasOwn(item,'available')?item.available:item.availableUnits;
  if(typeof label!=='string'||!label.trim()||!Number.isInteger(available)||available<0)return fail();
  return {sku:item.sku,available,label};
 });
}`;
test('same HTTP fixtures prove repair and preserve legacy cases',()=>job(async directory=>{
  writeFileSync(join(directory,'candidate.ts'),repair);
  const report=await checkJob(directory);
  assert.equal(report.outcome,'verified-repair');assert.equal(report.after.pass,7);assert.equal(report.before.pass,3);
  assert.ok(report.after.checks.every(row=>row.httpStatus===200));
  assert.equal(JSON.parse(readFileSync(join(directory,'report.json'),'utf8')).runId,report.runId);
}));
test('migration-only patch is rejected when legacy behavior regresses',()=>job(async directory=>{
  writeFileSync(join(directory,'candidate.ts'),repair.replace("Object.hasOwn(item,'available')?item.available:item.availableUnits","item.availableUnits").replace("typeof item.name==='string' && item.name.trim()?item.name:item.displayName","item.displayName"));
  const report=await checkJob(directory);assert.equal(report.outcome,'not-repaired');assert.equal(report.controlsPreserved,false);
}));
test('changed expectations are blocked before executing candidate',()=>job(async directory=>{
  const file=join(directory,'contract.json');writeFileSync(file,readFileSync(file,'utf8').replace('"available":20','"available":21'));
  await assert.rejects(checkJob(directory),/Pinned file changed/);
}));
test('candidate timeout is inconclusive, never a successful repair',()=>job(async directory=>{
  writeFileSync(join(directory,'candidate.ts'),'export function mapResponse(){while(true){}}');
  const report=await checkJob(directory,{timeoutMs:500});assert.equal(report.outcome,'inconclusive');assert.match(report.after.failure ?? '',/timed out/);
}));
test('noisy output is inconclusive and lossy JSON fails without erasing other checks',async()=>{
  await job(async directory=>{
    writeFileSync(join(directory,'candidate.ts'),`console.log('fake report'); ${repair}`);
    assert.equal((await checkJob(directory)).outcome,'inconclusive');
  });
  const root=mkdtempSync(join(tmpdir(),'repair-json-test-'));
  try {
    const cases=[
      ['NaN',null], ['Infinity',null], ['-Infinity',null],
      ['({count:undefined})',{}], ['[undefined]',[null]], ['Array(1)',[null]],
      ['undefined',{invalidOutput:'undefined'}],
      ["new Date('2026-01-01T00:00:00Z')",'2026-01-01T00:00:00.000Z'],
      ['1n',1], ['(()=>{const x={};x.self=x;return x;})()',{}],
    ];
    for(const [index,[expression,expected]] of cases.entries()) {
      const contract={version:1,name:'JSON output boundary',requirements:'Preserve one, return the migration value, reject invalid input.',checks:[
        {id:'legacy',purpose:'preserve',input:{value:1},expected:1},
        {id:'migration',purpose:'migration',input:{value:null},expected},
        {id:'reject',purpose:'reject',input:{invalid:true},error:'Invalid input'},
      ]};
      const contractPath=join(root,'contract.json'),sourcePath=join(root,'source.ts'),directory=join(root,String(index));
      writeFileSync(contractPath,JSON.stringify(contract));
      const source=(result:string)=>`export function mapResponse(p){if(p.invalid)throw new Error('Invalid input');return p.value===null?${result}:p.value;}`;
      writeFileSync(sourcePath,source('7'));prepareJob(contractPath,sourcePath,directory);
      writeFileSync(join(directory,'candidate.ts'),source(expression as string));
      const invalid=await checkJob(directory,{write:false});
      assert.equal(invalid.outcome,'not-repaired',String(expression));
      assert.equal(invalid.after.pass,2,String(expression));
      assert.deepEqual(invalid.after.checks[1].actual,{invalidOutput:'Return value is not lossless JSON'});
      // Genuine JSON null/objects/arrays and expected adapter rejections still work.
      writeFileSync(join(directory,'candidate.ts'),source(`(${JSON.stringify(expected)})`));
      const valid=await checkJob(directory,{write:false});
      assert.equal(valid.outcome,'verified-repair',String(expression));
      assert.equal(valid.after.pass,3);
    }
  } finally { assert.ok(root.startsWith(join(tmpdir(),'repair-json-test-')));rmSync(root,{recursive:true,force:true}); }
});
test('job preparation refuses overwrite and missing contract categories',()=>job(async directory=>{
  assert.throws(()=>prepareJob('repair/examples/stock.contract.json','repair/examples/stock.consumer.ts',directory),/already exists/);
  const value=JSON.parse(readFileSync('repair/examples/stock.contract.json','utf8'));value.checks=value.checks.filter(row=>row.purpose!=='reject');
  assert.throws(()=>parseContract(JSON.stringify(value)),/Missing reject/);
}));
