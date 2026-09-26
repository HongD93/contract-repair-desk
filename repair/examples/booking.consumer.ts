export function mapResponse(payload: any) {
  if (!Array.isArray(payload.slots)) throw new Error('Unsupported booking response');
  return payload.slots.map((row:any)=>({id:row.id,seats:row.remaining || 1,bookable:row.status==='open'}));
}
