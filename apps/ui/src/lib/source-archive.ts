export interface SourceFile {
  path: string
  text: string
  binary: boolean
  size: number
}

const decoder = new TextDecoder()

// A source tarball is small enough to keep in memory, so this reads the whole
// archive and walks the 512-byte tar records rather than shipping a tar reader.
export async function readSourceArchive(blob: Blob): Promise<SourceFile[]> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser can’t unpack source archives.")
  }

  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"))
  const buffer = await new Response(stream).arrayBuffer()
  return parseTar(buffer)
}

function parseTar(buffer: ArrayBuffer): SourceFile[] {
  const bytes = new Uint8Array(buffer)
  const files: SourceFile[] = []
  let offset = 0
  let longName: string | null = null

  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) {
      break
    }

    const name = readString(header, 0, 100)
    const prefix = readString(header, 345, 155)
    const size = readNumber(header, 124, 12)
    const type = String.fromCharCode(header[156] || 48)
    const dataStart = offset + 512
    const dataEnd = dataStart + size
    if (dataEnd > bytes.length) {
      break
    }

    const content = bytes.subarray(dataStart, dataEnd)
    if (type === "L") {
      longName = readString(content, 0, content.length)
    } else if (type === "x") {
      longName = paxPath(decoder.decode(content)) ?? longName
    } else if (type === "0" || type === "\0") {
      const rawPath = longName ?? (prefix ? `${prefix}/${name}` : name)
      longName = null
      const path = cleanPath(rawPath)
      if (path) {
        const binary = content.includes(0)
        files.push({
          path,
          text: binary ? "" : decoder.decode(content),
          binary,
          size,
        })
      }
    } else {
      longName = null
    }

    offset = dataStart + Math.ceil(size / 512) * 512
  }

  return files.sort(
    (a, b) =>
      fileRank(a.path) - fileRank(b.path) || a.path.localeCompare(b.path)
  )
}

function readString(bytes: Uint8Array, start: number, length: number): string {
  let end = start + length
  while (end > start && (bytes[end - 1] === 0 || bytes[end - 1] === 32)) {
    end -= 1
  }
  return decoder.decode(bytes.subarray(start, end))
}

function readNumber(bytes: Uint8Array, start: number, length: number): number {
  const field = bytes.subarray(start, start + length)
  if (field[0] & 0x80) {
    let value = 0
    for (let index = 1; index < field.length; index += 1) {
      value = value * 256 + field[index]
    }
    return value
  }

  const text = decoder.decode(field).replace(/\0.*$/, "").trim()
  if (!text) {
    return 0
  }
  const value = Number.parseInt(text, 8)
  return Number.isFinite(value) ? value : 0
}

function paxPath(text: string): string | null {
  for (const line of text.split("\n")) {
    const match = /^\d+ path=(.*)$/.exec(line)
    if (match) {
      return match[1]
    }
  }
  return null
}

function cleanPath(raw: string): string | null {
  const parts = raw
    .replace(/^\.\//, "")
    .split("/")
    .filter((part) => part && part !== ".")
  if (parts.length === 0 || parts.some((part) => part === "..")) {
    return null
  }
  return parts.join("/")
}

function fileRank(path: string): number {
  if (path === "twext.yml") {
    return 0
  }
  if (path === "package.json") {
    return 1
  }
  return path.startsWith("src/") ? 2 : 3
}
