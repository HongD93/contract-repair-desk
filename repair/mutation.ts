import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareJob, digest, loadJob } from './engine.ts';
import { reviewJob } from './review.ts';

export async function auditMutations(directory: string, planPath: string, mutationsPath: string, output: string, options: { timeoutMs?: number } = {}) {
  if (existsSync(output)) throw new Error('Mutation report already exists');
  const job = loadJob(directory);
  const source = readFileSync(join(job.root, 'candidate.ts'), 'utf8');
  const planText = readFileSync(planPath, 'utf8');
  const mutationText = readFileSync(mutationsPath, 'utf8');
  if (Buffer.byteLength(mutationText) > 65536) throw new Error('Mutation plan exceeds 64 KiB');
  const mutationPlan = JSON.parse(mutationText);
  if (mutationPlan?.version !== 1 || mutationPlan.kind !== 'seeded-fault-plan' || mutationPlan.candidateHash !== digest(source) || !Array.isArray(mutationPlan.mutations) || !mutationPlan.mutations.length || mutationPlan.mutations.length > 12) throw new Error('Invalid or stale mutation plan');
  const ids = new Set();
  for (const mutation of mutationPlan.mutations) {
    if (!/^[a-z0-9-]{1,64}$/.test(mutation.id) || ids.has(mutation.id) || !['behavior-change', 'equivalent-control'].includes(mutation.kind) || typeof mutation.from !== 'string' || !mutation.from || mutation.from.length > 2048 || typeof mutation.to !== 'string' || mutation.to.length > 2048 || mutation.from === mutation.to || source.split(mutation.from).length !== 2 || typeof mutation.reason !== 'string' || !mutation.reason.trim() || mutation.reason.length > 1000) throw new Error('Each seeded change must match exactly one source span and explain its intended effect');
    ids.add(mutation.id);
  }
  const root = mkdtempSync(join(tmpdir(), 'contract-fault-audit-'));
  try {
    const planCopy = join(root, 'review.json'); writeFileSync(planCopy, planText);
    const contractCopy = join(root, 'contract.json'); writeFileSync(contractCopy, readFileSync(join(job.root, 'contract.json')));
    const baselineCopy = join(root, 'baseline.ts'); writeFileSync(baselineCopy, readFileSync(join(job.root, 'baseline.ts')));
    const base = join(root, 'base'); prepareJob(contractCopy, baselineCopy, base); writeFileSync(join(base, 'candidate.ts'), source);
    const clean = await reviewJob(base, planCopy, join(root, 'clean'), options);
    if (clean.outcome !== 'review-passed') throw new Error('Unmodified candidate must pass before auditing seeded faults');
    const rows = [];
    for (const mutation of mutationPlan.mutations) {
      const isolated = join(root, mutation.id); prepareJob(contractCopy, baselineCopy, isolated);
      writeFileSync(join(isolated, 'candidate.ts'), source.replace(mutation.from, mutation.to));
      const report = await reviewJob(isolated, planCopy, join(root, `${mutation.id}-review`), options);
      const state = report.outcome === 'inconclusive' ? 'inconclusive' : mutation.kind === 'equivalent-control' ? report.outcome === 'review-passed' ? 'control-preserved' : 'control-rejected' : report.outcome === 'review-passed' ? 'survived' : 'detected';
      rows.push({ id: mutation.id, kind: mutation.kind, reason: mutation.reason, state, initialFailures: report.initial.total - report.initial.pass, addedFailures: report.additional.total - report.additional.pass, failedChecks: report.failures.map(row => row.id), candidateHash: report.bindings.candidate });
    }
    if (loadJob(directory).manifestHash !== job.manifestHash || digest(readFileSync(join(job.root, 'candidate.ts'))) !== digest(source) || readFileSync(planPath, 'utf8') !== planText || readFileSync(mutationsPath, 'utf8') !== mutationText) throw new Error('Inputs changed during mutation audit');
    const faults = rows.filter(row => row.kind === 'behavior-change');
    const summary = { seededFaults: faults.length, detectedByInitial: faults.filter(row => row.state !== 'inconclusive' && row.initialFailures > 0).length, detectedByCombined: faults.filter(row => row.state === 'detected').length, survived: faults.filter(row => row.state === 'survived').length, inconclusive: faults.filter(row => row.state === 'inconclusive').length, equivalentControls: rows.filter(row => row.kind === 'equivalent-control').length, controlsPreserved: rows.filter(row => row.state === 'control-preserved').length };
    const report = { version: 1, kind: 'seeded-fault-audit', candidateHash: digest(source), contractHash: clean.bindings.contract, reviewPlanHash: digest(planText), mutationPlanHash: digest(mutationText), summary, rows, limitations: ['Developer-selected seeded source changes, not exhaustive mutation testing or measured production defect recall.', 'Equivalent controls are reported separately. Inconclusive execution never counts as detection.', 'A passed pristine candidate is required; the source and original contract stay unchanged.'] };
    writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
    return report;
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected audit cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
}
