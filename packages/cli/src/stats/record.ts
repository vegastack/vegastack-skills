// The stats record — what one agent run or one interactive session is, as data.
//
// Counts and identifiers only. No prompt text, no assistant text, no tool arguments and no file
// contents ever enter a record: the vendors' transcripts are read for usage totals and tool-call
// counts and for nothing else. A capture path that would need text is a stop condition, not a
// design choice — which is why this file has no free-form string field at all beyond the
// identifiers the org already knows (repo, issue, stage, harness, model, human, session id).
//
// Everything here is pure. The month token is derived from a fixed English table in UTC rather
// than `toLocaleString`, so the file a machine in Bengaluru writes at 02:00 IST on 1 September
// lands in the same month bucket as the one a machine in Berlin writes at 22:30 CEST on 31 August.
// A missing field is `null`, never a guess and never a zero: "no cost reported" and "cost zero"
// are different facts, and a rollup that cannot tell them apart is a rollup nobody can trust.

export type StatsMode = 'headless' | 'interactive'
export type StatsOutcome = 'complete' | 'handback' | 'failed'
export type SkillTrigger = 'model' | 'typed' | 'mention'

export interface SkillInvocation { name: string; trigger: SkillTrigger; harness: string }

export interface StatsTokens {
  in: number | null
  out: number | null
  cache_read: number | null
  cache_write: number | null
}

export interface StatsRecord {
  ts: string
  repo: string
  issue: number | null
  parent: number | null
  stage: string | null
  harness: string | null
  model: string | null
  effort: string | null
  mode: StatsMode | null
  human: string | null
  session_id: string | null
  worktree: string | null
  duration_s: number | null
  turns: number | null
  tool_calls: number | null
  subagents: number | null
  tokens: StatsTokens
  cost_usd: number | null
  outcome: StatsOutcome | null
  review_rounds: number | null
  fix_rounds: number | null
  handbacks: number | null
  skills: SkillInvocation[]
}

// The single home of the serialized key order. `serializeRecord` builds its object field by field
// from this list, so a field added to the interface but not to this list is a type error rather
// than a line that silently changes shape halfway through a month's file.
export const RECORD_FIELDS: readonly (keyof StatsRecord)[] = [
  'ts', 'repo', 'issue', 'parent', 'stage', 'harness', 'model', 'effort', 'mode',
  'human', 'session_id', 'worktree', 'duration_s', 'turns', 'tool_calls', 'subagents',
  'tokens', 'cost_usd', 'outcome', 'review_rounds', 'fix_rounds', 'handbacks', 'skills',
] as const

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

export function monthToken(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()}`
}

export function parseMonthToken(token: string): { year: number; month: number } | null {
  const match = /^([A-Z]{3})-(\d{4})$/.exec(typeof token === 'string' ? token : '')
  if (!match) return null
  const month = MONTHS.indexOf(match[1] as (typeof MONTHS)[number])
  if (month < 0) return null
  return { year: Number(match[2]), month: month + 1 }
}

// One path segment, so `stats/<repo>/…` never nests and never collides with a month directory.
export function repoSegment(repo: string): string {
  return String(repo ?? '').replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '-')
}

const NULLABLE_FIELDS: readonly (keyof StatsRecord)[] = RECORD_FIELDS
  .filter(field => field !== 'ts' && field !== 'repo' && field !== 'tokens' && field !== 'skills')

export function normalizeRecord(partial: Partial<StatsRecord> & { repo: string; ts: string }): StatsRecord {
  const tokens = (partial.tokens ?? {}) as Partial<StatsTokens>
  const record = {
    ts: partial.ts,
    repo: partial.repo,
    tokens: {
      in: tokens.in ?? null,
      out: tokens.out ?? null,
      cache_read: tokens.cache_read ?? null,
      cache_write: tokens.cache_write ?? null,
    },
    skills: Array.isArray(partial.skills) ? partial.skills : [],
  } as StatsRecord
  for (const field of NULLABLE_FIELDS) {
    const value = (partial as Record<string, unknown>)[field]
    ;(record as unknown as Record<string, unknown>)[field] = value === undefined ? null : value
  }
  return record
}

// A record that cannot be filed is named, not written: an outbox line with no repo or no timestamp
// is a line no rollup can ever place, and silently dropping it hides the capture bug that made it.
export function recordProblems(record: StatsRecord): string[] {
  const problems: string[] = []
  if (typeof record.repo !== 'string' || record.repo === '') problems.push('repo is empty')
  if (typeof record.ts !== 'string' || !Number.isFinite(Date.parse(record.ts))) {
    problems.push(`ts is not an ISO-8601 timestamp: ${JSON.stringify(record.ts)}`)
  }
  for (const [index, skill] of (record.skills ?? []).entries()) {
    if (!skill || typeof skill.name !== 'string' || skill.name === '') problems.push(`skills[${index}] has no name`)
  }
  return problems
}

export function serializeRecord(record: StatsRecord): string {
  const ordered: Record<string, unknown> = {}
  for (const field of RECORD_FIELDS) ordered[field] = record[field]
  return JSON.stringify(ordered)
}

// --- policy ------------------------------------------------------------------------------

export interface StatsKnobs {
  stats?: 'on' | 'off'
  statsPeople?: 'on' | 'off'
  statsOverride?: 'allowed' | 'locked'
}

// Exactly three lines are read, and everything else in the document is ignored: these knobs live
// alongside prose in `org.md`, `group.md` and `dev.md`, and a parser that guessed at neighbouring
// lines would turn a sentence about statistics into a policy change.
export function parseStatsKnobs(text: string): StatsKnobs {
  const body = typeof text === 'string' ? text : ''
  const knobs: StatsKnobs = {}
  const stats = /^stats:\s*(on|off)\s*(?:#.*)?$/m.exec(body)
  if (stats) knobs.stats = stats[1] as 'on' | 'off'
  const people = /^stats-people:\s*(on|off)\s*(?:#.*)?$/m.exec(body)
  if (people) knobs.statsPeople = people[1] as 'on' | 'off'
  const override = /^stats-override:\s*(allowed|locked)\s*(?:#.*)?$/m.exec(body)
  if (override) knobs.statsOverride = override[1] as 'allowed' | 'locked'
  return knobs
}

export interface StatsPolicy {
  enabled: boolean
  people: boolean
  source: 'org' | 'group' | 'repo' | 'default'
  refusal: string | null
}

// Layered org → group → repo, nearest wins — except that a repo may only opt itself out while the
// org says `stats-override: allowed`. Under `locked` the repo line is ignored and the reason is
// carried back in `refusal`, so the person who wrote it learns why it did nothing instead of
// believing the repo is silent.
export function resolveStatsPolicy(layers: { org?: string; group?: string; repo?: string }): StatsPolicy {
  const org = parseStatsKnobs(layers.org ?? '')
  const group = parseStatsKnobs(layers.group ?? '')
  const repo = parseStatsKnobs(layers.repo ?? '')
  const override = group.statsOverride ?? org.statsOverride ?? 'allowed'

  let refusal: string | null = null
  let enabled: boolean
  let source: StatsPolicy['source']
  if (repo.stats !== undefined && override === 'allowed') {
    enabled = repo.stats === 'on'
    source = 'repo'
  } else {
    if (repo.stats !== undefined) {
      refusal = `this repo carries "stats: ${repo.stats}" but the org sets "stats-override: locked" — the repo line is ignored`
    }
    if (group.stats !== undefined) {
      enabled = group.stats === 'on'
      source = 'group'
    } else if (org.stats !== undefined) {
      enabled = org.stats === 'on'
      source = 'org'
    } else {
      enabled = true
      source = 'default'
    }
  }
  const people = group.statsPeople ?? org.statsPeople ?? 'off'
  return { enabled, people: enabled && people === 'on', source, refusal }
}
