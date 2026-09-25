import test from 'node:test';
import assert from 'node:assert/strict';
import { cases } from '../sample/cases.ts';
import { toVisibleTasks } from '../sample/view-model.ts';

const expected = {
  baseline: [{ id: 'task-01', title: 'Review release notes', statusLabel: 'Open', priorityLabel: 'P2' }],
  additive: [{ id: 'task-01', title: 'Review release notes', statusLabel: 'Open', priorityLabel: 'P2' }],
  'renamed-title': [{ id: 'task-01', title: 'Review release notes', statusLabel: 'Open', priorityLabel: 'P2' }],
  'status-enum': [{ id: 'task-02', title: 'Verify payment sandbox', statusLabel: 'In progress', priorityLabel: 'P2' }],
  'zero-priority': [{ id: 'task-03', title: 'Restore demo access', statusLabel: 'Open', priorityLabel: 'Critical' }],
};
for (const item of cases) {
  test(`case:${item.id}`, () => {
    if (item.category === 'unsupported') assert.throws(() => toVisibleTasks(item.body), /Unsupported task response/);
    else assert.deepEqual(toVisibleTasks(item.body), expected[item.id]);
  });
}
