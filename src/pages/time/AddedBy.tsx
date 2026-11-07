import { useUsers } from '@/api/users'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'

/** "Added by Nour El-Sayed": who added a time entry for its person (add time for). */
export function AddedBy({ userId }: { userId: string }) {
  const { workspace } = useCurrentWorkspace()
  const name = useUsers(workspace?.id).data?.find((u) => u.id === userId)?.name ?? 'someone else'
  return <>Added by {name}</>
}
