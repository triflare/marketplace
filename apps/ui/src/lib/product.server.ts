import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "yaml"

// Read from the app root, which is where npm, the dev server, and the Docker
// build all run from. Only the build calls this: the values land in the bundles
// through `define`, so a deploy never has to ship the YAML.
export function loadProduct(
  path = resolve(process.cwd(), "product.yml")
): Record<string, unknown> {
  return parse(readFileSync(path, "utf8")) ?? {}
}
