import {
  defaultProblemSlug,
  defaultProblemTitle,
  fieldPointer,
  problemFor,
  problemType,
} from './problems.js';

// A failure carries a slug from the catalogue rather than an invented sentence.
// `title` is the catalogue's own wording unless the call site overrides it, and
// `detail` says what happened this time.
export class HttpError extends Error {
  constructor(status, { title, detail, errors, retryAfter, extra, slug, headers } = {}) {
    if (typeof status === 'string') {
      super(status);
      this.status = 500;
      this.slug = 'internal-error';
      this.title = status;
    } else {
      const fallback = defaultProblemTitle(status);
      super(detail ?? title ?? fallback);
      this.status = status;
      this.slug = slug ?? defaultProblemSlug(status);
      // A type reads the same wherever it appears, so the catalogue owns the
      // title whenever it knows the slug. A call site can name a failure but
      // cannot give one type two titles.
      this.title = problemFor(this.slug)?.title ?? title ?? fallback;
      this.detail = detail;
      this.errors = errors;
      this.retryAfter = retryAfter;
      this.headers = headers;
      if (extra) Object.assign(this, extra);
    }
  }

  // `instance` and `requestId` need the request, so the handler adds them.
  toJSON() {
    const body = {
      type: problemType(this.slug),
      title: this.title,
      status: this.status,
    };
    if (this.detail) body.detail = this.detail;
    if (this.errors) body.errors = this.errors;
    // Device-flow failures name their state the way RFC 8628 spells it, so a
    // client can branch on `error` rather than parse the wording.
    if (this.error) body.error = this.error;
    if (this.buildLog) body.buildLog = this.buildLog;
    if (this.buildError) body.buildError = this.buildError;
    return body;
  }
}

export function fieldErrors(errors) {
  return new HttpError(422, {
    slug: 'validation-error',
    detail: 'One or more fields failed validation.',
    errors,
  });
}

export function unauthorized(detail = 'Missing or invalid bearer token.') {
  return new HttpError(401, { detail });
}

export function forbidden(detail = 'You are not allowed to perform this action.') {
  return new HttpError(403, { detail });
}

export function notFound(detail = 'Not found.') {
  return new HttpError(404, { detail });
}

export function conflict(detail = 'Resource already exists.') {
  return new HttpError(409, { detail });
}

export function gone(detail = 'This resource was removed.') {
  return new HttpError(410, { detail });
}

export function payloadTooLarge(detail = 'Request body is too large.') {
  return new HttpError(413, { detail });
}

export function unsupportedMediaType(detail = 'Unsupported media type.') {
  return new HttpError(415, { detail });
}

export function tooManyRequests(retryAfterSeconds) {
  return new HttpError(429, {
    detail: 'Rate limit exceeded. Try again later.',
    retryAfter: retryAfterSeconds,
  });
}

// RFC 6750 makes the scheme mandatory on a 401. A caller that sent a token gets
// `invalid_token`, which says "this credential is spent" rather than "you
// forgot one"; a caller that sent none gets the bare challenge.
function bearerChallenge(req) {
  const presented = typeof req.get('authorization') === 'string';
  return presented
    ? 'Bearer error="invalid_token", error_description="The access token is missing, expired, or revoked."'
    : 'Bearer';
}

function sendProblem(req, res, error) {
  const problem = problemFor(error.slug);
  const body = {
    type: problem ? problem.type : problemType('internal-error'),
    title: error.title ?? problem?.title ?? 'Error',
    status: error.status,
  };
  if (error.detail) body.detail = error.detail;
  if (req.originalUrl) body.instance = req.originalUrl;
  if (req.id) body.requestId = req.id;
  // Each entry carries the dotted field name and the JSON Pointer into the
  // request document that names the same place, so a client can read either.
  if (error.errors) {
    body.errors = error.errors.map((entry) => ({
      ...entry,
      pointer: entry.pointer ?? fieldPointer(entry.field),
    }));
  }
  if (error.error) body.error = error.error;
  if (error.buildLog) body.buildLog = error.buildLog;
  if (error.buildError) body.buildError = error.buildError;

  res.status(error.status).type('application/problem+json');
  if (error.retryAfter) res.set('Retry-After', String(Math.ceil(error.retryAfter)));
  if (error.headers) res.set(error.headers);
  if (error.status === 401) res.set('WWW-Authenticate', bearerChallenge(req));
  return res.json(body);
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return sendProblem(req, res, error);

  // body-parser reports its own failures with a `type` string rather than a
  // status, so they are mapped before the generic 4xx branch.
  if (error?.type === 'entity.parse.failed') {
    return sendProblem(
      req,
      res,
      new HttpError(400, { detail: 'The request body is not valid JSON.' }),
    );
  }
  if (error?.type === 'entity.too.large') {
    return sendProblem(req, res, new HttpError(413, { detail: 'The request body is too large.' }));
  }
  if (error?.type === 'encoding.unsupported') {
    return sendProblem(
      req,
      res,
      new HttpError(415, { detail: 'The request body uses an unsupported encoding.' }),
    );
  }

  const status = error?.status ?? error?.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return sendProblem(req, res, new HttpError(status));
  }
  console.error({
    message: error?.message,
    code: error?.code,
    stack: error?.stack,
    requestId: req.id,
  });
  return sendProblem(req, res, new HttpError(500));
}
