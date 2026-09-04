// Month tokens are the control room's directory names — SEP-2026 — so they are the axis every
// filter and query in the dashboard turns on. Uppercase three-letter English only: a token that
// does not round-trip through this module never reaches a file path or a SQL parameter.
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

export function monthToken(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()}`
}

export function parseMonth(token: string): { month: number; year: number } | null {
  const match = /^([A-Z]{3})-(\d{4})$/.exec(token)
  if (!match) return null
  const month = MONTHS.indexOf(match[1] as (typeof MONTHS)[number])
  if (month < 0) return null
  return { month: month + 1, year: Number(match[2]) }
}

// Sorts oldest first, so `.sort(compareMonths)` reads chronologically and `.reverse()` is the
// only thing a newest-first list needs. Unparseable tokens sort last, by their own text.
export function compareMonths(a: string, b: string): number {
  const left = parseMonth(a)
  const right = parseMonth(b)
  if (!left && !right) return a.localeCompare(b)
  if (!left) return 1
  if (!right) return -1
  return left.year - right.year || left.month - right.month
}
