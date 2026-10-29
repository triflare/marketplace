const LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  go: "go",
  py: "python",
  rs: "rust",
  sql: "sql",
}

// Monaco calls unknown languages plaintext; naming the fallback here keeps the
// viewer explicit about files it can't highlight.
export function languageForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? ""
  return LANGUAGES[extension] ?? "plaintext"
}
