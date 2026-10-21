import { ListSkeleton } from '@/components/ui/Skeleton'
import TopLoadingBar from '@/components/ui/TopLoadingBar'

export default function Loading() {
  return (
    <>
      <TopLoadingBar />
      <ListSkeleton />
    </>
  )
}
