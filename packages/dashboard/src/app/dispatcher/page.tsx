import { OfflineBanner } from '@/components/offline-banner'
import { Shell } from '@/components/shell'
import { StatTable } from '@/components/stat-table'
import { loadContext } from '@/lib/context'
import { readStatus } from '@/lib/live/status'
import { buildDispatcherView } from '@/lib/views/dispatcher'

export const dynamic = 'force-dynamic'

export default async function DispatcherPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await loadContext(await searchParams)
  const view = buildDispatcherView({ context, status: await readStatus({ bin: context.env.bin }), now: Date.now() })

  return (
    <Shell title="Dispatcher" freshness={view.freshness}>
      <OfflineBanner freshness={view.freshness} reasons={view.reasons} />

      <dl className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Running', value: view.running ? 'yes' : 'no' },
          { label: 'PID', value: view.pid === null ? '—' : String(view.pid) },
          { label: 'Last tick', value: view.lastTick ?? '—' },
          { label: 'Interval', value: view.interval === null ? '—' : `${view.interval}s` },
        ].map((tile) => (
          <div key={tile.label} className="border-border rounded-lg border p-4">
            <dt className="text-muted-foreground text-sm">{tile.label}</dt>
            <dd className="mt-1 text-lg font-semibold">{tile.value}</dd>
          </div>
        ))}
      </dl>

      {view.repos.map((repo) => (
        <section key={repo.repo} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{repo.repo}</h2>
          <p className="text-muted-foreground mb-3 text-sm">
            dispatch {repo.dispatch || '—'} · needs-plan {repo.board.needsPlan} · ready {repo.board.ready} ·
            working {repo.board.working} · for-operator {repo.board.forOperator}
          </p>
          <StatTable
            caption={`Recent headless runs in ${repo.repo}`}
            rows={repo.runs}
            rowKey={(row) => `${row.stage}-${row.startedAt}-${row.issue ?? 'none'}`}
            empty="No runs recorded."
            columns={[
              { key: 'issue', label: 'Issue', render: (row) => (row.issue === null ? '—' : `#${row.issue}`) },
              { key: 'stage', label: 'Stage', render: (row) => row.stage },
              { key: 'started', label: 'Started', render: (row) => row.startedAt },
              { key: 'exit', label: 'Exit', align: 'end', render: (row) => (row.exitCode === null ? '—' : row.exitCode) },
              { key: 'message', label: 'Last message', render: (row) => row.lastMessage },
            ]}
          />
        </section>
      ))}
    </Shell>
  )
}
