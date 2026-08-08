import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export const LABELS = ['OBSERVED', 'DOCUMENTED', 'REPRODUCED', 'INFERRED', 'RECOMMENDED', 'NOT VERIFIED']
export const sha256 = body => createHash('sha256').update(body).digest('hex')

// Canonical profile basename first; legacy name accepted with a deprecation notice at call sites.
export const PROFILE_BASENAMES = ['architecture.json', 'architecture.yaml']

export async function readJsonYaml(path) {
  const raw = await readFile(path, 'utf8')
  try { return JSON.parse(raw) } catch (error) {
    throw new Error(`${path} must contain a JSON document (guardian profiles and registries are JSON; rename legacy .yaml profiles to .json — YAML syntax is not supported): ${error.message}`)
  }
}

export async function pathExists(path) {
  try { await lstat(path); return true } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

// Discover the committed architecture profile. Returns { path, relative, legacy } or null.
export async function resolveProfile(root) {
  for (const basename of PROFILE_BASENAMES) {
    const candidate = join(root, '.vegastack', basename)
    if (await pathExists(candidate)) {
      return { path: candidate, relative: `.vegastack/${basename}`, legacy: basename.endsWith('.yaml') }
    }
  }
  return null
}

export async function listFiles(root, predicate = () => true) {
  const output = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Refusing symlink during traversal: ${path}`)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && predicate(path)) output.push(path)
    }
  }
  await walk(root)
  return output.sort((a, b) => relative(root, a).localeCompare(relative(root, b)))
}

export function slashRelative(root, path) {
  return relative(root, path).split(sep).join('/')
}

export function issue(status, rule, control, message, evidence, extra = {}) {
  const severity = status === 'FAIL' ? 'fail' : status === 'EXCEPTED' ? 'accepted-risk' : status === 'NOT_VERIFIED' ? 'warning' : 'pass'
  return { status, severity, rule, control, message, verificationType: extra.verificationType ?? 'static-sentinel', ...(evidence ? { evidence, path: evidence.path } : {}), ...extra }
}
