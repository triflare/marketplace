export interface UiConfig {
  port: number
  environment: "development" | "production"
  api: {
    url: string
    publicUrl: string | null
  }
  session: {
    name: string
    secret: string | null
    secure: boolean
  }
  onboarding: {
    completed: boolean
  }
  setupRequired: boolean
  configPath: string
}

export interface ConfigStorage {
  path: string
  writable: boolean
  persistent: boolean
  reason: string | null
}

export interface OnboardingOption {
  value: string
  label: string
}

export interface OnboardingField {
  key: string
  type: "url" | "number" | "boolean" | "select" | "secret"
  label: string
  help: string | null
  placeholder: string | null
  required: boolean
  nullable: boolean
  secret: boolean
  options: OnboardingOption[] | null
  min: number | null
  max: number | null
  value: string | number | boolean | null
  configured: boolean
}

export interface OnboardingStatus {
  required: boolean
  editable: boolean
  persistent: boolean
  reason: string | null
  configPath: string
  fields: OnboardingField[]
}

export interface OnboardingError extends Error {
  errors?: { field: string; message: string }[]
  status?: number
}

export const DEFAULTS: {
  port: number
  environment: "development" | "production"
  api: { url: string; publicUrl: string | null }
  session: { name: string; secret: string | null; secure: boolean | null }
  onboarding: { completed: boolean }
}

export const ONBOARDING_FIELDS: {
  key: string
  type: OnboardingField["type"]
  label: string
  help?: string
  placeholder?: string
  required?: boolean
  nullable?: boolean
  generate?: boolean
  min?: number
  max?: number
  options?: OnboardingOption[]
}[]

export function loadConfig(configPath?: string): UiConfig
export function getConfig(): UiConfig
export function setConfig(next: UiConfig): void
export function reloadConfig(): UiConfig
export function publicApiUrl(config?: UiConfig): string
export function configStorage(
  configPath: string,
  options?: { mountInfo?: string | null; container?: boolean }
): ConfigStorage
export function onboardingStatus(
  config?: UiConfig,
  options?: { mountInfo?: string | null; container?: boolean }
): OnboardingStatus
export function applyOnboarding(
  config: UiConfig,
  patch: Record<string, unknown>,
  options?: { mountInfo?: string | null; container?: boolean }
): { config: UiConfig; changed: string[] }
