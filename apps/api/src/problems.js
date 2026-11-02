// Every error response names what went wrong with a stable slug rather than a
// human sentence. `type` is a relative URI reference, resolved against the
// request URL, so a self-hosted instance serves its own catalogue at
// /problems/<slug> without the API having to know its public host.
//
// A slug is part of the contract: clients may branch on it, so renaming one is
// a breaking change. Adding one is not. A slug is only listed once something
// can send it; a type a client can never receive is a promise nobody keeps.
export const PROBLEMS = {
  'bad-request': {
    status: 400,
    title: 'Bad Request',
    description: 'The request could not be understood or one of its parameters is malformed.',
  },
  unauthorized: {
    status: 401,
    title: 'Unauthorized',
    description:
      'The request needs a valid bearer token, and the one presented is missing or spent.',
  },
  forbidden: {
    status: 403,
    title: 'Forbidden',
    description: 'The credential is valid but the account or scope it carries may not do this.',
  },
  'not-found': {
    status: 404,
    title: 'Not Found',
    description: 'The resource does not exist, or the caller is not allowed to know that it does.',
  },
  'method-not-allowed': {
    status: 405,
    title: 'Method Not Allowed',
    description:
      'The path exists but does not accept this HTTP method. The Allow header names the ones it does.',
  },
  conflict: {
    status: 409,
    title: 'Conflict',
    description:
      'The request conflicts with the current state of the resource, often because it already exists.',
  },
  'already-sent': {
    status: 409,
    title: 'Already Sent',
    description:
      'The resource already reached the state the request asks for, so repeating it would duplicate the effect.',
  },
  'mail-unavailable': {
    status: 409,
    title: 'Mail Unavailable',
    description: 'No mail driver is configured on this instance, so nothing can be sent.',
  },
  'confirmation-required': {
    status: 409,
    title: 'Confirmation Required',
    description:
      'The change is destructive and only happens when the request confirms it explicitly.',
  },
  'configuration-read-only': {
    status: 409,
    title: 'Configuration is read-only',
    description:
      'The configuration file cannot be written from inside this deployment, so runtime changes are refused.',
  },
  'reload-unavailable': {
    status: 409,
    title: 'Reload Unavailable',
    description: 'This process was not started in a way that can rebuild itself.',
  },
  'not-supervised': {
    status: 409,
    title: 'Not Supervised',
    description:
      'This process is not supervised, so exiting would end the service rather than restart it.',
  },
  'restart-unavailable': {
    status: 409,
    title: 'Restart Unavailable',
    description: 'This process cannot restart itself.',
  },
  'idempotency-key-reused': {
    status: 422,
    title: 'Idempotency Key Reused',
    description: 'The Idempotency-Key was already used for a different request body or path.',
  },
  'idempotency-in-progress': {
    status: 409,
    title: 'Idempotency Key In Progress',
    description: 'An earlier request with this key is still running. Retry once it finishes.',
  },
  'precondition-failed': {
    status: 412,
    title: 'Precondition Failed',
    description: 'The If-Match validator does not describe the current version of the document.',
  },
  gone: {
    status: 410,
    title: 'Gone',
    description:
      'The resource existed and was deliberately removed, so retrying will not bring it back.',
  },
  'payload-too-large': {
    status: 413,
    title: 'Payload Too Large',
    description: 'The request body or the object it would produce is over the configured limit.',
  },
  'unsupported-media-type': {
    status: 415,
    title: 'Unsupported Media Type',
    description: 'The request body is not in a media type this operation accepts.',
  },
  'unprocessable-entity': {
    status: 422,
    title: 'Unprocessable Entity',
    description: 'The request was well-formed but its content cannot be accepted as it stands.',
  },
  'validation-error': {
    status: 422,
    title: 'Validation Error',
    description: 'One or more fields failed validation; errors[].pointer names each one.',
  },
  'precondition-required': {
    status: 428,
    title: 'Precondition Required',
    description: 'This change requires an If-Match header naming the revision it is based on.',
  },
  'rate-limited': {
    status: 429,
    title: 'Too Many Requests',
    description: 'A rate-limit bucket is exhausted. Retry-After says when the window rolls over.',
  },
  'internal-error': {
    status: 500,
    title: 'Internal Server Error',
    description:
      'The registry failed while handling the request. The request id names the occurrence to report.',
  },
  'bad-gateway': {
    status: 502,
    title: 'Bad Gateway',
    description: 'A dependency the registry needs answered with something it cannot use.',
  },
  'mail-delivery-failed': {
    status: 502,
    title: 'Delivery Failed',
    description:
      "The mail provider refused the message; `detail` carries the provider's own words.",
  },
  'driver-verification-failed': {
    status: 502,
    title: 'Driver Verification Failed',
    description: 'The new driver instances could not be verified, so nothing was written.',
  },
  'service-unavailable': {
    status: 503,
    title: 'Service Unavailable',
    description:
      'The registry is starting, draining, or missing a dependency. Retry-After says when to try again.',
  },
};

const BY_STATUS = new Map();
for (const [slug, entry] of Object.entries(PROBLEMS)) {
  // The first slug registered for a status is the generic one; 422 registers
  // `unprocessable-entity` before the field-level `validation-error`, which is
  // chosen explicitly by the factory that raises it.
  if (!BY_STATUS.has(entry.status)) BY_STATUS.set(entry.status, slug);
}

export function problemType(slug) {
  return `/problems/${slug}`;
}

export function defaultProblemSlug(status) {
  return BY_STATUS.get(status) ?? (status >= 500 ? 'internal-error' : 'bad-request');
}

export function defaultProblemTitle(status) {
  return PROBLEMS[defaultProblemSlug(status)]?.title ?? 'Error';
}

export function problemCatalogue() {
  return Object.entries(PROBLEMS).map(([slug, entry]) => ({
    type: problemType(slug),
    slug,
    status: entry.status,
    title: entry.title,
    description: entry.description,
  }));
}

export function problemFor(slug) {
  const entry = PROBLEMS[slug];
  return entry
    ? {
        type: problemType(slug),
        slug,
        status: entry.status,
        title: entry.title,
        description: entry.description,
      }
    : null;
}

// A field name is a dotted path (`auth.methods`); a JSON Pointer is the
// standard way to point into the request document (`/auth/methods`).
export function fieldPointer(field) {
  if (typeof field !== 'string' || field === '') return undefined;
  return `/${field
    .split('.')
    .map((part) => part.replace(/~/g, '~0').replace(/\//g, '~1'))
    .join('/')}`;
}
