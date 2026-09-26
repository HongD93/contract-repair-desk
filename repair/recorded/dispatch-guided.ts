export function mapResponse(payload: any) {
  if (!Array.isArray(payload.tickets)) throw new Error('Unsupported dispatch response');
  const STATE_MAP: Record<string, string> = { open: 'Open', done: 'Done', assigned: 'In progress' };
  const PRIORITY_MAP: Record<number, string> = { 0: 'Critical', 1: 'P1', 2: 'P2', 3: 'P3' };
  return payload.tickets.map((row: any) => {
    const title = (row.title && row.title !== '') ? row.title : (row.summary && row.summary !== '') ? row.summary : '';
    if (!title) throw new Error('Unsupported dispatch response');
    const priority = PRIORITY_MAP[row.priority as number];
    if (priority === undefined) throw new Error('Unsupported dispatch response');
    const state = Object.prototype.hasOwnProperty.call(STATE_MAP, row.state) ? STATE_MAP[row.state] : undefined;
    if (state === undefined) throw new Error('Unsupported dispatch response');
    return { id: row.id, title, priority, state };
  });
}
