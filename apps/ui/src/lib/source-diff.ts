import { diffLines } from "diff"

import type { SourceFile } from "@/lib/source-archive"

export type SourceChange = "added" | "removed" | "changed" | "unchanged"

export interface DiffLine {
  kind: "context" | "added" | "removed"
  text: string
  oldLine?: number
  newLine?: number
}

export interface FileDiff {
  path: string
  change: SourceChange
  left?: SourceFile
  right?: SourceFile
  lines: DiffLine[]
  added: number
  removed: number
}

export function compareSourceArchives(
  leftFiles: SourceFile[],
  rightFiles: SourceFile[]
): FileDiff[] {
  const left = new Map(leftFiles.map((file) => [file.path, file]))
  const right = new Map(rightFiles.map((file) => [file.path, file]))
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort()

  return paths.map((path) => {
    const before = left.get(path)
    const after = right.get(path)

    if (!before) {
      return fileDiff(
        path,
        "added",
        undefined,
        after,
        textLines(after, "added")
      )
    }
    if (!after) {
      return fileDiff(
        path,
        "removed",
        before,
        undefined,
        textLines(before, "removed")
      )
    }
    if (before.text === after.text) {
      return fileDiff(path, "unchanged", before, after, [])
    }
    if (before.binary || after.binary) {
      return fileDiff(path, "changed", before, after, [])
    }

    return fileDiff(
      path,
      "changed",
      before,
      after,
      diffText(before.text, after.text)
    )
  })
}

function fileDiff(
  path: string,
  change: SourceChange,
  left: SourceFile | undefined,
  right: SourceFile | undefined,
  lines: DiffLine[]
): FileDiff {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.kind === "added") {
      added += 1
    } else if (line.kind === "removed") {
      removed += 1
    }
  }
  return { path, change, left, right, lines, added, removed }
}

function textLines(
  file: SourceFile | undefined,
  kind: "added" | "removed"
): DiffLine[] {
  if (!file || file.binary) {
    return []
  }

  const values = file.text.split("\n")
  if (values[values.length - 1] === "") {
    values.pop()
  }

  return values.map((text, index) =>
    kind === "added"
      ? { kind, text, newLine: index + 1 }
      : { kind, text, oldLine: index + 1 }
  )
}

function diffText(before: string, after: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldLine = 1
  let newLine = 1

  for (const part of diffLines(before, after)) {
    const values = part.value.split("\n")
    if (values[values.length - 1] === "") {
      values.pop()
    }

    for (const text of values) {
      if (part.added) {
        lines.push({ kind: "added", text, newLine })
        newLine += 1
      } else if (part.removed) {
        lines.push({ kind: "removed", text, oldLine })
        oldLine += 1
      } else {
        lines.push({ kind: "context", text, oldLine, newLine })
        oldLine += 1
        newLine += 1
      }
    }
  }

  return lines
}
