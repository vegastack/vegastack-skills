import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateSkill } from '../../../../packages/cli/scripts/validate-skill.mjs'

const skillRoot = resolve(import.meta.dir, '..')

describe('dev-setup contract', () => {
  test('SKILL.md passes repo validation', () => {
    const result = validateSkill(skillRoot)
    expect(result.message).toBe('Skill is valid!')
    expect(result.ok).toBe(true)
  })

  test('profile template carries the architect, chronicle-style, and emoji knobs with their documented defaults', () => {
    const template = readFileSync(join(skillRoot, 'assets/dev-profile.md.template'), 'utf8')
    expect(template).toMatch(/^architect: \{\{github-username\}\}\s+#.*gh api user -q \.login/m)
    expect(template).toMatch(/^chronicle-style: plain\s+# plain \| story \| witty/m)
    expect(template).toMatch(/^emoji: none\s+# none \| sparing/m)
  })

  test('the stop-and-ask section opens with the pause-only sentence and keeps the concrete list', () => {
    const template = readFileSync(join(skillRoot, 'assets/dev-profile.md.template'), 'utf8')
    const section = template.split('## Stop and ask')[1].split('\n## ')[0]
    expect(section).toContain('Pause for the operator only when the work genuinely requires them: a destructive or irreversible action, a real scope change, or input only they can provide — ask and end the turn rather than end on a promise')
    expect(section).toContain('a blocker the brief cannot resolve')
    expect(section).toContain("Nothing ships without the operator's explicit instruction")
  })

  test('agents-section template stays within the always-loaded budget and mirrors this repo AGENTS.md', () => {
    const template = readFileSync(join(skillRoot, 'assets/agents-section.md.template'), 'utf8')
    const body = template.split('<!-- vsk-dev:start -->')[1].split('<!-- vsk-dev:end -->')[0]
    expect(body.trim().split(/\s+/).length).toBeLessThanOrEqual(450)
    expect(body.match(/^\| .* \| .* \|$/gm)?.length).toBe(7) // header + six routing rows
    expect(body).toContain('| dev-intake, which writes the issue and never builds |')
    expect(body).toContain("| dev-implement's direct path |")
    expect(body).toContain('Local, reversible actions proceed')
    expect(body).toContain('Agent conduct:')
    const agents = readFileSync(resolve(skillRoot, '../../../AGENTS.md'), 'utf8')
    expect(agents).toContain(template.trim())
  })

  test('trigger query fixture is a small hard set with near-miss negatives', () => {
    const queries = JSON.parse(readFileSync(join(skillRoot, 'tests/fixtures/trigger-queries.json'), 'utf8'))
    const positives = queries.filter((entry: { should_trigger: boolean }) => entry.should_trigger)
    const negatives = queries.filter((entry: { should_trigger: boolean }) => !entry.should_trigger)
    expect(positives.length).toBeGreaterThanOrEqual(5)
    expect(negatives.length).toBeGreaterThanOrEqual(4)
    for (const entry of queries) expect(typeof entry.query).toBe('string')
  })

  const REGISTRY_IDS = ['CC-MEMORY', 'CC-SKILLS', 'CC-TOOLS', 'CC-HOOKS', 'CC-SDK-PRESET', 'CC-CLI', 'CC-SUBAGENT-ENV', 'CODEX-AGENTS', 'CODEX-SKILLS', 'CODEX-EXEC', 'CODEX-HOOKS', 'CODEX-AGENTS-MULTI', 'CODEX-CONFIG', 'HERMES-HOOKS', 'HERMES-TOOLS', 'GH-CLI']
  const harnessFacts = readFileSync(join(skillRoot, 'references/harness-facts.md'), 'utf8')

  test('refresh registry carries exactly the harness-facts sources, each manual-review on a 14-day clock', () => {
    const registry = JSON.parse(readFileSync(join(skillRoot, 'refresh/sources.json'), 'utf8'))
    expect(registry.schemaVersion).toBe(1)
    const ids = registry.sources.map((source: { id: string }) => source.id).sort()
    expect(ids).toEqual([...REGISTRY_IDS].sort())
    for (const source of registry.sources) {
      expect(source.thresholdDays).toBe(14)
      expect(source.versionDetection.type).toBe('manual-review')
      expect(typeof source.urls.primary).toBe('string')
      expect(source.affected).toContain('references/harness-facts.md')
    }
  })

  test('every source marker in harness-facts.md maps to a registry ID, and every registry ID is cited', () => {
    const cited = new Set<string>()
    for (const match of harnessFacts.matchAll(/<!--\s*source:\s*([A-Za-z0-9-]+)\s*-->/g)) {
      expect(REGISTRY_IDS, `unknown marker ${match[1]}`).toContain(match[1])
      cited.add(match[1])
    }
    expect([...cited].sort()).toEqual([...REGISTRY_IDS].sort())
  })

  test('the gh floors live in harness-facts.md under the GH-CLI marker', () => {
    const floors = harnessFacts.split('\n').filter((line) => /2\.9[47]\.0/.test(line))
    expect(floors.length).toBeGreaterThanOrEqual(2)
    for (const line of floors) expect(line).toContain('<!-- source: GH-CLI -->')
  })

  test('profile template carries the issue-types and issue-fields knobs with a none fallback', () => {
    const template = readFileSync(join(skillRoot, 'assets/dev-profile.md.template'), 'utf8')
    const knobs = template.split('## Knobs')[1].split('\n## ')[0]
    expect(knobs).toMatch(/^issue-types: \{\{.*\| none\}\}\s+#/m)
    expect(knobs).toMatch(/^issue-fields: \{\{.*\| none\}\}\s+#/m)
  })

  test('the flag table names every model, effort and concurrency control under its own source', () => {
    const section = harnessFacts.split('## Model, effort, and concurrency controls')[1].split('\n## ')[0]
    for (const control of ['`--model`', '`--effort`', '`effortLevel`', '`-c model=', '`-c model_reasoning_effort=', '`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`', '`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`', '`agents.max_concurrent_threads_per_session`']) {
      expect(section, `missing control ${control}`).toContain(control)
    }
    for (const id of ['CC-CLI', 'CC-SUBAGENT-ENV', 'CODEX-CONFIG']) expect(section).toContain(`<!-- source: ${id} -->`)
  })

  test('the dated model-currency sentence carries the effort vocabulary and a source', () => {
    const section = harnessFacts.split('## Model, effort, and concurrency controls')[1].split('\n## ')[0]
    const dated = section.split('\n').find((line) => /\b\d{2}-\d{2}-\d{4}\b/.test(line) && line.includes('<!-- source: CC-CLI -->'))
    expect(dated).toBeDefined()
    for (const level of ['low', 'medium', 'high', 'xhigh']) expect(dated).toContain(level)
  })

  test('the codex exec skill-loading drill is recorded reproducibly, dated, with its Codex version', () => {
    const drill = harnessFacts.split('```sh').slice(1).find((block) => block.split('```')[0].includes('codex exec'))
    expect(drill).toBeDefined()
    expect(drill).toContain('.agents/skills/')
    expect(drill).toContain('--skip-git-repo-check')
    const attempt = harnessFacts.split('\n').find((line) => line.includes('codex-cli 0.149.1'))
    expect(attempt).toBeDefined()
    expect(attempt).toMatch(/\b\d{2}-\d{2}-\d{4}\b/)
    expect(attempt).toContain('<!-- source: CODEX-SKILLS -->')
    expect(attempt).toContain('<!-- source: CODEX-EXEC -->')
  })

  // Parked: the drill could not reach the model on 03-09-2026 (Codex refresh token revoked), so
  // the verdict sentence is deliberately unwritten. Re-run the drill after `codex login`, write
  // the line, and turn this into a real test.
  test.todo('the codex exec skill-loading verdict sentence is recorded')

  test('Step 1 detection reads the org issue fields and drafts both knobs', () => {
    const skill = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8')
    expect(skill).toContain('gh api orgs/<org>/issue-types')
    expect(skill).toContain('gh api orgs/<org>/issue-fields')
    expect(skill).toContain('`issue-types:`')
    expect(skill).toContain('`issue-fields:`')
  })

  // TODO: if this skill ships scripts/, add unit tests for every deterministic
  // branch. A prose-only skill needs nothing more here - its quality bar is the
  // behavioral eval of skillify Phase 4, which runs BEFORE tests lock anything in.
})
