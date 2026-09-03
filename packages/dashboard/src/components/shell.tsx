import Link from 'next/link'

import type { Freshness } from '@/lib/freshness'

const VIEWS = [
  { href: '/', label: 'Org' },
  { href: '/people', label: 'People' },
  { href: '/skills', label: 'Skills' },
  { href: '/board', label: 'Board' },
  { href: '/dispatcher', label: 'Dispatcher' },
]

// The six views' common frame. The repo view has no top-level entry because it is reached from
// the org overview's repo rows, which is the only place a repo is worth naming.
export function Shell({ title, freshness, children }: { title: string; freshness: Freshness; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">{freshness.label}</p>
        </div>
        <nav aria-label="Views" className="mt-4 flex flex-wrap gap-4 text-sm">
          {VIEWS.map((view) => (
            <Link key={view.href} href={view.href} className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
              {view.label}
            </Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  )
}
