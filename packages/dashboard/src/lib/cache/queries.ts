import type { Db } from './build'
import { whereClause, type Filters } from './filters'

export interface Totals {
  runs: number
  costUsd: number
  durationS: number
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
  handbacks: number
  reviewRounds: number
  fixRounds: number
  /** Every point at which a human had to step back in: handbacks plus review and fix rounds. */
  humanTouchpoints: number
}

// coalesce keeps a null column out of the sums: a record #121 wrote before a field existed
// contributes zero to that total instead of erasing it.
const TOTAL_SQL = `
  count(*) as runs,
  coalesce(sum(cost_usd), 0) as costUsd,
  coalesce(sum(duration_s), 0) as durationS,
  coalesce(sum(tokens_in), 0) as tokensIn,
  coalesce(sum(tokens_out), 0) as tokensOut,
  coalesce(sum(cache_read), 0) as cacheRead,
  coalesce(sum(cache_write), 0) as cacheWrite,
  coalesce(sum(handbacks), 0) as handbacks,
  coalesce(sum(review_rounds), 0) as reviewRounds,
  coalesce(sum(fix_rounds), 0) as fixRounds
`

const EMPTY: Totals = {
  runs: 0, costUsd: 0, durationS: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0,
  handbacks: 0, reviewRounds: 0, fixRounds: 0, humanTouchpoints: 0,
}

const withTouchpoints = <T extends Omit<Totals, 'humanTouchpoints'>>(row: T): T & { humanTouchpoints: number } => ({
  ...row,
  humanTouchpoints: row.handbacks + row.reviewRounds + row.fixRounds,
})

export function orgTotals(db: Db, filters: Filters): Totals {
  const { sql, values } = whereClause(filters)
  const row = db.query<Omit<Totals, 'humanTouchpoints'>>(`select ${TOTAL_SQL} from runs where ${sql}`).get(...values)
  return row ? withTouchpoints(row) : { ...EMPTY }
}

// One shape for every "totals, grouped by a column" view: repo, stage, person. The column names
// are literals in this module, never anything a request carried.
function grouped<K extends string>(db: Db, filters: Filters, key: K, column: string): Array<Record<K, string> & Totals> {
  const { sql, values } = whereClause(filters)
  const rows = db.query<Record<K, string> & Omit<Totals, 'humanTouchpoints'>>(
    `select ${column} as ${key}, ${TOTAL_SQL} from runs where ${sql} and ${column} is not null group by ${column} order by ${column}`,
  ).all(...values)
  return rows.map(withTouchpoints)
}

export const perRepo = (db: Db, filters: Filters): Array<{ repo: string } & Totals> =>
  grouped(db, filters, 'repo', 'repo')

export const perStage = (db: Db, filters: Filters): Array<{ stage: string } & Totals> =>
  grouped(db, filters, 'stage', 'stage')

export const perPerson = (db: Db, filters: Filters): Array<{ human: string } & Totals> =>
  grouped(db, filters, 'human', 'human')

export interface SkillRow {
  name: string
  invocations: number
  triggers: Record<string, number>
  outcomes: Record<string, number>
  costUsd: number
  costPerInvocation: number
}

// Cost is attributed per invocation, not per run: a run that invoked two skills contributes its
// whole cost to each of them, so a column of skill costs sums to more than the org total. That
// is the reading the view wants — "what does this skill cost when it runs" — and the org total
// stays the one place a spend figure is authoritative.
export function perSkill(db: Db, filters: Filters): SkillRow[] {
  // The filter is the run's: the harness that executed the run, as every other aggregate reads it.
  const { sql, values } = whereClause(filters, 'r')
  const rows = db.query<{ name: string; trigger: string | null; outcome: string | null; costUsd: number }>(
    `select s.name as name, s.trigger as trigger, r.outcome as outcome, coalesce(r.cost_usd, 0) as costUsd
     from skill_invocations s join runs r on r.id = s.run_id
     where ${sql}`,
  ).all(...values)

  const byName = new Map<string, SkillRow>()
  for (const row of rows) {
    const entry = byName.get(row.name) ?? {
      name: row.name, invocations: 0, triggers: {}, outcomes: {}, costUsd: 0, costPerInvocation: 0,
    }
    entry.invocations += 1
    entry.costUsd += row.costUsd
    if (row.trigger) entry.triggers[row.trigger] = (entry.triggers[row.trigger] ?? 0) + 1
    if (row.outcome) entry.outcomes[row.outcome] = (entry.outcomes[row.outcome] ?? 0) + 1
    byName.set(row.name, entry)
  }
  return [...byName.values()]
    .map((row) => ({ ...row, costPerInvocation: row.invocations === 0 ? 0 : row.costUsd / row.invocations }))
    .sort((a, b) => b.invocations - a.invocations || a.name.localeCompare(b.name))
}

export function perIssue(db: Db, filters: Filters): Array<{ issue: number; repo: string } & Totals> {
  const { sql, values } = whereClause(filters)
  const rows = db.query<{ issue: number; repo: string } & Omit<Totals, 'humanTouchpoints'>>(
    `select issue, repo, ${TOTAL_SQL} from runs where ${sql} and issue is not null group by repo, issue order by repo, issue`,
  ).all(...values)
  return rows.map(withTouchpoints)
}

// The person page's stage breakdown. It is its own query rather than a Filters field because
// `human` is not a filter the bar offers — it is the subject of one page, gated by canViewPerson.
export function perStageForPerson(db: Db, filters: Filters, human: string): Array<{ stage: string } & Totals> {
  const { sql, values } = whereClause(filters)
  const rows = db.query<{ stage: string } & Omit<Totals, 'humanTouchpoints'>>(
    `select stage, ${TOTAL_SQL} from runs where ${sql} and human = ? and stage is not null group by stage order by stage`,
  ).all(...values, human)
  return rows.map(withTouchpoints)
}
