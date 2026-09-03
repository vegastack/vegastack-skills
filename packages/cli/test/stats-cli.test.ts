import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeRecord } from '../src/stats/record.ts'
import { appendRecord, listOutbox } from '../src/stats/outbox.ts'
import { parseStatsArgs, runStats, type StatsDeps } from '../src/stats/cli.ts'

const policy = { enabled: true, people: true, source: 'org' as const, refusal: null }
const deps = async (): Promise<{ lines: string[]; deps: StatsDeps }> => {
  const lines: string[] = []
  return {
    lines,
    deps: {
      home: await mkdtemp(join(tmpdir(), 'vsk-cli-')), cloneRoot: await mkdtemp(join(tmpdir(), 'vsk-cli-clone-')),
      hostname: 'mini', ghUser: 'kmanojkumar', login: 'kmanojkumar', isLead: false, policy,
      repo: 'vegastack/vegafactory',
      git: async () => ({ code: 0, stdout: '', stderr: '' }), readStdin: async () => '{}',
      readTranscript: async () => [],
      now: () => new Date('2026-09-03T10:00:00.000Z'), log: (line: string) => { lines.push(line) },
    },
  }
}

describe('parseStatsArgs', () => {
  test('defaults to showing this repo', () => {
    expect(parseStatsArgs([])).toMatchObject({ verb: 'show', scope: 'repo', since: null, json: false, commit: false })
  })
  test('reads the scope flags, the month window, and the record source', () => {
    expect(parseStatsArgs(['--org', '--since', 'SEP-2026', '--json'])).toMatchObject({ scope: 'org', since: 'SEP-2026', json: true })
    expect(parseStatsArgs(['skills'])).toMatchObject({ verb: 'show', scope: 'skills' })
    expect(parseStatsArgs(['record', '--source', 'claude-session-end'])).toMatchObject({ verb: 'record', source: 'claude-session-end' })
    expect(parseStatsArgs(['push', '--commit'])).toMatchObject({ verb: 'push', commit: true })
  })
  test('rejects a malformed month and an unknown source', () => {
    expect(() => parseStatsArgs(['--since', 'Sept-26'])).toThrow(/MON-YYYY/)
    expect(() => parseStatsArgs(['record', '--source', 'hermes'])).toThrow(/--source/)
  })
  test('two scopes at once is an error naming the conflict', () => {
    expect(() => parseStatsArgs(['--repo', '--org'])).toThrow(/one of/i)
  })
})

test('stats record with the policy off writes nothing and exits 0', async () => {
  const { deps: base } = await deps()
  const code = await runStats(parseStatsArgs(['record', '--source', 'codex-session-end']), {
    ...base, policy: { enabled: false, people: false, source: 'org', refusal: null },
    readStdin: async () => JSON.stringify({ session_id: 'sess-x', cwd: '/repo' }),
  })
  expect(code).toBe(0)
  expect(await listOutbox(base.home)).toEqual([])
})

test('stats record files one record per interactive session end', async () => {
  const { deps: base } = await deps()
  const code = await runStats(parseStatsArgs(['record', '--source', 'codex-session-end']), {
    ...base, readStdin: async () => JSON.stringify({ session_id: 'sess-y', cwd: '/repo/.vegastack/.worktrees/121-statistics' }),
  })
  expect(code).toBe(0)
  const batches = await listOutbox(base.home)
  expect(batches).toHaveLength(1)
  expect(batches[0]!.records[0]).toMatchObject({ session_id: 'sess-y', mode: 'interactive', harness: 'codex', issue: 121 })
})

test('a skill hook accumulates into the session sidecar, not the outbox', async () => {
  const { deps: base } = await deps()
  const code = await runStats(parseStatsArgs(['record', '--source', 'claude-post-tool']), {
    ...base, readStdin: async () => JSON.stringify({ session_id: 'sess-z', tool_name: 'Skill', tool_input: { skill: 'dev-architect' } }),
  })
  expect(code).toBe(0)
  expect(await listOutbox(base.home)).toEqual([])
})

test('a non-lead asking for another person is refused with the reason and exit 2', async () => {
  const { lines, deps: base } = await deps()
  const code = await runStats({ ...parseStatsArgs(['--me']), scope: 'me' }, { ...base, login: 'someone-else', isLead: false })
  expect(code).toBe(2)
  expect(lines.join('\n')).toContain('people-level statistics')
})

test('unparseable hook input is a refusal, never a partial record', async () => {
  const { deps: base } = await deps()
  const code = await runStats(parseStatsArgs(['record', '--source', 'claude-session-end']), { ...base, readStdin: async () => 'not json' })
  expect(code).toBe(2)
  expect(await listOutbox(base.home)).toEqual([])
})

test('push is a dry run until --commit', async () => {
  const { lines, deps: base } = await deps()
  const calls: string[][] = []
  const code = await runStats(parseStatsArgs(['push']), { ...base, git: async (args) => { calls.push(args); return { code: 0, stdout: '', stderr: '' } } })
  expect(code).toBe(0)
  expect(calls).toEqual([])
  expect(lines.join('\n')).toContain('dry run')
})

// --- reading the control room ------------------------------------------------------------

const seed = async (cloneRoot: string, month: string, lines: object[]) => {
  const dir = join(cloneRoot, 'stats/vegastack__vegafactory', month)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'mini.jsonl'), lines.map((line) => JSON.stringify(line)).join('\n') + '\n')
}
const row = (over: Record<string, unknown>) => normalizeRecord({
  repo: 'vegastack/vegafactory', ts: '2026-09-03T10:00:00.000Z', issue: 121, stage: 'implement',
  harness: 'claude', model: 'fable-5.1', outcome: 'complete', duration_s: 60, cost_usd: 1,
  human: 'kmanojkumar', tokens: { in: 10, out: 5, cache_read: 0, cache_write: 0 }, ...over,
})

test('--me shows only the subject\'s own runs, not the whole repo', async () => {
  const { lines, deps: base } = await deps()
  await seed(base.cloneRoot, 'SEP-2026', [row({}), row({ human: 'someone-else', issue: 999, cost_usd: 50 })])
  const code = await runStats(parseStatsArgs(['--me', '--json']), base)
  expect(code).toBe(0)
  const summary = JSON.parse(lines.join(''))
  expect(summary.runs).toBe(1)
  expect(summary.by_stage.implement.cost_usd).toBe(1)
})

test('--since totals every month in the window rather than printing one of them', async () => {
  const { lines, deps: base } = await deps()
  await seed(base.cloneRoot, 'SEP-2026', [row({})])
  await seed(base.cloneRoot, 'OCT-2026', [row({ ts: '2026-10-01T00:00:00.000Z' })])
  await seed(base.cloneRoot, 'AUG-2026', [row({ ts: '2026-08-01T00:00:00.000Z' })])
  const code = await runStats(parseStatsArgs(['--repo', '--since', 'SEP-2026', '--json']), base)
  expect(code).toBe(0)
  const summary = JSON.parse(lines.join(''))
  expect(summary.runs).toBe(2)
  expect(summary.month).toBe('SEP-2026…OCT-2026')
})

test('the dry-run push names the records it would copy and the commit it would make', async () => {
  const { lines, deps: base } = await deps()
  await appendRecord(base.home, row({}), 'mini')
  expect(await runStats(parseStatsArgs(['push']), base)).toBe(0)
  const output = lines.join('\n')
  expect(output).toContain('dry run')
  expect(output).toContain('(+1)')
  expect(output).toContain('stats: vegastack/vegafactory +1 runs SEP-2026 · kmanojkumar@mini · claude/fable-5.1')
})
