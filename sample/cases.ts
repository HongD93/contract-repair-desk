export const cases = [
  { id: 'baseline', title: 'Stable response', category: 'control', reason: 'Existing title and open status remain supported.', body: { tasks: [{ id: 'task-01', title: 'Review release notes', status: 'open', priority: 2 }] } },
  { id: 'additive', title: 'Extra field', category: 'control', reason: 'An extra owner field must not change the displayed task.', body: { tasks: [{ id: 'task-01', title: 'Review release notes', status: 'open', priority: 2, owner: 'Example team' }] } },
  { id: 'renamed-title', title: 'Renamed title', category: 'repair', reason: 'The API intentionally replaces title with displayName.', body: { tasks: [{ id: 'task-01', displayName: 'Review release notes', status: 'open', priority: 2 }] } },
  { id: 'status-enum', title: 'New status value', category: 'repair', reason: 'The intended in_progress status needs a readable label instead of Unknown.', body: { tasks: [{ id: 'task-02', title: 'Verify payment sandbox', status: 'in_progress', priority: 2 }] } },
  { id: 'zero-priority', title: 'Zero is a valid value', category: 'repair', reason: 'The numeric contract is unchanged. Priority 0 means Critical, not missing.', body: { tasks: [{ id: 'task-03', title: 'Restore demo access', status: 'open', priority: 0 }] } },
  { id: 'unsupported', title: 'Unsupported payload', category: 'unsupported', reason: 'A different response shape must stop with an explicit error.', body: { items: [{ id: 'task-04', title: 'Unsupported envelope' }] } },
] as const;

export type CaseId = typeof cases[number]['id'];
