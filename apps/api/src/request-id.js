import { randomUUID } from 'node:crypto';

// A request id is the one thing a person can quote from a failure that ties it
// to the server's own log line. A caller may supply its own (so a gateway that
// already assigned one keeps it), but only in a shape that cannot be used to
// forge log fields or break a header.
const VALID = /^[A-Za-z0-9._:-]{1,128}$/;

export function makeRequestId() {
  return function requestId(req, res, next) {
    const supplied = req.get('x-request-id');
    req.id = typeof supplied === 'string' && VALID.test(supplied) ? supplied : randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  };
}
