/**
 * workflow/evidence.ts
 *
 * Evidence workflow module for contract-repair-desk.
 * Replays test execution with the before-fixture and the current consumer,
 * then emits a JSON + HTML evidence report.
 *
 * CLI:  node workflow/evidence.ts --output <directory>
 * API:  captureEvidence({ projectRoot?, outputRoot })
 */

import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Spawn-level error message, if any */
  spawnError: string | null;
  /** True if the process was killed due to timeout or signal */
  timedOut: boolean;
  signal: string | null;
  total: number;
  pass: number;
  fail: number;
  skip: number;
  cancel: number;
  /** True when we could not determine outcome reliably */
  inconclusive: boolean;
}

export interface EvidenceReport {
  schemaVersion: 1;
  runId: string;
  generatedAt: string;
  kind: 'replayed-verification';
  nodeVersion: string;
  inputs: Record<string, string>;
  before: RunResult;
  after: RunResult;
  outcome: 'verified-repair' | 'inconclusive' | 'not-repaired';
  limitations: string[];
}

export interface CaptureResult {
  report: EvidenceReport;
  jsonPath: string;
  htmlPath: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Expected test counts – must never be inferred from exit code alone.
const EXPECTED_TOTAL = 3;
const BEFORE_EXPECTED_PASS = 2;
const BEFORE_EXPECTED_FAIL = 1;
const AFTER_EXPECTED_PASS = 3;
const AFTER_EXPECTED_FAIL = 0;

const LIMITATIONS: string[] = [
  'This report replays a saved initial fixture (fixtures/consumer-before.ts) and the current source file (sample/consumer.ts) in isolated temporary directories.',
  'It does not invoke Bob, measure developer time, record Bob session metadata, or prove rendered UI behaviour.',
  'Hashes in fixtures/integrity.json provide local change-detection only; they are not cryptographic attestation against a malicious owner who modifies both the manifest and the source files.',
  'Tests use a loopback HTTP fixture. No external service calls, npm installs, or automatic fixes are performed.',
  'Temporary directory paths in process logs are replaced with [isolated-run] for sharing.',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape a string for safe inclusion in HTML. */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sha256Hex(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// Integrity verification
// ---------------------------------------------------------------------------

interface IntegrityManifest {
  'test/consumer.test.ts': string;
  'sample/api.ts': string;
  'fixtures/consumer-before.ts': string;
}

const REQUIRED_MANIFEST_KEYS: (keyof IntegrityManifest)[] = [
  'test/consumer.test.ts',
  'sample/api.ts',
  'fixtures/consumer-before.ts',
];

function verifyIntegrity(projectRoot: string): void {
  const manifestPath = join(projectRoot, 'fixtures', 'integrity.json');
  let manifest: IntegrityManifest;

  try {
    const raw = readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(raw) as IntegrityManifest;
  } catch (err) {
    throw new Error(`integrity.json could not be read or parsed: ${(err as Error).message}`);
  }

  if (!manifest || typeof manifest !== 'object') throw new Error('integrity.json is malformed');
  for (const key of REQUIRED_MANIFEST_KEYS) {
    if (typeof manifest[key] !== 'string' || manifest[key].trim() === '') {
      throw new Error(`integrity.json is malformed: missing or empty entry for "${key}"`);
    }
  }

  for (const key of REQUIRED_MANIFEST_KEYS) {
    const filePath = join(projectRoot, key);
    let content: Buffer;
    try {
      content = readFileSync(filePath);
    } catch (err) {
      throw new Error(`Integrity check failed: cannot read "${key}": ${(err as Error).message}`);
    }
    const actual = sha256Hex(content);
    const expected = manifest[key];
    if (actual !== expected) {
      throw new Error(
        `Integrity check failed for "${key}": expected ${expected}, got ${actual}. ` +
        `Abort — file has been modified since the baseline was recorded.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// TAP log parsing
// ---------------------------------------------------------------------------

export function parseTapCounts(stdout: string): { total: number; pass: number; fail: number; skip: number; cancel: number; found: boolean } {
  // node:test TAP reporter emits lines like:
  //   # tests 3
  //   # pass 2
  //   # fail 1
  //   # skipped 0
  //   # cancelled 0
  const values = ['tests', 'pass', 'fail', 'skipped', 'cancelled'].map(key => {
    const matches = [...stdout.matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`, 'gm'))];
    return matches.length === 1 ? Number(matches[0][1]) : NaN;
  });
  const [total, pass, fail, skip, cancel] = values.map(value => Number.isSafeInteger(value) ? value : 0);
  const found = values.every(Number.isSafeInteger) && total === pass + fail + skip + cancel;
  return { total, pass, fail, skip, cancel, found };
}

// ---------------------------------------------------------------------------
// Temp-dir setup and test execution
// ---------------------------------------------------------------------------

function buildMinimalPackageJson(): string {
  return JSON.stringify({ type: 'module' });
}

function setupTempDir(projectRoot: string, consumerSrc: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'evidence-'));
  try {
  // Create required subdirectories
  mkdirSync(join(tempDir, 'sample'), { recursive: true });
  mkdirSync(join(tempDir, 'test'), { recursive: true });

  // Write minimal package.json (type:module)
  writeFileSync(join(tempDir, 'package.json'), buildMinimalPackageJson(), 'utf8');

  // Copy api.ts and test file
  cpSync(join(projectRoot, 'sample', 'api.ts'), join(tempDir, 'sample', 'api.ts'));
  cpSync(join(projectRoot, 'test', 'consumer.test.ts'), join(tempDir, 'test', 'consumer.test.ts'));

  // Copy the selected consumer file as sample/consumer.ts
  cpSync(consumerSrc, join(tempDir, 'sample', 'consumer.ts'));

  return tempDir;
  } catch (error) {
    cleanupTempDir(tempDir);
    throw error;
  }
}

function cleanupTempDir(directory: string): void {
  const target = resolve(directory);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('evidence-')) {
    throw new Error('Refusing to clean a directory outside the evidence temporary scope');
  }
  rmSync(target, { recursive: true, force: true });
}

function runTests(tempDir: string): RunResult {
  const publicLog = (value: string | null) => (value ?? '')
    .replaceAll(tempDir.replaceAll('\\', '\\\\'), '[isolated-run]')
    .replaceAll(tempDir, '[isolated-run]')
    .replaceAll(tempDir.replaceAll('\\', '/'), '[isolated-run]');
  // A capture invoked from node:test must start an independent TAP runner.
  // Inheriting the parent test context switches child output to the IPC protocol.
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', 'test/consumer.test.ts'],
    {
      cwd: tempDir,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1048576,
      shell: false,
      env: childEnv,
    },
  );

  // Spawn-level error (e.g. ENOENT)
  if (result.error) {
    return {
      exitCode: null,
      stdout: publicLog(result.stdout),
      stderr: publicLog(result.stderr),
      spawnError: result.error.message,
      timedOut: (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT',
      signal: result.signal ?? null,
      total: 0,
      pass: 0,
      fail: 0,
      skip: 0,
      cancel: 0,
      inconclusive: true,
    };
  }

  const timedOut = result.signal === 'SIGTERM' && result.status == null;
  const killed = result.signal != null;
  const stdout = publicLog(result.stdout);
  const stderr = publicLog(result.stderr);

  const { total, pass, fail, skip, cancel, found } = parseTapCounts(stdout);

  // Inconclusive conditions:
  // - process was killed / timed out
  // - TAP summary was not found in stdout
  const inconclusive = timedOut || killed || !found;

  return {
    exitCode: result.status,
    stdout,
    stderr,
    spawnError: null,
    timedOut,
    signal: result.signal ?? null,
    total,
    pass,
    fail,
    skip,
    cancel,
    inconclusive,
  };
}

// ---------------------------------------------------------------------------
// Outcome determination
// ---------------------------------------------------------------------------

/**
 * verified-repair requires:
 *   before: exit 1, pass 2, fail 1, total 3, skip 0, cancel 0, no spawn error
 *   after:  exit 0, pass 3, fail 0, total 3, skip 0, cancel 0, no spawn error
 *
 * Neither side may be inconclusive.
 * We never infer a favorable outcome solely from exit code.
 */
function determineOutcome(
  before: RunResult,
  after: RunResult,
): 'verified-repair' | 'inconclusive' | 'not-repaired' {
  if (before.inconclusive || after.inconclusive) return 'inconclusive';

  const beforeOk =
    before.exitCode === 1 &&
    before.pass === BEFORE_EXPECTED_PASS &&
    before.fail === BEFORE_EXPECTED_FAIL &&
    before.total === EXPECTED_TOTAL &&
    before.skip === 0 &&
    before.cancel === 0 &&
    before.spawnError === null;

  const afterOk =
    after.exitCode === 0 &&
    after.pass === AFTER_EXPECTED_PASS &&
    after.fail === AFTER_EXPECTED_FAIL &&
    after.total === EXPECTED_TOTAL &&
    after.skip === 0 &&
    after.cancel === 0 &&
    after.spawnError === null;

  if (beforeOk && afterOk) return 'verified-repair';
  if (afterOk && !beforeOk) return 'not-repaired'; // after passes but before doesn't match expected failure
  return 'not-repaired';
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function buildHtmlReport(report: EvidenceReport): string {
  const e = escapeHtml;

  function resultCard(label: string, result: RunResult): string {
    const statusLabel = result.inconclusive
      ? '⚠ inconclusive'
      : result.exitCode === 0
        ? '✓ passed'
        : '✗ failed';
    const statusClass = result.inconclusive ? 'inconclusive' : result.exitCode === 0 ? 'pass' : 'fail';

    return `
    <div class="card ${e(statusClass)}">
      <h2>${e(label)} <span class="status-badge ${e(statusClass)}">${statusLabel}</span></h2>
      <table>
        <tr><th>Exit code</th><td>${result.exitCode === null ? 'null' : result.exitCode}</td></tr>
        <tr><th>Pass</th><td>${result.pass}</td></tr>
        <tr><th>Fail</th><td>${result.fail}</td></tr>
        <tr><th>Skip</th><td>${result.skip}</td></tr>
        <tr><th>Cancel</th><td>${result.cancel}</td></tr>
        <tr><th>Inconclusive</th><td>${result.inconclusive}</td></tr>
        ${result.signal ? `<tr><th>Signal</th><td>${e(result.signal)}</td></tr>` : ''}
        ${result.spawnError ? `<tr><th>Spawn error</th><td>${e(result.spawnError)}</td></tr>` : ''}
      </table>
      <details>
        <summary>stdout</summary>
        <pre>${e(result.stdout || '(empty)')}</pre>
      </details>
      <details>
        <summary>stderr</summary>
        <pre>${e(result.stderr || '(empty)')}</pre>
      </details>
    </div>`;
  }

  const outcomeClass =
    report.outcome === 'verified-repair' ? 'pass' :
    report.outcome === 'inconclusive' ? 'inconclusive' : 'fail';

  const outcomeLabel =
    report.outcome === 'verified-repair' ? '✓ verified-repair' :
    report.outcome === 'inconclusive' ? '⚠ inconclusive' : '✗ not-repaired';

  const inputRows = Object.entries(report.inputs)
    .map(([k, v]) => `<tr><td>${e(k)}</td><td><code>${e(v)}</code></td></tr>`)
    .join('\n        ');

  const limitationItems = report.limitations
    .map(l => `<li>${e(l)}</li>`)
    .join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Evidence Report — ${e(report.runId)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #f8f9fa; color: #1a1a1a; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.1rem; margin-top: 0; }
    .outcome-banner { padding: 1rem 1.5rem; border-radius: 6px; margin-bottom: 1.5rem; font-size: 1.25rem; font-weight: bold; }
    .outcome-banner.pass  { background: #d1fae5; color: #065f46; }
    .outcome-banner.fail  { background: #fee2e2; color: #7f1d1d; }
    .outcome-banner.inconclusive { background: #fef3c7; color: #78350f; }
    .cards { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
    .card { flex: 1 1 340px; background: #fff; border-radius: 6px; padding: 1rem 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); border-top: 4px solid #d1d5db; }
    .card.pass  { border-top-color: #10b981; }
    .card.fail  { border-top-color: #ef4444; }
    .card.inconclusive { border-top-color: #f59e0b; }
    table { border-collapse: collapse; width: 100%; margin-bottom: .75rem; }
    th, td { text-align: left; padding: .3rem .5rem; border-bottom: 1px solid #e5e7eb; font-size: .875rem; }
    th { width: 130px; color: #6b7280; }
    pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 4px; font-size: .78rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; }
    details { margin-top: .5rem; }
    summary { cursor: pointer; font-size: .85rem; color: #2563eb; user-select: none; }
    .status-badge { font-size: .75rem; padding: .2rem .5rem; border-radius: 9999px; font-weight: 600; }
    .status-badge.pass  { background: #d1fae5; color: #065f46; }
    .status-badge.fail  { background: #fee2e2; color: #7f1d1d; }
    .status-badge.inconclusive { background: #fef3c7; color: #78350f; }
    .section { background: #fff; border-radius: 6px; padding: 1rem 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); margin-bottom: 1.5rem; }
    .section h3 { margin-top: 0; font-size: 1rem; }
    code { font-size: .82rem; background: #f1f5f9; padding: .1rem .3rem; border-radius: 3px; }
    ul { margin: 0; padding-left: 1.25rem; font-size: .875rem; }
    li { margin-bottom: .35rem; }
    .meta { font-size: .8rem; color: #6b7280; margin-bottom: 1.5rem; }
  </style>
</head>
<body>
  <h1>Evidence Report</h1>
  <p class="meta">
    Run ID: <code>${e(report.runId)}</code> &nbsp;|&nbsp;
    Generated: <code>${e(report.generatedAt)}</code> &nbsp;|&nbsp;
    Node: <code>${e(report.nodeVersion)}</code> &nbsp;|&nbsp;
    Kind: <code>${e(report.kind)}</code>
  </p>

  <div class="outcome-banner ${e(outcomeClass)}">
    Outcome: ${outcomeLabel}
  </div>

  <div class="cards">
    ${resultCard('Before (fixtures/consumer-before.ts)', report.before)}
    ${resultCard('After (sample/consumer.ts — current)', report.after)}
  </div>

  <div class="section">
    <h3>Inputs (SHA-256)</h3>
    <table>
      <tr><th>File</th><th>Hash</th></tr>
      ${inputRows}
    </table>
  </div>

  <div class="section">
    <h3>Limitations</h3>
    <ul>
      ${limitationItems}
    </ul>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface CaptureOptions {
  /** Absolute path to the project root. Defaults to the directory containing this file. */
  projectRoot?: string;
  /** Absolute path to the directory under which the output subdirectory will be created. */
  outputRoot: string;
}

export async function captureEvidence(options: CaptureOptions): Promise<CaptureResult> {
  const projectRoot = options.projectRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { outputRoot } = options;

  // 1. Verify integrity before touching any temp dirs
  verifyIntegrity(projectRoot);

  // 2. Collect input hashes
  const inputFiles: Record<string, string> = {};
  for (const rel of [
    'test/consumer.test.ts',
    'sample/api.ts',
    'sample/consumer.ts',
    'fixtures/consumer-before.ts',
  ] as const) {
    try {
      const buf = readFileSync(join(projectRoot, rel));
      inputFiles[rel] = sha256Hex(buf);
    } catch {
      inputFiles[rel] = '(unreadable)';
    }
  }

  // 3. Prepare output directory (unique per run, never overwrites previous)
  const runId = randomUUID();
  mkdirSync(outputRoot, { recursive: true });
  const outDir = mkdtempSync(join(outputRoot, 'evidence-'));

  // 4. Run before and after in isolated temp dirs
  const beforeSrc = join(projectRoot, 'fixtures', 'consumer-before.ts');
  const afterSrc = join(projectRoot, 'sample', 'consumer.ts');

  let beforeTempDir: string | null = null;
  let afterTempDir: string | null = null;
  let beforeResult: RunResult;
  let afterResult: RunResult;

  try {
    beforeTempDir = setupTempDir(projectRoot, beforeSrc);
    beforeResult = runTests(beforeTempDir);
  } finally {
    if (beforeTempDir) {
      cleanupTempDir(beforeTempDir);
    }
  }

  try {
    afterTempDir = setupTempDir(projectRoot, afterSrc);
    afterResult = runTests(afterTempDir);
  } finally {
    if (afterTempDir) {
      cleanupTempDir(afterTempDir);
    }
  }

  // 5. Determine outcome
  const outcome = determineOutcome(beforeResult, afterResult);

  // 6. Build report
  const report: EvidenceReport = {
    schemaVersion: 1,
    runId,
    generatedAt: new Date().toISOString(),
    kind: 'replayed-verification',
    nodeVersion: process.version,
    inputs: inputFiles,
    before: beforeResult,
    after: afterResult,
    outcome,
    limitations: LIMITATIONS,
  };

  // 7. Atomic-ish writes (write to temp name, then rename — best effort on Windows)
  const jsonPath = join(outDir, 'evidence.json');
  const htmlPath = join(outDir, 'evidence.html');

  const jsonContent = JSON.stringify(report, null, 2);
  const htmlContent = buildHtmlReport(report);

  // Write JSON (atomic-ish: write to .tmp then rename; fall back to direct write on Windows)
  const jsonTmp = jsonPath + '.tmp';
  writeFileSync(jsonTmp, jsonContent, 'utf8');
  try {
    renameSync(jsonTmp, jsonPath);
  } catch {
    writeFileSync(jsonPath, jsonContent, 'utf8');
    try { rmSync(jsonTmp, { force: true }); } catch { /* ignore */ }
  }

  // Write HTML
  const htmlTmp = htmlPath + '.tmp';
  writeFileSync(htmlTmp, htmlContent, 'utf8');
  try {
    renameSync(htmlTmp, htmlPath);
  } catch {
    writeFileSync(htmlPath, htmlContent, 'utf8');
    try { rmSync(htmlTmp, { force: true }); } catch { /* ignore */ }
  }

  return { report, jsonPath, htmlPath };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function cliUsage(msg?: string): never {
  if (msg) process.stderr.write(`error: ${msg}\n`);
  process.stderr.write('usage: node workflow/evidence.ts --output <directory>\n');
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) cliUsage('missing arguments');

  let outputArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output') {
      if (i + 1 >= args.length) cliUsage('--output requires a value');
      outputArg = args[i + 1];
      i++;
    } else {
      cliUsage(`unsupported argument: ${args[i]}`);
    }
  }

  if (!outputArg) cliUsage('--output is required');

  // CLI: projectRoot is always relative to THIS source file, not the caller.
  const thisFile = fileURLToPath(import.meta.url);
  const projectRoot = resolve(dirname(thisFile), '..');
  const outputRoot = resolve(outputArg);

  let result: CaptureResult;
  try {
    result = await captureEvidence({ projectRoot, outputRoot });
  } catch (err) {
    process.stderr.write(`evidence capture failed: ${(err as Error).message}\n`);
    process.exit(2);
  }

  const { report, jsonPath, htmlPath } = result;
  process.stdout.write(`outcome:  ${report.outcome}\n`);
  process.stdout.write(`json:     ${jsonPath}\n`);
  process.stdout.write(`html:     ${htmlPath}\n`);

  if (report.outcome === 'verified-repair') {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Run only when executed directly (not when imported)
const isMain = process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch(err => {
    process.stderr.write(`unhandled error: ${(err as Error).stack ?? err}\n`);
    process.exit(2);
  });
}
