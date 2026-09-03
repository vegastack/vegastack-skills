#!/usr/bin/env node
// Codex prompt → skill mentions, recorded as a proxy.
//
// Installed to .vegastack/hooks/prompt-skill-mention.mjs and wired on Codex's UserPromptSubmit
// event. Codex exposes no skill-activation event, so a skill's name mentioned in the prompt is the best available
// signal — and the record says so: these land with `trigger: "mention"`, never with the confidence
// of Claude's real activation events. Proactive skill capture on Codex stays a documented gap
// rather than a number that looks precise and is not.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

function main() {
  const raw = readFileSync(0, 'utf8')
  spawnSync(process.env.VSK_VEGAFACTORY || 'vegafactory', ['stats', 'record', '--source', 'codex-prompt'], {
    input: raw,
    stdio: ['pipe', 'ignore', 'ignore'],
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch {
    // a prompt must never fail to submit because nobody could count it
  }
  process.exit(0)
}
