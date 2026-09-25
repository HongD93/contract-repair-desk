export function mapResponse(payload: any) {
  if (payload == null || !Array.isArray(payload.items)) throw new Error('Unsupported stock response');
  return payload.items.map((item: any) => {
    if (item == null || typeof item.sku !== 'string' || item.sku === '') throw new Error('Unsupported stock response');

    const label: string =
      typeof item.name === 'string' && item.name !== ''
        ? item.name
        : typeof item.displayName === 'string' && item.displayName !== ''
          ? item.displayName
          : '';
    if (label === '') throw new Error('Unsupported stock response');

    const available: number =
      item.available !== undefined ? item.available : item.availableUnits;
    if (available === undefined || !Number.isInteger(available) || available < 0) {
      throw new Error('Unsupported stock response');
    }

    return { sku: item.sku, available, label };
  });
}
