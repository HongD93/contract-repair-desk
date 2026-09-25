import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareJob } from './engine.ts';
import { reviewJob, reviewStatus } from './review.ts';

// A replay of already observed gaps. No new model invocation or blind efficacy claim.
const cases = ['stock-plain', 'stock-guided', 'dispatch-plain', 'dispatch-guided', 'booking-plain', 'booking-guided', 'stock-ide', 'booking-followup'];
const root = mkdtempSync(join(tmpdir(), 'review-replay-'));
const rows = [];
let freshness;
try {
  for (const id of cases) {
    const caseId = id.split('-')[0];
    const job = join(root, id);
    prepareJob(`repair/examples/${caseId}.contract.json`, `repair/examples/${caseId}.consumer.ts`, job);
    copyFileSync(`repair/recorded/${id}.ts`, join(job, 'candidate.ts'));
    const plan = `repair/examples/${caseId}.review.json`;
    const output = join(root, `${id}-review`);
    const report = await reviewJob(job, plan, output);
    const handoff = readFileSync(join(output, 'FOLLOW_UP.md'), 'utf8');
    rows.push({ id, caseId, role: id === 'stock-ide' ? 'separate-corrected-ide-control' : id === 'booking-followup' ? 'separate-shell-followup' : 'original-shell-study-candidate', report, handoff });
    if (id === 'stock-ide') {
      const before = reviewStatus(job, plan, output);
      writeFileSync(join(job, 'candidate.ts'), readFileSync(join(job, 'candidate.ts'), 'utf8') + '\n// edit after review\n');
      freshness = { before, after: reviewStatus(job, plan, output), mutation: 'A comment appended after review changes the candidate hash; even this edit requires a new review.' };
    }
  }
  const candidates = rows.filter(row => row.role === 'original-shell-study-candidate');
  const payload = {
    version: 1, kind: 'known-gap-gate-replay', generatedAt: new Date().toISOString(),
    scope: 'Replay of six unchanged original Shell candidates, a separate actual IDE stock follow-up, and a separate Shell booking follow-up. This replay itself makes no model calls.',
    bookingFollowup: { original: 'booking-guided', corrected: 'booking-followup', bobcoins: 0.098678, attempts: 1, provenance: 'One actual Bob Shell read/edit-only task received the generated failure handoff plus the unchanged contract and review plan. Codex executed the subsequent checks; the model did not run commands.' },
    summary: {
      candidates: candidates.length,
      acceptedByInitialChecks: candidates.filter(row => row.report.initial.pass === row.report.initial.total).length,
      stoppedByReview: candidates.filter(row => row.report.outcome === 'changes-requested').length,
      failedAssertionsPackaged: candidates.reduce((sum, row) => sum + row.report.failures.length, 0),
    },
    limitations: [
      'These gaps were already known before the replay; this is not a blind or independent holdout evaluation.',
      'The added expectations are written by a developer. Authoring and reviewing them still takes work.',
      'The stronger gate runs more checks. This is not evidence that it outperforms a person running the same checks.',
      'This demonstrates automatic failure packaging and stale-result rejection, not faster or more accurate model generation.',
    ],
    rows, freshness,
  };
  mkdirSync('web/public/evidence', { recursive: true });
  writeFileSync('web/public/evidence/review-gate.json', JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ...payload.summary, correctedIDE: rows.find(row => row.id === 'stock-ide')?.report.outcome, bookingFollowup: rows.at(-1)?.report.outcome, staleAfterEdit: freshness?.after.outcome }));
} finally {
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected replay cleanup path');
  rmSync(root, { recursive: true, force: true });
}
