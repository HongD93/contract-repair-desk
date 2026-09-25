export type VisibleTask = { id: string; title: string; statusLabel: string; priorityLabel: string };

// Seeded initial view mapping. Repair against the unchanged suite acceptance checks.
export function toVisibleTasks(body: unknown): VisibleTask[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as any).tasks)) throw new Error('Unsupported task response');
  return (body as any).tasks.map((task: any) => ({
    id: String(task.id),
    title: typeof task.title === 'string' ? task.title : '',
    statusLabel: ({ open: 'Open', done: 'Done' } as Record<string, string>)[task.status] || 'Unknown',
    priorityLabel: task.priority ? `P${task.priority}` : 'Not set',
  }));
}
