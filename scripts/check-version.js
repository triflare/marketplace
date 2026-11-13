#!/usr/bin/env node
/**
 * Fail a release when a version file disagrees with the version
 * semantic-release computed.
 *
 * Runs immediately after scripts/set-version.js so a missing file or partial
 * write stops the release before it is committed and tagged.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPS = ["apps/api", "apps/ui"];

const requested = process.argv[2];
if (!requested) {
  process.stderr.write("[marketplace] usage: node scripts/check-version.js <version>\n");
  process.exit(1);
}

const version = requested.replace(/^v/, "");

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
}

function productVersion(relative) {
  const source = fs.readFileSync(path.join(ROOT, relative), "utf8");
  return source.match(/^version:\s*['"]?([^'"\n]+?)['"]?\s*$/m)?.[1];
}

const failures = [];

function expect(label, actual) {
  if (actual !== version)
    failures.push(`${label}: expected ${version}, found ${actual ?? "(none)"}`);
}

expect("package.json", readJson("package.json").version);
const rootLock = readJson("package-lock.json");
expect("package-lock.json", rootLock.version);
expect('package-lock.json packages[""]', rootLock.packages?.[""]?.version);

for (const dir of APPS) {
  expect(`${dir}/package.json`, readJson(`${dir}/package.json`).version);
  const lock = readJson(`${dir}/package-lock.json`);
  expect(`${dir}/package-lock.json`, lock.version);
  expect(`${dir}/package-lock.json packages[""]`, lock.packages?.[""]?.version);
  expect(`${dir}/product.yml`, productVersion(`${dir}/product.yml`));
}

if (failures.length > 0) {
  process.stderr.write(`[marketplace] version check failed for ${version}:\n`);
  for (const failure of failures) process.stderr.write(`  - ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`[marketplace] ${version} matches both app manifests and product.yml\n`);
