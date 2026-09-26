export function mapResponse(payload: any) {
  if (!Array.isArray(payload.tickets)) throw new Error('Unsupported dispatch response');
  const PRIORITY: Record<number, string> = { 0: 'Critical', 1: 'P1', 2: 'P2', 3: 'P3' };
  const STATE: Record<string, string> = { open: 'Open', done: 'Done', assigned: 'In progress' };
  return payload.tickets.map((row: any) => {
    const title = (row.title && row.title !== '') ? row.title : (row.summary && row.summary !== '') ? row.summary : '';
    if (!title) throw new Error('Unsupported dispatch response');
    if (!Object.prototype.hasOwnProperty.call(PRIORITY, row.priority)) throw new Error('Unsupported dispatch response');
    if (!Object.prototype.hasOwnProperty.call(STATE, row.state)) throw new Error('Unsupported dispatch response');
    return { id: row.id, title, priority: PRIORITY[row.priority as number], state: STATE[row.state] };
  });
}
