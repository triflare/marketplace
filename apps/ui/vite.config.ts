import { resolve } from "node:path"
import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

import { loadConfig } from "./config.js"
import { loadProduct } from "./src/lib/product.server.ts"

const config = loadConfig()

// https://reactrouter.com/start/framework/installation
export default defineConfig({
  // The dev server listens on the port in config.yaml. The production entry
  // point (server.js) reads the same file.
  server: { port: config.port },
  // product.yml is parsed once here and inlined into both bundles, so the app
  // reads its identity from `@/lib/product` without a loader or a fetch.
  define: {
    __PRODUCT__: JSON.stringify(loadProduct()),
  },
  plugins: [tailwindcss(), reactRouter()],
  // Some client-only modules are imported only when a dialog, an editor, or a
  // sign-up pane opens, so the dev server's initial scan does not see them.
  // Without pre-bundling, the first such import re-runs the dependency optimizer
  // and reloads the page, discarding whatever the user (or an end-to-end test)
  // was doing at that moment.
  optimizeDeps: {
    include: [
      "@base-ui/react/avatar",
      "@base-ui/react/button",
      "@base-ui/react/checkbox",
      "@base-ui/react/dialog",
      "@base-ui/react/input",
      "@base-ui/react/menu",
      "@base-ui/react/merge-props",
      "@base-ui/react/select",
      "@base-ui/react/separator",
      "@base-ui/react/switch",
      "@base-ui/react/tabs",
      "@base-ui/react/use-render",
      "@simplewebauthn/browser",
      "class-variance-authority",
      "cn",
      "diff",
      "lucide-react",
      "prettier/plugins/babel",
      "prettier/plugins/estree",
      "prettier/standalone",
      "react-markdown",
      "remark-gfm",
      "sonner",
      "spdx-license-list",
      "monaco-editor/editor/editor.api",
      "monaco-editor/editor/browser/coreCommands",
      "monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget",
      "monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution",
      "monaco-editor/editor/common/standaloneStrings",
      "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching",
      "monaco-editor/editor/contrib/clipboard/browser/clipboard",
      "monaco-editor/editor/contrib/comment/browser/comment",
      "monaco-editor/editor/contrib/contextmenu/browser/contextmenu",
      "monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo",
      "monaco-editor/editor/contrib/find/browser/findController",
      "monaco-editor/editor/contrib/folding/browser/folding",
      "monaco-editor/editor/contrib/indentation/browser/indentation",
      "monaco-editor/editor/contrib/linesOperations/browser/linesOperations",
      "monaco-editor/editor/contrib/multicursor/browser/multicursor",
      "monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter",
      "monaco-editor/editor/contrib/wordOperations/browser/wordOperations",
      "monaco-editor/languages/definitions/css/register",
      "monaco-editor/languages/definitions/go/register",
      "monaco-editor/languages/definitions/html/register",
      "monaco-editor/languages/definitions/javascript/register",
      "monaco-editor/languages/definitions/markdown/register",
      "monaco-editor/languages/definitions/python/register",
      "monaco-editor/languages/definitions/rust/register",
      "monaco-editor/languages/definitions/sql/register",
      "monaco-editor/languages/definitions/typescript/register",
      "monaco-editor/languages/definitions/xml/register",
      "monaco-editor/languages/definitions/yaml/register",
    ],
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
      // Monaco's exported stylesheet sits outside the package's exports map, so
      // the codicon font has to be addressed by path.
      "monaco-codicons": resolve(
        import.meta.dirname,
        "node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css"
      ),
    },
  },
})
