import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../..')
const read = (name: string) => readFileSync(resolve(repoRoot, '.github/workflows', name), 'utf8')
// Comment lines carry the audit list and the fallback line verbatim, so the
// assertions on what actually runs read the executable part of each workflow only.
const executable = (name: string) =>
  read(name)
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

describe('CI and release run on a reachable self-hosted runner', () => {
  for (const name of ['ci.yml', 'release.yml']) {
    test(`${name} targets the registered laptop runners, never a hosted one`, () => {
      // The Mac mini's org group (#119) is documented in the comment block but is
      // NOT the target: an ungranted or empty runner group queues a job forever
      // with `runner: null`, and `check (node 24)` is a required status check, so
      // pointing at it before the operator's org-admin grant would strand every PR.
      expect(executable(name)).toMatch(/^ {4}runs-on: \[self-hosted, vsk-runners-mac\]$/m)
      expect(executable(name)).not.toMatch(/^\s*runs-on: ubuntu-latest$/m)
      expect(executable(name)).not.toMatch(/^\s*group: /m)
    })

    test(`${name} names the pending Mac mini group and its provisioning checklist`, () => {
      const body = read(name)
      expect(body).toContain('vsk-runners-mac-mini')
      expect(body).toContain('onboarding/dispatcher-box.md')
    })

    test(`${name} keeps the BSD userland audit valid`, () => {
      const body = executable(name)
      for (const construct of ['sed -i', 'date -d', 'readlink -f', 'base64 -w', 'sort -V', 'grep -P', 'stat -c']) {
        expect(body).not.toContain(construct)
      }
    })
  }
})
