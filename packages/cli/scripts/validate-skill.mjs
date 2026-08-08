#!/usr/bin/env node
// Structural validation of authored skill trees (JS port of the skill-creator
// quick_validate checks, so `check` has no machine-local python dependency).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const ALLOWED_KEYS = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata']);

// Frontmatter in our skills is single-line "key: value" scalars only; reject anything fancier
// rather than mis-parse it.
function parseFrontmatter(text) {
  const entries = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') continue;
    if (/^\s/.test(line)) {
      throw new Error(`unsupported frontmatter continuation line: ${JSON.stringify(line)}`);
    }
    const match = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
    if (!match) throw new Error(`unparseable frontmatter line: ${JSON.stringify(line)}`);
    const [, key, rawValue] = match;
    if (key in entries) throw new Error(`duplicate frontmatter key: ${key}`);
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

export function validateSkill(skillDir) {
  const skillMd = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMd)) return { ok: false, message: 'SKILL.md not found' };

  const content = readFileSync(skillMd, 'utf8');
  if (!content.startsWith('---')) return { ok: false, message: 'No YAML frontmatter found' };
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) return { ok: false, message: 'Invalid frontmatter format' };

  let frontmatter;
  try {
    frontmatter = parseFrontmatter(match[1]);
  } catch (error) {
    return { ok: false, message: `Invalid frontmatter: ${error.message}` };
  }

  const unexpected = Object.keys(frontmatter).filter((key) => !ALLOWED_KEYS.has(key));
  if (unexpected.length > 0) {
    return {
      ok: false,
      message: `Unexpected key(s) in SKILL.md frontmatter: ${unexpected.sort().join(', ')}. Allowed properties are: ${[...ALLOWED_KEYS].sort().join(', ')}`,
    };
  }
  if (!('name' in frontmatter)) return { ok: false, message: "Missing 'name' in frontmatter" };
  if (!('description' in frontmatter)) return { ok: false, message: "Missing 'description' in frontmatter" };

  const name = frontmatter.name.trim();
  if (name !== '') {
    if (!/^[a-z0-9-]+$/.test(name)) {
      return { ok: false, message: `Name '${name}' should be hyphen-case (lowercase letters, digits, and hyphens only)` };
    }
    if (name.startsWith('-') || name.endsWith('-') || name.includes('--')) {
      return { ok: false, message: `Name '${name}' cannot start/end with hyphen or contain consecutive hyphens` };
    }
    if (name.length > MAX_NAME_LENGTH) {
      return { ok: false, message: `Name is too long (${name.length} characters). Maximum is ${MAX_NAME_LENGTH} characters.` };
    }
  }

  const description = frontmatter.description.trim();
  if (description !== '') {
    if (description.includes('<') || description.includes('>')) {
      return { ok: false, message: 'Description cannot contain angle brackets (< or >)' };
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return { ok: false, message: `Description is too long (${description.length} characters). Maximum is ${MAX_DESCRIPTION_LENGTH} characters.` };
    }
  }

  return { ok: true, message: 'Skill is valid!' };
}

function discoverSkillDirs(skillsRoot) {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot)
    .map((entry) => join(skillsRoot, entry))
    .filter((candidate) => statSync(candidate).isDirectory());
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const targets = args.length > 0 ? args.map((arg) => resolve(arg)) : discoverSkillDirs(join(repoRoot, 'skills'));
  if (targets.length === 0) {
    console.error('validate-skill: no skill directories found');
    process.exit(1);
  }
  let failed = false;
  for (const target of targets) {
    const { ok, message } = validateSkill(target);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${target}: ${message}`);
    if (!ok) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
