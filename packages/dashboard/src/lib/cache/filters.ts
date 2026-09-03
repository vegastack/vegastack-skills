import { compareMonths, monthToken } from '../stats/month'
import type { Db } from './build'

export interface Filters {
  month: string
  repo: string | null
  group: string | null
  harness: string | null
  model: string | null
  /**
   * The concrete repo scope the month/repo/group choice resolves to, empty when the choice puts
   * no bound on repo at all. Resolving it here is what lets every aggregate keep the `(db, f)`
   * signature the views call: a query never needs repos.md again.
   */
  repos: string[]
}

export interface FilterOptions {
  months: string[]
  repos: string[]
  groups: string[]
  harnesses: string[]
  models: string[]
}

const column = (db: Db, name: string): string[] =>
  db.query<{ value: string | null }>(`select distinct ${name} as value from runs where ${name} is not null`)
    .all()
    .map((row) => row.value)
    .filter((value): value is string => value !== null)

// Every option comes out of the cache, so the filter bar can only ever offer values that exist.
// Groups are the groups of the repos the cache actually holds, not every group repos.md names —
// a group with no runs this month is a dead control that answers nothing.
export function filterOptions(db: Db, repoGroups: Record<string, string>): FilterOptions {
  const repos = column(db, 'repo').sort()
  const groups = [...new Set(repos.map((repo) => repoGroups[repo]).filter((g): g is string => Boolean(g)))].sort()
  return {
    months: column(db, 'month').sort(compareMonths).reverse(),
    repos,
    groups,
    harnesses: column(db, 'harness').sort(),
    models: column(db, 'model').sort(),
  }
}

const pick = (value: string | undefined, allowed: string[]): string | null =>
  value !== undefined && allowed.includes(value) ? value : null

// A value the option list does not contain falls back to null and never reaches SQL. That is the
// injection story for the whole data layer: the queries bind parameters as well, but a filter
// that cannot hold an arbitrary string cannot carry one into a query in the first place.
export function parseFilters(
  params: Record<string, string | undefined>,
  options: FilterOptions,
  repoGroups: Record<string, string>,
): Filters {
  const group = pick(params.group, options.groups)
  const inGroup = group
    ? Object.entries(repoGroups).filter(([, value]) => value === group).map(([repo]) => repo)
    : null
  let repo = pick(params.repo, options.repos)
  // A repo outside the chosen group is dropped rather than intersected to nothing: the two
  // controls are read as "this group, and within it this repo", so the narrower one loses when
  // they disagree, and the page stays on a row the reader can see.
  if (repo && inGroup && !inGroup.includes(repo)) repo = null
  const repos = repo ? [repo] : (inGroup ?? [])
  return {
    month: pick(params.month, options.months) ?? options.months[0] ?? monthToken(new Date()),
    repo,
    group,
    harness: pick(params.harness, options.harnesses),
    model: pick(params.model, options.models),
    repos,
  }
}

// The WHERE fragment and its bound values, shared by every aggregate. The repo scope is the
// resolved list parseFilters computed; a chosen group holding no repo in the cache yields a
// clause no row satisfies, which is the honest answer rather than a silently unfiltered page.
export function whereClause(filters: Filters): { sql: string; values: unknown[] } {
  const clauses = ['month = ?']
  const values: unknown[] = [filters.month]
  if (filters.group && filters.repos.length === 0) clauses.push('1 = 0')
  else if (filters.repos.length > 0) {
    clauses.push(`repo in (${filters.repos.map(() => '?').join(', ')})`)
    values.push(...filters.repos)
  }
  if (filters.harness) {
    clauses.push('harness = ?')
    values.push(filters.harness)
  }
  if (filters.model) {
    clauses.push('model = ?')
    values.push(filters.model)
  }
  return { sql: clauses.join(' and '), values }
}
