import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cases } from '../sample/cases.ts';
import { escapeHtml, parseTapCounts } from './evidence.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pinned = ['sample/cases.ts', 'test/suite.test.ts', 'fixtures/view-model-before.ts'];
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function captureSuite(projectRoot = root, outputRoot = join(root, 'evidence/local')) {
  const started = performance.now();
  const manifest = JSON.parse(readFileSync(join(projectRoot, 'fixtures/suite-integrity.json'), 'utf8'));
  for (const name of pinned) if (manifest?.[name] !== hash(join(projectRoot, name))) throw new Error(`Integrity check failed: ${name}`);
  const inputs = Object.fromEntries([...pinned, 'sample/view-model.ts'].map(name => [name, hash(join(projectRoot, name))]));
  function run(stage: 'before' | 'after') {
    const directory = mkdtempSync(join(tmpdir(), 'contract-suite-'));
    try {
      mkdirSync(join(directory,'sample')); mkdirSync(join(directory,'test'));
      writeFileSync(join(directory,'package.json'), '{"type":"module"}');
      for (const file of ['sample/cases.ts','test/suite.test.ts']) copyFileSync(join(projectRoot,file),join(directory,file));
      copyFileSync(join(projectRoot, stage === 'before' ? 'fixtures/view-model-before.ts' : 'sample/view-model.ts'),join(directory,'sample/view-model.ts'));
      const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
      const start = performance.now();
      const result = spawnSync(process.execPath,['--test','--test-reporter=tap','test/suite.test.ts'], {cwd:directory,encoding:'utf8',timeout:30000,maxBuffer:1048576,shell:false,env});
      const sanitize = (log: string) => log.replaceAll(directory.replaceAll('\\','\\\\'),'[isolated-run]').replaceAll(directory,'[isolated-run]').replaceAll(directory.replaceAll('\\','/'),'[isolated-run]');
      const stdout = sanitize(result.stdout ?? ''); const stderr = sanitize(result.stderr ?? '');
      const counts = parseTapCounts(stdout);
      const rows = [...stdout.matchAll(/^(not )?ok \d+ - case:([\w-]+)\r?$/gm)].map(match => ({id:match[2],passed:!match[1]}));
      const complete = counts.found && counts.total === cases.length && rows.length === cases.length && cases.every(item => rows.filter(row => row.id===item.id).length===1);
      return {exitCode:result.status,stdout,stderr,spawnError:result.error?.message ?? null,elapsedMs:Math.round(performance.now()-start),signal:result.signal, ...counts,cases:rows,inconclusive:!complete || !!result.error || !!result.signal};
    } finally {
      if(dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('contract-suite-')) throw new Error('Unsafe temporary directory');
      rmSync(directory,{recursive:true,force:true});
    }
  }
  const before = run('before'); const after = run('after');
  const matches = (stage: typeof before, initial: boolean) => stage.cases.every(row => row.passed === (!initial || cases.find(item => item.id===row.id)?.category !== 'repair'));
  const outcome = before.inconclusive || after.inconclusive ? 'inconclusive' :
    before.exitCode===1 && before.pass===3 && before.fail===3 && after.exitCode===0 && after.pass===6 && after.fail===0 && !before.skip && !after.skip && !before.cancel && !after.cancel && matches(before,true) && matches(after,false) ? 'verified-repair' : 'not-repaired';
  const report = {schemaVersion:2,kind:'recorded-suite-verification',runId:randomUUID(),generatedAt:new Date().toISOString(),nodeVersion:process.version,outcome,inputs,before,after,elapsedMs:Math.round(performance.now()-started),
    cases:cases.map(item=>({id:item.id,title:item.title,category:item.category,reason:item.reason})),
    limitations:['Six fictional cases; no production repository coverage or human productivity benchmark.', 'Browser runs the real before/after mapper on fetched static fixtures. Recorded tests are separate from interactive previews.', 'Hashes pin local inputs, not third-party authenticity. Only trusted local code should be run.', 'No Bob inference or paid service is called by the viewer or capture command.']};
  mkdirSync(outputRoot,{recursive:true});
  const directory = mkdtempSync(join(outputRoot,'suite-'));
  const jsonPath = join(directory,'suite.json');
  writeFileSync(jsonPath,JSON.stringify(report,null,2));
  const e=escapeHtml;
  const htmlPath=join(directory,'suite.html');
  writeFileSync(htmlPath,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Contract Repair Desk — Evidence</title><style>body{font:16px system-ui;max-width:960px;margin:40px auto;padding:20px;color:#193d31}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef2ed;padding:20px}code{overflow-wrap:anywhere}h1{font-size:36px}</style><h1>Contract Repair Desk</h1><p>${e(outcome)} · ${e(report.runId)}</p><p>Six unchanged checks. Three seeded defects, two controls, one explicit rejection.</p><table><tr><th>Case</th><th>Before</th><th>After</th></tr>${cases.map(item=>`<tr><td>${e(item.title)}</td><td>${before.cases.find(row=>row.id===item.id)?.passed?'PASS':'FAIL / UNKNOWN'}</td><td>${after.cases.find(row=>row.id===item.id)?.passed?'PASS':'FAIL / UNKNOWN'}</td></tr>`).join('')}</table><h2>Before log</h2><pre>${e(before.stdout+before.stderr)}</pre><h2>After log</h2><pre>${e(after.stdout+after.stderr)}</pre><h2>Inputs</h2>${Object.entries(inputs).map(([name,value])=>`<p>${e(name)}<br><code>${value}</code></p>`).join('')}<h2>Limitations</h2><ul>${report.limitations.map(item=>`<li>${e(item)}</li>`).join('')}</ul></html>`);
  return {report,jsonPath,htmlPath};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=captureSuite(); console.log(JSON.stringify({outcome:result.report.outcome,json:result.jsonPath,html:result.htmlPath}));
  if(result.report.outcome!=='verified-repair') process.exitCode=1;
}
