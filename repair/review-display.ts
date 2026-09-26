function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function resultShape(value: any) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 1
    && ((Object.hasOwn(value, 'value') && value.value !== undefined)
      || (Object.hasOwn(value, 'error') && typeof value.error === 'string' && value.error.trim().length > 0));
}

function invalidOutputShape(value: any) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 1 && typeof value.invalidOutput === 'string' && value.invalidOutput.length > 0;
}

export function validateReviewReplay(value: any) {
  if (value?.version !== 1 || value.kind !== 'known-gap-gate-replay' || !Array.isArray(value.rows) || !value.rows.length || value.rows.length > 20 || !Array.isArray(value.limitations)) throw new Error('Unsupported review evidence');
  const rowIds = new Set();
  for (const row of value.rows) {
    const report = row?.report;
    if (typeof row.id !== 'string' || rowIds.has(row.id) || typeof row.handoff !== 'string' || !['original-shell-study-candidate', 'separate-corrected-ide-control', 'separate-shell-followup'].includes(row.role) || report?.kind !== 'independent-boundary-review' || !/^[a-f0-9]{64}$/.test(report.bindings?.candidate) || !['review-passed', 'changes-requested', 'inconclusive'].includes(report.outcome)) throw new Error('Invalid review candidate');
    rowIds.add(row.id);
    const ids = new Set();
    let failures = 0;
    for (const group of [report.initial, report.additional]) {
      if (!Array.isArray(group?.checks) || !group.checks.length || group.checks.length > 50 || group.total !== group.checks.length || group.pass !== group.checks.filter((check: any) => check.passed === true).length) throw new Error('Review counts do not match checks');
      for (const check of group.checks) {
        if (typeof check.id !== 'string' || ids.has(check.id) || typeof check.passed !== 'boolean' || check.httpStatus !== 200) throw new Error('Incomplete review check');
        if (!['migration', 'preserve', 'reject'].includes(check.purpose)
          || !Object.hasOwn(check, 'expected') || !resultShape(check.expected)
          || (check.purpose === 'reject') !== Object.hasOwn(check.expected, 'error')
          || !Object.hasOwn(check, 'actual') || !(resultShape(check.actual) || (invalidOutputShape(check.actual) && !check.passed) || (report.failure && check.actual === null && !check.passed))) throw new Error('Incomplete review result');
        ids.add(check.id);
        if (!report.failure && check.passed !== (canonical(check.expected) === canonical(check.actual))) throw new Error('Review result conflicts with actual behavior');
        if (!check.passed) failures++;
      }
    }
    if (!Array.isArray(report.failures) || report.failures.length !== failures || (report.outcome === 'review-passed' && (failures || report.failure)) || (report.outcome === 'changes-requested' && (!failures || report.failure)) || (report.outcome === 'inconclusive' && !report.failure)) throw new Error('Readiness conflicts with recorded checks');
    const failureIds = new Set();
    for (const failure of report.failures) {
      const group = failure.scope === 'original' ? report.initial : failure.scope === 'additional' ? report.additional : undefined;
      const check = group?.checks.find((item: any) => item.id === failure.id);
      if (!check || check.passed || failureIds.has(failure.id) || canonical(check.expected) !== canonical(failure.expected) || canonical(check.actual) !== canonical(failure.actual)) throw new Error('Failure handoff conflicts with recorded checks');
      failureIds.add(failure.id);
    }
  }
  const candidates = value.rows.filter((row: any) => row.role === 'original-shell-study-candidate');
  const summary = value.summary;
  if (summary?.candidates !== candidates.length || summary.acceptedByInitialChecks !== candidates.filter((row: any) => row.report.initial.pass === row.report.initial.total).length || summary.stoppedByReview !== candidates.filter((row: any) => row.report.outcome === 'changes-requested').length || summary.failedAssertionsPackaged !== candidates.reduce((total: number, row: any) => total + row.report.failures.length, 0)) throw new Error('Comparison summary conflicts with runs');
  if (value.freshness?.before?.outcome !== 'review-passed' || value.freshness.before.usable !== true || value.freshness?.after?.outcome !== 'stale' || value.freshness.after.usable !== false || value.limitations.some((line: any) => typeof line !== 'string')) throw new Error('Incomplete freshness evidence');
  return value;
}
