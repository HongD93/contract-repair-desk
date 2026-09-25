/**
 * test/evidence.test.ts
 *
 * Tests for workflow/evidence.ts.
 * Uses node:test; isolated fixture copies; cleans up only its own temp dirs.
 *
 * NOTE: These tests cannot be executed by the code author's environment
 * at authoring time. Report files changed honestly; outcomes documented
 * are based on the logic and fixtures, not on a live test run.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the module under test.
// Using a relative path that will resolve from the temp-dir copies is not viable;
// we import directly from the source so the module itself locates projectRoot
// relative to its own __file. For captureEvidence we pass an explicit projectRoot
// to point at our isolated fixture trees.
import { escapeHtml, captureEvidence, parseTapCounts } from '../workflow/evidence.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

test('partial, duplicated, and inconsistent TAP summaries cannot establish success', () => {
  const full = '# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n';
  assert.equal(parseTapCounts(full).found, true);
  assert.equal(parseTapCounts(full.replace('# skipped 0\n', '')).found, false);
  assert.equal(parseTapCounts(full + '# pass 3\n').found, false);
  assert.equal(parseTapCounts(full.replace('# tests 3', '# tests 4')).found, false);
  assert.equal(parseTapCounts('').found, false);
});

test('HTML escapes hostile text emitted by the actual consumer process', async () => {
  const dir = buildFixtureProject({});
  const outputRoot = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    const consumer = join(dir, 'sample', 'consumer.ts');
    writeFileSync(consumer, readFileSync(consumer, 'utf8') + '\nconsole.log(\'<script>alert("log")</script>\');\n');
    const result = await captureEvidence({ projectRoot: dir, outputRoot });
    assert.ok(result.report.after.stdout.includes('<script>alert("log")</script>'));
    const html = readFileSync(result.htmlPath, 'utf8');
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;alert(&quot;log&quot;)&lt;/script&gt;'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

/** Create an isolated copy of a minimal project suitable for captureEvidence. */
function buildFixtureProject(opts: {
  /** Override sample/consumer.ts with this file path */
  consumerSrc?: string;
  /** Override fixtures/consumer-before.ts with this file path */
  beforeSrc?: string;
  /** Override fixtures/integrity.json with this content */
  integrityJson?: string;
  /** Override test/consumer.test.ts with this file path */
  testSrc?: string;
  /** Override sample/api.ts with this file path */
  apiSrc?: string;
}): string {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-fixture-'));

  mkdirSync(join(dir, 'sample'), { recursive: true });
  mkdirSync(join(dir, 'test'), { recursive: true });
  mkdirSync(join(dir, 'fixtures'), { recursive: true });

  // package.json — always copy the real one so type:module is set
  cpSync(join(projectRoot, 'package.json'), join(dir, 'package.json'));

  // sample/api.ts — use real unless overridden
  cpSync(
    opts.apiSrc ?? join(projectRoot, 'sample', 'api.ts'),
    join(dir, 'sample', 'api.ts'),
  );

  // sample/consumer.ts — use current repaired version unless overridden
  cpSync(
    opts.consumerSrc ?? join(projectRoot, 'sample', 'consumer.ts'),
    join(dir, 'sample', 'consumer.ts'),
  );

  // test/consumer.test.ts — use real unless overridden
  cpSync(
    opts.testSrc ?? join(projectRoot, 'test', 'consumer.test.ts'),
    join(dir, 'test', 'consumer.test.ts'),
  );

  // fixtures/consumer-before.ts — use real unless overridden
  cpSync(
    opts.beforeSrc ?? join(projectRoot, 'fixtures', 'consumer-before.ts'),
    join(dir, 'fixtures', 'consumer-before.ts'),
  );

  // fixtures/integrity.json — compute real hashes unless overridden
  if (opts.integrityJson !== undefined) {
    writeFileSync(join(dir, 'fixtures', 'integrity.json'), opts.integrityJson, 'utf8');
  } else {
    // Generate matching hashes for the files we just copied
    function hashFile(p: string): string {
      return createHash('sha256').update(readFileSync(p)).digest('hex');
    }
    const manifest = {
      'test/consumer.test.ts': hashFile(join(dir, 'test', 'consumer.test.ts')),
      'sample/api.ts': hashFile(join(dir, 'sample', 'api.ts')),
      'fixtures/consumer-before.ts': hashFile(join(dir, 'fixtures', 'consumer-before.ts')),
    };
    writeFileSync(join(dir, 'fixtures', 'integrity.json'), JSON.stringify(manifest, null, 2), 'utf8');
  }

  return dir;
}

/** Return a valid integrity.json object with correct hashes for a fixture dir. */
async function computeIntegrity(dir: string): Promise<Record<string, string>> {
  const { createHash } = await import('node:crypto');
  function hashFile(p: string): string {
    return createHash('sha256').update(readFileSync(p)).digest('hex');
  }
  return {
    'test/consumer.test.ts': hashFile(join(dir, 'test', 'consumer.test.ts')),
    'sample/api.ts': hashFile(join(dir, 'sample', 'api.ts')),
    'fixtures/consumer-before.ts': hashFile(join(dir, 'fixtures', 'consumer-before.ts')),
  };
}

// ---------------------------------------------------------------------------
// escapeHtml unit tests
// ---------------------------------------------------------------------------

test('escapeHtml: escapes ampersand', () => {
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml: escapes less-than', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
});

test('escapeHtml: escapes double quote', () => {
  assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;');
});

test('escapeHtml: escapes single quote', () => {
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml: injected log text is safe in HTML context', () => {
  const malicious = '<img src=x onerror="alert(1)"> & "test" \'value\'';
  const escaped = escapeHtml(malicious);
  assert.ok(!escaped.includes('<img'), 'raw < not present');
  assert.ok(!escaped.includes('>'), 'raw > not present');
  assert.ok(!escaped.includes('"test"'), 'raw double quote not present');
  assert.ok(escaped.includes('&lt;img'), 'lt; escaped');
  assert.ok(escaped.includes('&amp;'), 'amp escaped');
  assert.ok(escaped.includes('&quot;'), 'quot escaped');
  assert.ok(escaped.includes('&#39;'), 'apos escaped');
});

test('escapeHtml: plain text passes through unchanged', () => {
  assert.equal(escapeHtml('hello world'), 'hello world');
});

// ---------------------------------------------------------------------------
// Integrity rejection tests (must fail before spawning any tests)
// ---------------------------------------------------------------------------

test('captureEvidence rejects tampered test file hash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-fixture-'));
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    mkdirSync(join(dir, 'sample'), { recursive: true });
    mkdirSync(join(dir, 'test'), { recursive: true });
    mkdirSync(join(dir, 'fixtures'), { recursive: true });

    cpSync(join(projectRoot, 'package.json'), join(dir, 'package.json'));
    cpSync(join(projectRoot, 'sample', 'api.ts'), join(dir, 'sample', 'api.ts'));
    cpSync(join(projectRoot, 'test', 'consumer.test.ts'), join(dir, 'test', 'consumer.test.ts'));
    cpSync(join(projectRoot, 'fixtures', 'consumer-before.ts'), join(dir, 'fixtures', 'consumer-before.ts'));
    cpSync(join(projectRoot, 'sample', 'consumer.ts'), join(dir, 'sample', 'consumer.ts'));

    const integrity = await computeIntegrity(dir);
    // Tamper the test file hash
    integrity['test/consumer.test.ts'] = 'a'.repeat(64);
    writeFileSync(join(dir, 'fixtures', 'integrity.json'), JSON.stringify(integrity), 'utf8');

    await assert.rejects(
      () => captureEvidence({ projectRoot: dir, outputRoot: outDir }),
      (err: Error) => {
        assert.ok(err.message.includes('Integrity check failed'), `expected integrity error, got: ${err.message}`);
        return true;
      },
    );
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence rejects tampered api.ts hash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-fixture-'));
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    mkdirSync(join(dir, 'sample'), { recursive: true });
    mkdirSync(join(dir, 'test'), { recursive: true });
    mkdirSync(join(dir, 'fixtures'), { recursive: true });

    cpSync(join(projectRoot, 'package.json'), join(dir, 'package.json'));
    cpSync(join(projectRoot, 'sample', 'api.ts'), join(dir, 'sample', 'api.ts'));
    cpSync(join(projectRoot, 'test', 'consumer.test.ts'), join(dir, 'test', 'consumer.test.ts'));
    cpSync(join(projectRoot, 'fixtures', 'consumer-before.ts'), join(dir, 'fixtures', 'consumer-before.ts'));
    cpSync(join(projectRoot, 'sample', 'consumer.ts'), join(dir, 'sample', 'consumer.ts'));

    const integrity = await computeIntegrity(dir);
    integrity['sample/api.ts'] = 'b'.repeat(64);
    writeFileSync(join(dir, 'fixtures', 'integrity.json'), JSON.stringify(integrity), 'utf8');

    await assert.rejects(
      () => captureEvidence({ projectRoot: dir, outputRoot: outDir }),
      (err: Error) => {
        assert.ok(err.message.includes('Integrity check failed'), `expected integrity error, got: ${err.message}`);
        return true;
      },
    );
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence rejects tampered consumer-before.ts hash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-fixture-'));
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    mkdirSync(join(dir, 'sample'), { recursive: true });
    mkdirSync(join(dir, 'test'), { recursive: true });
    mkdirSync(join(dir, 'fixtures'), { recursive: true });

    cpSync(join(projectRoot, 'package.json'), join(dir, 'package.json'));
    cpSync(join(projectRoot, 'sample', 'api.ts'), join(dir, 'sample', 'api.ts'));
    cpSync(join(projectRoot, 'test', 'consumer.test.ts'), join(dir, 'test', 'consumer.test.ts'));
    cpSync(join(projectRoot, 'fixtures', 'consumer-before.ts'), join(dir, 'fixtures', 'consumer-before.ts'));
    cpSync(join(projectRoot, 'sample', 'consumer.ts'), join(dir, 'sample', 'consumer.ts'));

    const integrity = await computeIntegrity(dir);
    integrity['fixtures/consumer-before.ts'] = 'c'.repeat(64);
    writeFileSync(join(dir, 'fixtures', 'integrity.json'), JSON.stringify(integrity), 'utf8');

    await assert.rejects(
      () => captureEvidence({ projectRoot: dir, outputRoot: outDir }),
      (err: Error) => {
        assert.ok(err.message.includes('Integrity check failed'), `expected integrity error, got: ${err.message}`);
        return true;
      },
    );
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence rejects malformed integrity.json (missing key)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-fixture-'));
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    mkdirSync(join(dir, 'sample'), { recursive: true });
    mkdirSync(join(dir, 'test'), { recursive: true });
    mkdirSync(join(dir, 'fixtures'), { recursive: true });

    cpSync(join(projectRoot, 'package.json'), join(dir, 'package.json'));
    cpSync(join(projectRoot, 'sample', 'api.ts'), join(dir, 'sample', 'api.ts'));
    cpSync(join(projectRoot, 'test', 'consumer.test.ts'), join(dir, 'test', 'consumer.test.ts'));
    cpSync(join(projectRoot, 'fixtures', 'consumer-before.ts'), join(dir, 'fixtures', 'consumer-before.ts'));
    cpSync(join(projectRoot, 'sample', 'consumer.ts'), join(dir, 'sample', 'consumer.ts'));

    // Missing 'sample/api.ts' key
    const integrity = {
      'test/consumer.test.ts': 'a'.repeat(64),
      'fixtures/consumer-before.ts': 'b'.repeat(64),
    };
    writeFileSync(join(dir, 'fixtures', 'integrity.json'), JSON.stringify(integrity), 'utf8');

    await assert.rejects(
      () => captureEvidence({ projectRoot: dir, outputRoot: outDir }),
      (err: Error) => {
        assert.ok(
          err.message.includes('malformed') || err.message.includes('Integrity'),
          `expected malformed/integrity error, got: ${err.message}`,
        );
        return true;
      },
    );
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence rejects invalid JSON in integrity.json', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-fixture-'));
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    mkdirSync(join(dir, 'sample'), { recursive: true });
    mkdirSync(join(dir, 'test'), { recursive: true });
    mkdirSync(join(dir, 'fixtures'), { recursive: true });

    cpSync(join(projectRoot, 'package.json'), join(dir, 'package.json'));
    cpSync(join(projectRoot, 'sample', 'api.ts'), join(dir, 'sample', 'api.ts'));
    cpSync(join(projectRoot, 'test', 'consumer.test.ts'), join(dir, 'test', 'consumer.test.ts'));
    cpSync(join(projectRoot, 'fixtures', 'consumer-before.ts'), join(dir, 'fixtures', 'consumer-before.ts'));
    cpSync(join(projectRoot, 'sample', 'consumer.ts'), join(dir, 'sample', 'consumer.ts'));

    writeFileSync(join(dir, 'fixtures', 'integrity.json'), '{ not valid json', 'utf8');

    await assert.rejects(
      () => captureEvidence({ projectRoot: dir, outputRoot: outDir }),
      (err: Error) => {
        assert.ok(
          err.message.includes('integrity.json') || err.message.includes('parsed'),
          `expected parse error, got: ${err.message}`,
        );
        return true;
      },
    );
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// Full workflow tests (before failure / after success)
// ---------------------------------------------------------------------------

test('captureEvidence: before (fixtures/consumer-before.ts) yields failing tests', async () => {
  // Use the real project root — integrity.json hashes match the real files.
  // The "before" consumer does not handle displayName, so renamed-title fails.
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    const result = await captureEvidence({ projectRoot, outputRoot: outDir });

    // before must NOT be inconclusive
    assert.equal(result.report.before.inconclusive, false, 'before run must not be inconclusive');

    // before should have exit code 1 (some tests fail)
    assert.equal(result.report.before.exitCode, 1, 'before run must exit with code 1');

    // before should have 2 passing and 1 failing
    assert.equal(result.report.before.pass, 2, 'before run: expected 2 passing tests');
    assert.equal(result.report.before.fail, 1, 'before run: expected 1 failing test');
    assert.equal(result.report.before.skip, 0, 'before run: expected 0 skipped');
    assert.equal(result.report.before.cancel, 0, 'before run: expected 0 cancelled');
    assert.ok(!result.report.before.stdout.includes(tmpdir()));
    assert.ok(!result.report.before.stdout.includes(tmpdir().replaceAll('\\', '\\\\')));
  } finally {
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence: after (sample/consumer.ts) yields all tests passing', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    const result = await captureEvidence({ projectRoot, outputRoot: outDir });

    // after must NOT be inconclusive
    assert.equal(result.report.after.inconclusive, false, 'after run must not be inconclusive');

    // after should have exit code 0 (all tests pass)
    assert.equal(result.report.after.exitCode, 0, 'after run must exit with code 0');

    // after should have 3 passing and 0 failing
    assert.equal(result.report.after.pass, 3, 'after run: expected 3 passing tests');
    assert.equal(result.report.after.fail, 0, 'after run: expected 0 failing tests');
    assert.equal(result.report.after.skip, 0, 'after run: expected 0 skipped');
    assert.equal(result.report.after.cancel, 0, 'after run: expected 0 cancelled');
  } finally {
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence: overall outcome is verified-repair', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    const result = await captureEvidence({ projectRoot, outputRoot: outDir });
    assert.equal(result.report.outcome, 'verified-repair');
  } finally {
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence: report has correct schema fields', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    const result = await captureEvidence({ projectRoot, outputRoot: outDir });
    const r = result.report;

    assert.equal(r.schemaVersion, 1);
    assert.equal(r.kind, 'replayed-verification');
    assert.ok(typeof r.runId === 'string' && r.runId.length > 0, 'runId must be present');
    assert.ok(typeof r.generatedAt === 'string' && r.generatedAt.length > 0, 'generatedAt must be present');
    assert.ok(typeof r.nodeVersion === 'string' && r.nodeVersion.startsWith('v'), 'nodeVersion must start with v');
    assert.ok(typeof r.inputs === 'object' && r.inputs !== null, 'inputs must be object');
    assert.ok(Array.isArray(r.limitations) && r.limitations.length > 0, 'limitations must be non-empty array');
  } finally {
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence: original consumer file is not overwritten', async () => {
  const consumerPath = join(projectRoot, 'sample', 'consumer.ts');
  const originalContent = readFileSync(consumerPath, 'utf8');
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    await captureEvidence({ projectRoot, outputRoot: outDir });
    const afterContent = readFileSync(consumerPath, 'utf8');
    assert.equal(afterContent, originalContent, 'sample/consumer.ts must not be modified');
  } finally {
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence: original consumer-before.ts fixture is not overwritten', async () => {
  const beforePath = join(projectRoot, 'fixtures', 'consumer-before.ts');
  const originalContent = readFileSync(beforePath, 'utf8');
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    await captureEvidence({ projectRoot, outputRoot: outDir });
    const afterContent = readFileSync(beforePath, 'utf8');
    assert.equal(afterContent, originalContent, 'fixtures/consumer-before.ts must not be modified');
  } finally {
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence: separate runs produce separate output directories', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    const r1 = await captureEvidence({ projectRoot, outputRoot: outDir });
    const r2 = await captureEvidence({ projectRoot, outputRoot: outDir });

    // Run IDs must differ
    assert.notEqual(r1.report.runId, r2.report.runId, 'runIds must be unique');

    // Output paths must differ
    assert.notEqual(r1.jsonPath, r2.jsonPath, 'jsonPaths must differ');
    assert.notEqual(r1.htmlPath, r2.htmlPath, 'htmlPaths must differ');

    // Both output files must exist
    assert.ok(existsSync(r1.jsonPath), 'first run json must exist');
    assert.ok(existsSync(r2.jsonPath), 'second run json must exist');
  } finally {
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('captureEvidence: JSON and HTML report files are written', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    const result = await captureEvidence({ projectRoot, outputRoot: outDir });

    assert.ok(existsSync(result.jsonPath), 'evidence.json must exist');
    assert.ok(existsSync(result.htmlPath), 'evidence.html must exist');

    // JSON must parse to the same report
    const parsed = JSON.parse(readFileSync(result.jsonPath, 'utf8'));
    assert.equal(parsed.runId, result.report.runId);
    assert.equal(parsed.outcome, result.report.outcome);

    // HTML must be a non-empty string containing the run ID (escaped)
    const html = readFileSync(result.htmlPath, 'utf8');
    assert.ok(html.includes(result.report.runId), 'HTML must contain the runId');
    assert.ok(html.startsWith('<!DOCTYPE html>'), 'HTML must start with DOCTYPE');
  } finally {
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// Broken consumer → not-repaired
// ---------------------------------------------------------------------------

test('captureEvidence with broken after-consumer yields not-repaired', async () => {
  // Create an isolated project where BOTH consumer.ts and consumer-before.ts
  // are the broken (before) version. In this case:
  //   - before run: exit 1 (correct for not-repaired check)
  //   - after run:  exit 1 (not repaired)
  // Outcome should be not-repaired.

  const dir = mkdtempSync(join(tmpdir(), 'evidence-fixture-'));
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    mkdirSync(join(dir, 'sample'), { recursive: true });
    mkdirSync(join(dir, 'test'), { recursive: true });
    mkdirSync(join(dir, 'fixtures'), { recursive: true });

    cpSync(join(projectRoot, 'package.json'), join(dir, 'package.json'));
    cpSync(join(projectRoot, 'sample', 'api.ts'), join(dir, 'sample', 'api.ts'));
    cpSync(join(projectRoot, 'test', 'consumer.test.ts'), join(dir, 'test', 'consumer.test.ts'));
    // Both before and current consumer are the broken version
    cpSync(join(projectRoot, 'fixtures', 'consumer-before.ts'), join(dir, 'fixtures', 'consumer-before.ts'));
    cpSync(join(projectRoot, 'fixtures', 'consumer-before.ts'), join(dir, 'sample', 'consumer.ts'));

    // Generate matching integrity for this fixture tree
    const { createHash } = await import('node:crypto');
    function hashFile(p: string): string {
      return createHash('sha256').update(readFileSync(p)).digest('hex');
    }
    const integrity = {
      'test/consumer.test.ts': hashFile(join(dir, 'test', 'consumer.test.ts')),
      'sample/api.ts': hashFile(join(dir, 'sample', 'api.ts')),
      'fixtures/consumer-before.ts': hashFile(join(dir, 'fixtures', 'consumer-before.ts')),
    };
    writeFileSync(join(dir, 'fixtures', 'integrity.json'), JSON.stringify(integrity, null, 2), 'utf8');

    const result = await captureEvidence({ projectRoot: dir, outputRoot: outDir });

    // After run should also fail since consumer is still broken
    assert.equal(result.report.after.exitCode, 1, 'after run should fail with broken consumer');
    assert.notEqual(result.report.outcome, 'verified-repair', 'outcome must not be verified-repair');
    assert.ok(
      result.report.outcome === 'not-repaired' || result.report.outcome === 'inconclusive',
      `outcome should be not-repaired or inconclusive, got: ${result.report.outcome}`,
    );
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// HTML escaping of injected log text
// ---------------------------------------------------------------------------

test('HTML report escapes injected log content', async () => {
  // We run the normal captureEvidence and confirm the HTML does not contain
  // unescaped < or > from actual TAP output (which contains things like "not ok").
  // Additionally we directly verify escapeHtml with representative log-injection strings.
  const outDir = mkdtempSync(join(tmpdir(), 'evidence-out-'));
  try {
    const result = await captureEvidence({ projectRoot, outputRoot: outDir });
    const html = readFileSync(result.htmlPath, 'utf8');

    // The HTML must not contain raw < outside of tag contexts.
    // Strategy: strip all HTML tags and check the text node content doesn't have raw <>.
    // More pragmatically: confirm that any occurrence of 'not ok' in TAP output
    // is only seen escaped (&lt;) if it were to contain angle brackets.
    // Direct test: inject a malicious string through escapeHtml and verify the HTML
    // would have contained it safely.
    const injected = '<script>alert("xss")</script>';
    const escaped = escapeHtml(injected);
    assert.ok(!escaped.includes('<script>'), 'escaped output must not contain raw <script>');
    assert.ok(escaped.includes('&lt;script&gt;'), 'escaped output must contain &lt;script&gt;');

    // The HTML file itself must not have obvious unescaped injection from logs
    // (TAP output is text, but we verify the HTML doesn't have raw <script> injected)
    assert.ok(!html.includes('<script>alert'), 'HTML must not contain unescaped script injection');
  } finally {
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('escapeHtml handles all five characters requiring HTML entity encoding', () => {
  // & < > " '
  const input = `& < > " '`;
  const output = escapeHtml(input);
  assert.ok(output.includes('&amp;'), 'must encode &');
  assert.ok(output.includes('&lt;'), 'must encode <');
  assert.ok(output.includes('&gt;'), 'must encode >');
  assert.ok(output.includes('&quot;'), 'must encode "');
  assert.ok(output.includes('&#39;'), "must encode '");
  // None of the original characters should remain
  assert.ok(!output.includes(' & '), 'raw & should not remain');
  // Note: checking raw " and ' presence is tricky since they appear in assert messages;
  // instead confirm the replacements were made above.
});
