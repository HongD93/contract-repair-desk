import { copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureEvidence } from './evidence.ts';
import { captureSuite } from './suite.ts';
import { cases } from '../sample/cases.ts';
import { writeFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await captureEvidence({ projectRoot: root, outputRoot: join(root, 'evidence/local') });
const destination = join(root, 'web/public/evidence');
mkdirSync(destination, { recursive: true });
for (const [source, name] of [[result.htmlPath, 'report.html'], [result.jsonPath, 'latest.json']]) {
  const target = join(destination, name);
  copyFileSync(source, `${target}.tmp`);
  renameSync(`${target}.tmp`, target);
}
console.log(JSON.stringify({ outcome: result.report.outcome, runId: result.report.runId, destination }));
if (result.report.outcome !== 'verified-repair') process.exitCode = 1;
const suite = captureSuite();
copyFileSync(suite.jsonPath, join(destination,'suite.json'));
copyFileSync(suite.htmlPath, join(destination,'suite.html'));
const fixtureDirectory = join(root,'web/public/fixtures');
mkdirSync(fixtureDirectory,{recursive:true});
for (const item of cases) writeFileSync(join(fixtureDirectory,`${item.id}.json`),JSON.stringify(item.body,null,2));
console.log(JSON.stringify({outcome:suite.report.outcome,cases:suite.report.cases.length,elapsedMs:suite.report.elapsedMs}));
if(suite.report.outcome !== 'verified-repair') process.exitCode=1;
