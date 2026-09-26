export function mapResponse(payload: any) {
  if (!Array.isArray(payload.items)) throw new Error('Unsupported stock response');
  return payload.items.map((item: any) => {
    // availability: `available` takes precedence when present; zero is valid
    const available = ('available' in item) ? item.available : item.availableUnits;
    if (typeof available !== 'number' || !Number.isInteger(available) || available < 0) {
      throw new Error('Unsupported stock response');
    }
    // label: non-empty `name` takes precedence over `displayName`
    const label = (typeof item.name === 'string' && item.name !== '') ? item.name : item.displayName;
    if (typeof label !== 'string' || label === '') throw new Error('Unsupported stock response');
    if (typeof item.sku !== 'string' || item.sku === '') throw new Error('Unsupported stock response');
    return { sku: item.sku, available, label };
  });
}
