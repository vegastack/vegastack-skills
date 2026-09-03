// The dispatcher: what a tick would do, and then doing it. Everything that decides is a pure
// function over data — a board, a set of reactions, a policy, the state file — so the whole
// decision surface is unit-testable without a network, a clock, or a running loop. The effectful
// half (searching, spawning, logging, handing back) is at the bottom and does no thinking.
//
// Refusals are first-class output, never silence: a repo that is skipped says why, in the JSON and
// in the log, because "nothing happened" and "the ship guard is unwired" look identical otherwise.
import type { Stage } from './config.ts'

export interface BoardIssue {
  number: number
  title: string
  labels: string[]
  assignees: string[]
  updatedAt: string
}

export interface PlannedRun {
  repo: string
  issue: number
  title: string
  stage: Stage
  commentId: number | null
  reactionId: number | null
}

export interface Refusal {
  repo: string
  issue: number | null
  reason: string
}

export interface TickPlan {
  runs: PlannedRun[]
  refusals: Refusal[]
}

// The state labels are exactly the ones conventions.md defines; an issue wearing two of them is a
// board in a state no skill produced, and guessing which one wins is how a plan run lands on an
// issue somebody is already implementing.
const STATE_LABELS = ['needs-operator', 'needs-plan', 'ready', 'working', 'for-operator']

// `no:assignee` is in the query and checked again here: search indexes lag, and a stale index is
// exactly how two runs start on one issue.
export function searchQueries(repo: string, since: string | null): { needsPlan: string; ready: string; corrections: string } {
  const scope = `repo:${repo} is:issue is:open`
  return {
    needsPlan: `${scope} label:needs-plan`,
    ready: `${scope} label:ready no:assignee`,
    corrections: since ? `${scope} label:for-operator updated:>=${since}` : `${scope} label:for-operator`,
  }
}

function stateLabelRefusal(repo: string, issue: BoardIssue): Refusal | null {
  const states = issue.labels.filter(label => STATE_LABELS.includes(label))
  if (states.length > 1) {
    return { repo, issue: issue.number, reason: `#${issue.number} carries two state labels (${states.join(', ')}) — the board says nothing a run could act on` }
  }
  if (issue.labels.includes('epic')) {
    return { repo, issue: issue.number, reason: `#${issue.number} is an epic — epics are maps, and only their children ever run` }
  }
  return null
}

export function planLabelRuns(input: { repo: string; needsPlan: BoardIssue[]; ready: BoardIssue[] }): TickPlan {
  const runs: PlannedRun[] = []
  const refusals: Refusal[] = []
  const consider = (issue: BoardIssue, stage: Stage): void => {
    const refusal = stateLabelRefusal(input.repo, issue)
    if (refusal) {
      refusals.push(refusal)
      return
    }
    if (issue.assignees.length > 0) {
      refusals.push({
        repo: input.repo,
        issue: issue.number,
        reason: `#${issue.number} is assigned to ${issue.assignees.join(', ')} — somebody may be mid-claim`,
      })
      return
    }
    runs.push({ repo: input.repo, issue: issue.number, title: issue.title, stage, commentId: null, reactionId: null })
  }
  for (const issue of input.needsPlan) consider(issue, 'plan')
  for (const issue of input.ready) consider(issue, 'implement')
  return { runs, refusals }
}
