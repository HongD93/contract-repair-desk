import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { validateAnonymousObservation } from '../repair/preparation-display.ts';
import { checkPublicEvidence } from '../repair/check-public.ts';
import { validateReviewReplay } from '../repair/review-display.ts';
const observation = () => JSON.parse(readFileSync('web/public/evidence/anonymous-observation.json', 'utf8'));

test('anonymous aggregates reject extra fields at every level, including apparently harmless text', () => {
  for (const position of ['root', 'faults', 'original', 'adopted', 'withheld']) {
    const value = observation(); (position === 'root' ? value : value[position]).notes = 'not for publication';
    assert.throws(() => validateAnonymousObservation(value), /non-public fields/);
  }
});
test('anonymous aggregates reject missing counts and strings hidden in numeric fields', () => {
  const missing = observation(); delete missing.faults.equivalentControls;
  assert.throws(() => validateAnonymousObservation(missing), /missing/);
  const text = observation(); text.original.pass = '3';
  assert.throws(() => validateAnonymousObservation(text), /counts conflict/);
  const huge = observation(); huge.withheld.total = Number.MAX_SAFE_INTEGER;
  assert.throws(() => validateAnonymousObservation(huge), /counts conflict/);
});
test('public asset gate accepts reviewed outputs and rejects unexpected files', () => {
  assert.ok(checkPublicEvidence().checkedAssets > 0);
  const root = mkdtempSync(join(tmpdir(), 'public-assets-test-'));
  try {
    cpSync('web/public', root, { recursive: true });
    writeFileSync(join(root, 'unreviewed.txt'), 'local draft');
    assert.throws(() => checkPublicEvidence(root), /allowlist mismatch/);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true });
  }
});
test('public asset gate blocks leakage and missing result fields even when file paths are allowed', () => {
  const root = mkdtempSync(join(tmpdir(), 'public-schema-test-'));
  try {
    cpSync('web/public', root, { recursive: true });
    const data = observation(); data.source = 'unapproved source';
    writeFileSync(join(root, 'evidence/anonymous-observation.json'), JSON.stringify(data));
    assert.throws(() => checkPublicEvidence(root), /non-public fields/);
    writeFileSync(join(root, 'evidence/anonymous-observation.json'), JSON.stringify(observation()));
    const review = () => JSON.parse(readFileSync('web/public/evidence/review-gate.json', 'utf8'));
    for (const mutate of [
      check => { delete check.expected; delete check.actual; },
      check => { delete check.actual; },
      check => { check.expected = {}; check.actual = {}; },
      check => { check.expected = { value: null, error: 'Invalid' }; },
      check => { check.actual = { error: 3 }; },
      check => { check.actual = null; },
    ]) {
      const value = review(); mutate(value.rows.find(row => row.report.outcome === 'review-passed').report.initial.checks[0]);
      writeFileSync(join(root, 'evidence/review-gate.json'), JSON.stringify(value));
      assert.throws(() => checkPublicEvidence(root), /Incomplete review result/);
    }
    const nullable = review();
    const check = nullable.rows.find(row => row.report.outcome === 'review-passed').report.initial.checks[0];
    check.expected = { value: null }; check.actual = { value: null };
    assert.doesNotThrow(() => validateReviewReplay(nullable));
    const timeout = review();
    const report = timeout.rows.find(row => row.report.outcome === 'review-passed').report;
    report.failure = 'Candidate timed out'; report.outcome = 'inconclusive';
    report.initial.checks[0].actual = null; report.initial.checks[0].passed = false;
    report.initial.pass--;
    report.failures.push({ ...report.initial.checks[0], scope: 'original', input: null });
    assert.doesNotThrow(() => validateReviewReplay(timeout));
    writeFileSync(join(root, 'evidence/review-gate.json'), JSON.stringify(review()));
    for (const mutate of [
      check => { delete check.input; },
      check => { delete check.expected; },
      check => { check.error = 'Invalid'; },
      check => { check.purpose = 'reject'; check.error = ''; delete check.expected; },
    ]) {
      const value = JSON.parse(readFileSync('web/public/evidence/preparation-lab.json', 'utf8'));
      mutate(value.proposal.checks[0].check);
      writeFileSync(join(root, 'evidence/preparation-lab.json'), JSON.stringify(value));
      assert.throws(() => checkPublicEvidence(root), /Incomplete proposal check/);
    }
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true });
  }
});
