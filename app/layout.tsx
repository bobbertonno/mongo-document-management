import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { AppShell } from '@/components/shell/app-shell'
import './globals.css'

export const metadata: Metadata = {
  title: 'Atlas Document Hub',
  description:
    'Enterprise document management and MongoDB Atlas architecture demonstration platform: metadata, versioning, search, auditing and event-driven processing.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F9FBFA' },
    { media: '(prefers-color-scheme: dark)', color: '#001E2B' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
