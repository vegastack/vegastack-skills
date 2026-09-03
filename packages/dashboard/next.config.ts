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
  // bun:sqlite is a Bun built-in with no npm counterpart; both of these keep the bundler
  // from trying to resolve it at build time, on a server that only ever runs under Bun.
  serverExternalPackages: ['bun:sqlite'],
  webpack: (webpackConfig: { externals?: unknown[] }) => {
    const externals = webpackConfig.externals ?? []
    webpackConfig.externals = [
      ...(Array.isArray(externals) ? externals : [externals]),
      ({ request }: { request?: string }, callback: (error?: Error | null, result?: string) => void) =>
        request?.startsWith('bun:') ? callback(null, `commonjs ${request}`) : callback(),
    ]
    return webpackConfig
  },
}

export default config
