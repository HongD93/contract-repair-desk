import test from 'node:test';
import assert from 'node:assert/strict';
import { toVisibleTasks } from '../sample/view-model.ts';

test('unrecognized and malformed payloads stop without displaying guessed values', () => {
  const row = { id: 'a', title: 'Fictional task', status: 'open', priority: 2 };
  for (const body of [null, [], {}, { tasks: null }, { tasks: [null] }, { tasks: [3] },
    ...[{status:'toString'}, {status:'__proto__'}, {status:'unknown'}, {id:3}, {title:8}, {priority:-1}, {priority:1.5}].map(patch => ({tasks:[{...row,...patch}]}))]) {
    assert.throws(() => toVisibleTasks(body), /Unsupported task response/);
  }
  assert.deepEqual(toVisibleTasks({tasks:[]}), []);
  assert.equal(toVisibleTasks({tasks:[{...row,priority:null}]})[0].priorityLabel, 'Not set');
  assert.equal(toVisibleTasks({tasks:[{...row,title:undefined,displayName:'New title'}]})[0].title, 'New title');
});
