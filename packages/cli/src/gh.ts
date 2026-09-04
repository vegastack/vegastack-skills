// The async `gh` client the vegafactory CLI uses. It mirrors the contract of the packaged
// `skills/dev/dev-implement/scripts/lib/gh.mjs` — explicit argv, never a shell, fail closed on
// anything unparseable, and a `VSK_GH` seam so tests can point at a stub — but it is a separate
// file on purpose: that one is `execFileSync`, and a synchronous call would stall the dispatcher's
// watch loop for the length of every API round trip.
import { spawn } from 'node:child_process'

export interface GhOptions {
  gh?: string
  input?: string
  cwd?: string
}

// A named failure, never a null result: a caller that cannot tell "no rows" from "the API refused"
// will eventually treat a 403 as an empty board and act on it.
export class GhUnavailable extends Error {
  readonly httpStatus: number | null
  constructor(message: string, httpStatus: number | null = null) {
    super(message)
    this.name = 'GhUnavailable'
    this.httpStatus = httpStatus
  }
}

function binary(options: GhOptions | undefined): string {
  return options?.gh ?? process.env.VSK_GH ?? 'gh'
}

// gh prints its HTTP failures as `HTTP 403: …` or `… (HTTP 404)`; both shapes are read so a caller
// can distinguish a rate limit from a missing repo without re-running the call.
function statusOf(text: string): number | null {
  const match = /HTTP (\d{3})/.exec(text)
  return match ? Number(match[1]) : null
}

// `spawn` rather than `execFile`, because stdin is part of the contract: `execFile` has no `input`
// option, and a caller that needs to POST a body would otherwise have to build a shell pipeline.
export function ghText(args: string[], options?: GhOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary(options), args, { cwd: options?.cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => {
      reject(new GhUnavailable(`gh ${args.join(' ')} could not be run: ${(error as Error).message}`))
    })
    child.on('close', code => {
      if (code === 0) return resolve(stdout)
      const message = stderr.trim() || `exit ${code}`
      reject(new GhUnavailable(`gh ${args.join(' ')} failed: ${message}`, statusOf(message)))
    })
    if (typeof options?.input === 'string') child.stdin.end(options.input)
    else child.stdin.end()
  })
}

export async function ghJson<T>(args: string[], options?: GhOptions): Promise<T> {
  const stdout = await ghText(args, options)
  try {
    return JSON.parse(stdout) as T
  } catch {
    throw new GhUnavailable(`gh ${args.join(' ')} returned output that is not JSON: ${stdout.trim().slice(0, 200)}`)
  }
}
