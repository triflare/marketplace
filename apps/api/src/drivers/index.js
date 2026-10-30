import { defineKind, registerDriver } from './registry.js';
import { deviceCode, emailOtp, magicLink, magicPassword, oidc, passkey, password } from './auth.js';
import { DESCRIPTORS as MAIL_DRIVERS } from './mail.js';
import { DESCRIPTORS as OTHER_DRIVERS } from './other.js';

// Auth and mail are the kinds that existed as hardcoded behavior, so they are
// the two the registry starts with. The rest (storage, cache, jobs, and so on)
// join the same host as their call sites move over.
defineKind({
  id: 'auth',
  label: 'Authentication',
  methods: ['describe'],
  // begin/complete are optional on a driver: the ones with a challenge (magic
  // link, email code) implement them, and the ones that complete in one call
  // (password) do not.
  ctxFirst: ['describe'],
  multiple: true,
});

defineKind({
  id: 'mail',
  label: 'Mail',
  methods: ['send', 'verify'],
  multiple: true,
});

defineKind({ id: 'storage', label: 'Storage', methods: ['put', 'get', 'delete', 'stat', 'probe'] });
defineKind({ id: 'jobs', label: 'Jobs', methods: ['enqueue'] });
defineKind({ id: 'search', label: 'Search', methods: ['search'] });
defineKind({ id: 'captcha', label: 'Captcha', methods: ['verify'] });
defineKind({ id: 'scanner', label: 'Scanner', methods: ['scan'] });
defineKind({ id: 'notify', label: 'Notifications', methods: ['send'] });
defineKind({ id: 'metrics', label: 'Metrics', methods: ['render'] });
defineKind({ id: 'compiler', label: 'Compiler', methods: ['command'] });

for (const descriptor of [
  password,
  oidc,
  passkey,
  deviceCode,
  magicLink,
  emailOtp,
  magicPassword,
]) {
  registerDriver(descriptor);
}
for (const descriptor of MAIL_DRIVERS) registerDriver(descriptor);
for (const descriptor of OTHER_DRIVERS) registerDriver(descriptor);
