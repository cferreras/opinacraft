export function numberEnv(
  name: string,
  fallback: number,
  minimum: number,
  env: Record<string, string | undefined> = process.env,
) {
  const raw = env[name]?.trim();
  const value = Number(raw || fallback);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}.`);
  return value;
}
