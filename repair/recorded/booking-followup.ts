export function mapResponse(payload: any) {
  if (payload === null || payload === undefined || !Array.isArray(payload.slots)) {
    throw new Error('Unsupported booking response');
  }
  return payload.slots.map((row: any) => {
    // Guard null/non-object rows.
    if (row === null || typeof row !== 'object') {
      throw new Error('Unsupported booking response');
    }

    // id must be a non-empty string.
    if (typeof row.id !== 'string' || row.id.length === 0) {
      throw new Error('Unsupported booking response');
    }

    // Determine seats: remaining takes precedence (even when zero or null).
    // If remaining key is present (even as null) it is authoritative — no fallback.
    let seats: number;
    if ('remaining' in row) {
      if (row.remaining === null || typeof row.remaining !== 'number' || !Number.isInteger(row.remaining) || row.remaining < 0) {
        throw new Error('Unsupported booking response');
      }
      seats = row.remaining;
    } else if (row.capacityLeft !== undefined && row.capacityLeft !== null) {
      if (typeof row.capacityLeft !== 'number' || !Number.isInteger(row.capacityLeft) || row.capacityLeft < 0) {
        throw new Error('Unsupported booking response');
      }
      seats = row.capacityLeft;
    } else {
      throw new Error('Unsupported booking response');
    }

    // Only open and accepting are valid bookable statuses; closed is valid but not bookable.
    const validStatuses = ['open', 'accepting', 'closed'];
    if (!validStatuses.includes(row.status)) {
      throw new Error('Unsupported booking response');
    }

    const bookable = (row.status === 'open' || row.status === 'accepting') && seats > 0;
    return { id: row.id, seats, bookable };
  });
}
