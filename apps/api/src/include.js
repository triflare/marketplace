import { fieldErrors } from './errors.js';

// `?include=` names related resources to fold into a detail response. Each
// endpoint declares what it can fold in; asking for anything else is a field
// error rather than a silently missing key.
export function parseIncludes(raw, allowed) {
  if (raw === undefined) return null;
  if (typeof raw !== 'string') {
    throw fieldErrors([{ field: 'include', message: 'Must be a comma-separated list of names.' }]);
  }
  const names = [
    ...new Set(
      raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
  if (names.length === 0) {
    throw fieldErrors([{ field: 'include', message: 'Name at least one relation.' }]);
  }
  for (const name of names) {
    if (!allowed.includes(name)) {
      throw fieldErrors([
        { field: 'include', message: `Unknown relation "${name}". Known: ${allowed.join(', ')}.` },
      ]);
    }
  }
  return names;
}
