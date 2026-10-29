export interface ProductData {
  name: string
  version: string
  tagline: string
  author?: string
  homepage?: string
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
