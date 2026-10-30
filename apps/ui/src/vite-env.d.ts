/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRIFLARE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// The codicon stylesheet is addressed through the vite alias.
declare module "monaco-codicons"
