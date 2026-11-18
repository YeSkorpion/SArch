import type { ReactNode } from 'react'
import { errorText } from '../lib/api'
import { Button } from './ui'

export function Loading({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="grid gap-2 p-6" role="status">
      <p className="text-sm text-muted">{label}</p>
      <div className="h-10 animate-pulse rounded-md bg-line/70" />
      <div className="h-10 w-4/5 animate-pulse rounded-md bg-line/50" />
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-card p-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-card p-6" role="alert">
      <h2 className="font-semibold">Das hat nicht geklappt</h2>
      <p className="mt-1 text-sm">{errorText(error)}</p>
      {onRetry ? (
        <Button className="mt-4" type="button" onClick={onRetry}>
          Erneut versuchen
        </Button>
      ) : null}
    </div>
  )
}

export function ConflictBanner({ onReload, onKeep }: { onReload: () => void; onKeep: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-warning bg-warning/10 px-3 py-2 text-sm">
      Jemand hat diese Fassung gerade gespeichert. Deine Änderungen sind noch hier.
      <Button size="sm" type="button" onClick={onReload}>Serverstand laden</Button>
      <Button size="sm" type="button" variant="primary" onClick={onKeep}>Meine Fassung speichern</Button>
    </div>
  )
}

export function SaveBadge({ state }: { state: 'saved' | 'saving' | 'error' | 'conflict' | 'idle' }) {
  const text = state === 'saving' ? 'Wird gespeichert' : state === 'saved' ? 'Gespeichert' : state === 'error' ? 'Speichern fehlgeschlagen' : state === 'conflict' ? 'Konflikt' : 'Bereit'
  return (
    <span className={state === 'error' || state === 'conflict' ? 'text-sm text-danger' : 'text-sm text-muted'} role="status">
      {text}
    </span>
  )
}
