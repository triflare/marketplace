import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

// A submission client, not a general MTA: it speaks just enough SMTP to hand
// one message to a relay, with STARTTLS and the two AUTH mechanisms relays
// actually offer. Everything it cannot do (DSNs, pipelining, eight-bit
// negotiation) is something a relay fills in.
const TIMEOUT_MS = 15_000;

export class SmtpError extends Error {
  constructor(message, { transport = true, code = null } = {}) {
    super(message);
    this.name = 'SmtpError';
    this.transport = transport;
    this.code = code;
  }
}

class Connection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = '';
    this.lines = [];
    this.waiters = [];
    this.error = null;
    socket.setEncoding('utf8');
    socket.setTimeout(TIMEOUT_MS, () => this.fail(new SmtpError('The SMTP server timed out.')));
    socket.on('data', (chunk) => this.receive(chunk));
    socket.on('error', (error) =>
      this.fail(new SmtpError(`SMTP connection failed: ${error.message}`)),
    );
    socket.on('close', () => {
      if (this.waiters.length) this.fail(new SmtpError('The SMTP server closed the connection.'));
    });
  }

  receive(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      this.lines.push(line);
      this.flush();
    }
  }

  flush() {
    while (this.waiters.length && this.lines.length) {
      const waiter = this.waiters.shift();
      const line = this.lines.shift();
      waiter.resolve(line);
    }
  }

  fail(error) {
    this.error = error;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  readLine() {
    if (this.error) return Promise.reject(this.error);
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  // A reply is one or more lines, and only the last one has a space after the
  // status code. The code is repeated on each line, so the last line is the
  // one that says how the command ended.
  async reply() {
    const lines = [];
    for (;;) {
      const line = await this.readLine();
      lines.push(line);
      if (line.length < 4 || line[3] !== '-') break;
    }
    const last = lines[lines.length - 1];
    const code = Number(last.slice(0, 3));
    if (!Number.isInteger(code)) throw new SmtpError(`Unexpected SMTP reply: ${last}`);
    return { code, lines };
  }

  write(text) {
    if (this.error) throw this.error;
    this.socket.write(text);
  }

  async command(text, { expect = [250] } = {}) {
    this.write(`${text}\r\n`);
    const reply = await this.reply();
    if (!expect.includes(reply.code)) {
      throw new SmtpError(`SMTP refused ${text.split(' ')[0]}: ${reply.lines.join(' ')}`, {
        code: reply.code,
      });
    }
    return reply;
  }

  async upgrade(host) {
    const secured = await new Promise((resolve, reject) => {
      const socket = tls.connect({ socket: this.socket, servername: host }, () => resolve(socket));
      socket.once('error', reject);
    });
    this.socket = secured;
    this.buffer = '';
    this.lines = [];
    secured.setEncoding('utf8');
    secured.setTimeout(TIMEOUT_MS, () => this.fail(new SmtpError('The SMTP server timed out.')));
    secured.on('data', (chunk) => this.receive(chunk));
    secured.on('error', (error) =>
      this.fail(new SmtpError(`SMTP connection failed: ${error.message}`)),
    );
    secured.on('close', () => {
      if (this.waiters.length) this.fail(new SmtpError('The SMTP server closed the connection.'));
    });
  }

  close() {
    this.socket.end();
    this.socket.destroy();
  }
}

function connect({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host }, () => resolve(socket))
      : net.connect({ host, port }, () => resolve(socket));
    socket.once('error', (error) =>
      reject(new SmtpError(`Could not reach the SMTP server: ${error.message}`)),
    );
  });
}

async function authenticate(connection, { user, password }) {
  if (!user) return;
  const mechanisms = connection.capabilities ?? new Set();
  if (mechanisms.has('PLAIN')) {
    const token = Buffer.from(`\u0000${user}\u0000${password ?? ''}`).toString('base64');
    await connection.command(`AUTH PLAIN ${token}`, { expect: [235] });
    return;
  }
  if (mechanisms.has('LOGIN')) {
    await connection.command('AUTH LOGIN', { expect: [334] });
    await connection.command(Buffer.from(user).toString('base64'), { expect: [334] });
    await connection.command(Buffer.from(password ?? '').toString('base64'), { expect: [235] });
    return;
  }
  throw new SmtpError('The SMTP server offers no AUTH mechanism this client speaks.');
}

async function open(options) {
  const connection = new Connection(await connect(options));
  const greeting = await connection.reply();
  if (greeting.code !== 220) {
    throw new SmtpError(`The SMTP server said ${greeting.code} at connect.`, {
      code: greeting.code,
    });
  }
  connection.capabilities = new Set();
  const ehlo = await connection
    .command(`EHLO ${options.ehloName}`, { expect: [250] })
    .catch(async () => connection.command(`HELO ${options.ehloName}`, { expect: [250] }));
  for (const line of ehlo.lines) {
    const [name, ...rest] = line.slice(4).split(' ');
    if (name) connection.capabilities.add(name.toUpperCase());
    if (name?.toUpperCase() === 'AUTH') {
      for (const mechanism of rest) connection.capabilities.add(mechanism.toUpperCase());
    }
  }
  if (!options.secure && options.starttls && connection.capabilities.has('STARTTLS')) {
    await connection.command('STARTTLS', { expect: [220] });
    await connection.upgrade(options.host);
    await connection.command(`EHLO ${options.ehloName}`, { expect: [250] });
  }
  if (!options.secure && options.user && !connection.socket.encrypted) {
    // Credentials over a plaintext connection are refused rather than sent:
    // an operator who wants them sent anyway has to turn starttls off and
    // accept that this is now the network's problem.
    throw new SmtpError(
      'The SMTP server did not offer STARTTLS, so credentials were not sent. Set starttls to false to allow it.',
    );
  }
  await authenticate(connection, options);
  return connection;
}

function encodeHeader(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ');
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`;
}

function addresses(value) {
  if (Array.isArray(value)) return value.flatMap((entry) => addresses(entry));
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildMessage(message, from) {
  const to = addresses(message.to);
  const boundary = `--${randomBytes(12).toString('hex')}`;
  const headers = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomBytes(12).toString('hex')}@${from.split('@')[1] ?? 'localhost'}>`,
    'MIME-Version: 1.0',
  ];
  if (message.replyTo) headers.push(`Reply-To: ${message.replyTo}`);

  const text = String(message.text ?? '');
  if (!message.html) {
    headers.push('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit');
    return { to, body: `${headers.join('\r\n')}\r\n\r\n${text}` };
  }
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    String(message.html),
    `--${boundary}--`,
  ].join('\r\n');
  return { to, body: `${headers.join('\r\n')}\r\n\r\n${body}` };
}

// A line that begins with a dot would end the DATA section early, so it is
// doubled -- the receiver removes one, and the message arrives as written.
function dotStuff(body) {
  return body.replace(/\r?\n\./g, '\r\n..').replace(/^\./, '..');
}

export async function sendSmtp(options, message) {
  const connection = await open({
    ...options,
    ehloName: options.heloName ?? 'localhost',
  });
  try {
    const { to, body } = buildMessage(message, options.from);
    await connection.command(`MAIL FROM:<${options.from.replace(/^.*</, '').replace(/>$/, '')}>`);
    for (const address of to) {
      await connection.command(`RCPT TO:<${address.replace(/^.*</, '').replace(/>$/, '')}>`, {
        expect: [250, 251],
      });
    }
    await connection.command('DATA', { expect: [354] });
    connection.write(`${dotStuff(body)}\r\n.\r\n`);
    const accepted = await connection.reply();
    if (accepted.code !== 250) {
      throw new SmtpError(`The SMTP server rejected the message: ${accepted.lines.join(' ')}`, {
        code: accepted.code,
      });
    }
    await connection.command('QUIT', { expect: [221] }).catch(() => {});
    return { accepted: to.length };
  } finally {
    connection.close();
  }
}

export async function verifySmtp(options) {
  const connection = await open({ ...options, ehloName: options.heloName ?? 'localhost' });
  try {
    await connection.command('QUIT', { expect: [221] }).catch(() => {});
  } finally {
    connection.close();
  }
  return true;
}
