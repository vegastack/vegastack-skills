#!/usr/bin/env node
// Ship guard — the "nothing ships without the operator's word" rule, made mechanical.
//
// Installed to .vegastack/hooks/ship-guard.mjs and wired as a PreToolUse hook on the
// harness's shell tool. Its ONLY source of policy is .vegastack/dev.md: the `## Environments`
// policy lines, the `gates:` knob, and the `## Ship` runbook's `ask:` lines. Nothing is
// compiled in, so a project changes its guard by editing one file.
//
// Fail closed: a command inside a guarded family that cannot be classified resolves to ask
// (Claude) / block (Codex), never allow. A payload carrying no shell command is in no
// guarded family and resolves to allow.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Substring matches. These ask whatever the knobs say — they are destructive or they
// deliberately skip a check, and neither is ever the agent's call to make unattended.
export const ALWAYS_ASK = [
  { pattern: 'git push --force', label: 'a force push' },
  { pattern: 'git push -f', label: 'a force push' },
  { pattern: 'git reset --hard', label: 'a hard reset' },
  { pattern: 'git branch -D', label: 'deleting a branch' },
  { pattern: 'git branch --delete --force', label: 'deleting a branch' },
  { pattern: 'git worktree remove --force', label: 'removing a worktree by force' },
  { pattern: '--no-verify', label: 'skipping the pre-commit checks' },
]

// The operations that reach the default branch or the world. Documentation for the reason
// text; the branch name itself comes from the profile, so this array stays generic.
export const DEFAULT_BRANCH_OPS = ['gh pr merge', 'git push origin <default-branch>', 'git tag', 'npm publish']

const DEFAULT_POLICY = { defaultBranch: 'main', gates: 3, environments: [], shipAsk: [] }

function sectionOf(text, heading) {
  const parts = text.split(new RegExp('^' + heading + '.*$', 'm'))
  if (parts.length < 2) return ''
  return parts[1].split(/^## /m)[0]
}

// Parses the profile into the whole of the guard's policy. Anything it cannot read falls
// back to the strictest defaults rather than to silence.
export function readPolicy(devMdText) {
  const text = typeof devMdText === 'string' ? devMdText : ''
  if (!text.trim()) return { ...DEFAULT_POLICY }
  const branch = text.match(/^repo:.*default branch (\S+)/m)
  const gates = text.match(/^gates:\s*([123])/m)
  const environments = []
  for (const line of sectionOf(text, '## Environments').split('\n')) {
    const match = line.match(/^- ([\w][\w-]*): (auto|ask) — (.+)$/)
    if (match) environments.push({ target: match[1], policy: match[2], pattern: match[3].trim() })
  }
  const shipAsk = []
  for (const line of sectionOf(text, '## Ship').split('\n')) {
    const match = line.match(/^- ask: (.+)$/)
    if (match) shipAsk.push(match[1].trim())
  }
  return {
    defaultBranch: branch ? branch[1] : DEFAULT_POLICY.defaultBranch,
    gates: gates ? Number(gates[1]) : DEFAULT_POLICY.gates,
    environments,
    shipAsk,
  }
}

// A guarded segment must never hide behind a benign one, so every operator that chains or
// pipes commands starts a new segment.
export function splitSegments(command) {
  if (typeof command !== 'string') return []
  return command
    .split(/&&|\|\||;|\||\n/)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

// Wrappers and environment assignments that carry a command without changing what it does.
const PREFIXES = new Set(['sudo', 'env', 'command', 'nohup', 'time', 'exec'])
// git's global options, which sit between `git` and the subcommand.
const GIT_GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'])

// A guarded command must not walk past the guard behind a wrapper, an inline environment
// assignment or a git global option, so the segment is reduced to the command it really runs
// before anything is matched against it.
export function normalizeSegment(segment) {
  let tokens = segment.split(/\s+/).filter(Boolean)
  let changed = true
  while (changed && tokens.length > 1) {
    changed = false
    const head = tokens[0]
    if (PREFIXES.has(head) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(head)) {
      tokens = tokens.slice(1)
      changed = true
    }
  }
  if (tokens[0] === 'git') {
    const rest = tokens.slice(1)
    while (rest.length > 0 && rest[0].startsWith('-')) {
      const option = rest[0]
      const name = option.includes('=') ? option.slice(0, option.indexOf('=')) : option
      if (GIT_GLOBAL_WITH_VALUE.has(name) && !option.includes('=')) rest.splice(0, 2)
      else rest.splice(0, 1)
    }
    tokens = ['git', ...rest]
  }
  return tokens.join(' ')
}

function ask(reason, rule) {
  return { decision: 'ask', reason: reason + ' — run it by hand', rule }
}

const ALLOW = { decision: 'allow', reason: null, rule: 'not-guarded' }

// The non-flag arguments of a `git push`, in order: normally [remote, refspec].
function pushArguments(segment) {
  const tokens = segment.split(/\s+/).slice(2)
  return tokens.filter((token) => !token.startsWith('-'))
}

export function classifySegment(segment, policy) {
  const text = typeof segment === 'string' ? normalizeSegment(segment.trim()) : ''
  if (!text) return ALLOW
  const settings = policy && typeof policy === 'object' ? { ...DEFAULT_POLICY, ...policy } : { ...DEFAULT_POLICY }

  for (const entry of ALWAYS_ASK) {
    if (text.includes(entry.pattern)) return ask(entry.label + " needs the operator's word", 'always-ask')
  }

  // Longest pattern first, so `--env production` beats a shorter `wrangler deploy` line.
  const matches = settings.environments
    .filter((entry) => entry.pattern && text.startsWith(entry.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)
  if (matches.length > 0) {
    const winner = matches[0]
    if (winner.policy === 'auto') return { decision: 'allow', reason: null, rule: 'environment:' + winner.target }
    return ask('the ' + winner.target + " environment needs the operator's word", 'environment:' + winner.target)
  }

  const shipRule = settings.gates === 1 ? 'default-branch-ship' : 'default-branch'
  if (text.startsWith('gh pr merge')) return ask("merging to the default branch needs the operator's word", shipRule)
  if (text.startsWith('git tag')) return ask("tagging a release needs the operator's word", shipRule)
  if (text.startsWith('npm publish')) return ask("publishing needs the operator's word", shipRule)
  if (text.startsWith('git push')) {
    const args = pushArguments(text)
    // No refspec means git decides which branch goes; the guard cannot tell, so it asks.
    if (args.length < 2) return ask("a push whose branch the guard cannot read needs the operator's word", 'unclassified-in-family')
    if (args[1] === settings.defaultBranch) return ask(`pushing to ${settings.defaultBranch} needs the operator's word`, shipRule)
    return { decision: 'allow', reason: null, rule: 'branch-push' }
  }
  for (const pattern of settings.shipAsk) {
    if (pattern && text.startsWith(pattern)) return ask(`a Ship runbook ask: step needs the operator's word`, shipRule)
  }

  // Fail closed: it looks like shipping, and no line in the profile says it is safe.
  if (/(^|\s)(deploy|publish)(\s|$)/.test(text) || text.includes('release create')) {
    return ask(`no ## Environments line in dev.md covers this deploy, so it needs the operator's word`, 'unclassified-in-family')
  }
  return ALLOW
}

export function classifyCommand(command, policy) {
  const segments = splitSegments(command)
  for (const segment of segments) {
    const result = classifySegment(segment, policy)
    if (result.decision === 'ask') return result
  }
  return ALLOW
}

// --- harness I/O ---------------------------------------------------------------------

const UNREADABLE = {
  decision: 'ask',
  reason: 'the ship guard could not read the hook payload — run the command by hand',
  rule: 'unreadable-payload',
}

// Claude puts the shell command at tool_input.command; Codex may send the argv array or the
// string itself. Every other shape is a tool that runs no shell command.
export function extractCommand(payload) {
  const input = payload && typeof payload === 'object' ? payload.tool_input : null
  if (typeof input === 'string') return input
  if (!input || typeof input !== 'object') return null
  const command = input.command
  if (typeof command === 'string') return command
  if (Array.isArray(command) && command.every((part) => typeof part === 'string')) return command.join(' ')
  return null
}

export function renderDecision(result, harness) {
  if (harness !== 'claude' && harness !== 'codex') {
    return JSON.stringify({
      decision: 'block',
      reason: 'the ship guard is wired without --harness claude|codex — fix the hook command',
    })
  }
  if (!result || result.decision !== 'ask') return ''
  if (harness === 'claude') {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: result.reason,
      },
    })
  }
  return JSON.stringify({ decision: 'block', reason: result.reason })
}

function flag(argv, name) {
  const index = argv.indexOf(name)
  if (index === -1 || index === argv.length - 1) return null
  return argv[index + 1]
}

function loadPolicy(path) {
  try {
    return readPolicy(readFileSync(path, 'utf8'))
  } catch {
    return readPolicy('')
  }
}

function main(argv) {
  const devMd = flag(argv, '--dev-md') || join(process.cwd(), '.vegastack/dev.md')
  const policy = loadPolicy(devMd)

  if (argv.includes('--check')) {
    const command = flag(argv, '--command') || ''
    const result = classifyCommand(command, policy)
    if (argv.includes('--json')) process.stdout.write(JSON.stringify(result) + '\n')
    else if (result.reason) process.stdout.write(result.reason + '\n')
    process.exit(result.decision === 'ask' ? 2 : 0)
  }

  const harness = flag(argv, '--harness')
  let payload = null
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    process.stdout.write(renderDecision(UNREADABLE, harness))
    process.exit(0)
  }
  const command = extractCommand(payload)
  if (command === null) {
    // Not a shell tool call at all — nothing for this guard to say.
    if (harness !== 'claude' && harness !== 'codex') process.stdout.write(renderDecision(UNREADABLE, harness))
    process.exit(0)
  }
  process.stdout.write(renderDecision(classifyCommand(command, policy), harness))
  process.exit(0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
