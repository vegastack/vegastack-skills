import type { PageContext } from '../context'
import { perSkill, type SkillRow } from '../cache/queries'

export interface SkillsView {
  rows: SkillRow[]
  /** #121's org-wide rollup for the month, or null when the clone does not carry it. */
  orgTotals: Record<string, number> | null
}

export function buildSkillsView({ context, orgSkills }: {
  context: PageContext
  orgSkills: Record<string, number> | null
}): SkillsView {
  return { rows: perSkill(context.db, context.filters), orgTotals: orgSkills }
}
