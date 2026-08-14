import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Parable',
  description: 'A personal dashboard with RSS feeds and economic indicators',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}