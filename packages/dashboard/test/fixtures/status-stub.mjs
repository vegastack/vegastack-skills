#!/usr/bin/env node
// Stands in for `vegafactory status --json` so the bridge can be tested without the CLI.
process.stdout.write(JSON.stringify({
  dispatcher: { running: true, pid: 4242, lastTick: '2026-09-03T11:59:00.000Z', interval: 120 },
  repos: [{
    repo: 'vegastack/vegafactory',
    dispatch: 'local',
    board: { needsPlan: 1, ready: 2, working: 0, forOperator: 3 },
    worktrees: [],
    runs: [],
  }],
}))
