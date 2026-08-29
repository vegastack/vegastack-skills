#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { dirname, join, parse, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pathExists, readJsonYaml, sha256 } from './lib.mjs'

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultRegistry = join(skillRoot, 'refresh', 'sources.json')
const maximumBytes = 5 * 1024 * 1024
// Every host referenced by refresh/sources.json must appear here; loadRegistry enforces the
// consistency so the allowlist cannot silently drift from the registry.
const approvedHosts = new Set(['agentskills.io', 'ai-sdk.dev', 'ai.google.dev', 'api.flutter.dev', 'api.osv.dev', 'aws.amazon.com', 'better-auth.com', 'bun.sh', 'code.claude.com', 'developer.apple.com', 'developers.cloudflare.com', 'developers.openai.com', 'docs.aws.amazon.com', 'docs.flutter.dev', 'firebase.google.com', 'git.postgresql.org', 'github.com', 'hermes-agent.nousresearch.com', 'learn.chatgpt.com', 'modal.com', 'modelcontextprotocol.io', 'nextjs.org', 'openbao.org', 'openid.github.io', 'opennext.js.org', 'opentelemetry.io', 'platform.claude.com', 'pub.dev', 'pypi.org', 'raw.githubusercontent.com', 'registry.npmjs.org', 'riverpod.dev', 'turborepo.dev', 'vercel.com', 'workflow-sdk.dev', 'www.cloudflare.com', 'www.npmjs.com', 'www.postgresql.org'])

function flagValue(argv, flag) {
  const value = argv.shift()
  if (value === undefined || value.startsWith('-')) throw new Error(`${flag} requires a value`)
  return value
}

function args(argv) {
  // No default: this runner is now shared across every skill (tooling/refresh/), so there is no
  // single skill-relative compatibility file to default to. Pass --compatibility explicitly when
  // a registry wants baseline-adoption review-date tracking.
  const result = { registry: defaultRegistry, cache: '.vegastack/evidence-cache.json', report: '.vegastack/evidence-drift.json', topics: [], offline: false, acceptBaselines: false, now: new Date().toISOString(), compatibility: null }
  while (argv.length) {
    const flag = argv.shift()
    if (flag === '--registry') result.registry = resolve(flagValue(argv, flag))
    else if (flag === '--cache') result.cache = resolve(flagValue(argv, flag))
    else if (flag === '--report') result.report = resolve(flagValue(argv, flag))
    else if (flag === '--topics') result.topics = flagValue(argv, flag).split(',').filter(Boolean)
    else if (flag === '--offline') result.offline = true
    else if (flag === '--accept-baselines') result.acceptBaselines = true
    else if (flag === '--verify-baselines') { /* explicit alias for the default online verification run */ }
    else if (flag === '--now') result.now = flagValue(argv, flag)
    else if (flag === '--compatibility') result.compatibility = resolve(flagValue(argv, flag))
    else throw new Error(`Unknown option: ${flag}`)
  }
  return result
}

// Security-advisory watch: query OSV.dev for every pinned npm/PyPI package. Advisories against a
// pinned version are the highest-value freshness signal — they surface in the weekly report and
// fail closed for critical sources so a vulnerable pin is never silently kept.
async function osvAdvisories(source, allowHttpLocalhost) {
  const detection = source.versionDetection ?? {}
  const ecosystem = { npm: 'npm', 'npm-suite': 'npm', pypi: 'PyPI' }[detection.type]
  const version = String(source.pinnedVersion ?? '')
  if (!ecosystem || !/^\d/.test(version)) return []
  const packages = detection.type === 'npm-suite' ? detection.packages : [detection.package]
  const findings = []
  for (const name of packages) {
    const response = await safeFetch('https://api.osv.dev/v1/query', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ package: { name, ecosystem }, version }) }, allowHttpLocalhost)
    if (!response.ok) throw new Error(`OSV HTTP ${response.status} for ${name}`)
    const data = JSON.parse(new TextDecoder().decode(await readBounded(response)))
    for (const vuln of data.vulns ?? []) findings.push({ package: name, version, id: vuln.id, summary: vuln.summary ?? null })
  }
  return findings
}

function privateAddress(address) {
  if (address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true
  if (!isIP(address)) return true
  // IPv4-mapped IPv6 must be evaluated as its IPv4 payload, not passed as "public IPv6" —
  // in both dotted (::ffff:10.0.0.1) and hex-group (::ffff:a00:1) notations.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return privateAddress(mapped[1])
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address)
  if (hexMapped) {
    const high = Number.parseInt(hexMapped[1], 16)
    const low = Number.parseInt(hexMapped[2], 16)
    return privateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
  }
  if (address.includes(':')) return false
  const [a, b] = address.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && (b === 168 || b === 0)) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true // benchmark + TEST-NET-2
  if (a === 203 && b === 0) return true // TEST-NET-3
  return false
}

// NOTE: validation resolves DNS immediately before each fetch (including every redirect hop), but
// Node fetch re-resolves independently, so a hostile authoritative DNS server could still rebind
// between the check and the request. The hard host allowlist above is the primary control; this
// check is defense in depth against allowlisted-host compromise, not a substitute for it.
async function validateNetworkTarget(input, allowHttpLocalhost = false) {
  const url = new URL(input)
  const loopbackName = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(allowHttpLocalhost && url.protocol === 'http:' && loopbackName)) throw new Error(`Only HTTPS evidence URLs are allowed: ${url}`)
  if (!approvedHosts.has(url.hostname) && !(allowHttpLocalhost && loopbackName)) throw new Error(`Unapproved evidence host: ${url.hostname}`)
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true, verbatim: true })
  if ((!allowHttpLocalhost || !loopbackName) && addresses.some(entry => privateAddress(entry.address))) throw new Error(`Private/reserved evidence target refused: ${url.hostname}`)
  return url
}

async function readBounded(response) {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > maximumBytes) throw new Error(`Evidence response exceeds ${maximumBytes} bytes`)
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumBytes) { await reader.cancel(); throw new Error(`Evidence response exceeds ${maximumBytes} bytes`) }
    chunks.push(value)
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return output
}

async function safeFetch(input, init = {}, allowHttpLocalhost = false) {
  let url = await validateNetworkTarget(input, allowHttpLocalhost)
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20_000) })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (!location || redirects === 5) throw new Error('Invalid or excessive evidence redirect')
    url = await validateNetworkTarget(new URL(location, url).href, allowHttpLocalhost)
  }
  throw new Error('Evidence redirect limit exceeded')
}

async function assertSafeWriteTarget(input) {
  const target = resolve(input)
  const root = parse(target).root
  const segments = relative(root, target).split(sep).filter(Boolean)
  let current = root
  for (const part of segments) {
    current = join(current, part)
    try {
      const entry = await lstat(current)
      if (entry.isSymbolicLink()) throw new Error(`Refusing write through symlink: ${current}`)
    } catch (error) {
      if (error?.code === 'ENOENT') break
      throw error
    }
  }
  await mkdir(dirname(target), { recursive: true })
  current = root
  for (const part of segments) {
    current = join(current, part)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing write through symlink: ${current}`)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return target
}

async function atomicJson(path, value) {
  const target = await assertSafeWriteTarget(path)
  const temporary = join(dirname(target), `.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}

const ownerFor = source => source.owner ?? 'maintainers'

function item(source, extra = {}) {
  return { id: source.id, critical: Boolean(source.critical), owner: ownerFor(source), affected: source.affected, ...extra }
}

function evidenceChecksum(source, policy, bytes) {
  const scope = source.checksumScope ?? policy?.defaultChecksumScope
  if (scope === 'http-body') return sha256(bytes)
  if (scope === 'html-text-v1') {
    const document = new TextDecoder().decode(bytes)
    const claimSurface = document.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? document
    const normalized = claimSurface
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(?:nbsp|#x27|quot|amp|lt|gt);/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return sha256(normalized)
  }
  throw new Error(`Unsupported checksum scope for ${source.id}: ${scope}`)
}

async function detectVersion(source, allowHttpLocalhost) {
  const detection = source.versionDetection ?? {}
  if (detection.type === 'npm' || detection.type === 'npm-suite') {
    const packages = detection.type === 'npm-suite' ? detection.packages : [detection.package]
    const tag = detection.tag ?? 'latest'
    const versions = []
    for (const packageName of packages) {
      const response = await safeFetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(tag)}`, {}, allowHttpLocalhost)
      if (!response.ok) throw new Error(`npm version detection HTTP ${response.status} for ${packageName}`)
      const metadata = JSON.parse(new TextDecoder().decode(await readBounded(response)))
      versions.push(metadata.version ?? null)
    }
    const unique = [...new Set(versions)]
    return unique.length === 1 ? unique[0] : versions.map((version, index) => `${packages[index]}@${version}`).join(',')
  }
  if (detection.type === 'pypi') {
    const response = await safeFetch(`https://pypi.org/pypi/${encodeURIComponent(detection.package)}/json`, {}, allowHttpLocalhost)
    if (!response.ok) throw new Error(`PyPI version detection HTTP ${response.status}`)
    return JSON.parse(new TextDecoder().decode(await readBounded(response))).info?.version ?? null
  }
  return null
}

function validAgeDays(prior, now) {
  const retrieved = prior?.retrievedAt ? new Date(prior.retrievedAt) : null
  if (!retrieved || Number.isNaN(retrieved.getTime()) || retrieved.getTime() > now.getTime()) return Infinity
  return (now.getTime() - retrieved.getTime()) / 86_400_000
}

async function verifyLocalIntegrity(source) {
  if (!source.path) return null
  if (source.treeChecksumAlgorithm === 'git-sha1-tree' || source.checksumAlgorithm === 'git-sha1-tree') {
    const expected = source.treeChecksum ?? source.checksum
    const result = spawnSync('git', ['-C', source.path, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stderr.trim() || 'git tree checksum failed')
    return { expected, actual: result.stdout.trim(), algorithm: 'git-sha1-tree' }
  }
  if (source.refreshable === false) return { expected: source.checksum, actual: sha256(await readFile(source.path)), algorithm: 'sha256' }
  return null
}

function validateRegistry(registry, options) {
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.sources)) throw new Error('Invalid evidence registry schema')
  const sourceIds = new Set()
  for (const source of registry.sources) {
    if (!source.id || sourceIds.has(source.id) || !Array.isArray(source.topics) || !Number.isFinite(source.thresholdDays) || source.thresholdDays < 1) throw new Error(`Invalid evidence registry entry: ${source.id ?? 'unknown'}`)
    sourceIds.add(source.id)
    if (source.refreshable !== false) {
      const scope = source.checksumScope ?? registry.policy?.defaultChecksumScope
      if (!['http-body', 'html-text-v1'].includes(scope)) throw new Error(`Refreshable source ${source.id} has unsupported checksum scope ${scope}`)
      // --accept-baselines seeds missing baselines for newly added sources; every other mode requires them.
      if (!/^[a-f0-9]{64}$/.test(source.checksum ?? '') && !options.acceptBaselines) throw new Error(`Refreshable source ${source.id} requires an explicit supported SHA-256 baseline`)
      for (const url of Object.values(source.urls ?? {})) {
        const hostname = new URL(url).hostname
        const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
        if (!approvedHosts.has(hostname) && !(options.allowHttpLocalhost && loopback)) throw new Error(`Registry source ${source.id} references unapproved host ${hostname}; update approvedHosts in refresh-evidence.mjs deliberately`)
      }
    }
  }
}

export async function refreshEvidence(options) {
  const registry = await readJsonYaml(options.registry)
  validateRegistry(registry, options)
  const cache = await pathExists(options.cache) ? JSON.parse(await readFile(options.cache, 'utf8')) : { schemaVersion: 1, sources: {} }
  const now = new Date(options.now)
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now timestamp: ${options.now}`)
  const selected = registry.sources.filter(source => !options.topics.length || source.topics.some(topic => options.topics.includes(topic)))
  const report = { schemaVersion: 1, generatedAt: now.toISOString(), offline: options.offline, acceptBaselines: options.acceptBaselines, selected: selected.map(source => source.id), drift: [], versionDrift: [], stale: [], unavailable: [], unaffected: [], manualVersionReview: [], acceptedBaselines: [], advisories: [], advisoryCheckFailed: [], reviewOverdue: [] }
  // Baseline-adoption nags: a reviewBy date that passed without a human decision, or a critical
  // pin lagging a known-newer current version, is how pins rot politely — surface both on every
  // run (warning, never fail-closed).
  if (options.compatibility && await pathExists(options.compatibility)) {
    const compatibility = JSON.parse(await readFile(options.compatibility, 'utf8'))
    for (const [name, baseline] of Object.entries(compatibility.baselines ?? {})) {
      if (baseline.reviewBy && Date.parse(`${baseline.reviewBy}T23:59:59Z`) < now.getTime()) report.reviewOverdue.push({ baseline: name, reviewBy: baseline.reviewBy, state: baseline.state })
    }
  }
  report.pinLag = registry.sources.filter(source => source.critical && /^\d/.test(String(source.pinnedVersion ?? '')) && /^\d/.test(String(source.currentVersion ?? '')) && source.pinnedVersion !== source.currentVersion).map(source => ({ id: source.id, pinned: source.pinnedVersion, current: source.currentVersion }))
  const baselineUpdates = new Map()
  for (const source of selected) {
    const prior = cache.sources[source.id]
    const ageDays = validAgeDays(prior, now)
    try {
      const local = await verifyLocalIntegrity(source)
      if (local && local.actual !== local.expected) {
        report.drift.push(item(source, { from: local.expected, to: local.actual, integrityFailure: true, scope: local.algorithm }))
        continue
      }
      if (source.refreshable === false) {
        report.unaffected.push(source.id)
        cache.sources[source.id] = { retrievedAt: now.toISOString(), checksum: local.actual, local: true, path: source.path }
        continue
      }
      if (options.offline) {
        if (!prior || !Number.isFinite(ageDays) || ageDays > source.thresholdDays) report.stale.push(item(source, { ageDays: Number.isFinite(ageDays) ? Math.floor(ageDays) : null }))
        else report.unaffected.push(source.id)
        continue
      }
      try {
        for (const advisory of await osvAdvisories(source, options.allowHttpLocalhost)) report.advisories.push(item(source, advisory))
      } catch (error) {
        report.advisoryCheckFailed.push(item(source, { error: error.message }))
      }
      const detectedVersion = await detectVersion(source, options.allowHttpLocalhost)
      if (detectedVersion && detectedVersion !== source.currentVersion) {
        // Under --accept-baselines a verified version change is accepted, not re-reported as drift —
        // the same single-code-path rule the checksum branch follows.
        if (options.acceptBaselines) baselineUpdates.set(source.id, { ...(baselineUpdates.get(source.id) ?? {}), currentVersion: detectedVersion, versionCheckedAt: now.toISOString() })
        else report.versionDrift.push(item(source, { from: source.currentVersion, to: detectedVersion, detection: source.versionDetection.type }))
      } else if (!detectedVersion && !['parent', 'git-commit'].includes(source.versionDetection?.type)) {
        const reviewedAgeDays = validAgeDays({ retrievedAt: source.retrievedAt }, now)
        report.manualVersionReview.push({ id: source.id, critical: Boolean(source.critical), owner: ownerFor(source), mechanism: source.versionDetection?.type ?? 'unspecified', due: !Number.isFinite(reviewedAgeDays) || reviewedAgeDays > source.thresholdDays, ageDays: Number.isFinite(reviewedAgeDays) ? Math.floor(reviewedAgeDays) : null })
      }
      const headers = {}
      if (prior?.etag) headers['If-None-Match'] = prior.etag
      if (prior?.lastModified) headers['If-Modified-Since'] = prior.lastModified
      const response = await safeFetch(source.urls.primary, { headers }, options.allowHttpLocalhost)
      if (response.status === 304 && prior) {
        if (prior.checksum !== source.checksum) {
          if (!options.acceptBaselines) {
            report.drift.push(item(source, { from: source.checksum, to: prior.checksum, baseline: 'registry-vs-304-cache' }))
            continue
          }
          baselineUpdates.set(source.id, { ...(baselineUpdates.get(source.id) ?? {}), checksum: prior.checksum, retrievedAt: now.toISOString() })
        }
        prior.retrievedAt = now.toISOString()
        if (options.acceptBaselines && prior.checksum === source.checksum) {
          baselineUpdates.set(source.id, { ...(baselineUpdates.get(source.id) ?? {}), retrievedAt: now.toISOString() })
        }
        report.unaffected.push(source.id)
        continue
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const checksum = evidenceChecksum(source, registry.policy, await readBounded(response))
      const comparison = prior?.checksum ?? source.checksum
      if (comparison && comparison !== checksum && !options.acceptBaselines) report.drift.push(item(source, { from: comparison, to: checksum, baseline: prior?.checksum ? 'cache' : 'registry' }))
      else report.unaffected.push(source.id)
      if (options.acceptBaselines && source.checksum !== checksum) {
        baselineUpdates.set(source.id, { ...(baselineUpdates.get(source.id) ?? {}), checksum, retrievedAt: now.toISOString() })
      } else if (options.acceptBaselines && source.checksum === checksum) {
        // Verified byte-identical to the reviewed baseline: the content a human
        // last reviewed is provably current, so the review clock refreshes.
        // Without this, an overdue manual-review source whose page never
        // changes fail-closes every accepting run forever (no sanctioned
        // recovery — hand-editing timestamps is forbidden).
        baselineUpdates.set(source.id, { ...(baselineUpdates.get(source.id) ?? {}), retrievedAt: now.toISOString() })
      }
      cache.sources[source.id] = { retrievedAt: now.toISOString(), checksum, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'), url: response.url, detectedVersion }
    } catch (error) {
      report.unavailable.push(item(source, { error: error.message }))
    }
  }
  // Accepted baselines are written back to the registry in the same run that produced the report,
  // so the registry snapshot, cache, and drift report can never disagree (single code path).
  if (options.acceptBaselines && baselineUpdates.size) {
    for (const source of registry.sources) {
      const update = baselineUpdates.get(source.id)
      if (!update) continue
      Object.assign(source, update)
      report.acceptedBaselines.push({ id: source.id, ...update })
    }
    // A manual-review flag raised earlier in this same run is satisfied by the acceptance that
    // just refreshed the source's retrievedAt — it must not fail-close the run that fixed it.
    for (const entry of report.manualVersionReview) if (baselineUpdates.get(entry.id)?.retrievedAt) { entry.due = false; entry.ageDays = 0 }
    await atomicJson(options.registry, registry)
  }
  await atomicJson(options.cache, cache)
  await atomicJson(options.report, report)
  const failClosed = [...report.stale, ...report.unavailable, ...report.drift, ...report.versionDrift, ...report.advisories, ...report.manualVersionReview.filter(entry => entry.due)].some(entry => entry.critical || entry.integrityFailure)
  return { report, failClosed }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const options = args(process.argv.slice(2))
  const { report, failClosed } = await refreshEvidence(options)
  console.log(`refresh-evidence: selected=${report.selected.length} drift=${report.drift.length} version-drift=${report.versionDrift.length} stale=${report.stale.length} unavailable=${report.unavailable.length} advisories=${report.advisories.length}${report.reviewOverdue.length ? ` review-overdue=${report.reviewOverdue.length}` : ''}${report.acceptedBaselines.length ? ` accepted=${report.acceptedBaselines.length}` : ''}`)
  for (const overdue of report.reviewOverdue) console.error(`warning: baseline ${overdue.baseline} (${overdue.state}) passed its reviewBy ${overdue.reviewBy} — a human adoption decision is overdue`)
  for (const lag of report.pinLag ?? []) console.error(`warning: critical source ${lag.id} pin ${lag.pinned} lags current ${lag.current} — review adoption or record the deliberate hold`)
  for (const advisory of report.advisories) console.error(`advisory: ${advisory.package}@${advisory.version} — ${advisory.id}${advisory.summary ? `: ${advisory.summary}` : ''}`)
  if (failClosed) process.exitCode = 1
}
