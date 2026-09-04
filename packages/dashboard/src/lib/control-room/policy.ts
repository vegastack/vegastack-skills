import { join } from 'node:path'

import { readOrEmpty } from '../read'

export interface Policy {
  stats: 'on' | 'off'
  statsPeople: 'on' | 'off'
}

const knob = (text: string, name: string): 'on' | 'off' | null => {
  const match = new RegExp(`^${name}:\\s*([^\\s#]+)`, 'm').exec(text)
  if (!match) return null
  return match[1] === 'on' ? 'on' : match[1] === 'off' ? 'off' : null
}

// org.md sets the policy, groups/<g>/group.md may override it. Every unreadable, absent or
// unrecognised value is `off`: a privacy knob that fails open would publish people-level numbers
// the moment a file went missing.
export async function readPolicy(controlRoom: string, group: string | null): Promise<Policy> {
  const org = await readOrEmpty(join(controlRoom, 'org.md'))
  const groupText = group ? await readOrEmpty(join(controlRoom, 'groups', group, 'group.md')) : ''
  const resolve = (name: string): 'on' | 'off' => knob(groupText, name) ?? knob(org, name) ?? 'off'
  return { stats: resolve('stats'), statsPeople: resolve('stats-people') }
}
