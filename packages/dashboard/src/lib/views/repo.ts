import type { PageContext } from '../context'
import { perIssue, perStage, type Totals } from '../cache/queries'
import type { StageTiming, Summary } from '../stats/summaries'

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
  stages: Array<StageTiming & Totals>
  issues: RepoIssueRow[]
  rework: Summary['rework']
  missing: string[]
}

const EMPTY_REWORK: Summary['rework'] = { reviewRounds: null, fixRounds: null, handbacks: null }

// Two sources, kept apart on purpose. Lead and cycle time are durations only #121's rollup can
// compute, so they come from the summary and stay null when it does not carry them — never
// approximated from run counts. Cost and rework counts come from the cache, which holds the runs
// themselves. `missing` names whichever half was unavailable.
export function buildRepoView({ context, repo, summary }: {
  context: PageContext
  repo: string
  summary: Summary | null
}): RepoView {
  const filters = { ...context.filters, repo, repos: [repo] }
  const stageTotals = perStage(context.db, filters)
  const timings = new Map((summary?.stages ?? []).map((stage) => [stage.stage, stage]))

  const stages = stageTotals.map((row) => {
    const timing = timings.get(row.stage)
    return { ...row, leadTimeS: timing?.leadTimeS ?? null, cycleTimeS: timing?.cycleTimeS ?? null }
  })
  // A stage the summary times but the cache has no runs for still belongs on the page: it is a
  // stage that ran in a month whose records this machine has not synced.
  for (const timing of timings.values()) {
    if (stages.some((stage) => stage.stage === timing.stage)) continue
    stages.push({
      stage: timing.stage, leadTimeS: timing.leadTimeS, cycleTimeS: timing.cycleTimeS,
      runs: 0, costUsd: 0, durationS: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0,
      handbacks: 0, reviewRounds: 0, fixRounds: 0, humanTouchpoints: 0,
    })
  }

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
    issues: rows.map((row) => ({
      issue: row.issue, costUsd: row.costUsd, reviewRounds: row.reviewRounds,
      fixRounds: row.fixRounds, handbacks: row.handbacks,
    })),
    rework: summary?.rework ?? EMPTY_REWORK,
    missing: summary ? summary.missing : ['summary'],
  }
}
