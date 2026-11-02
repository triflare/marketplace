import { CodeDiff, CodeEditor } from "@/components/common/code-editor"
import { languageForPath } from "@/lib/source-language"

export function SourceCode({ path, code }: { path: string; code: string }) {
  return (
    <CodeEditor
      value={code}
      language={languageForPath(path)}
      className="min-h-64 flex-1"
      ariaLabel={`${path} source`}
    />
  )
}

export function DiffCode({
  path,
  before,
  after,
}: {
  path: string
  before: string
  after: string
}) {
  return (
    <CodeDiff
      original={before}
      modified={after}
      language={languageForPath(path)}
      className="min-h-64 flex-1"
      ariaLabel={`Diff for ${path}`}
    />
  )
}
