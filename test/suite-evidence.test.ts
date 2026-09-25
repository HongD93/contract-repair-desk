import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { captureSuite } from '../workflow/suite.ts';

test('suite captures actual case-level outcomes, rejects fixture changes and does not bless a broken repair', () => {
  const directory=mkdtempSync(join(tmpdir(),'contract-suite-test-'));
  try {
    for(const name of ['sample','fixtures','test']) cpSync(resolve(name),join(directory,name),{recursive:true});
    const result=captureSuite(directory,join(directory,'output'));
    assert.equal(result.report.outcome,'verified-repair');
    assert.equal(result.report.before.fail,3);
    assert.equal(result.report.after.pass,6);
    assert.equal(result.report.after.cases.length,6);
    const consumer=readFileSync(join(directory,'sample/view-model.ts'),'utf8');
    copyFileSync(join(directory,'fixtures/view-model-before.ts'),join(directory,'sample/view-model.ts'));
    assert.equal(captureSuite(directory,join(directory,'output')).report.outcome,'not-repaired');
    writeFileSync(join(directory,'sample/view-model.ts'),consumer);
    writeFileSync(join(directory,'test/suite.test.ts'),'// altered acceptance check');
    assert.throws(()=>captureSuite(directory,join(directory,'output')),/Integrity check failed/);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
