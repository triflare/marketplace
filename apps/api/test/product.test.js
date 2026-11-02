import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Writable } from 'node:stream';
import request from 'supertest';
import { brandText, brandingColors, product } from '../src/product.js';
import { DEFAULTS } from '../src/config.js';
import { apiPath, boot } from './helpers.mjs';

let app;
before(async () => {
  ({ app } = await boot());
});
after(async () => {
  await (await boot()).db.$disconnect();
});

test('product.yml loads with required fields', () => {
  assert.equal(product.name, 'Triflare Marketplace');
  assert.ok(product.version);
  assert.ok(product.tagline);
  assert.ok(product.homepage);
  assert.ok(product.defaults?.configFilename);
  assert.ok(product.defaults?.apiRoot);
});

test('product.yml version matches package.json', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(product.version, pkg.version);
});

test('product.yml carries the brand palette', () => {
  assert.deepEqual(brandingColors(), {
    primary: '#16A34A',
    secondary: '#12823B',
    tertiary: '#0D602C',
  });
});

test('brandText paints the name with each brand color', () => {
  const previous = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = '1';
  try {
    const text = brandText(product.name);
    assert.ok(text.includes('\u001b[38;2;22;163;74m'));
    assert.ok(text.includes('\u001b[38;2;18;130;59m'));
    assert.ok(text.includes('\u001b[38;2;13;96;44m'));
  } finally {
    if (previous === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = previous;
  }
});

test('brandText stays plain text when the stream cannot show color', () => {
  const previous = process.env.FORCE_COLOR;
  delete process.env.FORCE_COLOR;
  try {
    const sink = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    });
    assert.equal(brandText(product.name, sink), product.name);
  } finally {
    if (previous === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = previous;
  }
});

test('config DEFAULTS.apiRoot is sourced from product.yml', () => {
  assert.equal(DEFAULTS.apiRoot, product.defaults.apiRoot);
});

test(`GET ${apiPath('/meta')} returns product metadata`, async () => {
  const r = await request(app).get(apiPath('/meta'));
  assert.equal(r.status, 200);
  assert.equal(r.body.name, product.name);
  assert.equal(r.body.version, product.version);
  assert.equal(r.body.tagline, product.tagline);
  assert.equal(r.body.homepage, product.homepage);
  // No announcement is configured on this instance, so there is no banner.
  assert.equal(r.body.banner, null);
});
