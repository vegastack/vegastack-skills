import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// Lints both the CLI package and the shipped runtime scripts under skills/*.
const packageRoot = resolve(import.meta.dirname, '..')
const skillsRoot = resolve(packageRoot, '../../skills')
const checked = []
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['dist', 'skill', 'node_modules', 'fixtures'].includes(entry.name)) continue
    const target = join(path, entry.name)
    if (entry.isDirectory()) await walk(target)
    else if (/\.(ts|mjs)$/.test(entry.name)) checked.push(target)
  }
}
await walk(packageRoot)
await walk(skillsRoot)
for (const path of checked) {
  const body = await readFile(path, 'utf8')
  if (body.includes('\t')) throw new Error(`Tab character: ${path}`)
  if (/\b(eval|new Function)\s*\(/.test(body)) throw new Error(`Dynamic code execution: ${path}`)
  if (/\bexecSync\s*\(/.test(body)) throw new Error(`Synchronous shell execution: ${path}`)
}
console.log(`lint: ${checked.length} source files checked`)
