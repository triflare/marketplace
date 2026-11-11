import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeMeRouter } from '../src/routes/me.js';

function exportHandler() {
  const user = { Id: 1, Namespace: 'test', CreatedAt: new Date() };
  const db = { Users: { findUnique: async () => user } };
  for (const model of [
    'AuthIdentities',
    'AutomationTokens',
    'Passkeys',
    'OrganizationOwners',
    'LegalDocuments',
    'Sessions',
    'Notifications',
    'Reports',
    'Versions',
  ])
    db[model] = { findMany: async () => [] };
  const router = makeMeRouter({ db, config: { privacy: {} } });
  return router.stack.find((layer) => layer.route.path === '/me/export').route.stack.at(-1).handle;
}

class Response extends EventEmitter {
  destroyed = false;
  headersSent = false;
  writes = 0;
  set() {}
  type() {}
  end() {
    this.ended = true;
  }
  destroy(error) {
    this.destroyed = true;
    this.failure = error;
  }
  write() {
    this.headersSent = true;
    this.writes++;
    return false;
  }
}

function assertClean(res) {
  for (const event of ['drain', 'error', 'close']) assert.equal(res.listenerCount(event), 0);
}

const req = { auth: { user: { Id: 1 } } };

test('export rejects an already destroyed response before writing', async () => {
  const res = new Response();
  res.destroyed = true;
  await assert.rejects(exportHandler()(req, res), /Export response closed/);
  assert.equal(res.writes, 0);
  assertClean(res);
});

for (const event of ['drain', 'error', 'close']) {
  test(`export cleans backpressure listeners after ${event}`, async () => {
    const res = new Response();
    const write = res.write.bind(res);
    res.write = () => {
      assertClean(res);
      const result = write();
      setImmediate(() => {
        assert.equal(res.listenerCount('drain'), 1);
        assert.equal(res.listenerCount('error'), 1);
        assert.equal(res.listenerCount('close'), 1);
        if (event === 'close') res.destroyed = true;
        res.emit(event, event === 'error' ? new Error('write failed') : undefined);
        assertClean(res);
      });
      return result;
    };
    await exportHandler()(req, res);
    assertClean(res);
    if (event === 'drain') {
      assert.ok(res.writes > 10);
      assert.equal(res.ended, true);
    } else {
      assert.equal(res.writes, 1);
      assert.match(res.failure.message, event === 'error' ? /write failed/ : /closed/);
    }
  });
}
