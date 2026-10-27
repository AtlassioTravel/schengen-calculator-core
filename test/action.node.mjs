import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const actionPath = fileURLToPath(new URL('../scripts/action.mjs', import.meta.url));
const startMarker = '<!-- schengen-calculator-core:badge:start -->';
const endMarker = '<!-- schengen-calculator-core:badge:end -->';

describe('GitHub Action runner', () => {
  it('updates the README badge block and emits outputs', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'schengen-calc-action-'));
    try {
      const readmePath = join(workspace, 'README.md');
      const outputPath = join(workspace, 'outputs.txt');
      writeFileSync(readmePath, `# Travel ledger\n\n${startMarker}\nold badge\n${endMarker}\n`);
      writeFileSync(join(workspace, 'trips.json'), JSON.stringify({
        referenceDate: '2026-06-01',
        trips: [{ entryDate: '2026-05-01', exitDate: '2026-05-01' }],
      }));

      const result = spawnSync(process.execPath, [actionPath], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_WORKSPACE: workspace,
          GITHUB_OUTPUT: outputPath,
          INPUT_TRIPS_FILE: 'trips.json',
          INPUT_README_FILE: 'README.md',
        },
      });

      const updatedReadme = readFileSync(readmePath, 'utf8');
      const outputs = readFileSync(outputPath, 'utf8');
      assert.equal(result.status, 0);
      assert.equal(updatedReadme.includes('old badge'), false);
      assert.match(updatedReadme, /89%20days%20left/);
      assert.match(outputs, /days-used=1/);
      assert.match(outputs, /badge-status=89-days-left/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('marks the README and fails when a ledger contains an overstay', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'schengen-calc-action-'));
    try {
      const readmePath = join(workspace, 'README.md');
      writeFileSync(readmePath, '# Travel ledger\n');
      writeFileSync(join(workspace, 'trips.json'), JSON.stringify({
        referenceDate: '2026-04-05',
        trips: [{ entryDate: '2026-01-01', exitDate: '2026-04-05' }],
      }));

      const result = spawnSync(process.execPath, [actionPath], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_WORKSPACE: workspace,
          INPUT_TRIPS_FILE: 'trips.json',
          INPUT_README_FILE: 'README.md',
        },
      });

      const updatedReadme = readFileSync(readmePath, 'utf8');
      assert.equal(result.status, 1);
      assert.match(updatedReadme, /Schengen-overstay-red/);
      assert.match(updatedReadme, /schengen-calculator-core:badge:start/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
