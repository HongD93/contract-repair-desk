export type Check = { id: string; purpose: 'migration' | 'preserve' | 'reject'; input: unknown; expected?: unknown; error?: string };
export type Contract = { version: 1; name: string; requirements: string; checks: Check[] };
export function parseContract(text: string): Contract {
  if (new TextEncoder().encode(text).length > 65536) throw new Error('Contract exceeds 64 KiB');
  const data = JSON.parse(text);
  if (data?.version !== 1 || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 120 || typeof data.requirements !== 'string' || !data.requirements.trim() || !Array.isArray(data.checks) || data.checks.length < 3 || data.checks.length > 50) throw new Error('Contract requires a name, requirements and 3–50 checks');
  const ids = new Set();
  for (const row of data.checks) {
    if (!row || typeof row.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(row.id) || ids.has(row.id) || !['migration','preserve','reject'].includes(row.purpose) || !Object.hasOwn(row,'input') || Object.hasOwn(row,'expected') === Object.hasOwn(row,'error') || (Object.hasOwn(row,'error') && (typeof row.error !== 'string' || !row.error || row.error.length > 160))) throw new Error('Each check needs a unique id, input and exactly one expected value or error');
    if ((row.purpose === 'reject') !== Object.hasOwn(row,'error')) throw new Error('Rejection checks must specify an error');
    ids.add(row.id);
  }
  for (const purpose of ['migration','preserve','reject']) if (!data.checks.some((row: Check) => row.purpose === purpose)) throw new Error(`Missing ${purpose} check`);
  return data;
}
