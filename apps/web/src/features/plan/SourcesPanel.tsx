import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Field, Input, Select } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import type { ArtifactSource, SourceKind } from '../../lib/types'

const kinds: SourceKind[] = ['Code', 'Ticket', 'Spezifikation', 'Sonstige']

function stateLabel(state: ArtifactSource['state']) {
  if (state === 'Geprueft') return 'Geprüft'
  if (state === 'ErneutPruefen') return 'Erneut prüfen'
  return 'Ungeprüft'
}

export function SourcesPanel({ projectId, artifactId, canWrite }: { projectId: string; artifactId: string; canWrite: boolean }) {
  const client = useQueryClient()
  const sources = useQuery({
    queryKey: ['sources', projectId, artifactId],
    queryFn: () => api<ArtifactSource[]>(`/api/v1/projects/${projectId}/artifacts/${artifactId}/sources`),
  })
  const [kind, setKind] = useState<SourceKind>('Code')
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [reference, setReference] = useState('')
  const refresh = () => client.invalidateQueries({ queryKey: ['sources', projectId, artifactId] })
  const create = useMutation({
    mutationFn: () => api<ArtifactSource>(`/api/v1/projects/${projectId}/artifacts/${artifactId}/sources`, { method: 'POST', body: { kind, title, target } }),
    onSuccess: () => { setTitle(''); setTarget(''); void refresh() },
  })
  const check = useMutation({
    mutationFn: (id: string) => api(`/api/v1/projects/${projectId}/sources/${id}/check`, { method: 'POST', body: { reference } }),
    onSuccess: () => { setReference(''); void refresh() },
  })
  const update = useMutation({
    mutationFn: (source: ArtifactSource) => api(`/api/v1/projects/${projectId}/sources/${source.id}`, { method: 'PATCH', body: { kind: source.kind, title: source.title, target: source.target } }),
    onSuccess: () => void refresh(),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/projects/${projectId}/sources/${id}`, { method: 'DELETE' }),
    onSuccess: () => void refresh(),
  })
  const pending = sources.data?.some((item) => item.state !== 'Geprueft')
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-semibold">Quellen und Aktualität</h2>
        <p className="text-sm text-muted">Die Prüfung gilt für die hier hinterlegte Zuordnung. Ein geändertes Ziel muss erneut geprüft werden.</p>
        {sources.data && sources.data.length > 0 ? <p className="mt-1 text-sm">{pending ? 'Mindestens eine Quelle ist ungeprüft oder wurde seit der Prüfung geändert.' : 'Alle Quellen sind geprüft.'}</p> : null}
      </div>
      {sources.isLoading ? <p className="text-sm text-muted">Wird geladen …</p> : null}
      {sources.isError ? <p role="alert" className="text-sm text-danger">{errorText(sources.error)}</p> : null}
      <ul className="grid gap-2">
        {sources.data?.map((source) => (
          <li key={source.id} className="rounded-lg border border-line px-3 py-2 text-sm">
            <p className="font-medium">{source.title}</p>
            <p className="text-muted">{source.kind} · {stateLabel(source.state)} · {source.destination}</p>
            {source.checkedByName && source.state === 'Geprueft' ? <p className="text-xs text-muted">Geprüft von {source.checkedByName}{source.checkedReference ? ` · ${source.checkedReference}` : ''}</p> : null}
            {source.state === 'ErneutPruefen' ? <p className="text-xs">Die geänderte Quelle muss erneut geprüft werden.</p> : null}
            {canWrite ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Field label="Ziel"><Input aria-label={`Ziel ${source.title}`} defaultValue={source.target} onBlur={(event) => { if (event.target.value !== source.target) update.mutate({ ...source, target: event.target.value }) }} /></Field>
                <Button size="sm" type="button" onClick={() => check.mutate(source.id)}>Geprüft</Button>
                <Button size="sm" type="button" variant="ghost" onClick={() => remove.mutate(source.id)}>Entfernen</Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {sources.data?.length === 0 ? <p className="text-sm text-muted">Noch keine Quelle.</p> : null}
      {canWrite ? (
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Art">
            <Select aria-label="Quellenart" value={kind} onChange={(event) => setKind(event.target.value as SourceKind)}>
              {kinds.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </Field>
          <Field label="Titel"><Input aria-label="Quellentitel" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
          <Field label="Ziel"><Input aria-label="Quellenziel" placeholder="https://… oder src/…" value={target} onChange={(event) => setTarget(event.target.value)} /></Field>
          <Field label="Referenz für die nächste Prüfung"><Input aria-label="Prüfreferenz" placeholder="Commit oder Version" value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
          <Button className="sm:col-span-2 justify-self-start" type="submit" disabled={create.isPending || title.trim().length === 0 || target.trim().length === 0}>Quelle hinzufügen</Button>
        </form>
      ) : null}
      {create.isError || check.isError || update.isError ? <p role="alert" className="text-sm text-danger">{errorText(create.error ?? check.error ?? update.error)}</p> : null}
    </section>
  )
}
