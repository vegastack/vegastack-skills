import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

export const sha256 = body => createHash('sha256').update(body).digest('hex')

export async function readJsonYaml(path) {
  const raw = await readFile(path, 'utf8')
  try { return JSON.parse(raw) } catch (error) {
    throw new Error(`${path}: registries must contain a JSON document: ${error.message}`)
  }
}

export async function pathExists(path) {
  try { await lstat(path); return true } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
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

