#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listFiles, pathExists, readJsonYaml } from './lib.mjs'
import { canonicalRuleIds } from './validate-profile.mjs'

let mermaid = null
try {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  mermaid = (await import('mermaid')).default
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
} catch {
  // Installed copies have no development dependencies and use structural checks.
}

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const references = join(skillRoot, 'references')
const architectureRoot = join(references, 'architecture')
const skillPath = join(skillRoot, 'SKILL.md')
const skillBody = await readFile(skillPath, 'utf8')
const chapters = await listFiles(architectureRoot, path => path.endsWith('.md'))
const registry = await readJsonYaml(join(skillRoot, 'refresh', 'sources.json'))
const sourceIds = new Set(registry.sources.map(source => source.id))
const ruleIds = await canonicalRuleIds()
const controlCatalog = await readJsonYaml(join(references, 'control-catalog.json'))
const ruleModel = await readJsonYaml(join(references, 'rule-model.json'))
const errors = []
let diagrams = 0
let normativeLines = 0

const expectedReferences = new Set(['agent-product.md', 'ai-cost.md', 'ai-data-boundaries.md', 'ai-evals.md', 'connectors-sandbox.md', 'data-memory.md', 'delivery-operations.md', 'durable-execution.md', 'flutter.md', 'foundation.md', 'hosting-reliability.md', 'identity-tenancy.md', 'model-lifecycle.md', 'models-observability.md', 'realtime-channels.md', 'security-privacy.md', 'topology-monorepo.md', 'web.md'])
if (chapters.length !== expectedReferences.size) errors.push(`expected ${expectedReferences.size} normative references, found ${chapters.length}`)
for (const path of chapters) if (!expectedReferences.delete(basename(path))) errors.push(`unexpected architecture reference ${basename(path)}`)
for (const missing of expectedReferences) errors.push(`missing architecture reference ${missing}`)

const skillLines = skillBody.split('\n').length
if (skillLines > 120) errors.push(`SKILL.md exceeds 120 lines (${skillLines})`)
const routed = new Set([...skillBody.matchAll(/\(references\/architecture\/([^)]+\.md)\)/g)].map(match => match[1]))

const citedSources = new Set()
for (const path of chapters) {
  const body = await readFile(path, 'utf8')
  normativeLines += body.split('\n').length
  if (!routed.has(basename(path))) errors.push(`${path}: not routed directly from SKILL.md`)
  for (const match of body.matchAll(/\[([A-Z0-9]+(?:-[A-Z0-9]+)*)\]|<!-- source: ([A-Z0-9]+(?:-[A-Z0-9]+)*) -->/g)) {
    const id = match[1] ?? match[2]
    citedSources.add(id)
    if (!sourceIds.has(id)) errors.push(`${path}: unknown source ${id}`)
  }
  for (const [index, line] of body.split('\n').entries()) {
    const definitions = [...line.matchAll(/\*\*([A-Z]+-[0-9]{3}) —/g)]
    if (definitions.length && !/\bMUST(?:\s+NOT)?\b/.test(line)) errors.push(`${path}: rule ${definitions[0][1]} must define a MUST or MUST NOT invariant in its canonical line`)
    if (/\bMUST(?:\s+NOT)?\b/.test(line) && definitions.length !== 1) errors.push(`${path}:${index + 1}: every MUST/MUST NOT must occur in exactly one canonical rule definition`)
  }
  for (const block of body.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    diagrams += 1
    const text = block[1].trim()
    if (!/^(flowchart|sequenceDiagram|stateDiagram-v2)\b/.test(text)) errors.push(`${path}: unsupported Mermaid declaration`)
    if ((text.match(/\[/g) ?? []).length !== (text.match(/\]/g) ?? []).length) errors.push(`${path}: unbalanced Mermaid brackets`)
    if (mermaid) try { await mermaid.parse(text) } catch (error) { errors.push(`${path}: Mermaid parser: ${error.message}`) }
  }
}
if (normativeLines > 800) errors.push(`normative references exceed 800 lines (${normativeLines})`)
if (diagrams < 4) errors.push(`expected at least four decision-useful Mermaid diagrams, found ${diagrams}`)

// criticalSources in foundation-compatibility must mirror every critical:true registry entry —
// asserted here so the mirror can never drift silently.
const compatibility = await readJsonYaml(join(references, 'foundation-compatibility.json'))
const declaredCritical = new Set(compatibility.sourceDrift?.criticalSources ?? [])
const actualCritical = new Set(registry.sources.filter(source => source.critical).map(source => source.id))
for (const id of actualCritical) if (!declaredCritical.has(id)) errors.push(`criticalSources mirror missing critical registry source ${id}`)
for (const id of declaredCritical) if (!actualCritical.has(id)) errors.push(`criticalSources mirror lists non-critical or unknown source ${id}`)

for (const source of registry.sources) {
  if (!citedSources.has(source.id)) errors.push(`orphan source registry entry ${source.id}`)
  if (!source.urls?.primary) errors.push(`source ${source.id} has no primary URL`)
  for (const target of source.affected ?? []) {
    const [kind, value] = String(target).split(':', 2)
    if (!['rule', 'ref', 'profile'].includes(kind)) errors.push(`source ${source.id} has invalid affected mapping ${target}`)
    if (kind === 'rule' && !ruleIds.has(value)) errors.push(`source ${source.id} maps unknown rule ${value}`)
    if (kind === 'ref' && !await pathExists(join(architectureRoot, `${value}.md`))) errors.push(`source ${source.id} maps unknown reference ${value}`)
  }
}

const catalogKeys = new Set()
for (const control of controlCatalog.controls ?? []) {
  if (!ruleIds.has(control.rule)) errors.push(`control catalog maps unknown rule ${control.rule}`)
  if ((!control.id && !control.idPattern) || (control.id && control.idPattern)) errors.push(`control catalog entry for ${control.rule} must have exactly one id or idPattern`)
  const key = `${control.rule}/${control.id ?? control.idPattern}`
  if (catalogKeys.has(key)) errors.push(`duplicate control catalog entry ${key}`)
  catalogKeys.add(key)
  for (const required of ['classification', 'activation', 'verification', 'waiver']) if (!control[required]) errors.push(`control catalog ${key} missing ${required}`)
}
const modeledRules = new Set()
for (const group of ruleModel.groups ?? []) {
  for (const required of ['activation', 'verification', 'rationale']) if (!group[required]) errors.push(`rule model group missing ${required}`)
  for (const rule of group.rules ?? []) {
    if (modeledRules.has(rule)) errors.push(`rule model duplicates ${rule}`)
    modeledRules.add(rule)
    if (!ruleIds.has(rule)) errors.push(`rule model names unknown rule ${rule}`)
  }
}
for (const rule of ruleIds) if (!modeledRules.has(rule)) errors.push(`canonical rule ${rule} has no activation/verification/rationale model`)
for (const override of ruleModel.overrides ?? []) if (!modeledRules.has(override.rule)) errors.push(`rule model override names unknown rule ${override.rule}`)

for (const match of (await readFile(join(skillRoot, 'scripts', 'architecture-check.mjs'), 'utf8')).matchAll(/issue\([^,]+,\s*['"]([A-Z]+-[0-9]{3})['"]/g)) if (!ruleIds.has(match[1])) errors.push(`architecture-check emits unknown rule ${match[1]}`)

const bannedNames = ['golden-architecture.md', 'evidence-manifest.json', 'coverage-matrix.md', 'verification-ledger.md', '23-evidence-comparisons.md', '24-roadmap.md', 'compile-guide.mjs']
const allFiles = await listFiles(skillRoot)
for (const path of allFiles) if (bannedNames.includes(basename(path))) errors.push(`forbidden runtime artifact remains: ${relative(skillRoot, path)}`)
const runtimeText = (await Promise.all((await listFiles(skillRoot, path => /\.(?:md|json|yaml|yml|mjs)$/.test(path) && !path.includes('/tests/'))).map(path => readFile(path, 'utf8')))).join('\n')
const historicalNames = ['C' + 'RM', 'S' + 'IM', 'Fl' + 'ue']
if (new RegExp(`\\b(?:${historicalNames.join('|')})\\b`).test(runtimeText)) errors.push('historical comparison names remain in runtime skill')

const githubSlug = heading => heading.toLowerCase().trim().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')
const headingsFor = body => new Set([...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => githubSlug(match[1])))
for (const path of await listFiles(skillRoot, path => path.endsWith('.md'))) {
  const body = await readFile(path, 'utf8')
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1]
    if (/^(https?:|mailto:)/.test(target)) continue
    const [filePart, anchor] = target.split('#')
    const targetPath = filePart ? resolve(dirname(path), decodeURIComponent(filePart)) : path
    if (!await pathExists(targetPath)) { errors.push(`${path}: broken link ${target}`); continue }
    if (anchor && !headingsFor(await readFile(targetPath, 'utf8')).has(anchor)) errors.push(`${path}: broken anchor ${target}`)
  }
  const lines = body.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('|')) continue
    const expected = (lines[index].match(/\|/g) ?? []).length
    let cursor = index + 1
    while (cursor < lines.length && lines[cursor].startsWith('|')) {
      const actual = (lines[cursor].match(/\|/g) ?? []).length
      if (actual !== expected) errors.push(`${path}:${cursor + 1}: malformed Markdown table`)
      cursor += 1
    }
    index = cursor - 1
  }
}

if (errors.length) {
  for (const error of errors) console.error(error)
  process.exitCode = 1
} else console.log(`verify-corpus: ${chapters.length} normative references, ${normativeLines} lines, ${ruleIds.size} rules, ${diagrams} Mermaid diagrams, ${sourceIds.size} cited sources, Mermaid mode=${mermaid ? 'formal' : 'structural-fallback'}`)
