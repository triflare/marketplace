import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { sendSmtp, verifySmtp } from './smtp.js';

const TIMEOUT_MS = 15_000;

// A delivery failure, told apart by whether trying another provider could
// help. A refused recipient is the provider's answer about this message and
// stops the chain; a timeout, a 5xx, or a rate limit moves to the next one.
export class MailError extends Error {
  constructor(message, { transport = false, status = null } = {}) {
    super(message);
    this.name = 'MailError';
    this.transport = transport;
    this.status = status;
  }
}

const MESSAGE_KEYS = ['to', 'subject', 'text', 'html', 'replyTo', 'purpose'];

function recipients(value) {
  if (Array.isArray(value)) return value.flatMap(recipients);
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    throw new MailError('A mail message must be an object.');
  }
  if (!recipients(message.to).length) throw new MailError('A mail message needs a recipient.');
  if (typeof message.subject !== 'string' || message.subject === '') {
    throw new MailError('A mail message needs a subject.');
  }
  for (const key of MESSAGE_KEYS) {
    if (message[key] !== undefined && typeof message[key] !== 'string') {
      throw new MailError(`message.${key} must be a string.`);
    }
  }
}

function logLine(ctx, message, delivered) {
  const line = JSON.stringify({
    event: 'mail',
    to: recipients(message.to),
    subject: message.subject,
    purpose: message.purpose ?? null,
    delivered,
  });
  if (typeof ctx?.log?.info === 'function') ctx.log.info(line);
  else (ctx?.log ?? console).log(line);
}

async function postJson(url, { headers = {}, body }) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new MailError(`Could not reach the mail provider: ${error.message}`, { transport: true });
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new MailError(
      `The mail provider answered ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}.`,
      { transport: response.status === 429 || response.status >= 500, status: response.status },
    );
  }
  return response;
}

export const none = {
  id: 'none',
  kind: 'mail',
  label: 'No mail',
  capabilities: { deliver: false },
  requirements: {},
  options: [],
  send(message) {
    validateMessage(message);
    throw new MailError('Mail is not configured on this instance.', { transport: false });
  },
  verify: () => true,
};

export const log = {
  id: 'log',
  kind: 'mail',
  label: 'Log only',
  capabilities: { deliver: false, log: true },
  requirements: {},
  options: [],
  send(message, ctx) {
    validateMessage(message);
    logLine(ctx, message, false);
    return { logged: recipients(message.to).length };
  },
  verify: () => true,
};

export const smtp = {
  id: 'smtp',
  kind: 'mail',
  label: 'SMTP',
  capabilities: { deliver: true },
  requirements: {},
  options: [
    { key: 'host', label: 'Host', type: 'text', required: true },
    { key: 'port', label: 'Port', type: 'number', default: 587 },
    { key: 'secure', label: 'Implicit TLS', type: 'boolean', default: false },
    { key: 'starttls', label: 'Upgrade with STARTTLS', type: 'boolean', default: true },
    { key: 'user', label: 'Username', type: 'text' },
    { key: 'password', label: 'Password', type: 'secret', secret: true },
    { key: 'from', label: 'From address', type: 'text', required: true },
  ],
  async send(message, ctx) {
    validateMessage(message);
    return sendSmtp(ctx.driver.options, { ...message });
  },
  verify: (ctx) => verifySmtp(ctx.driver.options),
};

// The mail drivers that take a provider's API key are one shape in different
// clothes, so the request builder is shared and only the endpoint, the header,
// and the body differ.
function keyedDriver({ id, label, url, headers, body }) {
  return {
    id,
    kind: 'mail',
    label,
    capabilities: { deliver: true },
    requirements: {},
    options: [
      { key: 'apiKey', label: 'API key', type: 'secret', required: true, secret: true },
      { key: 'from', label: 'From address', type: 'text', required: true },
      ...(url.includes('${domain}')
        ? [{ key: 'domain', label: 'Sending domain', type: 'text', required: true }]
        : []),
    ],
    async send(message, ctx) {
      validateMessage(message);
      const options = ctx.driver.options;
      await postJson(url.replace('${domain}', encodeURIComponent(options.domain ?? '')), {
        headers: headers(options),
        body: body(message, options),
      });
      return { delivered: recipients(message.to).length };
    },
    async verify(ctx) {
      const options = ctx.driver.options;
      if (!options.apiKey) throw new MailError(`${label} needs an API key.`, { transport: false });
      if (!options.from)
        throw new MailError(`${label} needs a from address.`, { transport: false });
      return true;
    },
  };
}

export const resend = keyedDriver({
  id: 'resend',
  label: 'Resend',
  url: 'https://api.resend.com/emails',
  headers: (options) => ({ authorization: `Bearer ${options.apiKey}` }),
  body: (message, options) => ({
    from: options.from,
    to: recipients(message.to),
    subject: message.subject,
    text: message.text ?? undefined,
    html: message.html ?? undefined,
    reply_to: message.replyTo ?? undefined,
  }),
});

export const postmark = keyedDriver({
  id: 'postmark',
  label: 'Postmark',
  url: 'https://api.postmarkapp.com/email',
  headers: (options) => ({ 'x-postmark-server-token': options.apiKey }),
  body: (message, options) => ({
    From: options.from,
    To: recipients(message.to).join(', '),
    Subject: message.subject,
    TextBody: message.text ?? '',
    HtmlBody: message.html ?? undefined,
    ReplyTo: message.replyTo ?? undefined,
  }),
});

export const sendgrid = keyedDriver({
  id: 'sendgrid',
  label: 'SendGrid',
  url: 'https://api.sendgrid.com/v3/mail/send',
  headers: (options) => ({ authorization: `Bearer ${options.apiKey}` }),
  body: (message, options) => ({
    personalizations: [{ to: recipients(message.to).map((email) => ({ email })) }],
    from: { email: options.from },
    subject: message.subject,
    content: [
      message.text ? { type: 'text/plain', value: message.text } : null,
      message.html ? { type: 'text/html', value: message.html } : null,
    ].filter(Boolean),
    reply_to: message.replyTo ? { email: message.replyTo } : undefined,
  }),
});

// Mailgun wants form encoding rather than JSON, so it does not fit the keyed
// shape above and sends its own request.
export const mailgun = {
  id: 'mailgun',
  kind: 'mail',
  label: 'Mailgun',
  capabilities: { deliver: true },
  requirements: {},
  options: [
    { key: 'apiKey', label: 'API key', type: 'secret', required: true, secret: true },
    { key: 'domain', label: 'Sending domain', type: 'text', required: true },
    { key: 'from', label: 'From address', type: 'text', required: true },
    { key: 'baseUrl', label: 'API base URL', type: 'url', default: 'https://api.mailgun.net' },
  ],
  async send(message, ctx) {
    validateMessage(message);
    const options = ctx.driver.options;
    const body = new URLSearchParams({ from: options.from, subject: message.subject });
    for (const to of recipients(message.to)) body.append('to', to);
    if (message.text) body.set('text', message.text);
    if (message.html) body.set('html', message.html);
    if (message.replyTo) body.set('h:Reply-To', message.replyTo);
    const url = `${(options.baseUrl ?? 'https://api.mailgun.net').replace(/\/+$/, '')}/v3/${encodeURIComponent(options.domain)}/messages`;
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`api:${options.apiKey}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new MailError(`Could not reach Mailgun: ${error.message}`, { transport: true });
    }
    if (!response.ok) {
      throw new MailError(`Mailgun answered ${response.status}.`, {
        transport: response.status === 429 || response.status >= 500,
        status: response.status,
      });
    }
    return { delivered: recipients(message.to).length };
  },
  async verify(ctx) {
    const options = ctx.driver.options;
    if (!options.apiKey || !options.domain || !options.from) {
      throw new MailError('Mailgun needs an API key, a domain, and a from address.');
    }
    return true;
  },
};

// POST the message as JSON to a gateway the operator already runs. This is the
// escape hatch for a provider with no driver of its own.
export const http = {
  id: 'http',
  kind: 'mail',
  label: 'HTTP gateway',
  capabilities: { deliver: true },
  requirements: {},
  options: [
    { key: 'url', label: 'Endpoint URL', type: 'url', required: true },
    { key: 'authorization', label: 'Authorization header', type: 'secret', secret: true },
    { key: 'from', label: 'From address', type: 'text', required: true },
  ],
  async send(message, ctx) {
    validateMessage(message);
    const options = ctx.driver.options;
    const headers = options.authorization ? { authorization: options.authorization } : {};
    await postJson(options.url, {
      headers,
      body: {
        from: options.from,
        to: recipients(message.to),
        subject: message.subject,
        text: message.text ?? null,
        html: message.html ?? null,
        replyTo: message.replyTo ?? null,
        purpose: message.purpose ?? null,
      },
    });
    return { delivered: recipients(message.to).length };
  },
  async verify(ctx) {
    if (!ctx.driver.options.url) throw new MailError('The HTTP mail driver needs a URL.');
    return true;
  },
};

// For tests and for an instance that wants to inspect what it would have sent:
// one .eml per message under dataDir/mail, named by time and a random suffix.
export const file = {
  id: 'file',
  kind: 'mail',
  label: 'File',
  capabilities: { deliver: false, file: true },
  requirements: {},
  options: [{ key: 'dir', label: 'Directory', type: 'text', default: null }],
  async send(message, ctx) {
    validateMessage(message);
    const options = ctx.driver.options;
    const dir = options.dir
      ? path.resolve(ctx.config.dataDir, options.dir)
      : path.join(ctx.config.dataDir, 'mail');
    mkdirSync(dir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.eml`;
    const headers = [
      `From: ${options.from ?? 'no-reply@localhost'}`,
      `To: ${recipients(message.to).join(', ')}`,
      `Subject: ${message.subject}`,
      `Date: ${new Date().toUTCString()}`,
      `X-Purpose: ${message.purpose ?? ''}`,
      'MIME-Version: 1.0',
    ];
    // Both halves, the way a provider sends them: a reader without HTML still
    // gets the link, and a reader with it gets the styled message.
    let body = message.text ?? '';
    if (message.html) {
      const boundary = `--${randomBytes(12).toString('hex')}`;
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      body = [
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        message.text ?? '',
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        message.html,
        `--${boundary}--`,
        '',
      ].join('\r\n');
    } else {
      headers.push('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit');
    }
    body = [...headers, '', body].join('\r\n');
    writeFileSync(path.join(dir, name), body, 'utf8');
    logLine(ctx, message, false);
    return { file: path.join(dir, name) };
  },
  verify: () => true,
};

export const DESCRIPTORS = [none, log, smtp, resend, postmark, sendgrid, mailgun, http, file];
