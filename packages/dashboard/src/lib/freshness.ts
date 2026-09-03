export interface Freshness {
  syncedAt: string | null
  ageMinutes: number | null
  label: string
  offline: boolean
}

// Freshness has two independent halves, and the banner needs both. `syncedAt` is how old the
// control-room clone on this machine is — `vegafactory sync` writes it into ~/.vegastack/factory.json.
// `offline` is whether the live half (GitHub, the dispatcher) answered on this request. A clone
// synced a minute ago with GitHub unreachable is still offline; a three-hour-old clone with
// GitHub answering is not.
export function freshnessFrom(input: {
  factoryJson: string | null
  org: string
  now: number
  liveOk: boolean
}): Freshness {
  const offline = !input.liveOk
  const never: Freshness = { syncedAt: null, ageMinutes: null, label: 'never synced', offline }

  if (!input.factoryJson) return never
  let parsed: unknown
  try {
    parsed = JSON.parse(input.factoryJson)
  } catch {
    return never
  }
  if (!parsed || typeof parsed !== 'object') return never
  const rooms = (parsed as Record<string, unknown>).controlRooms
  if (!rooms || typeof rooms !== 'object') return never
  const entry = (rooms as Record<string, unknown>)[input.org]
  if (!entry || typeof entry !== 'object') return never
  const syncedAt = (entry as Record<string, unknown>).lastSyncedAt
  if (typeof syncedAt !== 'string') return never
  const at = Date.parse(syncedAt)
  if (Number.isNaN(at)) return never

  const ageMinutes = Math.max(0, Math.round((input.now - at) / 60000))
  return { syncedAt, ageMinutes, label: labelFor(ageMinutes), offline }
}

function labelFor(ageMinutes: number): string {
  if (ageMinutes < 1) return 'synced just now'
  if (ageMinutes < 60) return `synced ${ageMinutes} minute${ageMinutes === 1 ? '' : 's'} ago`
  const hours = Math.round(ageMinutes / 60)
  return `synced ${hours} hour${hours === 1 ? '' : 's'} ago`
}
