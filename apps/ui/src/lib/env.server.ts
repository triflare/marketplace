// `react-router-serve` starts a plain Node process, so read the project's .env
// file before the API client and session store read their configuration.
try {
  process.loadEnvFile?.()
} catch {
  // No .env file, or a runtime that does not support loadEnvFile. The caller
  // falls back to defaults.
}
