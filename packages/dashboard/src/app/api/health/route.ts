import { readEnv } from '@/lib/env'

// The route `vegafactory dashboard` polls to decide the server is up. Dynamic on purpose: a
// cached 200 would report health the process no longer has.
export const dynamic = 'force-dynamic'

export function GET(): Response {
  const result = readEnv(process.env as Record<string, string | undefined>)
  const version = result.ok ? result.env.version : '0.0.0'
  return Response.json({ ok: true, version })
}
