import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { validateSkill } from '../../../packages/cli/scripts/validate-skill.mjs'
import { scaffoldSkill, templateFiles, validateName, wireSkill } from '../scripts/scaffold-skill.mjs'

const skillRoot = resolve(import.meta.dir, '..')

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'skillify-repo-'))
  await mkdir(join(root, 'skills'))
  return root
}

// A repo with the three wiring targets present, as in the real monorepo.
async function makeWiredRepo(): Promise<string> {
  const root = await makeRepo()
  await mkdir(join(root, 'packages/cli'), { recursive: true })
  await writeFile(join(root, 'packages/cli/packaging.json'), '{\n  "architect": ["SKILL.md"]\n}\n')
  await writeFile(
    join(root, 'README.md'),
    '# Repo\n\n## Skills\n\n| Skill | What it does | Docs |\n|---|---|---|\n| [architect](skills/architect/) | advisor | [SKILL.md](skills/architect/SKILL.md) |\n\nAfter the table.\n',
  )
  await mkdir(join(root, '.changeset'))
  return root
}

describe('skillify contract', () => {
  test('SKILL.md passes repo validation (including link resolution)', () => {
    const result = validateSkill(skillRoot)
    expect(result.message).toBe('Skill is valid!')
    expect(result.ok).toBe(true)
  })

  test('frontmatter carries only name and description', () => {
    const content = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8')
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)
    expect(frontmatter).not.toBeNull()
    const keys = (frontmatter as RegExpExecArray)[1]
      .split('\n')
      .filter(line => /^[A-Za-z]/.test(line))
      .map(line => line.split(':')[0])
    expect(keys.sort()).toEqual(['description', 'name'])
  })

  test('description states triggers within limits and never the phase workflow', () => {
    const content = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8')
    const description = /^description: (.*)$/m.exec(content)?.[1] ?? ''
    expect(description.length).toBeGreaterThan(0)
    expect(description.length).toBeLessThanOrEqual(1024)
    expect(description).toContain('skillify this')
    expect(description).toContain('make this a skill')
    expect(description).toContain('audit this skill')
    // The phases are body content; a description mentioning them is a workflow summary.
    expect(description.toLowerCase()).not.toContain('phase')
    expect(description.toLowerCase()).not.toContain('checklist')
  })

  test('SKILL.md stays under the 300-line ceiling', () => {
    const lines = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8').split('\n').length
    expect(lines).toBeLessThan(300)
  })

  test('the checklist has exactly 8 scored items and the three verdicts', () => {
    const content = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8')
    const items = content.match(/^\d+\. \*\*/gm) ?? []
    expect(items.length).toBe(8)
    expect(content).toContain('properly skilled')
    expect(content).toContain('close — create:')
    expect(content).toContain('needs skillify')
  })

  test('refresh registry is a valid delegating (empty-sources) registry', () => {
    const registry = JSON.parse(readFileSync(join(skillRoot, 'refresh/sources.json'), 'utf8'))
    expect(registry.schemaVersion).toBe(1)
    expect(Array.isArray(registry.sources)).toBe(true)
    expect(registry.sources).toHaveLength(0)
    expect(readFileSync(join(skillRoot, 'refresh/REFRESH.md'), 'utf8')).toContain('skill-maintainer')
  })

  test('trigger query fixture is a small hard set with near-miss negatives and an ambiguous case', () => {
    const queries = JSON.parse(readFileSync(join(skillRoot, 'tests/fixtures/trigger-queries.json'), 'utf8'))
    const positives = queries.filter((entry: { should_trigger: boolean }) => entry.should_trigger)
    const negatives = queries.filter((entry: { should_trigger: boolean }) => !entry.should_trigger)
    expect(positives.length).toBeGreaterThanOrEqual(5)
    expect(negatives.length).toBeGreaterThanOrEqual(4)
    expect(queries.length).toBeLessThanOrEqual(12)
    for (const entry of queries) {
      expect(typeof entry.query).toBe('string')
      if ('ambiguous_with' in entry) {
        expect(Array.isArray(entry.ambiguous_with)).toBe(true)
        for (const neighbor of entry.ambiguous_with) expect(typeof neighbor).toBe('string')
      }
    }
    expect(queries.some((entry: { ambiguous_with?: string[] }) => entry.ambiguous_with?.length)).toBe(true)
  })
})

describe('scaffold-skill consistency', () => {
  test('every template on disk is wired into the scaffolder, and vice versa', async () => {
    const onDisk = (await readdir(join(skillRoot, 'assets/templates'))).sort()
    const wired = templateFiles.map(([source]: [string, string | null]) => source).sort()
    expect(onDisk).toEqual(wired)
  })
})

describe('scaffold-skill name grammar', () => {
  test.each([
    ['Uppercase', 'lowercase'],
    ['1skill', 'lowercase letter'],
    ['a--b', 'consecutive hyphens'],
    ['trailing-', 'end with a hyphen'],
    ['under_score', 'only lowercase letters, digits, and hyphens'],
    ['', 'required'],
  ])('rejects %p', (name, reason) => {
    expect(validateName(name)).toContain(reason)
  })

  test('rejects names over 64 characters', () => {
    expect(validateName(`a${'b'.repeat(64)}`)).toContain('maximum is 64')
  })

  test('accepts valid hyphen-case names', () => {
    for (const name of ['a', 'demo-skill', 'a2c', 'skill-2-audit']) expect(validateName(name)).toBeNull()
  })

  test('scaffoldSkill refuses an invalid name before touching the filesystem', async () => {
    const repo = await makeRepo()
    try {
      await expect(scaffoldSkill({ name: 'Bad--Name', dir: repo, write: true })).rejects.toThrow('Invalid skill name')
      expect(await readdir(join(repo, 'skills'))).toEqual([])
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })
})

describe('scaffold-skill runs', () => {
  test('dry run returns the full plan and creates nothing', async () => {
    const repo = await makeWiredRepo()
    try {
      const plan = await scaffoldSkill({ name: 'demo-skill', dir: repo })
      expect(plan.wrote).toBe(false)
      expect(plan.files.sort()).toEqual([
        'README.md',
        'SKILL.md',
        'agents/openai.yaml',
        'refresh/REFRESH.md',
        'refresh/sources.json',
        'tests/demo-skill.test.ts',
        'tests/fixtures/trigger-queries.json',
      ])
      expect(plan.wiring.map((entry: { status: string }) => entry.status)).toEqual(['planned', 'planned', 'planned'])
      expect(await readdir(join(repo, 'skills'))).toEqual([])
      expect(await readdir(join(repo, '.changeset'))).toEqual([])
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  test('--write creates the contract tree and performs the repo wiring', async () => {
    const repo = await makeWiredRepo()
    try {
      const result = await scaffoldSkill({ name: 'demo-skill', dir: repo, write: true, now: new Date('2026-08-08T05:00:00Z') })
      expect(result.wrote).toBe(true)
      const target = join(repo, 'skills', 'demo-skill')
      for (const file of result.files) {
        const body = readFileSync(join(target, file), 'utf8')
        expect(body).not.toContain('{{name}}')
        expect(body).not.toContain('{{date}}')
      }
      expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toContain('name: demo-skill')
      expect(readFileSync(join(target, 'tests/demo-skill.test.ts'), 'utf8')).toContain("'demo-skill contract'")
      const registry = JSON.parse(readFileSync(join(target, 'refresh/sources.json'), 'utf8'))
      expect(registry.schemaVersion).toBe(1)
      expect(registry.sources).toEqual([])
      expect(registry.retrievalBaseline).toBe('2026-08-08')
      const validated = validateSkill(target)
      expect(validated.message).toBe('Skill is valid!')
      expect(validated.ok).toBe(true)
      // No staging leftovers.
      expect(await readdir(join(repo, 'skills'))).toEqual(['demo-skill'])

      // Wiring performed: packaging entry, README row, changeset.
      expect(result.wiring.map((entry: { status: string }) => entry.status)).toEqual(['done', 'done', 'done'])
      const packaging = JSON.parse(await readFile(join(repo, 'packages/cli/packaging.json'), 'utf8'))
      expect(packaging['demo-skill']).toEqual(['SKILL.md', 'agents/openai.yaml', 'refresh/REFRESH.md', 'refresh/sources.json'])
      expect(Object.keys(packaging)).toEqual(['architect', 'demo-skill'])
      const readme = await readFile(join(repo, 'README.md'), 'utf8')
      expect(readme).toContain('| [demo-skill](skills/demo-skill/) |')
      expect(readme.indexOf('demo-skill')).toBeGreaterThan(readme.indexOf('architect'))
      expect(readme).toContain('After the table.')
      expect(await readFile(join(repo, '.changeset/add-demo-skill.md'), 'utf8')).toContain('"@vegastack/skills": minor')
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  test('wiring is idempotent and degrades to skipped in a bare repo', async () => {
    const wired = await makeWiredRepo()
    const bare = await makeRepo()
    try {
      await wireSkill({ name: 'demo-skill', repoRoot: wired, write: true })
      const again = await wireSkill({ name: 'demo-skill', repoRoot: wired, write: true })
      for (const { status } of again) expect(status).toStartWith('skipped:')
      const bareResult = await scaffoldSkill({ name: 'demo-skill', dir: bare, write: true })
      expect(bareResult.wrote).toBe(true)
      for (const { status } of bareResult.wiring) expect(status).toStartWith('skipped:')
    } finally {
      await rm(wired, { recursive: true, force: true })
      await rm(bare, { recursive: true, force: true })
    }
  })

  test('refuses to overwrite an existing skill directory', async () => {
    const repo = await makeRepo()
    try {
      await mkdir(join(repo, 'skills', 'demo-skill'))
      await expect(scaffoldSkill({ name: 'demo-skill', dir: repo, write: true })).rejects.toThrow('already exists')
      expect(await readdir(join(repo, 'skills'))).toEqual(['demo-skill'])
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  test('refuses a symlinked skills root and a non-repo --dir', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillify-symlink-'))
    try {
      await mkdir(join(root, 'real-skills'))
      await symlink(join(root, 'real-skills'), join(root, 'skills'))
      await expect(scaffoldSkill({ name: 'demo-skill', dir: root, write: true })).rejects.toThrow('not a real directory')
      const empty = await mkdtemp(join(tmpdir(), 'skillify-empty-'))
      try {
        await expect(scaffoldSkill({ name: 'demo-skill', dir: empty })).rejects.toThrow('not a real directory')
      } finally {
        await rm(empty, { recursive: true, force: true })
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
