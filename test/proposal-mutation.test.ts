import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareJob, digest } from '../repair/engine.ts';
import { prepareProposal, inspectProposal, adoptProposal } from '../repair/proposal.ts';
import { auditMutations } from '../repair/mutation.ts';
import { buildPreparationExample } from '../repair/publish-preparation.ts';
import { validatePreparationEvidence, validateAnonymousObservation } from '../repair/preparation-display.ts';

const source = `export function mapResponse(p:any){if(!p || !Number.isInteger(p.n) || p.n<0)throw new Error('Invalid');return {n:p.n};}`;
async function fixture(work: (v: any) => any) {
  const root = mkdtempSync(join(tmpdir(), 'proposal-audit-test-'));
  const contract = { version: 1, name: 'Count', requirements: 'n must be a non-negative integer. Zero must stay zero. Invalid values throw Invalid.', checks: [
    { id: 'old', purpose: 'preserve', input: { n: 1 }, expected: { n: 1 } },
    { id: 'new', purpose: 'migration', input: { n: 2 }, expected: { n: 2 } },
    { id: 'bad', purpose: 'reject', input: { n: -1 }, error: 'Invalid' },
  ] };
  const contractPath = join(root, 'contract.json'); writeFileSync(contractPath, JSON.stringify(contract));
  const sourcePath = join(root, 'consumer.ts'); writeFileSync(sourcePath, source);
  const job = join(root, 'job'); prepareJob(contractPath, sourcePath, job);
  const check = { id: 'zero', purpose: 'preserve', input: { n: 0 }, expected: { n: 0 } };
  const proposal = { version: 1, kind: 'review-proposal', contractHash: digest(readFileSync(contractPath)), checks: [{ check, quote: 'Zero must stay zero.', reason: 'The initial checks contain only nonzero valid counts.' }], questions: [] };
  const proposalPath = join(root, 'proposal.json'); writeFileSync(proposalPath, JSON.stringify(proposal));
  const decision = { version: 1, kind: 'proposal-decisions', proposalHash: digest(readFileSync(proposalPath)), contractHash: proposal.contractHash, reviewer: { kind: 'independent-agent', name: 'Test reviewer' }, decisions: [{ id: 'zero', action: 'accept', reason: 'Exact output follows the quoted requirement.' }] };
  const decisionPath = join(root, 'decisions.json'); writeFileSync(decisionPath, JSON.stringify(decision));
  const planPath = join(root, 'plan.json');
  writeFileSync(planPath, JSON.stringify({ version: 1, kind: 'boundary-review', name: 'Zero review', basis: 'Explicit zero requirement', checks: [check] }));
  const mutations = { version: 1, kind: 'seeded-fault-plan', candidateHash: digest(source), mutations: [
    { id: 'zero-default', kind: 'behavior-change', from: 'return {n:p.n}', to: 'return {n:p.n||1}', reason: 'Valid zero becomes one.' },
    { id: 'negative-accepted', kind: 'behavior-change', from: 'p.n<0', to: 'false', reason: 'Negative counts are accepted.' },
    { id: 'comment-only', kind: 'equivalent-control', from: 'return {n:p.n}', to: '/* equivalent */ return {n:p.n}', reason: 'Only a comment is added.' },
  ] };
  const mutationsPath = join(root, 'mutations.json'); writeFileSync(mutationsPath, JSON.stringify(mutations));
  const output = join(root, 'audit.json');
  try { await work({ root, job, contractPath, proposal, proposalPath, decision, decisionPath, planPath, mutations, mutationsPath, output }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test('proposal preparation excludes candidate code and keeps the draft unapproved until explicit decisions', () => fixture(v => {
  const target = join(v.root, 'draft');
  assert.equal(prepareProposal(v.job, target).automaticallyAdopted, false);
  assert.equal(existsSync(join(target, 'candidate.ts')), false);
  assert.throws(() => prepareProposal(v.job, target), /already exists/);
  const original = readFileSync(join(v.job, 'contract.json'), 'utf8');
  const result = adoptProposal(v.job, v.proposalPath, v.decisionPath, join(v.root, 'adopted.json'));
  assert.equal(result.accepted, 1); assert.equal(result.humanApproved, false);
  assert.equal(readFileSync(join(v.job, 'contract.json'), 'utf8'), original);
  assert.throws(() => adoptProposal(v.job, v.proposalPath, v.decisionPath, join(v.root, 'adopted.json')), /EEXIST/);
}));

test('invented requirement quotes and stale proposal decisions are refused', () => fixture(v => {
  v.proposal.checks[0].quote = 'Negative values are okay'; writeFileSync(v.proposalPath, JSON.stringify(v.proposal));
  assert.equal(inspectProposal(v.job, v.proposalPath).grounding[0].quoteMatches, false);
  v.decision.proposalHash = digest(readFileSync(v.proposalPath)); writeFileSync(v.decisionPath, JSON.stringify(v.decision));
  assert.throws(() => adoptProposal(v.job, v.proposalPath, v.decisionPath, v.output), /matching requirement/);
  v.proposal.checks[0].quote = 'Zero must stay zero.'; v.proposal.checks[0].reason += ' More context.'; writeFileSync(v.proposalPath, JSON.stringify(v.proposal));
  assert.throws(() => adoptProposal(v.job, v.proposalPath, v.decisionPath, v.output), /stale proposal/);
  assert.equal(existsSync(v.output), false);
}));

test('ambiguous requirements and missing decisions cannot silently become approved expectations', () => fixture(v => {
  v.proposal.questions = ['Does negative mean missing?']; writeFileSync(v.proposalPath, JSON.stringify(v.proposal));
  assert.throws(() => adoptProposal(v.job, v.proposalPath, v.decisionPath, v.output), /Resolve proposal questions/);
  v.proposal.questions = []; writeFileSync(v.proposalPath, JSON.stringify(v.proposal));
  v.decision.decisions = []; writeFileSync(v.decisionPath, JSON.stringify(v.decision));
  assert.throws(() => adoptProposal(v.job, v.proposalPath, v.decisionPath, v.output), /Missing independent decisions/);
}));

test('rejected checks stay out and a proposal cannot shadow an original check', () => fixture(v => {
  v.decision.decisions[0].action = 'reject'; writeFileSync(v.decisionPath, JSON.stringify(v.decision));
  assert.throws(() => adoptProposal(v.job, v.proposalPath, v.decisionPath, v.output), /No checks accepted/);
  v.proposal.checks[0].check.id = 'old'; writeFileSync(v.proposalPath, JSON.stringify(v.proposal));
  assert.throws(() => inspectProposal(v.job, v.proposalPath), /unique id/);
}));

test('seeded-fault audit compares initial versus added checks and preserves equivalent controls', () => fixture(async v => {
  const before = readFileSync(join(v.job, 'candidate.ts'), 'utf8');
  const report = await auditMutations(v.job, v.planPath, v.mutationsPath, v.output);
  assert.deepEqual(report.summary, { seededFaults: 2, detectedByInitial: 1, detectedByCombined: 2, survived: 0, inconclusive: 0, equivalentControls: 1, controlsPreserved: 1 });
  assert.equal(readFileSync(join(v.job, 'candidate.ts'), 'utf8'), before);
  await assert.rejects(auditMutations(v.job, v.planPath, v.mutationsPath, v.output), /already exists/);
}));

test('stale candidates and ambiguous replacement spans cannot produce mutation metrics', () => fixture(async v => {
  v.mutations.candidateHash = '0'.repeat(64); writeFileSync(v.mutationsPath, JSON.stringify(v.mutations));
  await assert.rejects(auditMutations(v.job, v.planPath, v.mutationsPath, v.output), /stale mutation/);
  v.mutations.candidateHash = digest(source); v.mutations.mutations[0].from = 'p'; writeFileSync(v.mutationsPath, JSON.stringify(v.mutations));
  await assert.rejects(auditMutations(v.job, v.planPath, v.mutationsPath, v.output), /exactly one source span/);
  assert.equal(existsSync(v.output), false);
}));

test('inconclusive mutants are not counted as caught faults; failing pristine code blocks the audit', () => fixture(async v => {
  v.mutations.mutations = [{ id: 'hang', kind: 'behavior-change', from: 'return {n:p.n}', to: 'while(true){};return {n:p.n}', reason: 'A hanging adapter is inconclusive, not proof of semantic detection.' }];
  writeFileSync(v.mutationsPath, JSON.stringify(v.mutations));
  const report = await auditMutations(v.job, v.planPath, v.mutationsPath, v.output, { timeoutMs: 300 });
  assert.equal(report.summary.inconclusive, 1); assert.equal(report.summary.detectedByCombined, 0);
  const broken = source.replace('return {n:p.n}', 'return {n:7}'); writeFileSync(join(v.job, 'candidate.ts'), broken);
  v.mutations.candidateHash = digest(broken); v.mutations.mutations[0].from = 'return {n:7}'; writeFileSync(v.mutationsPath, JSON.stringify(v.mutations));
  await assert.rejects(auditMutations(v.job, v.planPath, v.mutationsPath, join(v.root, 'broken.json')), /Unmodified candidate must pass/);
}));

test('public synthetic example replays decisions and fault checks without a model or source project', async () => {
  const result = await buildPreparationExample();
  assert.equal(result.modelCalls, 0);
  assert.deepEqual(result.audit.summary, { seededFaults: 2, detectedByInitial: 1, detectedByCombined: 2, survived: 0, inconclusive: 0, equivalentControls: 1, controlsPreserved: 1 });
  const invalid = structuredClone(result); invalid.decisions.decisions[2].action = 'accept';
  assert.throws(() => validatePreparationEvidence(invalid), /adoption conflicts/);
  const inflated = structuredClone(result); inflated.audit.summary.detectedByCombined = 9;
  assert.throws(() => validatePreparationEvidence(inflated), /summary conflicts/);
});

test('anonymous observed aggregates remain distinct from synthetic evidence and reject contradictory totals', () => {
  const result = JSON.parse(readFileSync('web/public/evidence/anonymous-observation.json', 'utf8'));
  validateAnonymousObservation(result);
  assert.throws(() => validatePreparationEvidence(result), /synthetic attribution/);
  const invalid = structuredClone(result); invalid.accepted += 1;
  assert.throws(() => validateAnonymousObservation(invalid), /counts conflict/);
  const inflated = structuredClone(result); inflated.postAuditDetected = 99;
  assert.throws(() => validateAnonymousObservation(inflated), /fault counts conflict/);
});
