import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';
import YAML from 'yaml';

// Every user-facing name and default comes from product.yml, so a rebrand is a
// one-file change and a stale literal can't survive a rename.
export function loadProduct() {
  const productPath = fileURLToPath(new URL('../product.yml', import.meta.url));
  return YAML.parse(readFileSync(productPath, 'utf8')) ?? {};
}

export function getProduct() {
  return loadProduct();
}

export function productConfig() {
  const loaded = loadProduct();
  return {
    name: loaded.name,
    version: loaded.version,
    tagline: loaded.tagline,
    author: loaded.author,
    homepage: loaded.homepage,
    extend: loaded.extend ?? {},
    branding: loaded.branding ?? {},
    symbols: loaded.symbols ?? {},
    defaults: loaded.defaults ?? {},
  };
}

export const product = loadProduct();

export function productName() {
  return product.name;
}

export function configFilename() {
  return product.defaults?.configFilename ?? 'config.yaml';
}

// The project file an extension is published with, named by the build tool that
// reads it.
export function extendConfigFilename() {
  return product.extend?.configFilename ?? 'extend.yml';
}

// The prefix of every environment variable this server reads, so a rename moves
// the operator-facing surface along with the rest of the brand.
export function envPrefix() {
  return product.envPrefix ?? 'TRIFLARE';
}

export function envName(suffix) {
  return `${envPrefix()}_${suffix}`;
}

// A header-safe, metric-safe, lowercase form of the product name. Renaming the
// product in product.yml carries through to the user agent, the webhook headers,
// and the Prometheus metric prefix.
export function productSlug() {
  return product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const FALLBACK_COLORS = {
  primary: '#16A34A',
  secondary: '#12823B',
  tertiary: '#0D602C',
};

export function brandingColors(loaded = product) {
  const colors = loaded.branding?.colors ?? {};
  return {
    primary: colors.primary ?? FALLBACK_COLORS.primary,
    secondary: colors.secondary ?? FALLBACK_COLORS.secondary,
    tertiary: colors.tertiary ?? FALLBACK_COLORS.tertiary,
  };
}

const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;

// styleText only learned hex colors in Node 24.16, and engines allow any 24, so
// the truecolor escape is built here. The gate is styleText's own: ask it to
// color a marker, and stay plain when it comes back untouched.
function colorize(text, color, stream) {
  if (!HEX_COLOR.test(color)) return styleText(color, text, { stream });
  if (!styleText('red', '\u0000', { stream }).includes('\u001b')) return text;
  const digits = color.length === 4 ? color.slice(1).replace(/./g, '$&$&') : color.slice(1);
  const [red, green, blue] = digits.match(/../g).map((part) => parseInt(part, 16));
  return `\u001b[38;2;${red};${green};${blue}m${text}\u001b[39m`;
}

// Paints a product name in three equal bands taken from the brand palette. The
// colors disappear when the stream can't render them, so piped output and CI
// logs stay plain text.
export function brandText(text, stream = process.stdout) {
  const { primary, secondary, tertiary } = brandingColors();
  const palette = [primary, secondary, tertiary];
  const chars = Array.from(text);
  if (chars.length === 0) return text;

  const bandFor = (index) =>
    Math.min(palette.length - 1, Math.floor((index * palette.length) / chars.length));
  const runs = [];
  let start = 0;
  for (let index = 1; index <= chars.length; index += 1) {
    if (index === chars.length || bandFor(index) !== bandFor(start)) {
      runs.push(colorize(chars.slice(start, index).join(''), palette[bandFor(start)], stream));
      start = index;
    }
  }
  return runs.join('');
}
