// The web frontend reads the same config.yaml the rest of the instance does,
// not environment variables. The loader is plain JavaScript so the custom
// server entry point can read the listen port without a build step.
export {
  DEFAULTS,
  ONBOARDING_FIELDS,
  applyOnboarding,
  configStorage,
  getConfig,
  loadConfig,
  onboardingStatus,
  publicApiUrl,
  reloadConfig,
  setConfig,
} from "../../config.js"

export type {
  ConfigStorage,
  OnboardingField,
  OnboardingStatus,
  UiConfig,
} from "../../config.js"
