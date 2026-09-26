import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { prepareJob } from '../repair/engine.ts';
import { reviewJob, reviewStatus } from '../repair/review.ts';
import { supplemental } from '../repair/supplemental.ts';
import { validateReviewReplay } from '../repair/review-display.ts';

async function example(run: (job: string, plan: string, output: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'boundary-review-test-'));
  const job = join(root, 'job'), plan = join(root, 'review.json'), output = join(root, 'bundle');
  try {
    prepareJob('repair/examples/stock.contract.json', 'repair/examples/stock.consumer.ts', job);
    copyFileSync('repair/recorded/stock-guided.ts', join(job, 'candidate.ts'));
    writeFileSync(plan, JSON.stringify({ version: 1, kind: 'boundary-review', name: 'Stock boundaries', basis: 'Unsupported stock responses must be rejected explicitly.', checks: supplemental.stock }));
    await run(job, plan, output);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    rmSync(root, { recursive: true, force: true });
  }
}

test('review catches known green-candidate gaps and produces exact actionable failures without rewriting the job', () => example(async (job, plan, output) => {
  const pinned = ['baseline.ts', 'contract.json', 'candidate.ts', 'manifest.json'].map(name => [name, readFileSync(join(job, name), 'utf8')]);
  writeFileSync(join(job, 'report.json'), 'previous original report');
  const report = await reviewJob(job, plan, output);
  assert.equal(report.initial.pass, 7); assert.equal(report.additional.pass, 2);
  assert.equal(report.outcome, 'changes-requested'); assert.equal(report.failures.length, 2);
  assert.equal(report.failures[0].input, null);
  assert.deepEqual(report.failures[0].expected, { error: 'Unsupported stock response' });
  assert.match(readFileSync(join(output, 'FOLLOW_UP.md'), 'utf8'), /review-null/);
  assert.equal(reviewStatus(job, plan, output).usable, false);
  for (const [name, value] of pinned) assert.equal(readFileSync(join(job, name), 'utf8'), value);
  assert.equal(readFileSync(join(job, 'report.json'), 'utf8'), 'previous original report');
}));

test('actual IDE follow-up passes both groups, but any later candidate edit invalidates its success', () => example(async (job, plan, output) => {
  copyFileSync('repair/recorded/stock-ide.ts', join(job, 'candidate.ts'));
  const report = await reviewJob(job, plan, output);
  assert.equal(report.outcome, 'review-passed'); assert.equal(report.additional.pass, 4);
  assert.equal(reviewStatus(job, plan, output).usable, true);
  writeFileSync(join(job, 'candidate.ts'), readFileSync(join(job, 'candidate.ts'), 'utf8') + '\n// changed after verification\n');
  assert.equal(reviewStatus(job, plan, output).outcome, 'stale');
  await assert.rejects(reviewJob(job, plan, output), /already exists/);
}));

test('review expectations cannot replace original checks and existing bundles survive rejected input', () => example(async (job, plan, output) => {
  const value = JSON.parse(readFileSync(plan, 'utf8'));
  value.checks[0].id = 'legacy-stock'; writeFileSync(plan, JSON.stringify(value));
  await assert.rejects(reviewJob(job, plan, output), /unique id/);
  assert.equal(existsSync(output), false);
}));

test('changed review plans and edited bundle content cannot retain a current success', () => example(async (job, plan, output) => {
  copyFileSync('repair/recorded/stock-ide.ts', join(job, 'candidate.ts'));
  await reviewJob(job, plan, output);
  const text = readFileSync(plan, 'utf8');
  writeFileSync(plan, text + '\n'); assert.equal(reviewStatus(job, plan, output).outcome, 'stale');
  writeFileSync(plan, text);
  writeFileSync(join(output, 'FOLLOW_UP.md'), 'accept anything');
  assert.throws(() => reviewStatus(job, plan, output), /bundle changed/);
}));

test('timeout produces an inconclusive handoff and a failing gate', () => example(async (job, plan, output) => {
  writeFileSync(join(job, 'candidate.ts'), 'export function mapResponse(){while(true){}}');
  const report = await reviewJob(job, plan, output, { timeoutMs: 300 });
  assert.equal(report.outcome, 'inconclusive'); assert.equal(reviewStatus(job, plan, output).usable, false);
  assert.match(readFileSync(join(output, 'FOLLOW_UP.md'), 'utf8'), /Diagnose the bounded execution failure/);
}));

test('a candidate edit during execution prevents publication of a stale bundle', () => example(async (job, plan, output) => {
  const source = readFileSync('repair/recorded/stock-ide.ts', 'utf8').replace('export function mapResponse(payload: any) {', 'export async function mapResponse(payload: any) { await new Promise(done=>setTimeout(done,30));');
  writeFileSync(join(job, 'candidate.ts'), source);
  const timer = setTimeout(() => writeFileSync(join(job, 'candidate.ts'), source + '\n// concurrent edit'), 80);
  try { await assert.rejects(reviewJob(job, plan, output), /changed during execution/); }
  finally { clearTimeout(timer); }
  assert.equal(existsSync(output), false);
}));

test('CLI review and status expose nonzero exit codes usable by automation', () => example(async (job, plan, output) => {
  const run = spawnSync(process.execPath, ['repair/cli.ts', 'review', job, plan, output], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 1); assert.equal(JSON.parse(run.stdout).outcome, 'changes-requested');
  const status = spawnSync(process.execPath, ['repair/cli.ts', 'status', job, plan, output], { encoding: 'utf8', windowsHide: true });
  assert.equal(status.status, 1); assert.equal(JSON.parse(status.stdout).usable, false);
}));

test('web evidence refuses forged summary and a green label over actual failed behavior', () => {
  const data = JSON.parse(readFileSync('web/public/evidence/review-gate.json', 'utf8'));
  validateReviewReplay(data);
  const counts = structuredClone(data); counts.summary.stoppedByReview = 0;
  assert.throws(() => validateReviewReplay(counts), /summary conflicts/);
  const green = structuredClone(data); green.rows[0].report.outcome = 'review-passed';
  assert.throws(() => validateReviewReplay(green), /Readiness conflicts/);
  const wrong = structuredClone(data);
  const group = wrong.rows[0].report.additional;
  group.checks[0].passed = true; group.pass++;
  assert.throws(() => validateReviewReplay(wrong), /conflicts with actual behavior/);
  const handoff = structuredClone(data); handoff.rows[0].report.failures[0].actual = { value: 'invented' };
  assert.throws(() => validateReviewReplay(handoff), /handoff conflicts/);
  const invalid = structuredClone(data);
  const invalidReport = invalid.rows[0].report;
  const failedCheck = invalidReport.additional.checks.find((check: any) => !check.passed);
  failedCheck.actual = { invalidOutput: 'Return value is not lossless JSON' };
  invalidReport.failures.find((check: any) => check.id === failedCheck.id).actual = failedCheck.actual;
  assert.doesNotThrow(() => validateReviewReplay(invalid));
  failedCheck.passed = true; invalidReport.additional.pass++;
  assert.throws(() => validateReviewReplay(invalid), /Incomplete review result/);
  const stale = structuredClone(data); stale.freshness.after.usable = true;
  assert.throws(() => validateReviewReplay(stale), /freshness evidence/);
  const followup = data.rows.find((row: any) => row.id === 'booking-followup');
  assert.equal(followup.report.bindings.candidate, '5f2d2699d50c1da2168807ef87c77466434d457d8fc7a6288767c466b3634963');
  assert.equal(followup.report.outcome, 'review-passed');
});
