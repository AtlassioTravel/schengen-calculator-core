import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../dist/esm/cli.js', import.meta.url));

describe('schengen-calc CLI', () => {
  it('reads JSON from stdin and prints a machine-readable result', () => {
    const result = spawnSync(process.execPath, [cliPath, '--json'], {
      input: JSON.stringify({
        referenceDate: '2026-06-01',
        trips: [{ entryDate: '2026-05-01', exitDate: '2026-05-01' }],
      }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).calculation.daysUsed, 1);
  });

  it('returns a non-zero status when fail-on-overstay detects a breach', () => {
    const result = spawnSync(process.execPath, [cliPath, '--json', '--fail-on-overstay'], {
      input: JSON.stringify({
        referenceDate: '2026-04-05',
        trips: [{ entryDate: '2026-01-01', exitDate: '2026-04-05' }],
      }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).calculation.overstayDate, '2026-04-01');
  });
});
