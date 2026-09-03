import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openCache, refreshCache, type Db } from '../../src/lib/cache/build'

// The two-repo, two-month control room every view test reads. Two September runs in
// vegastack/vegafactory (one per person, one per harness) and one August run in vegastack/site,
// so a month, group, harness or person filter each has something to exclude.
export const groups: Record<string, string> = {
  'vegastack/vegafactory': 'dev',
  'vegastack/site': 'design',
}

const record = (fields: Record<string, unknown>) => JSON.stringify({
  stage: 'implement',
  outcome: 'for-operator',
  review_rounds: 1,
  fix_rounds: 0,
  handbacks: 1,
  harness: 'claude',
  model: 'fable-5-1',
  duration_s: 600,
  tokens: { in: 1000, out: 200, cache_read: 50, cache_write: 10 },
  ...fields,
})

export async function fixtureRoom(): Promise<{ root: string; db: Db; groups: Record<string, string> }> {
  const root = await mkdtemp(join(tmpdir(), 'vf-fixture-'))
  const september = join(root, 'stats', 'vegastack', 'vegafactory', 'SEP-2026')
  const august = join(root, 'stats', 'vegastack', 'site', 'AUG-2026')
  await mkdir(september, { recursive: true })
  await mkdir(august, { recursive: true })

  await writeFile(join(september, 'mini.jsonl'), [
    record({
      ts: '2026-09-02T10:00:00.000Z', repo: 'vegastack/vegafactory', issue: 122, human: 'kmanojkumar',
      cost_usd: 0.4, skills: [{ name: 'dev-plan', trigger: 'model', harness: 'claude' }],
    }),
    record({
      ts: '2026-09-02T12:00:00.000Z', repo: 'vegastack/vegafactory', issue: 121, human: 'dev1',
      harness: 'codex', model: 'gpt-5.6', cost_usd: 0.6, skills: [],
    }),
  ].join('\n') + '\n')

  await writeFile(join(august, 'mini.jsonl'), `${record({
    ts: '2026-08-14T09:00:00.000Z', repo: 'vegastack/site', issue: 7, human: 'dev1', cost_usd: 9, skills: [],
  })}\n`)

  const db = await openCache(join(root, 'stats.db'))
  await refreshCache(db, root)
  return { root, db, groups }
}
