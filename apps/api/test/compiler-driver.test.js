import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import '../src/drivers/index.js';
import { getDescriptor } from '../src/drivers/registry.js';
import { makeConfig } from './helpers.mjs';

test('the extend compiler names the bundled CLI', () => {
  const descriptor = getDescriptor('compiler', 'extend');
  assert.ok(descriptor, 'the compiler kind has an extend driver');
  const command = descriptor.command({ config: makeConfig(), driver: { options: {} } });
  assert.match(command, /node_modules[/\\]@triflare[/\\]extend[/\\]src[/\\]cli\.js$/);
});

test('a custom CLI is the script it names, and nothing else', () => {
  const descriptor = getDescriptor('compiler', 'custom-cli');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triflare-compiler-'));
  const script = path.join(dir, 'build.mjs');
  fs.writeFileSync(script, '// custom compiler\n');

  const command = descriptor.command({
    config: makeConfig(),
    driver: { options: { command: script } },
  });
  assert.equal(command, script);

  // A path that is not a Node script is refused when the instance is verified,
  // rather than at the first publish.
  for (const command of [path.join(dir, 'build.sh'), '', 42]) {
    const ctx = { config: makeConfig(), driver: { options: { command } } };
    assert.throws(() => descriptor.command(ctx), /compiler\.command/);
  }
});
