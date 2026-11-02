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
