import { createServer } from 'node:http';

export type Scenario = 'baseline' | 'additive' | 'renamed-title';

// Fictional data. The new displayName field is an intentional API migration.
export function taskResponse(scenario: Scenario) {
  if (scenario === 'renamed-title') {
    return { tasks: [{ id: 'task-01', displayName: 'Review release notes', status: 'open' }] };
  }
  if (scenario === 'additive') {
    return { tasks: [{ id: 'task-01', title: 'Review release notes', status: 'open', priority: 2 }] };
  }
  return { tasks: [{ id: 'task-01', title: 'Review release notes', status: 'open' }] };
}

export function createTaskApi(scenario: Scenario) {
  return createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/api/tasks') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(taskResponse(scenario)));
  });
}
