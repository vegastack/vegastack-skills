import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import type { NextConfig } from 'next'

// The traced root is the workspace root, not this package: Bun hoists next, react and
// @vegastack/design to the root node_modules, and a tracing root inside the package would
// leave the standalone tree missing every one of them.
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  // bun:sqlite is a Bun built-in with no npm counterpart. It is reached through a dynamic import
  // of a computed specifier carrying `turbopackIgnore`, so the bundler leaves it alone; this
  // entry states the same intent for the tracing pass, on a server that only runs under Bun.
  serverExternalPackages: ['bun:sqlite'],
  // Next 16 runs Turbopack by default and errors on a bare `webpack` config. Nothing here needs
  // a custom bundler rule, so the empty object is the whole configuration.
  turbopack: {},
}

export default config
