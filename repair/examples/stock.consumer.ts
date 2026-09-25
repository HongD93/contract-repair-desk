export function mapResponse(payload: any) {
  if (!Array.isArray(payload.items)) throw new Error('Unsupported stock response');
  return payload.items.map((item: any) => ({sku:item.sku,available:item.available || 20,label:item.name || ''}));
}
