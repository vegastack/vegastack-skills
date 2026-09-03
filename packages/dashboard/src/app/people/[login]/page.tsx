import { FilterBar } from '@/components/filter-bar'
import { Shell } from '@/components/shell'
import { money, StatTable } from '@/components/stat-table'
import { loadContext } from '@/lib/context'
import { buildPersonView } from '@/lib/views/people'

export const dynamic = 'force-dynamic'

export default async function PersonPage({ params, searchParams }: {
  params: Promise<{ login: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { login } = await params
  const context = await loadContext(await searchParams)
  const view = buildPersonView({ context, login })

  if (!view.gate.allowed) {
    return (
      <Shell title={login} freshness={context.freshness}>
        <p className="text-muted-foreground text-sm">{view.gate.reason}</p>
      </Shell>
    )
  }

  return (
    <Shell title={`${view.person?.name ?? login} — ${context.filters.month}`} freshness={context.freshness}>
      <FilterBar base={`/people/${login}`} options={context.options} filters={context.filters} />
      <dl className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Runs', value: String(view.totals?.runs ?? 0) },
          { label: 'Cost', value: money(view.totals?.costUsd ?? 0) },
          { label: 'Human touchpoints', value: String(view.totals?.humanTouchpoints ?? 0) },
          { label: 'Role', value: view.person?.role || '—' },
        ].map((tile) => (
          <div key={tile.label} className="border-border rounded-lg border p-4">
            <dt className="text-muted-foreground text-sm">{tile.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>
      <StatTable
        caption="This person's runs per stage"
        rows={view.stages}
        rowKey={(row) => row.stage}
        empty="No runs recorded for this person this month."
        columns={[
          { key: 'stage', label: 'Stage', render: (row) => row.stage },
          { key: 'runs', label: 'Runs', align: 'end', render: (row) => row.runs },
          { key: 'cost', label: 'Cost', align: 'end', render: (row) => money(row.costUsd) },
          { key: 'human', label: 'Human touchpoints', align: 'end', render: (row) => row.humanTouchpoints },
        ]}
      />
    </Shell>
  )
}
