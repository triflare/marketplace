const MAX_PRETTY_BYTES = 1_500_000

export interface PrettyCode {
  code: string
  formatted: boolean
}

// Prettier is a large dependency, so the output tab loads it on demand instead
// of putting it in the initial bundle. A minified build that can't be parsed is
// still worth showing, so failures fall back to the original text.
export async function prettifyJavaScript(code: string): Promise<PrettyCode> {
  if (code.length > MAX_PRETTY_BYTES) {
    return { code, formatted: false }
  }

  try {
    const [prettier, babel, estree] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/babel"),
      import("prettier/plugins/estree"),
    ])
    const formatted = await prettier.format(code, {
      parser: "babel",
      plugins: [babel, estree],
      printWidth: 100,
    })
    return { code: formatted, formatted: true }
  } catch {
    return { code, formatted: false }
  }
}
