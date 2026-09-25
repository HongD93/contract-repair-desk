import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createTaskApi } from '../sample/api.ts';
import type { Scenario } from '../sample/api.ts';
import { loadTaskRows } from '../sample/consumer.ts';

const expectedRows = [{ id: 'task-01', title: 'Review release notes', status: 'open' }];

for (const scenario of ['baseline', 'additive', 'renamed-title'] as Scenario[]) {
  test(`consumer preserves visible task content: ${scenario}`, async () => {
    const server = createTaskApi(scenario);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const raw = await (await fetch(`${baseUrl}/api/tasks`)).json();
      if (scenario === 'renamed-title') {
        assert.equal(raw.tasks[0].displayName, expectedRows[0].title);
        assert.equal(Object.hasOwn(raw.tasks[0], 'title'), false, 'API migration must remain intact');
      }
      assert.deepEqual(await loadTaskRows(baseUrl), expectedRows);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
