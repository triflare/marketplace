// Monaco is bundled rather than fetched from a CDN so a self-hosted registry
// keeps working offline. This module is only ever imported from an effect, so it
// never reaches the server bundle.
import * as monaco from "monaco-editor/editor/editor.api"

import EditorWorker from "monaco-editor/editor/editor.worker?worker"

// Editor features. Anything missing here simply has no keybinding or UI, so the
// list mirrors the parts a source viewer and a markdown editor need.
import "monaco-editor/editor/browser/coreCommands"
import "monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget"
import "monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution"
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching"
import "monaco-editor/editor/contrib/clipboard/browser/clipboard"
import "monaco-editor/editor/contrib/comment/browser/comment"
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu"
import "monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo"
import "monaco-editor/editor/contrib/find/browser/findController"
import "monaco-editor/editor/contrib/folding/browser/folding"
import "monaco-editor/editor/contrib/indentation/browser/indentation"
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations"
import "monaco-editor/editor/contrib/multicursor/browser/multicursor"
import "monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter"
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations"
import "monaco-editor/editor/common/standaloneStrings"

// Grammars for the file types an extension source archive contains.
import "monaco-editor/languages/definitions/javascript/register"
import "monaco-editor/languages/definitions/typescript/register"
import "monaco-editor/languages/definitions/markdown/register"
import "monaco-editor/languages/definitions/yaml/register"
import "monaco-editor/languages/definitions/css/register"
import "monaco-editor/languages/definitions/html/register"
import "monaco-editor/languages/definitions/xml/register"
import "monaco-editor/languages/definitions/python/register"
import "monaco-editor/languages/definitions/go/register"
import "monaco-editor/languages/definitions/rust/register"
import "monaco-editor/languages/definitions/sql/register"

// The find widget and folding controls draw icons from the codicon font.
import "monaco-codicons"

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

// JSON ships only with Monaco's worker-backed language feature, and a viewer has
// no use for a second worker, so the grammar is registered here by hand.
monaco.languages.register({
  id: "json",
  extensions: [".json"],
  aliases: ["JSON", "json"],
})
monaco.languages.setMonarchTokensProvider("json", {
  tokenizer: {
    root: [
      [/\[|\]|\{|\}/, "delimiter.bracket"],
      [/[,:]/, "delimiter"],
      [/\/\/.*$/, "comment"],
      [/-?\d+(\.\d+)?([eE][-+]?\d+)?/, "number"],
      [/"([^"\\]|\\.)*"\s*(?=:)/, "attribute.name"],
      [/"([^"\\]|\\.)*"/, "string"],
      [/\b(true|false|null)\b/, "keyword"],
    ],
  },
})
monaco.languages.setLanguageConfiguration("json", {
  brackets: [
    ["{", "}"],
    ["[", "]"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: '"', close: '"' },
  ],
})

export type MonacoTheme = "triflare-light" | "triflare-dark"

const FONT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, monospace"

// Colors mirror the CSS syntax variables in index.css, inlined because Monaco
// themes are resolved by the editor rather than by the cascade.
monaco.editor.defineTheme("triflare-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "7c7482", fontStyle: "italic" },
    { token: "keyword", foreground: "7a4bad" },
    { token: "string", foreground: "2f7a53" },
    { token: "number", foreground: "9a6420" },
    { token: "regexp", foreground: "a8442c" },
    { token: "type", foreground: "3b64b0" },
    { token: "delimiter", foreground: "6f6a76" },
    { token: "tag", foreground: "9a4a3a" },
    { token: "attribute.name", foreground: "9a4a3a" },
    { token: "attribute.value", foreground: "2f7a53" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#26232b",
    "editor.lineHighlightBackground": "#f4f2f5",
    "editor.selectionBackground": "#d8d3e0",
    "editorLineNumber.foreground": "#a49dab",
    "editorLineNumber.activeForeground": "#26232b",
    "editorIndentGuide.background1": "#e8e4ea",
    "editorGutter.background": "#ffffff",
    "editorWidget.background": "#ffffff",
    "editorWidget.border": "#e2dde6",
    "diffEditor.insertedTextBackground": "#2f7a5320",
    "diffEditor.removedTextBackground": "#a8442c20",
    "scrollbarSlider.background": "#26232b20",
    "scrollbarSlider.hoverBackground": "#26232b30",
  },
})

monaco.editor.defineTheme("triflare-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "a89caa", fontStyle: "italic" },
    { token: "keyword", foreground: "d3a6f5" },
    { token: "string", foreground: "a3d9b4" },
    { token: "number", foreground: "e6be7a" },
    { token: "regexp", foreground: "f0a898" },
    { token: "type", foreground: "a8c0f0" },
    { token: "delimiter", foreground: "a298a6" },
    { token: "tag", foreground: "f0ad9e" },
    { token: "attribute.name", foreground: "f0ad9e" },
    { token: "attribute.value", foreground: "a3d9b4" },
  ],
  colors: {
    "editor.background": "#232128",
    "editor.foreground": "#faf8fb",
    "editor.lineHighlightBackground": "#2c2933",
    "editor.selectionBackground": "#48415a",
    "editorLineNumber.foreground": "#6f6878",
    "editorLineNumber.activeForeground": "#faf8fb",
    "editorIndentGuide.background1": "#353138",
    "editorGutter.background": "#232128",
    "editorWidget.background": "#232128",
    "editorWidget.border": "#3b3643",
    "diffEditor.insertedTextBackground": "#2f7a5340",
    "diffEditor.removedTextBackground": "#a8442c40",
    "scrollbarSlider.background": "#faf8fb20",
    "scrollbarSlider.hoverBackground": "#faf8fb30",
  },
})

export const EDITOR_OPTIONS = {
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  lineHeight: 18,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  renderWhitespace: "selection",
  padding: { top: 8, bottom: 8 },
  fixedOverflowWidgets: true,
  stickyScroll: { enabled: false },
} as const

export function themeForDocument(): MonacoTheme {
  return document.documentElement.classList.contains("dark")
    ? "triflare-dark"
    : "triflare-light"
}

export { monaco }
