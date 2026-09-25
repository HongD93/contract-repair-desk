// Candidate code runs in a separate, permission-constrained process, without credentials.
import { pathToFileURL } from 'node:url';
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (input.length > 131072) throw new Error('Input too large'); }
const { mapResponse } = await import(pathToFileURL(process.argv[2]).href);
if (typeof mapResponse !== 'function') throw new Error('Export mapResponse(payload)');
const results = [];
for (const row of JSON.parse(input)) {
  try {
    const value = await mapResponse(row.input);
    results.push({ id: row.id, value: value === undefined ? { invalidOutput: 'undefined' } : value });
  } catch (error) { results.push({ id: row.id, error: String(error?.message ?? error).slice(0,2048) }); }
}
process.stdout.write(JSON.stringify(results));
