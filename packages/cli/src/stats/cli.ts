// `vegafactory stats` — the four verbs, and the only place the pieces are wired together.
//
// `record` is what the hooks call, so it is built to be uninteresting: it reads one JSON payload on
// stdin, hands it to the parser its `--source` names, and appends. It never prints to a session, it
// never asks a question, and with the policy off it does nothing at all and says so with exit 0.
//
// `push` is dry-run by default — printing what it would copy and the commit it would make — because
// it writes to a shared repository under the operator's own credentials, and a verb that pushes
// just because it was typed is a verb people learn to fear. The automatic callers pass `--commit`.
//
// `show` and `rollup` read the control-room clone and are pure reporting. People-level views are
// gated: your own rows, or a `lead`'s. Everyone can see org totals.

import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { hostname, userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseControlRoomKnob } from '../control-room.ts'
import { ghJson } from '../gh.ts'
import { GIT_CREDENTIAL_ARGS } from '../sync.ts'
import {
  fromClaudeSessionEnd, fromCodexSessionEnd, fromSkillHook,
  type CaptureContext, type SkillHookSource,
} from './capture.ts'
import { appendRecord, appendSkillInvocations, listOutbox, takeSkillInvocations } from './outbox.ts'
import { monthToken, parseMonthToken, resolveStatsPolicy, type StatsPolicy, type StatsRecord } from './record.ts'
import { planPush, pushOutbox, statsClonePath, type GitRunner } from './push.ts'
import {
  rollupOrg, rollupRepo, rollupSkills, stableStringify,
  type OrgSummary, type RepoSummary, type SkillsSummary, type TimelineEvent,
} from './rollup.ts'
import { fetchTimelines, type GhJson } from './timeline.ts'

export type StatsSource = 'claude-session-end' | 'codex-session-end' | 'claude-post-tool' | 'claude-prompt-expansion' | 'codex-prompt'

const SOURCES: readonly StatsSource[] = [
  'claude-session-end', 'codex-session-end', 'claude-post-tool', 'claude-prompt-expansion', 'codex-prompt',
] as const

export interface StatsArgs {
  verb: 'show' | 'record' | 'push' | 'rollup'
  scope: 'repo' | 'me' | 'org' | 'skills'
  since: string | null
  json: boolean
  commit: boolean
  source: StatsSource | null
}

export function parseStatsArgs(argv: string[]): StatsArgs {
  const args: StatsArgs = { verb: 'show', scope: 'repo', since: null, json: false, commit: false, source: null }
  const rest = [...argv]
  let scopeSet = false
  const setScope = (scope: StatsArgs['scope']): void => {
    if (scopeSet && args.scope !== scope) throw new Error(`stats takes one of --repo, --me, --org or skills, not both --${args.scope} and --${scope}`)
    args.scope = scope
    scopeSet = true
  }
  if (rest[0] && !rest[0].startsWith('-')) {
    const head = rest.shift()!
    if (head === 'skills') setScope('skills')
    else if (head === 'show' || head === 'record' || head === 'push' || head === 'rollup') args.verb = head
    else throw new Error(`Unknown stats verb: ${head}`)
  }
  while (rest.length) {
    const flag = rest.shift()!
    if (flag === '--repo') setScope('repo')
    else if (flag === '--me') setScope('me')
    else if (flag === '--org') setScope('org')
    else if (flag === '--skills') setScope('skills')
    else if (flag === '--json') args.json = true
    else if (flag === '--commit') args.commit = true
    else if (flag === '--since') {
      const value = rest.shift()
      if (!value || !parseMonthToken(value)) throw new Error(`--since takes a month token in MON-YYYY form, e.g. SEP-2026 — got ${JSON.stringify(value ?? '')}`)
      args.since = value
    }
    else if (flag === '--source') {
      const value = rest.shift() as StatsSource | undefined
      if (!value || !SOURCES.includes(value)) throw new Error(`--source takes one of ${SOURCES.join(', ')} — got ${JSON.stringify(value ?? '')}`)
      args.source = value
    }
    else throw new Error(`Unknown option: ${flag}`)
  }
  return args
}

export interface StatsDeps {
  home: string
  hostname: string
  ghUser: string
  login: string
  isLead: boolean
  policy: StatsPolicy
  repo: string | null
  cloneRoot: string
  git: GitRunner
  // The one GitHub API seam: issue timelines, read by `rollup` and by nothing else.
  gh: GhJson
  readStdin: () => Promise<string>
  readTranscript: (path: string) => Promise<string[]>
  now: () => Date
  log: (line: string) => void
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map(row => (row[index] ?? '').length)))
  const line = (cells: string[]): string => cells.map((cell, index) => pad(cell, widths[index]!)).join('  ').trimEnd()
  return [line(headers), line(widths.map(width => '-'.repeat(width))), ...rows.map(line)].join('\n')
}

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

export function renderStatsTable(summary: RepoSummary | OrgSummary | SkillsSummary, scope: StatsArgs['scope']): string {
  if (scope === 'skills') {
    const skills = (summary as SkillsSummary).skills
    const rows = Object.keys(skills).sort().map(name => {
      const entry = skills[name]!
      const triggers = Object.keys(entry.by_trigger).sort().map(key => `${key} ${entry.by_trigger[key]}`).join(', ')
      const harnesses = Object.keys(entry.by_harness).sort().map(key => `${key} ${entry.by_harness[key]}`).join(', ')
      return [name, String(entry.invocations), triggers, harnesses]
    })
    return `skills — ${summary.month}\n${table(['skill', 'runs', 'trigger', 'harness'], rows)}`
  }
  const runs = summary as RepoSummary | OrgSummary
  const stages = runs.by_stage
  const rows = Object.keys(stages).sort().map(stage => {
    const stats = stages[stage]!
    const outcomes = Object.keys(stats.outcomes).sort().map(key => `${key} ${stats.outcomes[key]}`).join(', ')
    return [stage, String(stats.runs), `${Math.round(stats.duration_s / 60)}m`, String(stats.tokens), money(stats.cost_usd), outcomes]
  })
  const heading = 'repo' in runs
    ? `${runs.repo} — ${runs.month} · ${runs.runs} runs`
    : `org — ${runs.month} · ${runs.runs} runs across ${runs.repos.length} repos`
  const body = table(['stage', 'runs', 'time', 'tokens', 'cost', 'outcomes'], rows)
  if (!('repo' in runs)) return `${heading}\n${body}`
  const repo = runs
  const lead = repo.lead_time_h.p50 === null ? '—' : `${repo.lead_time_h.p50}h`
  const count = (value: number | null): string => (value === null ? '—' : String(value))
  return `${heading}\n${body}\n\nlead time p50 ${lead} · issues touched ${repo.throughput.issues_touched} · closed ${repo.throughput.issues_closed} · rework: ${count(repo.rework.review_rounds)} review, ${count(repo.rework.fix_rounds)} fix, ${count(repo.rework.handbacks)} handbacks`
}

// --- reading the control room ------------------------------------------------------------

async function monthsUnder(root: string, repoDir: string): Promise<string[]> {
  try {
    return (await readdir(join(root, 'stats', repoDir))).filter(entry => parseMonthToken(entry) !== null).sort()
  } catch {
    return []
  }
}

async function readMonth(cloneRoot: string, repoDir: string, month: string): Promise<StatsRecord[]> {
  const dir = join(cloneRoot, 'stats', repoDir, month)
  const records: StatsRecord[] = []
  let files: string[]
  try {
    files = (await readdir(dir)).sort()
  } catch {
    return records
  }
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue
    let text: string
    try {
      text = await readFile(join(dir, file), 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      try {
        records.push(JSON.parse(line) as StatsRecord)
      } catch {
        // one unreadable line never costs the month its summary
      }
    }
  }
  return records
}

async function readTimelines(cloneRoot: string, repoDir: string, month: string): Promise<TimelineEvent[]> {
  const file = join(cloneRoot, 'stats', repoDir, `${month}.timeline.json`)
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return Array.isArray(parsed) ? parsed as TimelineEvent[] : []
  } catch {
    // Lead and cycle time need issue timelines. Absent, they are reported as null rather than
    // guessed from run timestamps — a run knows nothing about how long its issue waited.
    return []
  }
}

async function repoDirs(cloneRoot: string): Promise<string[]> {
  try {
    return (await readdir(join(cloneRoot, 'stats'))).filter(entry => !entry.includes('.')).sort()
  } catch {
    return []
  }
}

function monthsInWindow(months: string[], since: string | null): string[] {
  if (!since) return months
  const from = parseMonthToken(since)
  if (!from) return months
  return months.filter(month => {
    const at = parseMonthToken(month)
    return at !== null && (at.year > from.year || (at.year === from.year && at.month >= from.month))
  })
}

// --- the verbs ---------------------------------------------------------------------------

async function runRecord(args: StatsArgs, deps: StatsDeps): Promise<number> {
  if (!deps.policy.enabled) {
    // Not an error and not a warning: the org (or this repo) turned statistics off, and a hook that
    // shouted about it every time a session ended would be its own kind of telemetry.
    return 0
  }
  if (!args.source) {
    deps.log('stats record needs --source <kind>')
    return 2
  }
  const raw = await deps.readStdin()
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    deps.log('stats record: the hook payload on stdin is not JSON — nothing was written')
    return 2
  }

  if (args.source === 'claude-post-tool' || args.source === 'claude-prompt-expansion' || args.source === 'codex-prompt') {
    const { sessionId, invocations } = fromSkillHook(payload, args.source as SkillHookSource)
    if (!sessionId || invocations.length === 0) return 0
    await appendSkillInvocations(deps.home, sessionId, invocations)
    return 0
  }

  if (!deps.repo) {
    deps.log('stats record: this working copy names no repo (no .vegastack/dev.md repo: line) — the record was not filed')
    return 1
  }
  const context: CaptureContext = { repo: deps.repo, ts: deps.now().toISOString(), human: deps.ghUser }
  const hook = payload as { session_id?: unknown; transcript_path?: unknown }
  const record = args.source === 'claude-session-end'
    ? fromClaudeSessionEnd(payload, typeof hook.transcript_path === 'string' ? await deps.readTranscript(hook.transcript_path) : [], context)
    : fromCodexSessionEnd(payload, context)
  if (record.session_id) record.skills = await takeSkillInvocations(deps.home, record.session_id)
  await appendRecord(deps.home, record, deps.hostname)
  return 0
}

async function runPush(args: StatsArgs, deps: StatsDeps): Promise<number> {
  const result = await pushOutbox({
    home: deps.home,
    cloneRoot: deps.cloneRoot,
    ghUser: deps.ghUser,
    hostname: deps.hostname,
    commit: args.commit,
    git: deps.git,
  })
  if (args.json) {
    deps.log(JSON.stringify({ guard: 'stats-push', commit: args.commit, ...result }))
  } else if (!args.commit) {
    const plan = planPush(await listOutbox(deps.home), deps.cloneRoot, { ghUser: deps.ghUser, hostname: deps.hostname })
    const lines = plan.copies.reduce((sum, copy) => sum + copy.lines, 0)
    deps.log(lines === 0
      ? 'stats push (dry run): the outbox is empty — nothing to push'
      : `stats push (dry run — pass --commit to write): ${lines} record(s) into ${plan.copies.length} file(s)\n  ${plan.copies.map(copy => `${copy.from} → ${copy.to} (+${copy.lines})`).join('\n  ')}\n  commit: ${plan.subject}`)
  } else {
    deps.log(`stats push: ${result.pushed} records, ${result.retries} rebase retries, ${result.deferred.length} deferred`)
  }
  for (const refusal of result.refusals) deps.log(refusal)
  if (result.refusals.length > 0) return 2
  return result.ok ? 0 : 1
}

interface WindowBucket { dir: string; repo: string; month: string; records: StatsRecord[]; timelines: TimelineEvent[] }

// Every (repo, month) bucket in the window. `--since SEP-2026` means "September onward", so a
// window can hold several months and several repos, and a caller that wants one repo filters here
// rather than picking the first bucket and hoping.
async function windowBuckets(deps: StatsDeps, since: string | null): Promise<WindowBucket[]> {
  const buckets: WindowBucket[] = []
  for (const dir of await repoDirs(deps.cloneRoot)) {
    for (const month of monthsInWindow(await monthsUnder(deps.cloneRoot, dir), since)) {
      const records = await readMonth(deps.cloneRoot, dir, month)
      if (records.length === 0) continue
      buckets.push({
        dir,
        repo: records[0]?.repo ?? dir,
        month,
        records,
        timelines: await readTimelines(deps.cloneRoot, dir, month),
      })
    }
  }
  return buckets
}

// The label a summary carries when the window is more than one month: a table headed "SEP-2026"
// while it totals three months would be a lie in the one place a reader looks first.
function windowLabel(buckets: WindowBucket[], fallback: string): string {
  // Chronological, never alphabetical: sorting the tokens as strings puts AUG before SEP before
  // OCT of the same year only by luck, and reads "OCT-2026…SEP-2026" the rest of the time.
  const months = [...new Set(buckets.map(bucket => bucket.month))].sort((a, b) => {
    const left = parseMonthToken(a)
    const right = parseMonthToken(b)
    if (!left || !right) return a.localeCompare(b)
    return left.year - right.year || left.month - right.month
  })
  if (months.length === 0) return fallback
  if (months.length === 1) return months[0]!
  return `${months[0]}…${months[months.length - 1]}`
}

// One summary per repo across the whole window, so `--since` totals rather than picks.
function summariesByRepo(buckets: WindowBucket[], people: boolean, fallback: string): RepoSummary[] {
  const byRepo = new Map<string, WindowBucket[]>()
  for (const bucket of buckets) byRepo.set(bucket.repo, [...(byRepo.get(bucket.repo) ?? []), bucket])
  return [...byRepo.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([repo, group]) => rollupRepo(
    group.flatMap(bucket => bucket.records),
    group.flatMap(bucket => bucket.timelines),
    { repo, month: windowLabel(group, fallback), people },
  ))
}

async function runRollup(args: StatsArgs, deps: StatsDeps): Promise<number> {
  const month = args.since ?? monthToken(deps.now())
  const written: string[] = []
  const summaries: RepoSummary[] = []
  const allRecords: StatsRecord[] = []
  const timelines: string[] = []
  const unreachable: string[] = []
  for (const dir of await repoDirs(deps.cloneRoot)) {
    const records = await readMonth(deps.cloneRoot, dir, month)
    if (records.length === 0) continue
    allRecords.push(...records)
    const repo = records[0]?.repo ?? dir
    // Lead and cycle time come from the issues' label timelines, fetched here for every issue the
    // month's records touch and written beside the summary. A fetch that fails keeps the timeline
    // file the clone already has, so a rate limit degrades to last rollup's answer, never to a
    // summary that quietly reports no lead time at all.
    const fetched = await fetchTimelines(repo, records.map(record => record.issue).filter((issue): issue is number => issue !== null), deps.gh)
    const timelineFile = join(deps.cloneRoot, 'stats', dir, `${month}.timeline.json`)
    if (fetched.ok) {
      await mkdir(dirname(timelineFile), { recursive: true })
      await writeFile(timelineFile, `${stableStringify(fetched.events)}\n`)
      written.push(timelineFile)
      timelines.push(repo)
    } else {
      unreachable.push(`${repo}: ${fetched.reason}`)
    }
    // Never a per-person block in a committed summary: the control room is readable by everyone
    // the org onboards, and people-level statistics are for the person or a lead — which `show`
    // checks per caller and a file in a shared clone cannot.
    const summary = rollupRepo(records, await readTimelines(deps.cloneRoot, dir, month), {
      repo,
      month,
      people: false,
    })
    summaries.push(summary)
    const file = join(deps.cloneRoot, 'stats', dir, `${month}.summary.json`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `${stableStringify(summary)}\n`)
    written.push(file)
  }
  const orgSummary = join(deps.cloneRoot, 'stats', 'org', `${month}.summary.json`)
  await mkdir(dirname(orgSummary), { recursive: true })
  await writeFile(orgSummary, `${stableStringify(rollupOrg(summaries, { month, people: false }))}\n`)
  written.push(orgSummary)
  const skillsSummary = join(deps.cloneRoot, 'stats', 'org', `${month}.skills.json`)
  await writeFile(skillsSummary, `${stableStringify(rollupSkills(allRecords, { month }))}\n`)
  written.push(skillsSummary)
  deps.log(args.json
    ? JSON.stringify({ guard: 'stats-rollup', month, written, timelines, unreachable })
    : `stats rollup ${month}: ${written.length} files regenerated`)
  for (const line of unreachable) {
    deps.log(`stats rollup: issue timelines for ${line} — lead and cycle time come from the last timeline file this clone holds, if any`)
  }
  return unreachable.length > 0 ? 1 : 0
}

async function runShow(args: StatsArgs, deps: StatsDeps): Promise<number> {
  const fallback = args.since ?? monthToken(deps.now())
  const subject = deps.ghUser
  if (args.scope === 'me') {
    if (subject !== deps.login && !deps.isLead) {
      deps.log(`people-level statistics are for the person they describe or a lead in people.csv — ${deps.login} may not read ${subject}'s`)
      return 2
    }
    if (!deps.policy.people && !deps.isLead) {
      deps.log('people-level statistics are off for this org (stats-people: off) — org and repo totals are available to everyone')
      return 2
    }
  }
  const buckets = await windowBuckets(deps, args.since)
  const label = windowLabel(buckets, fallback)
  // A per-person block on an org or repo summary is a people-level view of everyone at once, so it
  // is a lead's to read and nobody else's — `stats-people: on` is what lets a lead read it, not
  // what hands it to every viewer.
  const people = deps.policy.people && deps.isLead

  if (args.scope === 'skills') {
    const summary = rollupSkills(buckets.flatMap(bucket => bucket.records), { month: label })
    deps.log(args.json ? stableStringify(summary) : renderStatsTable(summary, 'skills'))
    return 0
  }
  if (args.scope === 'org') {
    const summary = rollupOrg(summariesByRepo(buckets, people, fallback), { month: label, people })
    deps.log(args.json ? stableStringify(summary) : renderStatsTable(summary, 'org'))
    return 0
  }

  // repo and me: this repo when the working copy names one, and for `--me` only the rows whose
  // `human` is the subject — a `--me` table showing the whole repo would be the wrong answer
  // delivered confidently.
  const mine = deps.repo ? buckets.filter(bucket => bucket.repo === deps.repo) : buckets
  const scoped = args.scope === 'me'
    ? mine.map(bucket => ({ ...bucket, records: bucket.records.filter(record => record.human === subject) }))
    : mine
  const records = scoped.flatMap(bucket => bucket.records)
  if (records.length === 0) {
    const what = args.scope === 'me' ? `no runs of yours (${subject})` : 'no records'
    deps.log(args.json
      ? JSON.stringify({ guard: 'stats-show', month: label, scope: args.scope, records: 0 })
      : `${what} for ${label} in ${deps.cloneRoot}`)
    return 0
  }
  const summary = rollupRepo(records, scoped.flatMap(bucket => bucket.timelines), {
    repo: args.scope === 'me' ? `${subject} · ${deps.repo ?? 'every repo'}` : (deps.repo ?? scoped[0]!.repo),
    month: label,
    people: people || args.scope === 'me',
  })
  deps.log(args.json ? stableStringify(summary) : renderStatsTable(summary, args.scope))
  return 0
}

export async function runStats(args: StatsArgs, deps: StatsDeps): Promise<number> {
  if (args.verb === 'record') return runRecord(args, deps)
  if (args.verb === 'push') return runPush(args, deps)
  if (args.verb === 'rollup') return runRollup(args, deps)
  return runShow(args, deps)
}

export function statsUsage(): string {
  return `Usage: vegafactory stats [--repo|--me|--org|skills] [--since MON-YYYY] [--json]
       vegafactory stats push [--commit] [--json]
       vegafactory stats rollup [--since MON-YYYY] [--json]   (reads issue timelines through gh)
       vegafactory stats record --source <kind>      (called by the harness hooks)

Where agent time and money went, from the org's own control room. Records are counts and
identifiers only — no prompt text, no assistant text, no tool arguments, ever.

  --repo         this repository's month (the default)
  --me           your own rows; a lead in people.csv may read another person's
  --org          every repo in the org, totalled
  skills         invocations per skill, by trigger and harness
  --since        the month to report, e.g. SEP-2026 (default: this month, UTC)

push is a dry run until --commit. Whether anything is recorded at all is org policy:
stats: / stats-people: in org.md or group.md, and a repo opt-out only under
stats-override: allowed. There is no machine-level knob.

Exit 0 done · 1 deferred (a push that will retry) · 2 a refusal.
Outbox: ~/.vegastack/stats/outbox/<owner>__<name>/<MON-YYYY>/<host>.jsonl
`
}

// --- wiring ------------------------------------------------------------------------------
//
// The effectful half: where the project is, which control room it belongs to, who is asking, and
// how git is run. Kept below the pure surface above so every branch that decides anything stays
// unit-testable, and this part stays small enough to read as configuration.

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

// Walks up from the working directory, the way every other verb finds the project.
export async function findDevMd(from: string): Promise<{ path: string; text: string } | null> {
  let dir = resolve(from)
  for (;;) {
    const candidate = join(dir, '.vegastack', 'dev.md')
    const text = await readIfPresent(candidate)
    if (text !== null) return { path: candidate, text }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function repoFromDevMd(text: string): string | null {
  const match = /^repo:\s*([^\s·#]+)/m.exec(text ?? '')
  return match?.[1] && match[1].includes('/') ? match[1] : null
}

// A `lead` in the org's people.csv may read another person's rows. The header names the columns, so
// a control room that adds one does not silently move the role into a different position.
export function isLeadIn(peopleCsv: string | null, login: string): boolean {
  if (!peopleCsv) return false
  const lines = peopleCsv.trim().split('\n')
  const header = (lines.shift() ?? '').split(',').map(cell => cell.trim().toLowerCase())
  const loginAt = header.indexOf('login')
  const roleAt = header.indexOf('role')
  if (loginAt < 0 || roleAt < 0) return false
  for (const line of lines) {
    const cells = line.split(',').map(cell => cell.trim())
    if (cells[loginAt] === login) return /\blead\b/i.test(cells[roleAt] ?? '')
  }
  return false
}

function defaultGit(): GitRunner {
  return (args, cwd) => new Promise(resolveRun => {
    const child = spawn('git', [...GIT_CREDENTIAL_ARGS, ...args], {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', error => resolveRun({ code: 1, stdout, stderr: `${stderr}${(error as Error).message}` }))
    child.on('close', code => resolveRun({ code: code ?? 1, stdout, stderr }))
  })
}

export async function buildStatsDeps(home: string, cwd: string, log: (line: string) => void): Promise<StatsDeps> {
  const project = await findDevMd(cwd)
  const devMd = project?.text ?? ''
  const knob = parseControlRoomKnob(devMd)
  const readOnlyClone = knob ? join(home, '.vegastack', 'control-room', knob.org) : null
  const orgMd = readOnlyClone ? await readIfPresent(join(readOnlyClone, 'org.md')) : null
  const groupMd = readOnlyClone && knob?.group ? await readIfPresent(join(readOnlyClone, 'groups', knob.group, 'group.md')) : null
  const peopleCsv = readOnlyClone ? await readIfPresent(join(readOnlyClone, 'people.csv')) : null
  // No network call for an identity: the operator's own login is already in dev.md's operators
  // list, and an env override exists for a machine whose account name differs.
  const ghUser = process.env.VSK_GH_USER
    || (/^operators:\s*([^\s,#]+)/m.exec(devMd)?.[1] ?? '')
    || userInfo().username
  return {
    home,
    hostname: hostname(),
    ghUser,
    login: ghUser,
    isLead: isLeadIn(peopleCsv, ghUser),
    policy: resolveStatsPolicy({ org: orgMd ?? '', group: groupMd ?? '', repo: devMd }),
    repo: repoFromDevMd(devMd),
    cloneRoot: statsClonePath(home, knob?.org ?? 'org'),
    git: defaultGit(),
    gh: args => ghJson(args),
    readStdin: async () => {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
      return Buffer.concat(chunks).toString('utf8')
    },
    readTranscript: async (path: string) => (await readIfPresent(path))?.split('\n') ?? [],
    now: () => new Date(),
    log,
  }
}

export async function runStatsCli(argv: string[], home: string): Promise<number> {
  if (argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    console.log(statsUsage())
    return 0
  }
  let args: StatsArgs
  try {
    args = parseStatsArgs(argv)
  } catch (error) {
    console.error(`error: ${(error as Error).message}`)
    return 2
  }
  const deps = await buildStatsDeps(home, process.cwd(), line => console.log(line))
  if (deps.policy.refusal) console.error(deps.policy.refusal)
  return runStats(args, deps)
}
