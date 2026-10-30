import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const SPEC_PATH = fileURLToPath(new URL('../openapi/v1.yml', import.meta.url));

// The spec is baked into the image, so both readers below cache it: the file
// cannot change without a restart, and one request should not pay for the parse
// another already did.
let text;
let document;

export function specText() {
  if (text === undefined) {
    try {
      text = readFileSync(SPEC_PATH, 'utf8');
    } catch {
      text = null;
    }
  }
  return text;
}

export function specDocument() {
  if (document === undefined) {
    const raw = specText();
    try {
      document = raw === null ? null : YAML.parse(raw);
    } catch {
      document = null;
    }
  }
  return document;
}
