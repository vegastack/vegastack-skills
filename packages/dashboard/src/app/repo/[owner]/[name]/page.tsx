import { FilterBar } from '@/components/filter-bar'
import { Shell } from '@/components/shell'
import { hours, money, StatTable } from '@/components/stat-table'
import { loadContext } from '@/lib/context'
import { readRepoSummary } from '@/lib/stats/summaries'
import { buildRepoView } from '@/lib/views/repo'

export const dynamic = 'force-dynamic'

export default async function RepoPage({ params, searchParams }: {
  params: Promise<{ owner: string; name: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { owner, name } = await params
  const repo = `${owner}/${name}`
  const context = await loadContext(await searchParams)
  const view = buildRepoView({ context, repo, summary: await readRepoSummary(context.env.controlRoom, repo, context.filters.month) })

  return (
    <Shell title={`${repo} — ${view.month}`} freshness={context.freshness}>
      <FilterBar base={`/repo/${repo}`} options={context.options} filters={context.filters} />

      {view.missing.length > 0 && (
        <p className="text-muted-foreground mb-6 text-sm">
          Not in the rollup for this month: {view.missing.join(', ')}.
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Stages</h2>
        <StatTable
          caption="Lead and cycle time from the rollup, runs and cost from the cache"
          rows={view.stages}
          rowKey={(row) => row.stage}
          empty="No stages recorded for this month."
          columns={[
            { key: 'stage', label: 'Stage', render: (row) => row.stage },
            { key: 'lead', label: 'Lead time', align: 'end', render: (row) => hours(row.leadTimeS) },
            { key: 'cycle', label: 'Cycle time', align: 'end', render: (row) => hours(row.cycleTimeS) },
            { key: 'runs', label: 'Runs', align: 'end', render: (row) => row.runs },
            { key: 'cost', label: 'Cost', align: 'end', render: (row) => money(row.costUsd) },
          ]}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Issues</h2>
        <StatTable
          caption="Cost and rework per issue"
          rows={view.issues}
          rowKey={(row) => String(row.issue)}
          empty="No issues recorded for this month."
          columns={[
            { key: 'issue', label: 'Issue', render: (row) => `#${row.issue}` },
            { key: 'cost', label: 'Cost', align: 'end', render: (row) => money(row.costUsd) },
            { key: 'review', label: 'Review rounds', align: 'end', render: (row) => row.reviewRounds },
            { key: 'fix', label: 'Fix rounds', align: 'end', render: (row) => row.fixRounds },
            { key: 'handbacks', label: 'Handbacks', align: 'end', render: (row) => row.handbacks },
          ]}
        />
      </section>
    </Shell>
  )
}
