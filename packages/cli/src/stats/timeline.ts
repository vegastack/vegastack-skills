// Issue timelines — the one place the statistics touch the GitHub API, and only at rollup.
//
// A run knows how long it took; it does not know how long its issue waited in `ready`, sat in
// `working`, or took from creation to close. Those spans live in the issue's label timeline, so
// the rollup reads them once per issue touched in the month and writes the events beside the
// summary as `<MON-YYYY>.timeline.json` — regenerated, never appended, like the summaries.
//
// The read fails closed as a whole: a month whose timelines cannot be fetched keeps whatever
// timeline file it already had and reports lead and cycle time from that, and the rollup says
// why. It never writes a partial file, which would make one month's lead time a lie about a
// subset of its issues.

import type { TimelineEvent } from './rollup.ts'

export type GhJson = (args: string[]) => Promise<unknown>

const KEPT = new Set(['labeled', 'unlabeled', 'closed', 'reopened'])

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

// The issue's own `created_at` is the `created` event; the timeline endpoint carries the rest.
// Every other event kind (comments, renames, references) is dropped here so the file holds only
// what `rollupRepo` reads.
export function timelineFromApi(issue: number, issueDoc: unknown, events: unknown): TimelineEvent[] {
  const out: TimelineEvent[] = []
  const created = asObject(issueDoc).created_at
  if (typeof created === 'string') out.push({ issue, event: 'created', label: null, created_at: created })
  for (const raw of Array.isArray(events) ? events : []) {
    const event = asObject(raw)
    const kind = typeof event.event === 'string' ? event.event : ''
    const at = typeof event.created_at === 'string' ? event.created_at : null
    if (!KEPT.has(kind) || at === null) continue
    const label = asObject(event.label).name
    out.push({ issue, event: kind, label: typeof label === 'string' ? label : null, created_at: at })
  }
  // Stable on time alone: two events at one instant keep the API's order, which is the order
  // GitHub recorded them in.
  return out.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

export type TimelineFetch = { ok: true; events: TimelineEvent[] } | { ok: false; reason: string }

export async function fetchTimelines(repo: string, issues: number[], gh: GhJson): Promise<TimelineFetch> {
  const events: TimelineEvent[] = []
  for (const issue of [...new Set(issues)].sort((a, b) => a - b)) {
    try {
      const doc = await gh(['api', `repos/${repo}/issues/${issue}`])
      const timeline = await gh(['api', `repos/${repo}/issues/${issue}/timeline`, '--paginate'])
      events.push(...timelineFromApi(issue, doc, timeline))
    } catch (error) {
      return { ok: false, reason: (error as Error).message }
    }
  }
  return { ok: true, events }
}
