export function mapResponse(payload: any) {
  if (!Array.isArray(payload.tickets)) throw new Error('Unsupported dispatch response');
  return payload.tickets.map((row:any)=>({id:row.id,title:row.title || '',priority:row.priority ? `P${row.priority}` : 'Normal',state:row.state==='open'?'Open':row.state==='done'?'Done':'Unknown'}));
}
