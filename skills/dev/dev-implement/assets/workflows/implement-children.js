export const meta = {
  name: 'implement-children',
  description: 'Run the independent children of one parent issue, one agent per child in its own worktree',
  whenToUse: 'A parent session whose plan declares independent groups with disjoint file sets, launching those children at the same time. The parent joins the branches afterwards — this workflow never merges anything.',
  phases: [{ title: 'Build children', detail: 'one agent per independent child, isolated in its own worktree' }],
}

// The join contract. children.mjs `evaluateJoin` consumes exactly these fields:
// a child is merged only when status is 'done' and its files stayed inside the
// set the plan declared for it.
const CHILD_RESULT = {
  type: 'object',
  required: ['issue', 'status', 'branch', 'head', 'files', 'message'],
  properties: {
    issue: { type: 'number', description: 'the child issue number' },
    status: { type: 'string', enum: ['done', 'failed'], description: 'done only when the work is complete and verified' },
    branch: { type: 'string', description: 'the branch the child created from the parent HEAD sha' },
    head: { type: 'string', description: 'the sha at the tip of that branch, or an empty string when nothing was committed' },
    files: { type: 'array', items: { type: 'string' }, description: 'every path the child changed' },
    message: { type: 'string', description: 'one line: what was built, or why it failed' },
  },
}

// A workflow script has no filesystem and no Node APIs, so everything the run
// needs arrives in `args` from children.mjs `claudeWorkflowCall`. The parent
// session owns the join: the worktrees, the diffs and the merges all happen
// there, never here.
export default async function ({ args, agent, pipeline, log }) {
  log('implement-children: ' + args.children.length + ' children of #' + args.parentIssue
    + ' from ' + args.parentBranch + ' @ ' + args.parentHead
    + ', at most ' + args.concurrency + ' at once')

  const results = await pipeline(args.children, async (_previous, child) =>
    agent(child.prompt, {
      label: '#' + child.issue,
      phase: 'Build children',
      isolation: 'worktree',
      schema: CHILD_RESULT,
    }))

  // A skipped or dead agent yields null; the parent treats a child with no
  // result as failed, which is what a missing entry means to evaluateJoin.
  return results.filter(Boolean)
}
