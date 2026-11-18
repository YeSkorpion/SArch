import { useBlocker } from 'react-router'
import { ConfirmDialog } from './ui'

export function LeaveGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(when)
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset()
      }}
      title="Ungespeicherte Änderungen"
      description="Es gibt noch Änderungen, die nicht auf dem Server angekommen sind. Beim Verlassen bleibt der lokale Entwurf hier nicht erhalten."
      confirmLabel="Trotzdem verlassen"
      onConfirm={() => {
        if (blocker.state === 'blocked') blocker.proceed()
      }}
    />
  )
}
