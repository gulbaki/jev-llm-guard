import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { runCli } from '../src/cli.js';
import { jevResponse, httpResponse } from './helpers/jev.js';
const writer = () => { let value = ''; return { write: x => { value += x; }, read: () => value }; };
const io = () => ({ env: { TYPESAFE_API_KEY: 'test-key' }, stdin: Readable.from(['hello']), stdout: writer(), stderr: writer(), fetchImpl: async () => httpResponse(jevResponse()) });
test('JSON CLI carries explicit context and trusted task to Jev and prints ten risks', async () => {
  const deps = io(); let state;
  deps.fetchImpl = async (_url, opts) => { state = JSON.parse(opts.body).state; return httpResponse(jevResponse({ LLM01: 0.9 })); };
  assert.equal(await runCli(['--json', '--context=tool_output', '--task=Summarize results', 'hello'], deps), 0);
  const result = JSON.parse(deps.stdout.read());
  assert.equal(result.context, 'tool_output');
  assert.equal(result.action, 'block');
  assert.equal(Object.keys(result.risks).length, 10);
  assert.equal(state.trusted_task, 'Summarize results');
});
test('piped text prints the decision and contextual assessment gaps', async () => {
  const deps = io();
  assert.equal(await runCli([], deps), 0);
  assert.match(deps.stdout.read(), /Decision: ALLOW/);
  assert.match(deps.stdout.read(), /LLM04.*needs_context/);
  assert.match(deps.stdout.read(), /Context: user_input/);
});
test('rejects obsolete email flag and unknown context without a Jev request', async () => {
  for (const args of [['--source=email', 'text'], ['--context=bogus', 'text']]) {
    const deps = io(); deps.fetchImpl = async () => { throw new Error('unexpected call'); };
    assert.equal(await runCli(args, deps), 1);
    assert.equal(deps.stdout.read(), '');
  }
});
test('missing key fails without disclosing text', async () => {
  const deps = io(); deps.env = {};
  assert.equal(await runCli(['secret document'], deps), 1);
  assert.match(deps.stderr.read(), /TYPESAFE_API_KEY/);
  assert.doesNotMatch(deps.stderr.read(), /secret document/);
});
