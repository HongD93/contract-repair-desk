export function mapResponse(payload: any) {
  if (!Array.isArray(payload.slots)) throw new Error('Unsupported booking response');
  return payload.slots.map((row: any) => {
    // Determine seats: remaining takes precedence if present (even zero); else capacityLeft
    let seats: number;
    if (row.remaining !== undefined) {
      if (typeof row.remaining !== 'number' || !Number.isFinite(row.remaining) || row.remaining < 0) {
        throw new Error('Unsupported booking response');
      }
      seats = row.remaining;
    } else if (row.capacityLeft !== undefined) {
      if (typeof row.capacityLeft !== 'number' || !Number.isFinite(row.capacityLeft) || row.capacityLeft < 0) {
        throw new Error('Unsupported booking response');
      }
      seats = row.capacityLeft;
    } else {
      throw new Error('Unsupported booking response');
    }

    // Validate status
    const status: string = row.status;
    if (status !== 'open' && status !== 'accepting' && status !== 'closed') {
      throw new Error('Unsupported booking response');
    }

    const bookable = (status === 'open' || status === 'accepting') && seats > 0;
    return { id: row.id, seats, bookable };
  });
}
