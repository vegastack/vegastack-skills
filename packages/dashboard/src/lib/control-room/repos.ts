import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// repos.md's `| repo | group | board | owner |` table, read as repo → group. The separator row
// and any row whose first cell is not an `owner/name` are passed over, so prose around the table
// costs nothing.
export function parseRepoGroups(reposMd: string): Record<string, string> {
  const groups: Record<string, string> = {}
  for (const line of (reposMd ?? '').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    const repo = cells[0]
    const group = cells[1]
    if (!repo || !group) continue
    if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) continue
    groups[repo] = group
  }
  return groups
}

export async function readRepoGroups(controlRoom: string): Promise<Record<string, string>> {
  try {
    return parseRepoGroups(await readFile(join(controlRoom, 'repos.md'), 'utf8'))
  } catch {
    return {}
  }
}
