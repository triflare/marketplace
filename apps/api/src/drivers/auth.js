import { deviceEnabled } from '../device.js';
import { getDescriptor } from './registry.js';
import { oidcEnabled } from '../oidc.js';
import { webauthnSettings } from '../mfa.js';

// The methods the instance offers today: password, the identity provider, a
// passkey, and the device flow. Each descriptor says how it is advertised and
// what it needs; the handlers stay in their routers until the challenge
// drivers below grow begin/complete of their own.
export const password = {
  id: 'password',
  kind: 'auth',
  label: 'Password',
  capabilities: { signIn: true, register: true, link: false, mfa: false },
  requirements: {},
  options: [],
  describe: ({ config }) => (config.auth.passwordEnabled ? { signIn: true } : null),
};

export const oidc = {
  id: 'oidc',
  kind: 'auth',
  label: 'OpenID Connect',
  capabilities: { signIn: true, register: true, link: true, mfa: false },
  requirements: {},
  options: [
    { key: 'issuer', label: 'Issuer URL', type: 'url', required: true },
    { key: 'clientId', label: 'Client ID', type: 'text', required: true },
    { key: 'clientSecret', label: 'Client secret', type: 'secret' },
  ],
  // `required` is the old spelling of "the provider is the only way in". It is
  // reported so a sign-in page can hide its password form.
  describe: ({ config }) =>
    oidcEnabled(config)
      ? { issuer: config.auth.oidc.issuer, required: Boolean(config.auth.oidc.required) }
      : null,
};

export const passkey = {
  id: 'passkey',
  kind: 'auth',
  label: 'Passkey',
  capabilities: {
    signIn: true,
    register: true,
    link: true,
    // A passkey is also the second factor for an account that has one, which
    // is a different job from signing in with it.
    mfa: true,
  },
  requirements: {},
  options: [
    { key: 'rpId', label: 'Relying party ID', type: 'text' },
    { key: 'rpName', label: 'Relying party name', type: 'text' },
  ],
  describe: ({ config }) => {
    const settings = webauthnSettings(config);
    return { rpId: settings.rpId, rpName: settings.rpName };
  },
};

export const deviceCode = {
  id: 'device-code',
  kind: 'auth',
  label: 'Device code',
  capabilities: { signIn: true, register: false, link: false, mfa: false, browser: true },
  requirements: {},
  options: [{ key: 'verificationUrl', label: 'Approval page', type: 'url', required: true }],
  describe: ({ config }) =>
    deviceEnabled(config) ? { verificationUrl: config.auth.device.verificationUrl } : null,
};

export const magicLink = {
  id: 'magic-link',
  kind: 'auth',
  label: 'Email link',
  capabilities: { signIn: true, register: true, link: false, mfa: false },
  requirements: { mail: true },
  options: [{ key: 'ttlMinutes', label: 'Link lifetime (minutes)', type: 'number', default: 15 }],
  describe: () => ({}),
};

// The same channel as a link, but a code the reader types. It suits a device
// that cannot open the link, and it leaves no token in a URL.
export const emailOtp = {
  id: 'email-otp',
  kind: 'auth',
  label: 'Email code',
  capabilities: { signIn: true, register: true, link: false, mfa: false },
  requirements: { mail: true },
  options: [],
  describe: () => ({}),
};

export const magicPassword = {
  id: 'magic-password',
  kind: 'auth',
  label: 'Generated password',
  capabilities: { signIn: true, register: true, link: false, mfa: false },
  // The generated password is shown in the response, but the address is the
  // way back in when it is lost, which is the mail this method depends on.
  requirements: { mail: true },
  options: [],
  describe: () => ({}),
};

// What GET /auth advertises: one entry per configured instance, in the order
// the instance offers them, so two OIDC providers are two entries rather than
// one driver named twice.
export function methodSummaries(ctx) {
  const summaries = [];
  for (const entry of ctx.config.driverInstances?.auth ?? []) {
    const descriptor = getDescriptor('auth', entry.driver);
    const described = descriptor?.describe?.({ ...ctx, driver: entry });
    if (described === null || described === undefined) continue;
    summaries.push({
      kind: entry.driver,
      driver: entry.driver,
      id: entry.id,
      label: descriptor.label,
      capabilities: descriptor.capabilities,
      requirements: descriptor.requirements,
      describe: described,
    });
  }
  return summaries;
}
