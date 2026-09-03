import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'VegaFactory',
  description: 'Local read-only view of the factory — throughput, cost, people, skills, board, dispatcher',
}

// `isolate` is required rather than cosmetic: overlay components portal to <body> and need a root
// stacking context to render above page chrome.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="isolate bg-background text-foreground min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
