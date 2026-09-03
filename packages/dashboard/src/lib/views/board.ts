import type { PageContext } from '../context'
import { freshnessAt, type Freshness } from '../freshness'
import type { Live, LiveIssue, LivePull } from '../live/github'
import type { StatusReport, StatusWorktree } from '../live/status'

// The five workflow states, in the order work moves through them. They are the labels the
// conventions define, and the board is a projection of those labels — never a second state store.
export const STATES = ['needs-operator', 'needs-plan', 'ready', 'working', 'for-operator'] as const

export interface BoardView {
  columns: Array<{ label: string; issues: LiveIssue[] }>
  pulls: LivePull[]
  worktrees: StatusWorktree[]
  freshness: Freshness
  reasons: string[]
}

// Every live source contributes independently: GitHub down still leaves the worktree list the
// local dispatcher reported, and the columns render empty rather than the page erroring. What a
// reader must never get is an empty column that looks like a fact — hence the reasons list and
// the offline flag, which the banner renders above the board.
export function buildBoardView({ context, issues, pulls, status, now }: {
  context: PageContext
  issues: Live<LiveIssue[]>
  pulls: Live<LivePull[]>
  status: Live<StatusReport>
  now: number
}): BoardView {
  const reasons: string[] = []
  if (!issues.ok) reasons.push(issues.reason)
  if (!pulls.ok) reasons.push(pulls.reason)
  if (!status.ok) reasons.push(status.reason)

  const rows = issues.ok ? issues.data : []
  return {
    columns: STATES.map((label) => ({
      label,
      issues: rows.filter((issue) => issue.labels.includes(label)).sort((a, b) => a.number - b.number),
    })),
    pulls: pulls.ok ? pulls.data : [],
    worktrees: status.ok ? status.data.repos.flatMap((repo) => repo.worktrees) : [],
    freshness: freshnessAt({ syncedAt: context.freshness.syncedAt, now, liveOk: reasons.length === 0 }),
    reasons,
  }
}
