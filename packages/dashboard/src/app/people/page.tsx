import Link from 'next/link'

import { FilterBar } from '@/components/filter-bar'
import { Shell } from '@/components/shell'
import { money, StatTable } from '@/components/stat-table'
import { loadContext } from '@/lib/context'
import { buildPeopleView } from '@/lib/views/people'

export const dynamic = 'force-dynamic'

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await loadContext(await searchParams)
  const view = buildPeopleView({ context })

  return (
    <Shell title={`People — ${context.filters.month}`} freshness={context.freshness}>
      <FilterBar base="/people" options={context.options} filters={context.filters} />
      {view.gated && (
        <p className="text-muted-foreground mb-6 text-sm">
          People-level stats are visible to the person themselves and to a lead, while the org&rsquo;s
          <code className="mx-1">stats-people</code> knob is on. You are seeing your own row.
        </p>
      )}
      <StatTable
        caption="Runs, cost and human touchpoints per person"
        rows={view.rows}
        rowKey={(row) => row.login}
        empty="No runs are attributed to anyone you can see this month."
        columns={[
          { key: 'login', label: 'Person', render: (row) => <Link className="underline-offset-4 hover:underline" href={`/people/${row.login}`}>{row.name}</Link> },
          { key: 'role', label: 'Role', render: (row) => row.role || '—' },
          { key: 'runs', label: 'Runs', align: 'end', render: (row) => row.runs },
          { key: 'cost', label: 'Cost', align: 'end', render: (row) => money(row.costUsd) },
          { key: 'human', label: 'Human touchpoints', align: 'end', render: (row) => row.humanTouchpoints },
        ]}
      />
    </Shell>
  )
}
