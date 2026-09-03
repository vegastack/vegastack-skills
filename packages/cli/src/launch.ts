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

const STAGE_COMMAND: Record<Stage, string> = {
  plan: '/dev-plan',
  implement: '/dev-implement',
  corrections: '/dev-implement',
}

const STAGE_SKILL: Record<Stage, string> = {
  plan: 'dev-plan',
  implement: 'dev-implement',
  corrections: 'dev-implement',
}

// The whole first turn of a headless run, in the order a session reads it: who it is and that
// nobody is watching, what the scope is, who it is for and what they need, which stage to run, what
// it must never do, how long the answer should be, and — only when resuming — the start ritual.
//
// The order is load-bearing. Autonomy first, because everything after it is read differently by a
// session that knows there is no one to ask; the stop-list last before the ritual, because it is
// the sentence that has to still be in mind when the run starts making choices.
export function buildPrompt(input: LaunchInput): string {
  const stageInstruction = input.skillPath
    ? `Read ${input.skillPath} and follow it for issue ${input.issue.number}.`
    : `${STAGE_COMMAND[input.stage]} ${input.issue.number}`
  const sections: string[] = [
    'You are operating autonomously. The operator is not watching and cannot answer mid-run. Deliver what the brief and plan ask, completely; report outcomes faithfully — if a check fails, say so with its output. Stop with a hand-back comment only for a real scope change or a blocker the plan cannot resolve.',
    'The approved brief and plan are the scope: build what they describe, and take anything beyond them to the operator instead of deciding it yourself.',
    `I'm working on ${input.issue.title} for ${input.operator}; they need: ${input.outcome}`,
    stageInstruction,
  ]
  if (input.stage === 'corrections') {
    sections.push('This is a corrections run: the reacted comment and every operator comment since the hand-back are the correction input. A reaction is a start signal, never an approval.')
  }
  if (input.stopList.length > 0) {
    sections.push(`Stop and ask the operator rather than proceeding when the work would mean any of these:\n${input.stopList.map(entry => `- ${entry}`).join('\n')}`)
  }
  sections.push('Length follows the work: say what happened and what is worth checking, and stop there.')
  if (input.resume) {
    sections.push(`This run resumes work already in progress in ${input.worktree}. Before touching code: print the working directory, read the brief, then the plan, then the ledger, then git log on the branch — nothing else — and run the project's check command once so you know the state you inherited.`)
  }
  return sections.join('\n\n')
}
