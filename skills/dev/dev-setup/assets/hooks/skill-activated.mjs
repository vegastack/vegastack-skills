#!/usr/bin/env node
// Skill invocation → one line in the session's skill sidecar.
//
// Installed to .vegastack/hooks/skill-activated.mjs and wired on Claude Code's PostToolUse (matcher
// `Skill`) and UserPromptExpansion events. Both carry a skill name; they differ in who chose it,
// and that difference is the whole point of capturing them separately — "the model reached for
// dev-architect" and "a person typed /dev-architect" are different facts about a skill.
//
// The invocations accumulate per session because they happen long before the session's own record
// exists; the session-end capture folds them in and deletes the sidecar.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// One payload, two shapes: a tool call names the tool, a prompt expansion names the command. An
// unrecognised payload is forwarded as neither — the parser would only return an empty list.
export function sourceFor(payload) {
  if (payload && payload.tool_name === 'Skill') return 'claude-post-tool'
  if (payload && typeof payload.command_name === 'string' && payload.command_name !== '') return 'claude-prompt-expansion'
  return null
}

function main() {
  const raw = readFileSync(0, 'utf8')
  let payload = null
  try {
    payload = JSON.parse(raw)
  } catch {
    return
  }
  const source = sourceFor(payload)
  if (!source) return
  spawnSync(process.env.VSK_VEGAFACTORY || 'vegafactory', ['stats', 'record', '--source', source], {
    input: raw,
    stdio: ['pipe', 'ignore', 'ignore'],
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch {
    // a skill must never fail to run because nobody could count it
  }
  process.exit(0)
}
