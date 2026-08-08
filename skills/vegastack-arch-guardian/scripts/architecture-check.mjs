#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, extname, relative as relativePath, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { issue, pathExists, resolveProfile } from './lib.mjs'
import { canonicalRuleIds, validateProfile } from './validate-profile.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const scanExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.toml', '.sql', '.md', '.py', '.go', '.java', '.kt', '.dart', '.rs', '.php', '.rb'])
const scanNames = new Set(['.env', '.env.local', '.env.production', 'Dockerfile'])
const ignored = new Set(['node_modules', '.git', '.turbo', 'dist', 'build', '.next', '.agents', '.claude', '.vegastack', 'coverage', 'vendor', 'out', '.output', '.vercel', '.wrangler'])
// Files this large or with lines this long are treated as generated bundles, not reviewable evidence.
const bundleBodyBytes = 500_000
const bundleLineLength = 5_000
const findingsCapPerControl = 25
const capabilityPatterns = {
  webControlPlane: /(?:from\s+['"]next(?:\/|['"])|next\.config|@opennextjs\/cloudflare)/i,
  flutter: /(?:pubspec\.yaml|package:flutter|flutter_secure_storage)/i,
  agents: /(?:from\s+['"]eve['"]|@workflow\/world|AgentRun)/i,
  jobs: /(?:from\s+['"]pg-boss['"]|\bPgBoss\b)/i,
  sandbox: /(?:@cloudflare\/sandbox|enableInternet|block_network|SandboxProvider)/i,
  connectors: /(?:\bMCP\b|webhook|connector|refresh_token)/i,
  knowledge: /(?:pgvector|vector\(|\bknowledge\b|embedding)/i,
  modelRouting: /(?:generateText|streamText|AI Gateway|BYOK|model provider)/i,
  enterpriseIdentity: /(?:\bSCIM\b|\bSSO\b|saml)/i,
  realtime: /(?:EventSource|text\/event-stream|WebSocket)/i,
  notifications: /(?:firebase_messaging|\bAPNs\b|notification intent)/i,
  secrets: /(?:OPENBAO|VAULT_ADDR|CLIENT_SECRET|API_KEY|DATABASE_URL)/i
}

async function loadGuardianIgnore(root) {
  const path = resolve(root, '.guardianignore')
  if (!await pathExists(path)) return []
  return (await readFile(path, 'utf8'))
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.replace(/\/+$/, ''))
}

// Traversal skips (rather than aborts on) symlinks, agent-skill trees, and .guardianignore
// prefixes; the caller reports skips as a single NOT_VERIFIED finding.
async function sourceFiles(root, ignorePrefixes, skipped) {
  const files = []
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    if (directory !== root && entries.some(entry => entry.name === 'SKILL.md')) {
      skipped.skillTrees.push(relativePath(root, directory).split('\\').join('/'))
      return
    }
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue
      const path = resolve(directory, entry.name)
      const relative = relativePath(root, path).split('\\').join('/')
      if (ignorePrefixes.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`))) continue
      if (entry.isSymbolicLink()) { skipped.symlinks.push(relative); continue }
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && (scanExtensions.has(extname(path)) || scanNames.has(basename(path)))) files.push(path)
    }
  }
  await walk(root)
  return files.sort()
}

function looksGenerated(body) {
  if (body.length > bundleBodyBytes) return true
  let lineStart = 0
  for (let index = 0; index <= body.length; index += 1) {
    if (index === body.length || body[index] === '\n') {
      if (index - lineStart > bundleLineLength) return true
      lineStart = index + 1
    }
  }
  return false
}

const lineOf = (body, index) => body.slice(0, Math.max(0, index)).split('\n').length
const evidence = (path, body, index = 0, type = 'static-sentinel') => ({ path, line: lineOf(body, index), type })
const enabled = (profile, name) => profile?.capabilities?.[name]?.status === 'enabled'
const owned = (profile, name) => enabled(profile, name) && profile.capabilities[name].ownership === 'owned'
const roots = (profile, name) => profile?.capabilities?.[name]?.sourceRoots ?? []
const inRoots = (path, selected = []) => selected.some(root => path === root || path.startsWith(`${root.replace(/\/$/, '')}/`))
const moduleSpecifiers = body => [...body.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g)].map(match => match[1])
const nonProductionPath = path => path.split('/').some(part => ['test', 'tests', '__tests__', 'fixture', 'fixtures', 'example', 'examples', 'docs'].includes(part.toLowerCase()))
const normalizedSqlName = name => name.replaceAll('"', '').toLowerCase()

function tenantTables(body) {
  return [...body.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."-]+)\s*\(([\s\S]*?)\);/gi)]
    .filter(match => /\bworkspace_id\b/i.test(match[2]))
    .map(match => ({ name: match[1].replaceAll('"', ''), definition: match[2], index: match.index ?? 0 }))
}

function tablePolicies(sqlFiles) {
  const policies = new Map()
  for (const file of sqlFiles) for (const match of file.body.matchAll(/CREATE\s+POLICY\b[\s\S]*?;/gi)) {
    const statement = match[0]
    const table = statement.match(/\bON\s+(?:ONLY\s+)?([\w."-]+)/i)?.[1]
    if (!table) continue
    const key = normalizedSqlName(table)
    if (!policies.has(key)) policies.set(key, [])
    policies.get(key).push({ statement, path: file.path, body: file.body, index: match.index ?? 0 })
  }
  return policies
}

const tenantClause = (statement, clause) => new RegExp(`\\b${clause}\\s*\\([\\s\\S]*?(?:workspace_id|current_setting)`, 'i').test(statement) && !new RegExp(`\\b${clause}\\s*\\(\\s*true\\s*\\)`, 'i').test(statement)

function rawFinding(findings, rule, control, message, path, body = '', index = 0, extra = {}) {
  findings.push(issue('FAIL', rule, control, message, evidence(path, body, index), extra))
}

function applyExceptions(findings, exceptionStates, profilePath) {
  const matched = new Set()
  const output = findings.map(finding => {
    const exceptionType = finding.status === 'FAIL' ? 'static-sentinel' : finding.status === 'NOT_VERIFIED' ? 'manual-qualification' : null
    if (!exceptionType || finding.exceptionEligible === false) return finding
    // An exception without a controls list covers every control under its single rule; paths stay exact.
    const state = exceptionStates.find(item => item.valid && item.exception.verificationType === exceptionType && item.exception.ruleId === finding.rule && (!item.exception.controls || item.exception.controls.includes(finding.control)) && item.exception.paths.includes(finding.path))
    if (!state) return finding
    matched.add(state.exception.id)
    return { ...finding, status: 'EXCEPTED', severity: 'accepted-risk', exceptionId: state.exception.id, acceptedBy: state.exception.projectOwner, message: `${finding.message} — accepted project risk; foundation recommendation remains unmet` }
  })
  for (const state of exceptionStates.filter(item => item.valid && !matched.has(item.exception.id))) output.push(issue('FAIL', 'FOUND-002', 'exception.scope-match', `${state.exception.id} did not match an eligible emitted finding for its rule/path/verification scope (controls, when listed, must also match exactly)`, { path: profilePath, line: 1, type: 'declared-control' }, { verificationType: 'semantic', exceptionEligible: false }))
  return output
}

function capFindings(findings) {
  const groups = new Map()
  const output = []
  for (const finding of findings) {
    if (finding.status !== 'FAIL') { output.push(finding); continue }
    const key = `${finding.rule}/${finding.control}`
    const group = groups.get(key) ?? { kept: 0, suppressed: 0, last: null }
    groups.set(key, group)
    if (group.kept < findingsCapPerControl) {
      group.kept += 1
      group.last = finding
      output.push(finding)
    } else {
      group.suppressed += 1
    }
  }
  for (const group of groups.values()) if (group.suppressed > 0 && group.last) group.last.suppressedCount = group.suppressed
  return output
}

export async function checkArchitecture(projectRoot, options = {}) {
  const root = resolve(projectRoot)
  const findings = []
  const discovered = options.profile ? null : await resolveProfile(root)
  const profileRelative = options.profile ?? discovered?.relative ?? '.vegastack/architecture.json'
  const profilePath = resolve(root, profileRelative)
  const legacyProfileName = options.profile ? profileRelative.endsWith('.yaml') : Boolean(discovered?.legacy)
  let profile = null
  let exceptionStates = []
  if (!await pathExists(profilePath)) rawFinding(findings, 'FOUND-001', 'profile.present', 'Commit a confirmed v3 architecture profile for CI; read-only review continued without mutation', profileRelative)
  else {
    const validation = await validateProfile(profilePath, { projectRoot: root, now: options.now })
    profile = validation.profile
    exceptionStates = validation.exceptions
    for (const diagnostic of validation.diagnostics) rawFinding(findings, diagnostic.rule, diagnostic.control, diagnostic.message, diagnostic.path, '', 0, { exceptionEligible: diagnostic.exceptionEligible })
  }

  const skipped = { symlinks: [], skillTrees: [], generated: [] }
  let files = []
  try { files = await sourceFiles(root, await loadGuardianIgnore(root), skipped) } catch (error) {
    rawFinding(findings, 'DEL-001', 'inspection.traversal', `Cannot complete repository traversal: ${error.message}`, '.')
  }
  const content = []
  const observed = Object.fromEntries(Object.keys(capabilityPatterns).map(name => [name, []]))
  for (const path of files) {
    if (resolve(path) === profilePath) continue
    const relative = relativePath(root, path).split('\\').join('/')
    let body
    try { body = await readFile(path, 'utf8') } catch (error) { rawFinding(findings, 'DEL-001', 'inspection.read', `Cannot inspect file: ${error.message}`, relative); continue }
    if (looksGenerated(body)) { skipped.generated.push(relative); continue }
    content.push({ path: relative, body, extension: extname(path) })
    const searchable = `${relative}\n${body}`
    const machineSource = extname(path) !== '.md'
    const productionEvidence = machineSource && !nonProductionPath(relative)
    if (productionEvidence) for (const [name, pattern] of Object.entries(capabilityPatterns)) if (pattern.test(searchable)) observed[name].push(relative)

    const localSecretAllowance = relative === '.env.local' && profile?.environments?.localDevelopment?.allowances?.includes('local-secrets')
    if (productionEvidence && !localSecretAllowance) {
      for (const match of body.matchAll(/^\s*(?:export\s+)?(?:const\s+)?([A-Z][A-Z0-9_]*(?:SECRET(?:_KEY)?|PASSWORD|PRIVATE_KEY|TOKEN|API_KEY)|API_KEY|CLIENT_SECRET|REFRESH_TOKEN|OPENBAO_TOKEN|DATABASE_URL|BYOK)\s*[:=]\s*(?!process\.env|env\.|os\.environ|System\.getenv|\$\{|['"]?REDACTED)([^\s,;]{8,}|['"][^'"$]{8,}['"])/gim)) rawFinding(findings, 'SEC-002', 'secret.plaintext', 'Probable plaintext credential', relative, body, match.index)
      for (const match of body.matchAll(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g)) rawFinding(findings, 'SEC-002', 'secret.plaintext', 'Probable plaintext private key', relative, body, match.index)
      for (const match of body.matchAll(/authorization\s*:\s*['"]Bearer\s+[^$'"]{8,}/gi)) rawFinding(findings, 'SEC-002', 'secret.bearer', 'Hard-coded bearer credential', relative, body, match.index)
      for (const match of body.matchAll(/(console\.(?:log|info|warn|error)|logger\.(?:debug|info|warn|error))\s*\([^\n]*(?:TOKEN|SECRET|PASSWORD|DATABASE_URL|API_KEY|AUTHORIZATION|COOKIE|PROMPT|RESTRICTED)/gi)) rawFinding(findings, 'OBS-002', 'telemetry.sensitive-data', 'Probable credential or restricted content emitted to telemetry', relative, body, match.index)
    }

    const sandboxApplicable = productionEvidence && (enabled(profile, 'sandbox') || observed.sandbox.length > 0 || capabilityPatterns.sandbox.test(searchable))
    if (sandboxApplicable) for (const match of body.matchAll(/enableInternet\s*[:=]\s*true|block_network\s*[:=]\s*false|allowedHosts\s*[:=]\s*\[\s*['"]\*['"]/g)) rawFinding(findings, 'SBX-003', 'sandbox.egress', 'Production sandbox egress must default deny without wildcards', relative, body, match.index)

    const tenancyApplicable = productionEvidence && (profile?.project?.tenancy === 'multi-tenant-shared-schema' || /app\.workspace_id|workspace_id/.test(body))
    if (tenancyApplicable) {
      for (const match of body.matchAll(/\bSET\s+(?!LOCAL\b)(?:SESSION\s+)?app\.workspace_id\b/gi)) rawFinding(findings, 'TEN-003', 'tenancy.context-local', 'Tenant context must use SET LOCAL in the protected transaction', relative, body, match.index)
      for (const match of body.matchAll(/\bBYPASSRLS\b/gi)) rawFinding(findings, 'TEN-003', 'tenancy.role-bypassrls', 'Application/request roles must not receive BYPASSRLS', relative, body, match.index)
    }
    if (productionEvidence && (enabled(profile, 'agents') || observed.agents.length)) for (const match of body.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w."-]*(?:workflow_steps|workflow_runs|agent_approvals|continuations)\b/gi)) rawFinding(findings, 'DUR-001', 'agents.dual-workflow-state', 'Do not create a second workflow, tool-loop, HITL, or continuation store', relative, body, match.index)

    const specifiers = moduleSpecifiers(body)
    if (productionEvidence && owned(profile, 'webControlPlane') && inRoots(relative, roots(profile, 'webControlPlane'))) for (const specifier of specifiers) if (specifier === 'eve' || specifier === 'pg-boss' || specifier.startsWith('@workflow/')) rawFinding(findings, specifier === 'pg-boss' ? 'RUN-002' : 'RUN-001', 'runtime.web-bundle-boundary', `Web source root must not depend on long-running runtime package ${specifier}`, relative, body, body.indexOf(specifier))
    if (productionEvidence && owned(profile, 'agents') && inRoots(relative, roots(profile, 'agents')) && specifiers.includes('pg-boss')) rawFinding(findings, 'DUR-003', 'agents.pg-boss-ownership', 'EVE runtime must not own pg-boss orchestration', relative, body, body.indexOf('pg-boss'))
    if (productionEvidence && owned(profile, 'jobs') && inRoots(relative, roots(profile, 'jobs')) && specifiers.some(specifier => specifier === 'eve' || specifier.startsWith('@workflow/'))) rawFinding(findings, 'DUR-001', 'jobs.workflow-ownership', 'Jobs runtime must not own EVE/Workflow state', relative, body, 0)

    const authApplicable = productionEvidence && ((enabled(profile, 'webControlPlane') && profile.project?.access !== 'public') || /better-auth/.test(body))
    if (authApplicable) {
      for (const match of body.matchAll(/disableCSRFCheck\s*:\s*true|disableOriginCheck\s*:\s*true/g)) rawFinding(findings, 'AUTH-003', 'auth.csrf-origin', 'CSRF and origin checks must remain enabled', relative, body, match.index)
      for (const match of body.matchAll(/trustedOrigins\s*[:=][\s\S]{0,120}(?:['"]\*|\*:\/\/|http:\/\/)/gi)) rawFinding(findings, 'AUTH-003', 'auth.trusted-origins', 'Production trusted origins must be exact HTTPS origins', relative, body, match.index)
      for (const match of body.matchAll(/require_pkce\s*:\s*false/g)) rawFinding(findings, 'AUTH-004', 'auth.pkce', 'Delegated OAuth clients must not opt out of PKCE', relative, body, match.index)
      for (const match of body.matchAll(/defaultSCIM\s*:\s*true|storeSCIMToken\s*:\s*['"]plain['"]/g)) rawFinding(findings, 'AUTH-006', 'identity.scim-storage', 'Production SCIM must be organization-scoped with protected token storage', relative, body, match.index)
      for (const match of body.matchAll(/enableSessionForAPIKeys\s*:\s*true|referenceId\s*:\s*['"]user|storeKey\s*:\s*true/g)) rawFinding(findings, 'AUTH-005', 'auth.api-key-scope', 'Workspace API keys must be organization-scoped, hashed, expiring, and must not create browser sessions', relative, body, match.index)
    }
    if (enabled(profile, 'realtime')) for (const match of body.matchAll(/websocket/gi)) if (/default|primary/i.test(body) && /stream|run/i.test(body)) findings.push(issue('NOT_VERIFIED', 'RT-002', 'realtime.websocket-trigger', 'Verify that bidirectional presence/collaboration justifies WebSockets; default to resumable SSE', evidence(relative, body, match.index), { verificationType: 'manual-qualification', reason: 'intent cannot be proven statically', risk: 'durable state or streaming coupled to WebSocket lifetime', owner: 'project owner', nextAction: 'document and reproduce the bidirectional requirement' }))
  }

  if (skipped.symlinks.length || skipped.skillTrees.length || skipped.generated.length) {
    const parts = []
    if (skipped.symlinks.length) parts.push(`${skipped.symlinks.length} symlinked path(s)`)
    if (skipped.skillTrees.length) parts.push(`${skipped.skillTrees.length} agent-skill tree(s)`)
    if (skipped.generated.length) parts.push(`${skipped.generated.length} generated/bundled file(s)`)
    findings.push(issue('NOT_VERIFIED', 'DEL-001', 'inspection.traversal', `Skipped without inspection: ${parts.join(', ')} (first: ${[...skipped.symlinks, ...skipped.skillTrees, ...skipped.generated][0]})`, { path: '.', line: 1, type: 'static-sentinel' }, { verificationType: 'manual-qualification', reason: 'paths were excluded from static inspection', risk: 'excluded paths may contain violations', owner: 'project owner', nextAction: 'review excluded paths or extend .guardianignore deliberately', skipped }))
  }

  if (profile) for (const [name, paths] of Object.entries(observed)) {
    if (paths.length && !enabled(profile, name)) rawFinding(findings, 'FOUND-004', `capability.${name}.undeclared`, `Repository evidence suggests disabled capability ${name}: ${paths.slice(0, 3).join(', ')}`, paths[0])
    if (owned(profile, name) && !content.some(item => inRoots(item.path, roots(profile, name)))) rawFinding(findings, 'FOUND-004', `capability.${name}.missing-code`, `Enabled owned capability ${name} has no inspectable code in declared source roots`, roots(profile, name)[0] ?? profileRelative)
  }

  if (profile?.project?.tenancy === 'multi-tenant-shared-schema') {
    const sqlFiles = content.filter(item => item.extension === '.sql' && !nonProductionPath(item.path))
    const allSql = sqlFiles.map(item => item.body).join('\n')
    const policiesByTable = tablePolicies(sqlFiles)
    const tables = sqlFiles.flatMap(file => tenantTables(file.body).map(table => ({ ...table, path: file.path, body: file.body })))
    for (const table of tables) {
      const escaped = table.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const primary = table.definition.match(/PRIMARY\s+KEY\s*\(([^)]*)\)/i)?.[1] ?? ''
      if (!/\bworkspace_id\b/i.test(primary)) rawFinding(findings, 'TEN-001', 'tenancy.composite-primary-key', `Tenant table ${table.name} primary key must include workspace_id`, table.path, table.body, table.index)
      for (const match of table.definition.matchAll(/(?:UNIQUE|REFERENCES\s+[\w."-]+)\s*\(([^)]*)\)/gi)) if (!/\bworkspace_id\b/i.test(match[1])) rawFinding(findings, 'TEN-001', 'tenancy.composite-relationship', `Tenant table ${table.name} unique/foreign relationship must include workspace_id`, table.path, table.body, table.index + (match.index ?? 0))
      if (!new RegExp(`ALTER\\s+TABLE\\s+"?${escaped}"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i').test(allSql)) rawFinding(findings, 'TEN-002', 'tenancy.rls-enable', `Tenant table ${table.name} must enable RLS`, table.path, table.body, table.index)
      if (!new RegExp(`ALTER\\s+TABLE\\s+"?${escaped}"?\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i').test(allSql)) rawFinding(findings, 'TEN-002', 'tenancy.rls-force', `Tenant table ${table.name} must force RLS`, table.path, table.body, table.index)
      const policies = policiesByTable.get(normalizedSqlName(table.name)) ?? []
      if (!policies.some(policy => tenantClause(policy.statement, 'USING')) || !policies.some(policy => tenantClause(policy.statement, 'WITH\\s+CHECK'))) rawFinding(findings, 'TEN-002', 'tenancy.rls-policy', `Tenant table ${table.name} requires table-bound fail-closed tenant USING and WITH CHECK predicates; command-specific policies may split them`, table.path, table.body, table.index)
    }
    if (!tables.length) rawFinding(findings, 'TEN-002', 'tenancy.rls-evidence', 'Shared-schema tenancy requires reviewed tenant table/RLS migration evidence', 'database migrations')
    const all = content.filter(item => item.extension !== '.md' && !nonProductionPath(item.path)).map(item => item.body).join('\n')
    if (!/(SET\s+LOCAL\s+app\.workspace_id|set_config\s*\(\s*['"]app\.workspace_id['"][^)]*,\s*true\s*\))/i.test(all)) rawFinding(findings, 'TEN-003', 'tenancy.context-evidence', 'Set tenant context locally inside each protected transaction', 'data access')
    for (const file of sqlFiles) for (const match of file.body.matchAll(/SECURITY\s+DEFINER/gi)) {
      const window = file.body.slice(Math.max(0, (match.index ?? 0) - 700), (match.index ?? 0) + 700)
      if (!/SET\s+(?:LOCAL\s+)?search_path\s*(?:=|TO)\s*(?:pg_catalog|['"]?[^,;'"\s]+['"]?\s*,\s*pg_temp)/i.test(window) || !/(workspace_id|current_setting\s*\(\s*['"]app\.workspace_id|authorize)/i.test(window)) rawFinding(findings, 'TEN-004', 'tenancy.security-definer', 'SECURITY DEFINER tenant paths require a fixed search_path and explicit tenant/authorization guard', file.path, file.body, match.index)
    }
  }

  if (profile && enabled(profile, 'webControlPlane') && profile.project.access !== 'public' && owned(profile, 'webControlPlane')) {
    const nextCode = content.filter(item => item.extension !== '.md' && !nonProductionPath(item.path) && inRoots(item.path, roots(profile, 'webControlPlane'))).map(item => item.body).join('\n')
    if (!/from\s+['"]better-auth['"]/.test(nextCode)) rawFinding(findings, 'AUTH-003', 'auth.library', 'Configure the reviewed Better Auth server library', 'identity configuration')
    if (profile.project.tenancy.startsWith('multi-tenant') && !/organization\s*\(/.test(nextCode)) rawFinding(findings, 'AUTH-001', 'auth.organization-boundary', 'Configure Better Auth Organization as the workspace boundary', 'identity configuration')
    if ((enabled(profile, 'flutter') || enabled(profile, 'connectors')) && !/oauthProvider\s*\(/.test(nextCode)) rawFinding(findings, 'AUTH-004', 'auth.oauth-provider', 'Configure Better Auth OAuth Provider for delegated clients', 'identity configuration')
    if (!/useSecureCookies\s*:\s*true/.test(nextCode)) rawFinding(findings, 'AUTH-003', 'auth.secure-cookies-code', 'Force secure browser cookies in production', 'identity configuration')
  }

  if (profile) {
    for (const [name, capability] of Object.entries(profile.capabilities ?? {})) if (capability.status === 'enabled' && ['shared-managed', 'external-managed'].includes(capability.ownership)) findings.push(issue('NOT_VERIFIED', 'RUN-003', `contract.${name}.qualification`, `${name} contract is declared but live compatibility, isolation, recovery and exit behavior were not reproduced`, { path: profileRelative, line: 1, type: 'declared-control' }, { capability: name, verificationType: 'manual-qualification', reason: 'environment-bound service behavior is not statically testable', risk: 'dependency contract may not meet declared boundary', owner: capability.contract?.incidentOwner, nextAction: 'run contract, failure and exit qualification' }))
    if (!profile.objectives) findings.push(issue('NOT_VERIFIED', 'REL-001', 'reliability.objectives', 'No measured production objectives are declared', { path: profileRelative, line: 1, type: 'declared-control' }, { verificationType: 'manual-qualification', reason: 'project objectives were not provided', risk: 'capacity and recovery decisions cannot be qualified', owner: 'project owner', nextAction: 'confirm applicable SLI/SLO, RPO and RTO objectives' }))
    if (Object.values(profile.capabilities ?? {}).some(capability => capability.status === 'enabled')) findings.push(issue('NOT_VERIFIED', 'DEL-001', 'qualification.runtime', 'Static sentinels and declarations do not prove runtime isolation, replay, failover, restore, provider security or recovery', { path: profileRelative, line: 1, type: 'static-sentinel' }, { verificationType: 'manual-qualification', reason: 'no environment-bound tests were executed by this checker', risk: 'declared controls may fail at runtime', owner: 'project owner', nextAction: 'run the scoped qualification plan for enabled capabilities' }))
  }

  const unique = findings.filter((finding, index, all) => all.findIndex(candidate => candidate.status === finding.status && candidate.rule === finding.rule && candidate.control === finding.control && candidate.path === finding.path && candidate.evidence?.line === finding.evidence?.line && candidate.message === finding.message) === index)
  const resolved = capFindings(applyExceptions(unique, exceptionStates, profileRelative))
  const knownRules = await canonicalRuleIds()
  const catalogPath = resolve(scriptDirectory, '../references/control-catalog.json')
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  const knownControl = finding => catalog.controls.some(item => item.rule === finding.rule && (item.id === finding.control || (item.idPattern && new RegExp(item.idPattern).test(finding.control))))
  for (const finding of resolved) {
    if (!knownRules.has(finding.rule)) throw new Error(`Checker emitted unknown canonical rule ${finding.rule}`)
    if (!knownControl(finding)) throw new Error(`Checker emitted unknown control ${finding.rule}/${finding.control}`)
  }
  if (!resolved.some(item => item.status === 'FAIL')) resolved.unshift(issue('PASS', 'FOUND-004', 'profile.capability-alignment', 'No unexcepted machine-detectable architecture violations were found', { path: profileRelative, line: 1, type: 'static-sentinel' }))
  if (legacyProfileName && profile) console.error(`deprecation: ${profileRelative} uses the legacy .yaml name for a JSON document; rename to .vegastack/architecture.json`)
  return resolved
}

export function summarize(findings) {
  const counts = Object.fromEntries(['PASS', 'FAIL', 'EXCEPTED', 'NOT_VERIFIED'].map(status => [status, findings.filter(item => item.status === status).length]))
  const suppressed = findings.reduce((total, item) => total + (item.suppressedCount ?? 0), 0)
  return { status: counts.FAIL ? 'FAIL' : 'PASS', verdict: counts.FAIL || counts.EXCEPTED ? 'GUARDIAN VERDICT: REJECT' : 'GUARDIAN VERDICT: ACCEPT', counts, ...(suppressed ? { suppressedFindings: suppressed } : {}) }
}

const usage = `Usage: architecture-check.mjs [DIR] [--json | --summary] [--help]

Deterministic, read-only architecture checks for the directory (default: cwd).
Profile discovery: .vegastack/architecture.json (preferred) or legacy .vegastack/architecture.yaml.
Add repository-relative path prefixes to a .guardianignore file (one per line, # comments) to exclude paths.

Output: --summary prints the verdict, counts, and the first 10 findings; --json prints everything.
Exit codes: 0 = no FAIL findings; 1 = FAIL findings present; 2 = usage or tool error.`

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2)
  const flags = new Set(argv.filter(argument => argument.startsWith('-')))
  const positional = argv.filter(argument => !argument.startsWith('-'))
  const known = new Set(['--json', '--summary', '--help', '-h'])
  const unknown = [...flags].filter(flag => !known.has(flag))
  if (flags.has('--help') || flags.has('-h')) { console.log(usage); process.exit(0) }
  if (unknown.length || positional.length > 1) { console.error(`error: unknown arguments: ${[...unknown, ...positional.slice(1)].join(' ')}\n\n${usage}`); process.exit(2) }
  const root = resolve(positional[0] ?? process.cwd())
  let findings
  try { findings = await checkArchitecture(root) } catch (error) { console.error(`error: ${error.message}`); process.exit(2) }
  const summary = summarize(findings)
  if (flags.has('--json')) console.log(JSON.stringify({ schemaVersion: 1, root, ...summary, findings }, null, 2))
  else if (flags.has('--summary')) {
    console.log(summary.verdict)
    console.log(`architecture-check: ${Object.entries(summary.counts).map(([key, value]) => `${value} ${key}`).join(', ')}${summary.suppressedFindings ? `, ${summary.suppressedFindings} suppressed` : ''}`)
    const ranked = [...findings].sort((a, b) => (a.status === 'FAIL' ? 0 : 1) - (b.status === 'FAIL' ? 0 : 1))
    for (const finding of ranked.slice(0, 10)) console.log(`${finding.status} ${finding.rule}/${finding.control}: ${finding.message}${finding.path ? ` (${finding.path}${finding.evidence?.line ? `:${finding.evidence.line}` : ''})` : ''}`)
    if (findings.length > 10) console.log(`(+${findings.length - 10} more findings; use --json for all)`)
  } else {
    console.log(summary.verdict)
    for (const finding of findings) console.log(`${finding.status} ${finding.rule}/${finding.control}: ${finding.message}${finding.path ? ` (${finding.path}${finding.evidence?.line ? `:${finding.evidence.line}` : ''})` : ''}${finding.suppressedCount ? ` (+${finding.suppressedCount} more suppressed)` : ''}`)
    console.log(`architecture-check: ${Object.entries(summary.counts).map(([key, value]) => `${value} ${key}`).join(', ')}`)
  }
  if (summary.status === 'FAIL') process.exitCode = 1
}
