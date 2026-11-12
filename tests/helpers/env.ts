/** `process.env` without the given keys (vitest sets NODE_ENV=test and a dev shell may define the app's variables), plus `extra`. */
export function cleanEnv(remove: readonly string[], extra: Record<string, string>): NodeJS.ProcessEnv {
  const kept = Object.entries(process.env).filter(([key]) => !remove.includes(key));
  return { ...Object.fromEntries(kept), NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', ...extra };
}
