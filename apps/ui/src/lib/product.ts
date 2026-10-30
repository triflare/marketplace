export interface ExtendData {
  name?: string
  package?: string
  command?: string
  configFilename?: string
}

export interface ProductData {
  name: string
  version: string
  tagline: string
  author?: string
  homepage?: string
  extend?: ExtendData
  defaults?: {
    apiUrl?: string
  }
  branding?: {
    colors?: {
      primary?: string
      secondary?: string
      tertiary?: string
    }
  }
}

// Replaced at build time with the parsed contents of product.yml; see
// vite.config.ts. Components can read it directly instead of threading it
// through a loader.
declare const __PRODUCT__: ProductData

export const product: ProductData = __PRODUCT__

export function productName(): string {
  return product.name
}

const FALLBACK_EXTEND = {
  name: "Triflare Extend",
  package: "@triflare/extend",
  command: "extend",
  configFilename: "extend.yml",
}

// The compiler and CLI the copy points at. Every mention of the tool, its
// package, and its command comes from here.
export const extend = {
  name: product.extend?.name ?? FALLBACK_EXTEND.name,
  package: product.extend?.package ?? FALLBACK_EXTEND.package,
  command: product.extend?.command ?? FALLBACK_EXTEND.command,
  configFilename:
    product.extend?.configFilename ?? FALLBACK_EXTEND.configFilename,
}

// The instance a browser build points at when VITE_TRIFLARE_API_URL is unset.
export const officialApiUrl =
  product.defaults?.apiUrl ?? "https://twexts.sdisk.us/api/v1"

const FALLBACK_COLORS = {
  primary: "#16A34A",
  secondary: "#12823B",
  tertiary: "#0D602C",
}

export function brandingColors() {
  const colors = product.branding?.colors ?? {}
  return {
    primary: colors.primary ?? FALLBACK_COLORS.primary,
    secondary: colors.secondary ?? FALLBACK_COLORS.secondary,
    tertiary: colors.tertiary ?? FALLBACK_COLORS.tertiary,
  }
}
