import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { prepareJob, digest } from './engine.ts';
import { adoptProposal } from './proposal.ts';
import { auditMutations } from './mutation.ts';
import { validatePreparationEvidence } from './preparation-display.ts';

// An independently authored teaching fixture. No source repository is an input.
export async function buildPreparationExample() {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-check-example-'));
  const save = (name: string, data: unknown) => { const p = join(root, name); writeFileSync(p, JSON.stringify(data, null, 2)); return p; };
  try {
    const source = "export function mapResponse(p:any){if(!p||!Number.isInteger(p.units)||p.units<0)throw new Error('Invalid units');return {units:p.units};}\n";
    const sourcePath = join(root, 'counter.ts'); writeFileSync(sourcePath, source);
    const contract = { version: 1, name: 'Synthetic unit counter', requirements: 'units must be a non-negative integer. Zero must stay zero. Invalid inputs throw Invalid units.', checks: [
      { id: 'positive', purpose: 'preserve', input: { units: 4 }, expected: { units: 4 } },
      { id: 'new-input', purpose: 'migration', input: { units: 9 }, expected: { units: 9 } },
      { id: 'negative', purpose: 'reject', input: { units: -2 }, error: 'Invalid units' },
    ] };
    const contractPath = save('contract.json', contract); const job = join(root, 'job'); prepareJob(contractPath, sourcePath, job);
    const proposal = { version: 1, kind: 'review-proposal', contractHash: digest(readFileSync(contractPath)), checks: [
      { check: { id: 'zero', purpose: 'preserve', input: { units: 0 }, expected: { units: 0 } }, quote: 'Zero must stay zero.', reason: 'Positive-only examples miss a truthiness fallback.' },
      { check: { id: 'fraction', purpose: 'reject', input: { units: 1.5 }, error: 'Invalid units' }, quote: 'units must be a non-negative integer.', reason: 'A fraction is not an integer.' },
      { check: { id: 'invented-default', purpose: 'migration', input: {}, expected: { units: 10 } }, quote: 'Missing units default to ten.', reason: 'Intentionally unsupported teaching proposal.' },
    ], questions: [] };
    const proposalPath = save('proposal.json', proposal);
    const decisions = { version: 1, kind: 'proposal-decisions', proposalHash: digest(readFileSync(proposalPath)), contractHash: proposal.contractHash, reviewer: { kind: 'independent-agent', name: 'Codex synthetic fixture author' }, decisions: [
      { id: 'zero', action: 'accept', reason: 'The exact rule requires preserving zero.' },
      { id: 'fraction', action: 'accept', reason: 'The integer rule explicitly rejects fractions.' },
      { id: 'invented-default', action: 'reject', reason: 'No such default exists in the requirements; the proposed result contradicts rejection.' },
    ] };
    const plan = join(root, 'review.json'); adoptProposal(job, proposalPath, save('decisions.json', decisions), plan);
    const mutations = { version: 1, kind: 'seeded-fault-plan', candidateHash: digest(source), mutations: [
      { id: 'false-zero', kind: 'behavior-change', from: 'return {units:p.units}', to: 'return {units:p.units||10}', reason: 'Valid zero is replaced with ten.' },
      { id: 'accept-negative', kind: 'behavior-change', from: 'p.units<0', to: 'false', reason: 'Negative counts are incorrectly accepted.' },
      { id: 'comment', kind: 'equivalent-control', from: 'return {units:p.units}', to: '/* unchanged behavior */ return {units:p.units}', reason: 'Only a comment changes.' },
    ] };
    const audit = await auditMutations(job, plan, save('mutations.json', mutations), join(root, 'audit.json'));
    const result = { version: 1, kind: 'synthetic-preparation-example', attribution: 'Codex-authored synthetic teaching fixture. No Bob call, source-project extraction or measured productivity claim.', modelCalls: 0, contract, source, proposal, decisions, audit };
    validatePreparationEvidence(result); return result;
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected example cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const result = await buildPreparationExample();
  writeFileSync('web/public/evidence/preparation-lab.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ proposals: result.proposal.checks.length, ...result.audit.summary, modelCalls: 0 }));
}
