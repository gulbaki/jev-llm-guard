import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('CLI help has no dotenv chatter on stdout', () => {
  const result = spawnSync(process.execPath, ['bin/jev-guard.js', '--help'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Usage: jev-guard/);
  assert.equal(result.stderr, '');
});

test('demo help has no dotenv chatter on stdout', () => {
  const result = spawnSync(process.execPath, ['bin/jev-demo.js', '--help'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Usage: npm run scenarios/);
  assert.equal(result.stderr, '');
});
