import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Router } from 'express';
import { applyOnboarding, onboardingStatus } from '../onboarding.js';
import { product } from '../product.js';
import { requireObjectBody } from './shared.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderField(field) {
  if (field.type === 'info') {
    const state = field.writable
      ? field.persistent
        ? 'Writable and persistent.'
        : 'Writable, but this path is not on a volume, so a change may not survive a redeploy.'
      : 'Not writable by this process. Fix the file permissions before onboarding can save.';
    return `<section class="storage"><strong>${escapeHtml(field.label)}</strong>
      <code>${escapeHtml(field.value)}</code>
      <p>${escapeHtml(state)}</p>
      ${field.reason ? `<p class="warning">${escapeHtml(field.reason)}</p>` : ''}
    </section>`;
  }

  const id = `field-${field.key.replaceAll('.', '-')}`;
  const help = field.help ? `<p class="help">${escapeHtml(field.help)}</p>` : '';
  const required = field.required ? ' required' : '';
  let control;

  if (field.type === 'boolean') {
    control = `<input id="${id}" name="${escapeHtml(field.key)}" type="checkbox"${
      field.value === true ? ' checked' : ''
    }>`;
  } else if (field.type === 'select') {
    control = `<select id="${id}" name="${escapeHtml(field.key)}"${required}>${field.options
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}"${
            option.value === field.value ? ' selected' : ''
          }>${escapeHtml(option.label)}</option>`,
      )
      .join('')}</select>`;
  } else {
    const type = field.type === 'number' ? 'number' : field.secret ? 'password' : 'text';
    const placeholder =
      field.secret && field.configured
        ? 'Leave empty to keep the current value'
        : (field.placeholder ?? '');
    control = `<input id="${id}" name="${escapeHtml(field.key)}" type="${type}" value="${escapeHtml(
      field.value ?? '',
    )}" placeholder="${escapeHtml(placeholder)}"${
      field.min !== null ? ` min="${field.min}"` : ''
    }${field.max !== null ? ` max="${field.max}"` : ''}${required} autocomplete="off" spellcheck="false">`;
  }

  return `<label class="field" for="${id}">
    <span class="label">${escapeHtml(field.label)}${
      field.required ? ' <em>required</em>' : ''
    }</span>
    ${control}
    ${help}
  </label>`;
}

function renderPage(status, action) {
  const fields = status.fields.map(renderField).join('\n');
  const blocked = !status.editable;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Set up ${escapeHtml(product.name)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 16px/1.55 system-ui, -apple-system, Segoe UI, sans-serif; max-width: 46rem; margin: 0 auto; padding: 2.5rem 1rem 4rem; background: #fafafa; color: #18181b; }
  h1 { margin: 0 0 .25rem; font-size: 1.9rem; letter-spacing: -.02em; }
  .tagline { margin: 0 0 2rem; color: #52525b; }
  form { display: grid; gap: 1.15rem; }
  .field { display: grid; gap: .3rem; }
  .label { font-weight: 600; }
  .label em { font-style: normal; font-weight: 500; font-size: .78rem; color: #71717a; }
  input, select { width: 100%; padding: .6rem .7rem; border: 1px solid #d4d4d8; border-radius: .5rem; background: #fff; color: inherit; font: inherit; }
  input[type=checkbox] { width: auto; justify-self: start; }
  .help { margin: 0; color: #52525b; font-size: .86rem; }
  .storage { display: grid; gap: .2rem; padding: .9rem 1rem; border: 1px solid #e4e4e7; border-radius: .6rem; background: #fff; }
  .storage code { word-break: break-all; font-size: .82rem; }
  .storage p { margin: .2rem 0 0; font-size: .86rem; color: #52525b; }
  .warning { color: #b45309 !important; }
  .actions { display: flex; align-items: center; gap: 1rem; margin-top: .5rem; }
  button { padding: .7rem 1.1rem; border: 0; border-radius: .5rem; background: #16a34a; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .55; cursor: not-allowed; }
  #result { margin-top: 1.5rem; padding: 1rem; border-radius: .6rem; display: none; }
  #result.error { display: block; background: #fef2f2; color: #991b1b; }
  #result.ok { display: block; background: #f0fdf4; color: #166534; }
  ul { margin: .4rem 0 0; padding-left: 1.2rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #18181b; color: #e4e4e7; }
    .tagline, .help, .storage p { color: #a1a1aa; }
    input, select, .storage { background: #27272a; border-color: #3f3f46; }
    #result.error { background: #450a0a; color: #fecaca; }
    #result.ok { background: #052e16; color: #bbf7d0; }
  }
</style>
</head>
<body>
<h1>Set up ${escapeHtml(product.name)}</h1>
<p class="tagline">${escapeHtml(product.tagline)}</p>
<form id="onboarding">
  ${fields}
  <div class="actions">
    <button type="submit"${blocked ? ' disabled' : ''}>Save and start</button>
    <span class="help">The first account you create afterwards becomes the administrator.</span>
  </div>
</form>
<div id="result" role="status"></div>
<script>
(function () {
  var form = document.getElementById('onboarding');
  var result = document.getElementById('result');
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    result.className = '';
    result.textContent = '';
    var settings = {};
    for (var field of form.querySelectorAll('[name]')) {
      if (field.type === 'checkbox') settings[field.name] = field.checked;
      else if (field.type === 'number') settings[field.name] = field.value === '' ? null : Number(field.value);
      else settings[field.name] = field.value === '' ? null : field.value;
    }
    var button = form.querySelector('button');
    button.disabled = true;
    try {
      var response = await fetch(${JSON.stringify(action)}, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ settings: settings })
      });
      var body = await response.json().catch(function () { return null; });
      if (!response.ok) {
        var detail = body && body.detail ? body.detail : 'Setup failed.';
        var errors = body && body.errors ? body.errors : [];
        result.className = 'error';
        result.innerHTML = '<strong>' + detail + '</strong>' + (errors.length
          ? '<ul>' + errors.map(function (error) { return '<li><code>' + error.field + '</code>: ' + error.message + '</li>'; }).join('') + '</ul>'
          : '');
        button.disabled = false;
        return;
      }
      result.className = 'ok';
      result.innerHTML = '<strong>Setup complete.</strong><p>The registry is starting. <a href="/">Continue</a>.</p>';
      form.remove();
    } catch (error) {
      result.className = 'error';
      result.textContent = 'Could not reach the server: ' + error.message;
      button.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;
}

export function makeOnboardingRouter({ config, system = {} }) {
  const router = Router();

  function status() {
    return onboardingStatus(config, system.storageProbe ?? {});
  }

  router.get('/onboarding', (req, res) => {
    const current = status();
    if (req.accepts(['html', 'json']) === 'html') {
      const action = `${req.baseUrl}/onboarding`;
      res.type('html').send(renderPage(current, action));
      return;
    }
    res.set('Cache-Control', 'no-store').json(current);
  });

  router.get('/onboarding/status', (req, res) => {
    res.set('Cache-Control', 'no-store').json(status());
  });

  router.post('/onboarding', async (req, res) => {
    requireObjectBody(req);
    const current = status();
    if (!current.editable) {
      res.status(409).json({
        type: 'about:blank',
        title: 'Configuration is read-only',
        status: 409,
        detail: current.reason ?? 'The configuration file is not writable by this process.',
      });
      return;
    }
    const originalPath = config.configPath;
    const original = existsSync(originalPath) ? readFileSync(originalPath) : null;
    const { config: next } = await applyOnboarding(
      config,
      req.body.settings,
      system.storageProbe ?? {},
    );
    if (typeof system.onboard !== 'function') {
      res.json({ completed: true, restartRequired: true });
      return;
    }
    try {
      await system.onboard(next);
    } catch (error) {
      // The file is valid but the instance could not be rebuilt with it (the
      // database answered a SELECT but refused the migrations, for example).
      // Put the original back so the next boot returns here instead of failing.
      if (original === null) rmSync(originalPath, { force: true });
      else writeFileSync(originalPath, original);
      throw error;
    }
    res.json({ completed: true, restartRequired: false });
  });

  return router;
}
