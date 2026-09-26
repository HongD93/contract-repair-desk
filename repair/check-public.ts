import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateAnonymousObservation, validatePreparationEvidence } from './preparation-display.ts';
import { validateReviewReplay } from './review-display.ts';

export function checkPublicEvidence(root = 'web/public') {
  const allowed: string[] = JSON.parse(readFileSync(new URL('./public-assets.json', import.meta.url), 'utf8'));
  const actual: string[] = [];
  function walk(relative = '') {
    for (const name of readdirSync(join(root, relative))) {
      const path = relative ? `${relative}/${name}` : name;
      const stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink()) throw new Error('Public assets must not use symbolic links');
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) actual.push(path);
      else throw new Error('Unsupported public asset type');
    }
  }
  walk(); actual.sort();
  if (JSON.stringify(actual) !== JSON.stringify([...allowed].sort())) throw new Error('Public asset allowlist mismatch; review missing or additional files');
  const read = (name: string) => JSON.parse(readFileSync(join(root, 'evidence', name), 'utf8'));
  validateAnonymousObservation(read('anonymous-observation.json'));
  validatePreparationEvidence(read('preparation-lab.json'));
  validateReviewReplay(read('review-gate.json'));
  return { checkedAssets: actual.length, anonymousFields: 'aggregate-only', modelCalls: 0 };
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) console.log(JSON.stringify(checkPublicEvidence()));
