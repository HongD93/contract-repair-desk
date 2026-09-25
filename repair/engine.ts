import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseContract, type Contract } from './contract.ts';

const workerPath = join(dirname(fileURLToPath(import.meta.url)), 'worker.ts');
export const digest = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const read = (path: string) => readFileSync(path,'utf8');
export function prepareJob(contractPath: string, sourcePath: string, output: string) {
  const contractText = read(contractPath); const contract = parseContract(contractText); const source = read(sourcePath);
  if (Buffer.byteLength(source) > 65536) throw new Error('Consumer exceeds 64 KiB');
  const directory = resolve(output);
  if (existsSync(directory)) throw new Error('Output already exists; choose a new job directory');
  mkdirSync(directory,{recursive:true});
  writeFileSync(join(directory,'contract.json'),contractText);
  writeFileSync(join(directory,'baseline.ts'),source); writeFileSync(join(directory,'candidate.ts'),source);
  writeFileSync(join(directory,'manifest.json'),JSON.stringify({version:1,name:contract.name,pinned:{'contract.json':digest(contractText),'baseline.ts':digest(source)}},null,2));
  writeFileSync(join(directory,'TASK.md'),`# Repair ${contract.name}\n\nRead contract.json and reproduce the failures before editing. Repair only candidate.ts. Export mapResponse(payload). Keep baseline.ts, contract.json and manifest.json unchanged. Preserve old inputs and exact rejection behavior. Do not read another job, reference solution or previous Bob conversation. Do not install packages or call external services.\n\nRequirements:\n${contract.requirements}\n\nThe report command is node repair/cli.ts check ${JSON.stringify(directory)} from Contract Repair Desk's root. It evaluates both versions against the same contract. Stop if requirements are ambiguous. Explain remaining limits; do not claim developer time savings.\n`);
  return {directory,name:contract.name,pinned:digest(read(join(directory,'manifest.json')))};
}
export function loadJob(directory: string) {
  const root = realpathSync(directory); const before = read(join(root,'manifest.json'));
  const manifest = JSON.parse(before);
  if (manifest.version !== 1 || Object.keys(manifest.pinned ?? {}).sort().join(',') !== 'baseline.ts,contract.json') throw new Error('Invalid pin manifest');
  for (const name of ['contract.json','baseline.ts','candidate.ts']) {
    if (realpathSync(join(root,name)) !== join(root,name)) throw new Error('Job files must not be symbolic links');
    const bytes=readFileSync(join(root,name));
    if(bytes.length > 65536) throw new Error('Job file exceeds 64 KiB');
    if(name !== 'candidate.ts' && digest(bytes) !== manifest.pinned[name]) throw new Error(`Pinned file changed: ${name}`);
  }
  return { root, manifest, manifestHash:digest(before), contract:parseContract(read(join(root,'contract.json'))) };
}
async function fetchInputs(contract: Contract) {
  const server = createServer((request,response) => {
    const match = /^\/case\/(\d+)$/.exec(request.url ?? '');
    const item = match && contract.checks[Number(match[1])];
    if(!item){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':'application/json'}); response.end(JSON.stringify(item.input));
  });
  await new Promise<void>((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
  try {
    const address=server.address(); if(!address || typeof address === 'string') throw new Error('HTTP fixture unavailable');
    const results=[];
    for(let index=0;index<contract.checks.length;index++) {
      const response=await fetch(`http://127.0.0.1:${address.port}/case/${index}`,{signal:AbortSignal.timeout(3000)});
      if(response.status !== 200) throw new Error('HTTP fixture failed');
      results.push({id:contract.checks[index].id,httpStatus:response.status,input:await response.json()});
    }
    return results;
  } finally { server.closeAllConnections(); await new Promise<void>(done=>server.close(()=>done())); }
}
async function execute(source: string, inputs: unknown[], timeoutMs: number) {
  const directory=mkdtempSync(join(tmpdir(),'contract-candidate-'));
  try {
    const candidate=join(directory,'candidate.ts'); const worker=join(directory,'worker.ts');
    writeFileSync(candidate,source); copyFileSync(workerPath,worker);
    const start=performance.now();
    return await new Promise<any>(done=>{
      const child=spawn(process.execPath,['--permission',`--allow-fs-read=${directory}`,worker,candidate],{cwd:directory,env:{SystemRoot:process.env.SystemRoot ?? '',NODE_NO_WARNINGS:'1'},stdio:['pipe','pipe','pipe'],windowsHide:true});
      let stdout='',stderr='',failure=''; let bytes=0;
      const timer=setTimeout(()=>{failure='Candidate timed out';child.kill();},timeoutMs);
      for(const [stream,kind] of [[child.stdout,'out'],[child.stderr,'err']] as const) stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>262144){failure='Candidate output limit exceeded';child.kill();return;} if(kind==='out')stdout+=chunk;else stderr+=chunk;});
      child.stdin.on('error',()=>{});
      child.on('error',()=>{failure='Candidate process could not start';});
      child.on('close',code=>{clearTimeout(timer);let rows;
        if(!failure && code === 0) {try{rows=JSON.parse(stdout);}catch{failure='Candidate did not return a single JSON result';}}
        if(code !== 0 && !failure) failure='Candidate execution failed';
        done({exitCode:code,elapsedMs:Math.round(performance.now()-start),rows,failure,diagnostic:stderr.replaceAll(directory,'<isolated-job>').slice(0,3000)});
      });
      child.stdin.end(JSON.stringify(inputs.map((row:any)=>({id:row.id,input:row.input}))));
    });
  } finally {rmSync(directory,{recursive:true,force:true});}
}
function score(run: any, contract: Contract, inputs: any[]) {
  const complete=Array.isArray(run.rows) && run.rows.length === contract.checks.length && contract.checks.every(row=>run.rows.filter((actual:any)=>actual?.id===row.id && Object.hasOwn(actual,'value') !== Object.hasOwn(actual,'error')).length===1);
  const checks=contract.checks.map((row,index)=>{
    const actual=complete?run.rows.find((item:any)=>item.id===row.id):undefined;
    const passed=!run.failure && complete && (Object.hasOwn(row,'error') ? actual.error === row.error : Object.hasOwn(actual,'value') && isDeepStrictEqual(actual.value,row.expected));
    return {id:row.id,purpose:row.purpose,httpStatus:inputs[index].httpStatus,passed,expected:Object.hasOwn(row,'error')?{error:row.error}:{value:row.expected},actual:actual ? (Object.hasOwn(actual,'error')?{error:actual.error}:{value:actual.value}) : null};
  });
  return {pass:checks.filter(row=>row.passed).length,total:checks.length,checks,elapsedMs:run.elapsedMs,failure:run.failure || (!complete?'Incomplete candidate result':null),diagnostic:run.diagnostic};
}
export async function checkJob(directory: string, options: {timeoutMs?:number; write?:boolean}={}) {
  const job=loadJob(directory); const baseline=read(join(job.root,'baseline.ts')); const candidate=read(join(job.root,'candidate.ts'));
  const inputs=await fetchInputs(job.contract);
  const before=score(await execute(baseline,inputs,options.timeoutMs ?? 5000),job.contract,inputs);
  const after=score(await execute(candidate,inputs,options.timeoutMs ?? 5000),job.contract,inputs);
  const current=loadJob(directory);
  if(current.manifestHash !== job.manifestHash || read(join(job.root,'candidate.ts')) !== candidate) throw new Error('Job changed during verification; rerun');
  const controlsPreserved=after.checks.filter(row=>row.purpose==='preserve').every(row=>row.passed);
  const outcome=before.failure || after.failure ? 'inconclusive' : after.pass !== after.total ? 'not-repaired' : before.pass === before.total ? 'already-passing' : 'verified-repair';
  const report={version:1,kind:'contract-repair-job',runId:randomUUID(),generatedAt:new Date().toISOString(),name:job.contract.name,outcome,controlsPreserved,manifestHash:job.manifestHash,hashes:{...job.manifest.pinned,'candidate.ts':digest(candidate)},before,after,source:{before:baseline,after:candidate},limitations:['Synthetic HTTP fixtures and a pure TypeScript consumer adapter.','Recorded execution time is not developer time saved.','Local pins detect edits, not malicious replacement of both manifest and inputs.','Run only trusted local code; this is not a hostile-code sandbox.']};
  if(options.write !== false) {const target=join(job.root,'report.json');writeFileSync(`${target}.tmp`,JSON.stringify(report,null,2));renameSync(`${target}.tmp`,target);}
  return report;
}
