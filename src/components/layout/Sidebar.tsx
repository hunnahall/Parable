import NavColumn from './NavColumn'

// Fixed 240px sidebar at 1000px and up. Narrower screens get the top bar
// and sheet in MobileSidebarDrawer instead.
export default function Sidebar({
  userEmail,
  inboxCount,
}: {
  userEmail: string
  inboxCount: number
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[var(--sidebar-w)] shrink-0 border-r border-border bg-background min-[1000px]:block">
      <NavColumn userEmail={userEmail} inboxCount={inboxCount} />
    </aside>
  )
}
