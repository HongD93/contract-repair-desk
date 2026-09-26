// Candidate code runs in a separate, permission-constrained process, without credentials.
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (input.length > 131072) throw new Error('Input too large'); }
const { mapResponse } = await import(pathToFileURL(process.argv[2]).href);
if (typeof mapResponse !== 'function') throw new Error('Export mapResponse(payload)');
const results = [];
for (const row of JSON.parse(input)) {
  let value;
  try {
    value = await mapResponse(row.input);
  } catch (error) {
    results.push({ id: row.id, error: String(error?.message ?? error).slice(0,2048) });
    continue;
  }
  // Preserve other checks while distinguishing invalid output from a business error.
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || !isDeepStrictEqual(value, JSON.parse(encoded))) throw new Error('Lossy JSON');
    results.push({ id: row.id, value: JSON.parse(encoded) });
  } catch {
    results.push({ id: row.id, invalidOutput: 'Return value is not lossless JSON' });
  }
}
process.stdout.write(JSON.stringify(results));
