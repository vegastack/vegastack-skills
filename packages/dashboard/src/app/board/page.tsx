import { OfflineBanner } from '@/components/offline-banner'
import { Shell } from '@/components/shell'
import { StatTable } from '@/components/stat-table'
import { loadContext } from '@/lib/context'
import { acrossRepos, fetchOpenIssues, fetchOpenPulls, type LiveIssue, type LivePull } from '@/lib/live/github'
import { readStatus } from '@/lib/live/status'
import { buildBoardView } from '@/lib/views/board'

export const dynamic = 'force-dynamic'

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await loadContext(await searchParams)
  const repos = context.filters.repo ? [context.filters.repo] : context.env.repos
  // The board is one org-wide column set: a repo that fails names itself in the banner, and the
  // repos that answered still fill the columns.
  const [issues, pulls, status] = await Promise.all([
    acrossRepos<LiveIssue>(repos, context.env.token, fetchOpenIssues),
    acrossRepos<LivePull>(repos, context.env.token, fetchOpenPulls),
    readStatus({ bin: context.env.bin }),
  ])
  const view = buildBoardView({
    context, issues: issues.live, pulls: pulls.live, status, now: Date.now(),
    warnings: [...issues.reasons, ...pulls.reasons],
  })

  return (
    <Shell title="Board" freshness={view.freshness}>
      <OfflineBanner freshness={view.freshness} reasons={view.reasons} />

      <section className="mb-8 grid gap-4 md:grid-cols-5">
        {view.columns.map((column) => (
          <div key={column.label} className="border-border rounded-lg border p-4">
            <h2 className="text-muted-foreground mb-3 text-sm font-medium">{column.label}</h2>
            {column.issues.length === 0
              ? <p className="text-muted-foreground text-sm">—</p>
              : (
                <ul className="space-y-2 text-sm">
                  {column.issues.map((issue) => (
                    <li key={issue.url}>
                      <a href={issue.url} className="underline-offset-4 hover:underline">#{issue.number} {issue.title}</a>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        ))}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Open pull requests</h2>
        <StatTable
          caption="Open pull requests across the passed repos"
          rows={view.pulls}
          rowKey={(row) => row.url}
          empty="No open pull requests."
          columns={[
            { key: 'number', label: 'PR', render: (row) => <a className="underline-offset-4 hover:underline" href={row.url}>#{row.number}</a> },
            { key: 'title', label: 'Title', render: (row) => row.title },
            { key: 'draft', label: 'Draft', render: (row) => (row.draft ? 'yes' : 'no') },
          ]}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Worktrees</h2>
        <StatTable
          caption="Feature worktrees the dispatcher reports"
          rows={view.worktrees}
          rowKey={(row) => row.path}
          empty="No worktrees reported."
          columns={[
            { key: 'branch', label: 'Branch', render: (row) => row.branch },
            { key: 'issue', label: 'Issue', render: (row) => (row.issue === null ? '—' : `#${row.issue}`) },
            { key: 'state', label: 'State', render: (row) => row.state },
            { key: 'path', label: 'Path', render: (row) => row.path },
          ]}
        />
      </section>
    </Shell>
  )
}
