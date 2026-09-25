export type TaskRow = { id: string; title: string; status: string };

// Deliberately legacy consumer: Bob's first repair task is to adapt this mapping.
// Do not interpret the seeded defect as a completed repair implementation.
export async function loadTaskRows(baseUrl: string): Promise<TaskRow[]> {
  const response = await fetch(new URL('/api/tasks', baseUrl));
  if (!response.ok) throw new Error(`Task API returned ${response.status}`);
  const body = await response.json() as { tasks: Array<Record<string, unknown>> };
  if (!Array.isArray(body.tasks)) throw new Error('Unsupported task response');
  return body.tasks.map(task => ({
    id: String(task.id),
    title: typeof task.title === 'string' ? task.title : '',
    status: String(task.status),
  }));
}
