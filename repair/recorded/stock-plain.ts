export function mapResponse(payload: any) {
  if (!Array.isArray(payload.items)) throw new Error('Unsupported stock response');
  return payload.items.map((item: any) => {
    const label = (typeof item.name === 'string' && item.name !== '') ? item.name : item.displayName;
    const available = ('available' in item) ? item.available : item.availableUnits;
    if (typeof item.sku !== 'string' || item.sku === '') throw new Error('Unsupported stock response');
    if (typeof label !== 'string' || label === '') throw new Error('Unsupported stock response');
    if (typeof available !== 'number' || !Number.isInteger(available) || available < 0) throw new Error('Unsupported stock response');
    return { sku: item.sku, available, label };
  });
}
