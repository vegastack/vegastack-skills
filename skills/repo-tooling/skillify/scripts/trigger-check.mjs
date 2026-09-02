#!/usr/bin/env node
// skillify guard: deterministic family-level check over every authored skill's
// tests/fixtures/trigger-queries.json. Two skills claiming the same normalised
// query as should_trigger:true without naming each other in ambiguous_with is a
// contradiction the behavioral eval would only find by re-running the whole
// family; this script finds it mechanically. Shape errors block; fixture
// hygiene (unknown neighbour names, one-sided references, missing or short
// fixtures) warns.
//
// Exit codes: 0 pass · 1 warnings under --strict · 2 blocked or usage error.
// Usage: node trigger-check.mjs [--dir <repo-root>] [--strict] [--json]
// Self-contained on purpose apart from the repo's skill-discovery lib: skillify
// is repo-only, so the relative import to packages/cli is always present.

const MIN_ENTRIES = 8;

// lowercase → collapse whitespace → trim → strip trailing sentence punctuation.
export function normalizeQuery(query) {
  return query.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '');
}

function isNameArray(value) {
  return Array.isArray(value) && value.every((name) => typeof name === 'string' && name.length > 0);
}

// Shape-checks one fixture's entries. Returns the valid entries; every bad
// entry becomes a block naming the file and index.
function readEntries(file, data, blocks) {
  const entries = [];
  data.forEach((entry, index) => {
    const where = file + '[' + index + ']';
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      blocks.push(`${where}: entry must be an object`);
      return;
    }
    if (typeof entry.query !== 'string' || entry.query.trim().length === 0) {
      blocks.push(`${where}: query must be a non-empty string`);
      return;
    }
    if (typeof entry.should_trigger !== 'boolean') {
      blocks.push(`${where}: should_trigger must be true or false`);
      return;
    }
    if ('ambiguous_with' in entry && !isNameArray(entry.ambiguous_with)) {
      blocks.push(`${where}: ambiguous_with must be an array of skill-name strings`);
      return;
    }
    entries.push({
      where,
      query: entry.query.trim(),
      norm: normalizeQuery(entry.query),
      positive: entry.should_trigger,
      names: entry.ambiguous_with ?? [],
    });
  });
  return entries;
}

// fixtures: Map<skillName, { file, data?, error? } | null>. A key is a skill
// authored here; null means the skill ships no fixture file.
export function checkTriggers(fixtures) {
  const blocks = [];
  const warns = [];
  const valid = new Map();

  for (const [skill, input] of fixtures) {
    if (input === null) {
      warns.push(`${skill}: no tests/fixtures/trigger-queries.json — every skill ships one (skillify item 2)`);
      continue;
    }
    if (input.error) {
      blocks.push(`${input.file}: ${input.error}`);
      continue;
    }
    if (!Array.isArray(input.data)) {
      blocks.push(`${input.file}: fixture must be a JSON array of entries`);
      continue;
    }
    const entries = readEntries(input.file, input.data, blocks);
    if (entries.length < MIN_ENTRIES) warns.push(`${skill}: ${entries.length} fixture entries, fewer than ${MIN_ENTRIES}`);
    valid.set(skill, entries);
  }

  // Per-entry hygiene: neighbour names must be authored here, and a negative
  // that hands a query to a neighbour needs that neighbour to hold the query.
  for (const [, entries] of valid) {
    for (const entry of entries) {
      for (const name of entry.names) {
        if (!fixtures.has(name)) {
          warns.push(`${entry.where}: ambiguous_with names "${name}", which is no skill authored here — a typo is invisible to this guard, so confirm the name by hand`);
          continue;
        }
        if (entry.positive) continue;
        const theirs = valid.get(name);
        if (theirs && !theirs.some((other) => other.norm === entry.norm)) {
          warns.push(`${entry.where}: should_trigger:false hands "${entry.query}" to ${name}, whose fixture has no entry for it — add it there so the family-level eval walks both sides`);
        }
      }
    }
  }

  // Collisions: index positives by normalised query, then compare each pair of
  // claiming skills. A skill's claim on a query carries the union of the
  // neighbour names its positive entries for that query list.
  const claims = new Map();
  for (const [skill, entries] of valid) {
    for (const entry of entries) {
      if (!entry.positive) continue;
      const bySkill = claims.get(entry.norm) ?? new Map();
      const names = bySkill.get(skill) ?? new Set();
      for (const name of entry.names) names.add(name);
      bySkill.set(skill, names);
      claims.set(entry.norm, bySkill);
    }
  }
  for (const [norm, bySkill] of claims) {
    const skills = [...bySkill.keys()].sort();
    for (let i = 0; i < skills.length; i += 1) {
      for (let j = i + 1; j < skills.length; j += 1) {
        const [x, y] = [skills[i], skills[j]];
        const xNamesY = bySkill.get(x).has(y);
        const yNamesX = bySkill.get(y).has(x);
        if (xNamesY && yNamesX) continue;
        if (!xNamesY && !yNamesX) {
          blocks.push(`"${norm}" is should_trigger:true in ${x} and ${y} without a mutual ambiguous_with — merge the trigger or have each fixture name the other`);
          continue;
        }
        const [namer, silent] = xNamesY ? [x, y] : [y, x];
        warns.push(`"${norm}" is should_trigger:true in ${x} and ${y}; ${namer} names ${silent} in ambiguous_with but ${silent} does not name ${namer} — add the reciprocal entry`);
      }
    }
  }

  blocks.sort();
  warns.sort();
  return { blocks, warns };
}
