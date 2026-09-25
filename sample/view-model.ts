export type VisibleTask = { id: string; title: string; statusLabel: string; priorityLabel: string };

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  done: 'Done',
  in_progress: 'In progress',
};

export function toVisibleTasks(body: unknown): VisibleTask[] {
  if (
    body === null ||
    typeof body !== 'object' ||
    !('tasks' in (body as object)) ||
    !Array.isArray((body as Record<string, unknown>).tasks)
  ) {
    throw new Error('Unsupported task response');
  }

  const rows = (body as Record<string, unknown>).tasks as unknown[];

  return rows.map((raw): VisibleTask => {
    if (raw === null || typeof raw !== 'object') {
      throw new Error('Unsupported task response');
    }
    const task = raw as Record<string, unknown>;

    if (typeof task.id !== 'string') throw new Error('Unsupported task response');
    const id = task.id;

    const title =
      typeof task.title === 'string' ? task.title :
      typeof task.displayName === 'string' ? task.displayName :
      (() => { throw new Error('Unsupported task response'); })();

    if (typeof task.status !== 'string' || !Object.hasOwn(STATUS_LABELS, task.status)) {
      throw new Error('Unsupported task response');
    }
    const statusLabel = STATUS_LABELS[task.status];

    const p = task.priority;
    let priorityLabel: string;
    if (p === null || p === undefined) {
      priorityLabel = 'Not set';
    } else if (typeof p !== 'number' || !Number.isInteger(p) || p < 0) {
      throw new Error('Unsupported task response');
    } else if (p === 0) {
      priorityLabel = 'Critical';
    } else {
      priorityLabel = `P${p}`;
    }

    return { id, title, statusLabel, priorityLabel };
  });
}
