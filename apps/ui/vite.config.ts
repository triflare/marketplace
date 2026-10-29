import { resolve } from "node:path"
import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// https://reactrouter.com/start/framework/installation
export default defineConfig({
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
