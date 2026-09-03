// The launch table: what a headless run of one stage actually is, per harness — the command, its
// argv, its environment, its working directory, and the prompt that is its whole first turn.
//
// It is a pure function on purpose. This is the file a reviewer has to read as data — an argv this
// module gets wrong is a dark build running with the wrong permissions — and a table asserted
// through a running loop is a table nobody ever reads. Nothing here spawns anything.
import type { Harness, Stage, Subagents } from './config.ts'

export interface LaunchInput {
  harness: Harness
  model: string
  effort: string
  stage: Stage
  worktree: string
  issue: { number: number; title: string }
  operator: string
  outcome: string
  stopList: string[]
  resume: boolean
  // Set when the harness does not discover project skills on its own: the prompt then names the
  // SKILL.md path instead of the slash command.
  skillPath: string | null
  subagents: Subagents
}

export interface LaunchPlan {
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
  prompt: string
}

function envFor(input: LaunchInput): Record<string, string> {
  return {
    CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: String(input.subagents.spawnDepth),
    CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(input.subagents.concurrent),
    // #111's route: with no human at a keyboard, a question goes into the issue and the next run
    // reads the answer there.
    VSK_ASK_ROUTE: 'issue',
  }
}

export function buildLaunchPlan(input: LaunchInput): LaunchPlan {
  const prompt = buildPrompt(input)
  const env = envFor(input)
  if (input.harness === 'codex') {
    return {
      command: 'codex',
      // `-a never` because there is nobody to approve, `--sandbox workspace-write` because the run
      // edits its own worktree and nothing else, and the hook-trust bypass because the ship guard
      // must fire in a headless run — it is the only thing standing between a dark build and main.
      args: [
        'exec', '-C', input.worktree, '--sandbox', 'workspace-write', '-a', 'never',
        '--dangerously-bypass-hook-trust', '-c', `model=${input.model}`,
        '-c', `model_reasoning_effort=${input.effort}`, '--json', prompt,
      ],
      env,
      cwd: input.worktree,
      prompt,
    }
  }
  return {
    command: 'claude',
    args: [
      '-p', prompt, '--permission-mode', 'bypassPermissions', '--output-format', 'json',
      '--model', input.model, '--effort', input.effort,
    ],
    env,
    cwd: input.worktree,
    prompt,
  }
}

export function buildPrompt(input: LaunchInput): string {
  return `I'm working on ${input.issue.title} for ${input.operator}; they need: ${input.outcome}`
}
