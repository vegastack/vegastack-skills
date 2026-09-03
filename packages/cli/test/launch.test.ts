import { describe, expect, test } from 'bun:test'
import { buildLaunchPlan, type LaunchInput } from '../src/launch.ts'

const base: LaunchInput = {
  harness: 'claude', model: 'fable-5-1', effort: 'high', stage: 'implement',
  worktree: '/w/12-thing', issue: { number: 12, title: 'feat: thing' }, operator: 'mk',
  outcome: 'the thing exists and is tested', stopList: ['spending money'], resume: false,
  skillPath: null, subagents: { spawnDepth: 1, concurrent: 3 },
}

describe('buildLaunchPlan', () => {
  test('the Claude plan is exactly the documented argv, env and cwd', () => {
    const plan = buildLaunchPlan(base)
    expect(plan.command).toBe('claude')
    expect(plan.args[0]).toBe('-p')
    expect(plan.args[1]).toBe(plan.prompt)
    expect(plan.args.slice(2)).toEqual(['--permission-mode', 'bypassPermissions', '--output-format', 'json', '--model', 'fable-5-1', '--effort', 'high'])
    expect(plan.cwd).toBe('/w/12-thing')
    expect(plan.env.VSK_ASK_ROUTE).toBe('issue')
    expect(plan.env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH).toBe('1')
    expect(plan.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS).toBe('3')
  })

  test('the Codex plan carries -C, the sandbox, no approvals, hook-trust bypass and the model config', () => {
    const plan = buildLaunchPlan({ ...base, harness: 'codex', model: 'gpt-5.6', effort: 'xhigh' })
    expect(plan.command).toBe('codex')
    expect(plan.args).toEqual(['exec', '-C', '/w/12-thing', '--sandbox', 'workspace-write', '-a', 'never', '--dangerously-bypass-hook-trust', '-c', 'model=gpt-5.6', '-c', 'model_reasoning_effort=xhigh', '--json', plan.prompt])
    expect(plan.env.VSK_ASK_ROUTE).toBe('issue')
  })

  test('no argument is ever a shell string — the prompt stays one argv element', () => {
    const plan = buildLaunchPlan({ ...base, outcome: 'a "quoted" $OUTCOME; rm -rf /' })
    expect(plan.args.filter(arg => arg === plan.prompt)).toHaveLength(1)
    expect(plan.prompt).toContain('rm -rf /')
  })

  test('thinking is never disabled and no flag turns it down', () => {
    const claude = buildLaunchPlan(base)
    const codex = buildLaunchPlan({ ...base, harness: 'codex' })
    for (const plan of [claude, codex]) {
      expect(plan.args.join(' ')).not.toContain('no-think')
      expect(plan.args.join(' ')).not.toContain('reasoning_effort=none')
    }
  })
})
