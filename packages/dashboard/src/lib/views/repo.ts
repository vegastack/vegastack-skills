import type { PageContext } from '../context'
import { perIssue, perStage, type Totals } from '../cache/queries'
import type { Pct, Summary } from '../stats/summaries'

export interface RepoIssueRow {
  issue: number
  costUsd: number
  reviewRounds: number
  fixRounds: number
  handbacks: number
}

export interface RepoView {
  repo: string
  month: string
  totals: Totals
  stages: Array<{ stage: string } & Totals>
  /** Repo-wide hours from issue creation to close, from the rollup. */
  leadTimeH: Pct
  /** Hours issues sat in each workflow state label, from the rollup, sorted by label. */
  cycleTimeH: Array<{ label: string } & Pct>
  issues: RepoIssueRow[]
  rework: Summary['rework']
  missing: string[]
}

const EMPTY_REWORK: Summary['rework'] = { reviewRounds: null, fixRounds: null, handbacks: null }
const EMPTY_PCT: Pct = { p50: null, p90: null }

// Two sources, kept apart on purpose. Lead and cycle time are durations only #121's rollup can
// compute — one lead time for the repo, one cycle time per state label — so they come from the
// summary and stay null when it does not carry them, never approximated from run counts. Runs,
// cost and rework per issue come from the cache, which holds the runs themselves. `missing` names
// whichever half was unavailable.
export function buildRepoView({ context, repo, summary }: {
  context: PageContext
  repo: string
  summary: Summary | null
}): RepoView {
  const filters = { ...context.filters, repo, repos: [repo] }
  const stages = perStage(context.db, filters)

  const rows = perIssue(context.db, filters)
  const totals = rows.reduce<Totals>((sum, row) => ({
    runs: sum.runs + row.runs,
    costUsd: sum.costUsd + row.costUsd,
    durationS: sum.durationS + row.durationS,
    tokensIn: sum.tokensIn + row.tokensIn,
    tokensOut: sum.tokensOut + row.tokensOut,
    cacheRead: sum.cacheRead + row.cacheRead,
    cacheWrite: sum.cacheWrite + row.cacheWrite,
    handbacks: sum.handbacks + row.handbacks,
    reviewRounds: sum.reviewRounds + row.reviewRounds,
    fixRounds: sum.fixRounds + row.fixRounds,
    humanTouchpoints: sum.humanTouchpoints + row.humanTouchpoints,
  }), {
    runs: 0, costUsd: 0, durationS: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0,
    handbacks: 0, reviewRounds: 0, fixRounds: 0, humanTouchpoints: 0,
  })

  return {
    repo,
    month: context.filters.month,
    totals,
    stages: stages.sort((a, b) => a.stage.localeCompare(b.stage)),
    leadTimeH: summary?.leadTimeH ?? EMPTY_PCT,
    cycleTimeH: Object.entries(summary?.cycleTimeH ?? {})
      .map(([label, pct]) => ({ label, ...pct }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    issues: rows.map((row) => ({
      issue: row.issue, costUsd: row.costUsd, reviewRounds: row.reviewRounds,
      fixRounds: row.fixRounds, handbacks: row.handbacks,
    })),
    rework: summary?.rework ?? EMPTY_REWORK,
    missing: summary ? summary.missing : ['summary'],
  }
}
