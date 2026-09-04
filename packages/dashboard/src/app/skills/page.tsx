import { FilterBar } from '@/components/filter-bar'
import { Shell } from '@/components/shell'
import { money, StatTable } from '@/components/stat-table'
import { loadContext } from '@/lib/context'
import { readOrgSkills } from '@/lib/stats/summaries'
import { buildSkillsView } from '@/lib/views/skills'

export const dynamic = 'force-dynamic'

const counts = (row: Record<string, number>): string =>
  Object.entries(row).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key} ${value}`).join(' · ') || '—'

export default async function SkillsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await loadContext(await searchParams)
  const view = buildSkillsView({ context, orgSkills: await readOrgSkills(context.env.controlRoom, context.filters.month) })

  return (
    <Shell title={`Skills — ${context.filters.month}`} freshness={context.freshness}>
      <FilterBar base="/skills" options={context.options} filters={context.filters} />
      <p className="text-muted-foreground mb-6 text-sm">
        Cost is attributed per invocation: a run that invoked two skills counts its whole cost against
        each of them, so this column sums to more than the org total.
      </p>
      <StatTable
        caption="Invocations, trigger, outcome and cost per skill"
        rows={view.rows}
        rowKey={(row) => row.name}
        empty="No skill invocations recorded for this month."
        columns={[
          { key: 'name', label: 'Skill', render: (row) => row.name },
          { key: 'invocations', label: 'Invocations', align: 'end', render: (row) => row.invocations },
          { key: 'org', label: 'Org total', align: 'end', render: (row) => view.orgTotals?.[row.name] ?? '—' },
          { key: 'triggers', label: 'Trigger', render: (row) => counts(row.triggers) },
          { key: 'outcomes', label: 'Outcome', render: (row) => counts(row.outcomes) },
          { key: 'per', label: 'Cost / invocation', align: 'end', render: (row) => money(row.costPerInvocation) },
        ]}
      />
    </Shell>
  )
}
