#!/usr/bin/env node
import { lstat, readFile, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { listFiles, pathExists, readJsonYaml, resolveProfile } from './lib.mjs'
import { validateJsonSchema } from './schema-validate.mjs'

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const architectureRoot = join(skillRoot, 'references', 'architecture')
const schemaPath = join(skillRoot, 'assets', 'architecture-profile.schema.json')
const compatibilityPath = join(skillRoot, 'references', 'foundation-compatibility.json')

export async function canonicalRuleIds() {
  const ids = new Set()
  const duplicates = new Set()
  for (const path of await listFiles(architectureRoot, file => file.endsWith('.md'))) {
    const body = await readFile(path, 'utf8')
    for (const match of body.matchAll(/\*\*([A-Z]+-[0-9]{3}) —/g)) {
      if (ids.has(match[1])) duplicates.add(match[1])
      ids.add(match[1])
    }
  }
  if (duplicates.size) throw new Error(`Duplicate canonical rule IDs: ${[...duplicates].join(', ')}`)
  return ids
}

const enabled = (profile, name) => profile.capabilities?.[name]?.status === 'enabled'
const control = (profile, capability, name) => profile.capabilities?.[capability]?.controls?.[name]
const exactVersion = /^\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const diag = (rule, controlId, path, message, exceptionEligible = true) => ({ rule, control: controlId, path, message, exceptionEligible })

async function containedFile(projectRoot, targetPath) {
  if (isAbsolute(targetPath) || targetPath.split(/[\\/]/).includes('..')) throw new Error('path must be repository-relative without ..')
  const target = resolve(projectRoot, targetPath)
  let current = resolve(projectRoot)
  for (const part of relative(current, target).split(sep).filter(Boolean)) {
    current = resolve(current, part)
    if ((await lstat(current)).isSymbolicLink()) throw new Error('symlink component')
  }
  const resolvedRoot = await realpath(projectRoot)
  const resolvedTarget = await realpath(target)
  if (relative(resolvedRoot, resolvedTarget).startsWith('..') || !(await lstat(resolvedTarget)).isFile()) throw new Error('outside project or not a file')
  return resolvedTarget
}

function metadata(body, key) {
  return body.match(new RegExp(`^- ${key}:\\s*(.+)$`, 'mi'))?.[1]?.trim()
}

async function validateExceptions(profile, projectRoot, now, knownRules) {
  const states = []
  const seen = new Set()
  for (const exception of profile.exceptions ?? []) {
    const reasons = []
    if (seen.has(exception.id)) reasons.push(`duplicate exception id ${exception.id}`)
    seen.add(exception.id)
    if (!knownRules.has(exception.ruleId)) reasons.push(`unknown canonical rule ${exception.ruleId}`)
    for (const path of exception.paths ?? []) if (path.includes('*')) reasons.push('wildcard paths are forbidden')
    if (exception.review?.date) {
      const [year, month, day] = String(exception.review.date).split('-').map(Number)
      const parsed = new Date(Date.UTC(year, month - 1, day))
      const validCalendarDate = /^\d{4}-\d{2}-\d{2}$/.test(exception.review.date) && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
      const expiry = validCalendarDate ? Date.parse(`${exception.review.date}T23:59:59Z`) : Number.NaN
      if (!Number.isFinite(expiry)) reasons.push('review.date is not a real ISO calendar date')
      else if (expiry < now.getTime()) reasons.push(`exception expired on ${exception.review.date}`)
    }
    try {
      const adrPath = await containedFile(projectRoot, String(exception.adr ?? ''))
      const body = await readFile(adrPath, 'utf8')
      const requiredHeadings = ['## Decision and rationale', '## Risks and accepted deviation', '## Compensating controls', '## Verification', '## Rollback or migration', '## Review trigger']
      for (const heading of requiredHeadings) if (!body.includes(heading)) reasons.push(`ADR missing ${heading}`)
      const checks = {
        'Status': 'accepted',
        'Project-Owner': exception.projectOwner,
        'Rule-ID': exception.ruleId,
        'Exception-ID': exception.id,
        'Foundation-Deviation-Acknowledged': 'true'
      }
      for (const [key, expected] of Object.entries(checks)) if (metadata(body, key) !== String(expected)) reasons.push(`ADR ${key} must equal ${expected}`)
      const adrControls = new Set((metadata(body, 'Control-IDs') ?? '').split(',').map(item => item.trim()).filter(Boolean))
      const adrPaths = new Set((metadata(body, 'Scope-Paths') ?? '').split(',').map(item => item.trim()).filter(Boolean))
      if (exception.controls) {
        if (exception.controls.some(item => !adrControls.has(item)) || adrControls.size !== exception.controls.length) reasons.push('ADR Control-IDs do not exactly match profile')
      } else if (metadata(body, 'Control-IDs') !== 'all') {
        // A rule-level exception (no controls list) covers every control under its rule; the ADR
        // must acknowledge that breadth explicitly.
        reasons.push('ADR Control-IDs must equal all for a rule-level exception without a controls list')
      }
      if ((exception.paths ?? []).some(item => !adrPaths.has(item)) || adrPaths.size !== (exception.paths ?? []).length) reasons.push('ADR Scope-Paths do not exactly match profile')
      if (exception.review?.date && metadata(body, 'Review-Date') !== exception.review.date) reasons.push('ADR Review-Date does not match profile')
      if (exception.review?.event && metadata(body, 'Review-Event') !== exception.review.event) reasons.push('ADR Review-Event does not match profile')
    } catch (error) { reasons.push(`ADR invalid or not found: ${error.message}`) }
    if (exception.status !== 'active') reasons.push(`exception status is ${exception.status}`)
    states.push({ exception, valid: reasons.length === 0, reasons })
  }
  return states
}

function requiredFamilyVersions(profile, compatibility) {
  const baseline = compatibility.baselines?.[profile.foundation?.baseline]
  if (!baseline) return []
  const requirements = []
  const add = (capability, family) => {
    if (!enabled(profile, capability)) return
    for (const [key, expected] of Object.entries(baseline.families?.[family] ?? {})) requirements.push({ capability, key, expected })
  }
  add('webControlPlane', 'web')
  if (enabled(profile, 'webControlPlane') && profile.environments?.production?.hosting === 'cloudflare-opennext') add('webControlPlane', 'cloudflare-opennext')
  add('agents', 'agents')
  add('jobs', 'jobs')
  if (enabled(profile, 'webControlPlane') && profile.project?.access !== 'public') add('webControlPlane', 'identity')
  if (enabled(profile, 'sandbox') && control(profile, 'sandbox', 'provider') === 'cloudflare-sandbox') add('sandbox', 'sandbox-cloudflare')
  return requirements
}

function profileRelativeName(path, projectRoot) {
  const absolute = resolve(path)
  if (projectRoot) {
    const relativePath = relative(resolve(projectRoot), absolute).split(sep).join('/')
    if (!relativePath.startsWith('..')) return relativePath
  }
  return basename(dirname(absolute)) === '.vegastack' ? `.vegastack/${basename(absolute)}` : basename(absolute)
}

export async function validateProfile(path, options = {}) {
  const diagnostics = []
  const profileRel = profileRelativeName(path, options.projectRoot)
  let profile
  try { profile = await readJsonYaml(path) } catch (error) {
    return { profile: null, errors: [error.message], diagnostics: [diag('FOUND-001', 'profile.parse', profileRel, error.message, false)], exceptions: [] }
  }
  if (profile.schemaVersion === 2) {
    const message = 'schemaVersion 2 is obsolete; run profile-tool.mjs migrate-v2 <profile> for a deterministic read-only v3 draft, then confirm project facts'
    return { profile, errors: [message], diagnostics: [diag('FOUND-001', 'profile.schema-version', profileRel, message, false)], exceptions: [] }
  }
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
  for (const message of validateJsonSchema(schema, profile)) diagnostics.push(diag('FOUND-001', 'profile.schema', profileRel, message, false))
  const profileDirectory = dirname(resolve(path))
  const projectRoot = resolve(options.projectRoot ?? (basename(profileDirectory) === '.vegastack' ? dirname(profileDirectory) : process.cwd()))
  const compatibility = JSON.parse(await readFile(compatibilityPath, 'utf8'))
  const knownRules = await canonicalRuleIds()
  const now = options.now ? new Date(options.now) : new Date()
  const exceptionStates = await validateExceptions(profile, projectRoot, now, knownRules)
  for (const state of exceptionStates.filter(item => !item.valid)) diagnostics.push(diag('FOUND-002', 'exception.validity', profileRel, `${state.exception?.id ?? 'unknown'}: ${state.reasons.join('; ')}`, false))

  if (profile.profileStatus !== 'confirmed') diagnostics.push(diag('FOUND-001', 'profile.confirmed', profileRel, 'profileStatus must be confirmed before CI; the bundled profile is an intentionally incomplete draft', false))
  if (String(profile.project?.name ?? '').startsWith('REQUIRED-')) diagnostics.push(diag('FOUND-001', 'profile.project-name', profileRel, 'replace the REQUIRED project name with a confirmed fact', false))
  const baseline = compatibility.baselines?.[profile.foundation?.baseline]
  if (!baseline) diagnostics.push(diag('PKG-003', 'foundation.baseline', profileRel, `unknown foundation baseline ${profile.foundation?.baseline}`))
  else if (profile.foundation?.adoption !== baseline.state) diagnostics.push(diag('PKG-003', 'foundation.adoption', profileRel, `baseline ${profile.foundation.baseline} has state ${baseline.state}, not ${profile.foundation?.adoption}`))
  else if (baseline.state !== 'supported') diagnostics.push(diag('PKG-003', 'foundation.non-supported-adoption', profileRel, `${baseline.state} baseline adoption requires scoped project-owner ADR and qualification evidence`))

  for (const [name, capability] of Object.entries(profile.capabilities ?? {})) {
    if (capability?.status !== 'enabled') continue
    for (const [key, version] of Object.entries(capability.versions ?? {})) if (!exactVersion.test(String(version))) diagnostics.push(diag('PKG-003', `version.${name}.${key}`, profileRel, `${name}.versions.${key} must be an exact version`))
    if (capability.ownership === 'owned') for (const root of capability.sourceRoots ?? []) {
      const full = resolve(projectRoot, root)
      try {
        if (relative(projectRoot, full).startsWith('..')) throw new Error('outside project')
        if ((await lstat(full)).isSymbolicLink()) throw new Error('symlink')
        if (!(await lstat(full)).isDirectory()) throw new Error('not a directory')
      } catch (error) { diagnostics.push(diag('FOUND-004', `capability.${name}.source-root`, root, `owned enabled capability ${name} source root is unavailable: ${error.message}`)) }
    }
  }
  const separatedRuntimes = new Set(['webControlPlane', 'agents', 'jobs'])
  const ownedRoots = Object.entries(profile.capabilities ?? {}).flatMap(([name, cap]) => separatedRuntimes.has(name) && cap?.status === 'enabled' && cap?.ownership === 'owned' ? (cap.sourceRoots ?? []).map(root => [name, root]) : [])
  for (let left = 0; left < ownedRoots.length; left += 1) for (let right = left + 1; right < ownedRoots.length; right += 1) {
    const [leftOwner, leftRoot] = ownedRoots[left]
    const [rightOwner, rightRoot] = ownedRoots[right]
    if (leftOwner !== rightOwner && (leftRoot === rightRoot || leftRoot.startsWith(`${rightRoot}/`) || rightRoot.startsWith(`${leftRoot}/`))) diagnostics.push(diag('RUN-003', 'capability.source-root-overlap', profileRel, `owned source roots overlap between ${leftOwner} and ${rightOwner}: ${leftRoot} / ${rightRoot}`))
  }

  for (const item of requiredFamilyVersions(profile, compatibility)) {
    const actual = profile.capabilities?.[item.capability]?.versions?.[item.key]
    if (actual !== item.expected) diagnostics.push(diag('PKG-003', `version.${item.capability}.${item.key}`, profileRel, `${item.capability}.versions.${item.key} must equal supported baseline ${item.expected}; lag/advance requires a scoped project ADR`))
  }

  if (enabled(profile, 'flutter')) {
    if (!enabled(profile, 'webControlPlane')) diagnostics.push(diag('MOB-002', 'flutter.api-provider', profileRel, 'Flutter requires an enabled REST/OpenAPI provider capability'))
    if (control(profile, 'flutter', 'delegatedOAuthPkce') !== true) diagnostics.push(diag('MOB-001', 'flutter.oauth-pkce', profileRel, 'Flutter requires delegated OAuth/OIDC code with S256 PKCE'))
    if (control(profile, 'flutter', 'generatedRestClient') !== true || control(profile, 'webControlPlane', 'openapiGenerated') !== true) diagnostics.push(diag('MOB-002', 'flutter.generated-client', profileRel, 'Flutter requires deterministic generated REST/OpenAPI client consumption'))
  }
  if (enabled(profile, 'agents')) {
    if (control(profile, 'agents', 'workflowWorld') !== 'postgres' || control(profile, 'agents', 'agentRun') !== true) diagnostics.push(diag('DUR-001', 'agents.durable-owner', profileRel, 'Agents require qualified EVE/Postgres World and AgentRun'))
    if (profile.capabilities.agents.ownership === 'owned' && (!control(profile, 'agents', 'workflowDatabaseOwner') || !control(profile, 'agents', 'agentRunOwner'))) diagnostics.push(diag('DUR-001', 'agents.storage-ownership', profileRel, 'Owned agents must declare the Workflow PostgreSQL and AgentRun durable owners'))
    const admission = control(profile, 'agents', 'admission')
    if (admission === 'pg-boss' && (!enabled(profile, 'jobs') || profile.capabilities.jobs.ownership !== 'owned' || !(control(profile, 'jobs', 'roles') ?? []).includes('agent-admission'))) diagnostics.push(diag('DUR-003', 'agents.admission', profileRel, 'owned agent admission requires owned pg-boss jobs with agent-admission role'))
    if (admission === 'shared-contract' && !profile.capabilities.agents.contract && !profile.capabilities.jobs?.contract) diagnostics.push(diag('DUR-003', 'agents.admission', profileRel, 'shared admission requires an explicit qualified service contract'))
    if (!['pg-boss', 'shared-contract'].includes(admission)) diagnostics.push(diag('DUR-003', 'agents.admission', profileRel, 'agents must declare pg-boss or shared-contract admission'))
  }
  if (enabled(profile, 'jobs') && profile.capabilities.jobs.ownership === 'owned' && !control(profile, 'jobs', 'databaseOwner')) diagnostics.push(diag('DUR-003', 'jobs.database-owner', profileRel, 'Owned pg-boss jobs must declare their PostgreSQL owner'))
  if (enabled(profile, 'knowledge') && profile.capabilities.knowledge.ownership === 'owned') {
    if (!control(profile, 'knowledge', 'postgresOwner')) diagnostics.push(diag('DATA-002', 'knowledge.storage-owner', profileRel, 'Owned knowledge must declare its PostgreSQL/pgvector owner'))
    if (control(profile, 'knowledge', 'binaryObjects') === true && !control(profile, 'knowledge', 'objectStorageOwner')) diagnostics.push(diag('DATA-002', 'knowledge.object-storage-owner', profileRel, 'Knowledge with binary objects must declare the object-storage owner'))
  }
  for (const name of ['connectors', 'modelRouting']) if (enabled(profile, name) && control(profile, name, 'credentialBearing') === true && !enabled(profile, 'secrets')) diagnostics.push(diag('SEC-002', 'secrets.dependency', profileRel, `Credential-bearing ${name} requires an enabled production secret-custody capability`))
  if (enabled(profile, 'enterpriseIdentity') && control(profile, 'enterpriseIdentity', 'scim') === true && !enabled(profile, 'secrets')) diagnostics.push(diag('SEC-002', 'secrets.dependency', profileRel, 'SCIM requires an enabled production secret-custody capability'))
  if (enabled(profile, 'notifications') && !control(profile, 'notifications', 'durableIntentOwner')) diagnostics.push(diag('RT-005', 'notifications.durable-intent-owner', profileRel, 'Notifications must declare the durable notification-intent owner'))
  if (control(profile, 'agents', 'untrustedExecution') === true) {
    if (!enabled(profile, 'sandbox')) diagnostics.push(diag('SBX-001', 'sandbox.activation', profileRel, 'untrusted execution activates the sandbox capability'))
    if (control(profile, 'sandbox', 'trustedBroker') !== true) diagnostics.push(diag('SBX-002', 'sandbox.trusted-broker', profileRel, 'untrusted execution requires a trusted capability broker'))
  }
  if (enabled(profile, 'sandbox')) {
    if (control(profile, 'sandbox', 'egress') !== 'deny-by-default') diagnostics.push(diag('SBX-003', 'sandbox.egress', profileRel, 'sandbox egress must be deny-by-default'))
    if (control(profile, 'sandbox', 'databaseCredentials') !== false) diagnostics.push(diag('SBX-002', 'sandbox.credentials', profileRel, 'sandboxes must not receive database credentials'))
  }
  if (enabled(profile, 'enterpriseIdentity') && control(profile, 'enterpriseIdentity', 'scim') === true) {
    if (control(profile, 'enterpriseIdentity', 'organizationMapping') !== true || control(profile, 'enterpriseIdentity', 'deprovisioning') !== true) diagnostics.push(diag('AUTH-006', 'identity.scim-deprovisioning', profileRel, 'SCIM requires organization mapping and complete deprovisioning'))
  }
  if (enabled(profile, 'webControlPlane')) {
    if (profile.environments?.production?.hosting === 'cloudflare-opennext' && profile.capabilities.webControlPlane.placement !== 'open-next-worker') diagnostics.push(diag('HOST-004', 'hosting.web-placement', profileRel, 'Cloudflare/OpenNext requires web placement open-next-worker'))
    if (profile.project?.access !== 'public' && control(profile, 'webControlPlane', 'secureCookies') !== true) diagnostics.push(diag('AUTH-003', 'auth.secure-cookies', profileRel, 'authenticated web access requires secure cookies'))
    if (profile.project?.access !== 'public' && profile.capabilities.webControlPlane.ownership === 'owned' && !enabled(profile, 'secrets')) diagnostics.push(diag('SEC-002', 'secrets.activation', profileRel, 'owned authenticated web production activates secret custody'))
    if (enabled(profile, 'flutter') && (control(profile, 'webControlPlane', 'canonicalApi') !== 'rest-openapi' || control(profile, 'webControlPlane', 'openapiGenerated') !== true)) diagnostics.push(diag('API-002', 'api.generated-contract', profileRel, 'Flutter requires canonical generated REST/OpenAPI'))
  }
  if (profile.environments?.production?.hosting === 'cloudflare-opennext') for (const name of ['agents', 'jobs']) {
    const cap = profile.capabilities?.[name]
    if (cap?.status === 'enabled' && cap.ownership === 'owned' && !['node-service', 'oci-container'].includes(cap.placement)) diagnostics.push(diag(name === 'agents' ? 'RUN-001' : 'RUN-002', `hosting.${name}-placement`, profileRel, `owned ${name} must use external long-running Node/OCI placement outside OpenNext`))
  }
  if (enabled(profile, 'secrets') && profile.capabilities.secrets.ownership === 'owned' && control(profile, 'secrets', 'provider') !== 'openbao') diagnostics.push(diag('SEC-002', 'secrets.production-provider', profileRel, 'owned production secret custody requires OpenBao'))

  const errors = diagnostics.map(item => `${item.rule}/${item.control}: ${item.message}`)
  return { profile, errors, diagnostics, exceptions: exceptionStates }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argument = process.argv.slice(2).find(value => !value.startsWith('-'))
  let path = argument ? resolve(argument) : null
  if (!path) {
    const discovered = await resolveProfile(process.cwd())
    if (!discovered) { console.error('error: no .vegastack/architecture.json (or legacy .yaml) profile found; pass a path explicitly'); process.exit(2) }
    if (discovered.legacy) console.error(`deprecation: ${discovered.relative} uses the legacy .yaml name for a JSON document; rename to .vegastack/architecture.json`)
    path = discovered.path
  }
  const json = process.argv.includes('--json')
  const result = await validateProfile(path)
  if (json) console.log(JSON.stringify({ path, valid: result.errors.length === 0, diagnostics: result.diagnostics, exceptions: result.exceptions }, null, 2))
  else if (result.errors.length) for (const error of result.errors) console.error(`FAIL profile: ${error}`)
  else console.log(`validate-profile: valid ${path}`)
  if (result.errors.length) process.exitCode = 1
}
