import type { Freshness } from '@/lib/freshness'

// Shown only when a live source failed on this request. The clone's age is always true and is
// rendered by the shell; this banner is the narrower claim that what you are looking at is not
// live, and it names how stale the cached half is so the reader can judge.
export function OfflineBanner({ freshness, reasons = [] }: { freshness: Freshness; reasons?: string[] }) {
  if (!freshness.offline) return null
  return (
    <div className="border-border bg-muted text-muted-foreground mb-6 rounded-lg border px-4 py-3 text-sm">
      <p className="text-foreground font-medium">Live data is unavailable — showing the control-room clone, {freshness.label}.</p>
      {reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </div>
  )
}
