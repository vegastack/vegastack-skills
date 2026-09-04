import Link from 'next/link'

import { FilterBar } from '@/components/filter-bar'
import { Shell } from '@/components/shell'
import { money, ratio, StatTable } from '@/components/stat-table'
import { loadContext } from '@/lib/context'
import { readOrgSummary } from '@/lib/stats/summaries'
import { buildOrgView } from '@/lib/views/org'

export const dynamic = 'force-dynamic'

export default async function OrgPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await loadContext(await searchParams)
  const view = buildOrgView({ context, summary: await readOrgSummary(context.env.controlRoom, context.filters.month) })

  return (
    <Shell title={`Org — ${view.month}`} freshness={context.freshness}>
      <FilterBar base="/" options={context.options} filters={context.filters} />

      <dl className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Runs', value: String(view.totals.runs) },
          { label: 'Cost', value: money(view.totals.costUsd) },
          { label: 'Human touchpoints', value: String(view.totals.humanTouchpoints) },
          { label: 'Per run', value: ratio(view.humanShare) },
        ].map((tile) => (
          <div key={tile.label} className="border-border rounded-lg border p-4">
            <dt className="text-muted-foreground text-sm">{tile.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Repos</h2>
        <StatTable
          caption="Runs, cost and human touchpoints per repo"
          rows={view.repos}
          rowKey={(row) => row.repo}
          empty="No runs recorded for this month."
          columns={[
            { key: 'repo', label: 'Repo', render: (row) => <Link className="underline-offset-4 hover:underline" href={`/repo/${row.repo}`}>{row.repo}</Link> },
            { key: 'group', label: 'Group', render: (row) => row.group ?? '—' },
            { key: 'runs', label: 'Runs', align: 'end', render: (row) => row.runs },
            { key: 'cost', label: 'Cost', align: 'end', render: (row) => money(row.costUsd) },
            { key: 'human', label: 'Human touchpoints', align: 'end', render: (row) => row.humanTouchpoints },
          ]}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Stages</h2>
        <StatTable
          caption="Runs and cost per workflow stage"
          rows={view.stages}
          rowKey={(row) => row.stage}
          empty="No stages recorded for this month."
          columns={[
            { key: 'stage', label: 'Stage', render: (row) => row.stage },
            { key: 'runs', label: 'Runs', align: 'end', render: (row) => row.runs },
            { key: 'cost', label: 'Cost', align: 'end', render: (row) => money(row.costUsd) },
            { key: 'human', label: 'Human touchpoints', align: 'end', render: (row) => row.humanTouchpoints },
          ]}
        />
      </section>
    </Shell>
  )
}
