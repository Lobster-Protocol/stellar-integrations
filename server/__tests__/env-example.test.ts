// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// process.env.X, the env and e aliases some modules keep for it, and requireEnv('X')
const READ = /\b(?:process\.env|env|e)\.([A-Z][A-Z0-9_]*)|requireEnv\('([A-Z][A-Z0-9_]*)'\)/g

function readByRelay(): Set<string> {
  const dir = resolve(process.cwd(), 'server')
  const names = new Set<string>()
  for (const file of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.ts') || file.includes('__tests__')) continue
    for (const m of readFileSync(join(dir, file), 'utf8').matchAll(READ)) names.add(m[1] ?? m[2])
  }
  return names
}

function listedInExample(): Set<string> {
  const text = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8')
  return new Set([...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]))
}

describe('.env.example', () => {
  it('lists every variable the relay reads', () => {
    const listed = listedInExample()
    const missing = [...readByRelay()].filter((name) => !listed.has(name)).sort()
    expect(missing).toEqual([])
  })
})
