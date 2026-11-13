#!/usr/bin/env node
/**
 * Write the version semantic-release computed into both apps.
 *
 * The root package.json belongs to @semantic-release/npm. Each app publishes
 * its version through its own package.json and product.yml, so this script
 * keeps those in step with the release before the commit is made.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPS = ["apps/api", "apps/ui"];

const version = process.argv[2];
if (!version) {
  process.stderr.write("[marketplace] usage: node scripts/set-version.js <version>\n");
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Update an app's package.json and the two version fields of its lockfile. */
function setPackageVersion(dir) {
  const manifest = path.join(ROOT, dir, "package.json");
  const lockfile = path.join(ROOT, dir, "package-lock.json");

  const pkg = readJson(manifest);
  pkg.version = version;
  writeJson(manifest, pkg);

  const lock = readJson(lockfile);
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  writeJson(lockfile, lock);
}

/**
 * Replace the `version:` line in product.yml, keeping its quote style. A YAML
 * round-trip would drop the file's comments, so the line is rewritten in place.
 */
function setProductVersion(dir) {
  const file = path.join(ROOT, dir, "product.yml");
  const source = fs.readFileSync(file, "utf8");
  if (!/^version:.*$/m.test(source)) {
    throw new Error(`${dir}/product.yml has no version: line to update`);
  }
  const next = source.replace(
    /^(version:\s*)(['"]?)([^'"\s]+)\2\s*$/m,
    (_match, prefix, quote) => `${prefix}${quote}${version}${quote}`,
  );
  fs.writeFileSync(file, next);
}

for (const dir of APPS) {
  setPackageVersion(dir);
  setProductVersion(dir);
}
