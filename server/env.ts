export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} env var missing`)
  return v
}
