import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { validateAnonymousObservation } from '../repair/preparation-display.ts';
import { checkPublicEvidence } from '../repair/check-public.ts';
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
test('public asset gate blocks aggregate leakage even when the file path is allowed', () => {
  const root = mkdtempSync(join(tmpdir(), 'public-schema-test-'));
  try {
    cpSync('web/public', root, { recursive: true });
    const data = observation(); data.source = 'unapproved source';
    writeFileSync(join(root, 'evidence/anonymous-observation.json'), JSON.stringify(data));
    assert.throws(() => checkPublicEvidence(root), /non-public fields/);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true });
  }
});
