export function validatePreparationEvidence(value: any) {
  if (value?.version !== 1 || value.kind !== 'synthetic-preparation-example' || value.modelCalls !== 0 || !value.attribution?.startsWith('Codex-authored synthetic teaching fixture.')) throw new Error('Invalid synthetic attribution');
  if (!Array.isArray(value.proposal?.checks) || !Array.isArray(value.decisions?.decisions) || value.proposal.checks.length !== value.decisions.decisions.length) throw new Error('Invalid proposal decisions');
  const seen = new Set();
  for (const row of value.proposal.checks) {
    if (typeof row.check?.id !== 'string' || seen.has(row.check.id)) throw new Error('Invalid proposal id');
    const check = row.check;
    if (!['migration', 'preserve', 'reject'].includes(check.purpose)
      || !Object.hasOwn(check, 'input') || check.input === undefined
      || Object.hasOwn(check, 'expected') === Object.hasOwn(check, 'error')
      || (Object.hasOwn(check, 'expected') && check.expected === undefined)
      || (Object.hasOwn(check, 'error') && (typeof check.error !== 'string' || !check.error.trim()))
      || (check.purpose === 'reject') !== Object.hasOwn(check, 'error')) throw new Error('Incomplete proposal check');
    seen.add(row.check.id);
    const decision = value.decisions.decisions.filter((d: any) => d.id === row.check.id);
    if (decision.length !== 1 || !['accept', 'reject'].includes(decision[0].action) || !decision[0].reason || typeof row.quote !== 'string' || !row.quote || (decision[0].action === 'accept' && !value.contract?.requirements?.includes(row.quote))) throw new Error('Proposal adoption conflicts with requirement');
  }
  const rows = value.audit?.rows;
  if (!Array.isArray(rows) || !rows.length || new Set(rows.map((r: any) => r.id)).size !== rows.length) throw new Error('Invalid audit rows');
  for (const r of rows) {
    if (![r.initialFailures, r.addedFailures].every(n => Number.isInteger(n) && n >= 0) || !['behavior-change', 'equivalent-control'].includes(r.kind)) throw new Error('Invalid audit row');
    const expected = r.kind === 'equivalent-control' ? (r.initialFailures + r.addedFailures ? 'control-rejected' : 'control-preserved') : (r.initialFailures + r.addedFailures ? 'detected' : 'survived');
    if (r.state !== 'inconclusive' && r.state !== expected) throw new Error('Audit state conflicts');
  }
  const faults = rows.filter((r: any) => r.kind === 'behavior-change');
  const totals = { seededFaults: faults.length, detectedByInitial: faults.filter((r: any) => r.state !== 'inconclusive' && r.initialFailures > 0).length, detectedByCombined: faults.filter((r: any) => r.state === 'detected').length, survived: faults.filter((r: any) => r.state === 'survived').length, inconclusive: faults.filter((r: any) => r.state === 'inconclusive').length, equivalentControls: rows.length - faults.length, controlsPreserved: rows.filter((r: any) => r.state === 'control-preserved').length };
  for (const [key, count] of Object.entries(totals)) if (value.audit.summary?.[key] !== count) throw new Error('Audit summary conflicts');
  return value;
}

const anonymousScope = 'One privately retained adapter. Actual recorded Bob draft and repair; source, inputs and provenance identifiers are withheld. This record cannot be independently replayed from public files. It is separate from the public synthetic teaching fixture.';
const anonymousLimitations = 'Two Codex checks were added after observing survivors. The same evaluator authored requirements and withheld cases. No external validation, measured productivity, production coverage or blind post-audit score is claimed.';
function exactKeys(value: any, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Anonymous record contains missing or non-public fields');
}
export function validateAnonymousObservation(value: any) {
  exactKeys(value, ['kind', 'drafted', 'accepted', 'rejected', 'original', 'adopted', 'withheld', 'faults', 'postAuditDetected']);
  if (value.kind !== 'anonymized-observed-execution') throw new Error('Invalid anonymous record');
  exactKeys(value.faults, ['seededFaults', 'detectedByInitial', 'detectedByCombined', 'controlsPreserved', 'equivalentControls']);
  for (const group of [value.original, value.adopted, value.withheld]) exactKeys(group, ['pass', 'total']);
  const counts = [value.drafted, value.accepted, value.rejected, value.postAuditDetected, ...Object.values(value.faults), ...[value.original,value.adopted,value.withheld].flatMap(group=>[group.pass,group.total])];
  if (!counts.every(n => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 10000) || value.drafted !== value.accepted + value.rejected) throw new Error('Anonymous counts conflict');
  for (const group of [value.original, value.adopted, value.withheld]) if (group.total < group.pass) throw new Error('Anonymous check counts conflict');
  const f = value.faults;
  if (f.detectedByInitial > f.detectedByCombined || f.detectedByCombined > f.seededFaults || value.postAuditDetected < f.detectedByCombined || value.postAuditDetected > f.seededFaults || f.controlsPreserved > f.equivalentControls) throw new Error('Anonymous fault counts conflict');
  return { ...value, scope: anonymousScope, limitations: anonymousLimitations };
}
