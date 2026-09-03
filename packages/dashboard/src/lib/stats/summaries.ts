import { join } from 'node:path'

import { readOrNull } from '../read'

export interface StageTiming {
  stage: string
  leadTimeS: number | null
  cycleTimeS: number | null
}

export interface Summary {
  scope: string
  month: string
  stages: StageTiming[]
  rework: { reviewRounds: number | null; fixRounds: number | null; handbacks: number | null }
  costUsd: number | null
  runs: number | null
  /**
   * Dotted keys this document did not carry. #121 owns the summary shape and will widen it; a
   * field this reader cannot find is named here and rendered as "not in the summary" rather than
   * defaulted to zero, which would read as a measured result.
   */
  missing: string[]
}

const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function field(row: Record<string, unknown>, key: string, dotted: string, missing: string[]): number | null {
  const value = asNumber(row[key])
  if (value === null) missing.push(dotted)
  return value
}

// Read field by field, never destructured against a declared shape: a summary #121 widens keeps
// rendering, and a summary that is missing something says which thing.
export function parseSummary(scope: string, month: string, text: string): Summary {
  const empty: Summary = {
    scope, month, stages: [], rework: { reviewRounds: null, fixRounds: null, handbacks: null },
    costUsd: null, runs: null, missing: ['document'],
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return empty
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty
  const document = parsed as Record<string, unknown>
  const missing: string[] = []

  const stages: StageTiming[] = []
  if (Array.isArray(document.stages)) {
    for (const entry of document.stages) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      const stage = typeof row.stage === 'string' ? row.stage : null
      if (!stage) continue
      stages.push({ stage, leadTimeS: asNumber(row.lead_time_s), cycleTimeS: asNumber(row.cycle_time_s) })
    }
  } else missing.push('stages')

  const reworkRow = (document.rework && typeof document.rework === 'object' ? document.rework : {}) as Record<string, unknown>
  const rework = {
    reviewRounds: field(reworkRow, 'review_rounds', 'rework.review_rounds', missing),
    fixRounds: field(reworkRow, 'fix_rounds', 'rework.fix_rounds', missing),
    handbacks: field(reworkRow, 'handbacks', 'rework.handbacks', missing),
  }

  return {
    scope,
    month,
    stages,
    rework,
    costUsd: field(document, 'cost_usd', 'cost_usd', missing),
    runs: field(document, 'runs', 'runs', missing),
    missing,
  }
}

export async function readRepoSummary(controlRoom: string, repo: string, month: string): Promise<Summary | null> {
  const text = await readOrNull(join(controlRoom, 'stats', ...repo.split('/'), `${month}.summary.json`))
  return text === null ? null : parseSummary(repo, month, text)
}

export async function readOrgSummary(controlRoom: string, month: string): Promise<Summary | null> {
  const text = await readOrNull(join(controlRoom, 'stats', 'org', `${month}.summary.json`))
  return text === null ? null : parseSummary('org', month, text)
}

// The org skills rollup is a flat name → count document, so it is read as one rather than forced
// through the Summary shape; an unreadable or non-object file is null, never a half rollup.
export async function readOrgSkills(controlRoom: string, month: string): Promise<Record<string, number> | null> {
  const text = await readOrNull(join(controlRoom, 'stats', 'org', `${month}.skills.json`))
  if (text === null) return null
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const rollup: Record<string, number> = {}
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      const count = asNumber(value)
      if (count !== null) rollup[name] = count
    }
    return rollup
  } catch {
    return null
  }
}
