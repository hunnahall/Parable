import NavColumn from './NavColumn'
import type { ShellData } from './sidebarNav'

// Fixed 240px sidebar at 1000px and up. Narrower screens get the top bar
// and sheet in MobileSidebarDrawer instead.
export default function Sidebar({ shell }: { shell: ShellData }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[var(--sidebar-w)] shrink-0 border-r border-border bg-background min-[1000px]:block">
      <NavColumn shell={shell} />
    </aside>
  )
}
