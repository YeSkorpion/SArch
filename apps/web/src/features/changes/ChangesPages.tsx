import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router'
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '../../components/ui'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { ApiError, api, errorText } from '../../lib/api'
import { artifactHref, searchTypeLabel } from '../../lib/labels'
import type { Area, Member, PackageDetail, PackageStatus, PackageSummary, SearchHit, SnapshotChange, SnapshotDetail, SnapshotSummary } from '../../lib/types'
import type { ProjectOutlet } from '../shell/Shell'
import { UsagePanel } from '../usage/UsagePanel'
import { AreaOptions } from '../areas/AreaOptions'

function statusLabel(status: PackageStatus) {
  if (status === 'InPruefung') return 'In Prüfung'
  return status
}

export function ChangesPage() {
  const { project, canWrite, user } = useOutletContext<ProjectOutlet>()
  const client = useQueryClient()
  const packages = useQuery({ queryKey: ['packages', project.id], queryFn: () => api<PackageSummary[]>(`/api/v1/projects/${project.id}/packages`) })
  const members = useQuery({ queryKey: ['members', project.id], queryFn: () => api<Member[]>(`/api/v1/projects/${project.id}/members`) })
  const areas = useQuery({ queryKey: ['areas', project.id], queryFn: () => api<Area[]>(`/api/v1/projects/${project.id}/areas`) })
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [areaId, setAreaId] = useState('')
  const [ownerId, setOwnerId] = useState(user.id)
  const [reviewerId, setReviewerId] = useState('')
  const create = useMutation({
    mutationFn: () => api<PackageDetail>(`/api/v1/projects/${project.id}/packages`, { method: 'POST', body: { title, goal, areaId: areaId || null, ownerId, reviewerId: reviewerId || null } }),
    onSuccess: async () => {
      setOpen(false)
      setTitle('')
      setGoal('')
      await client.invalidateQueries({ queryKey: ['packages', project.id] })
    },
  })
  if (packages.isLoading) return <Loading />
  if (packages.isError) return <div className="p-6"><ErrorState error={packages.error} onRetry={() => void packages.refetch()} /></div>
  return (
    <div className="grid w-full gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Änderungen</h1>
          <p className="mt-1 text-sm text-muted">Vorhaben sammeln, prüfen und übergeben.</p>
        </div>
        {canWrite && packages.data?.length ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Änderungspaket anlegen</Button> : null}
      </header>
      {packages.data?.length === 0 ? (
        <EmptyState title="Noch keine Änderungspakete" body="Bündele die Artefakte eines Vorhabens und gib eine Fassung zur Prüfung." action={canWrite ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Änderungspaket anlegen</Button> : undefined} />
      ) : (
        <ul className="grid gap-2">
          {packages.data?.map((item) => (
            <li key={item.id}>
              <Link className="grid gap-1 rounded-xl border border-line bg-card px-4 py-3 hover:bg-background" to={`/projekte/${project.id}/aenderungen/${item.id}`}>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{item.title}</span>
                  <Badge tone={item.status === 'Freigegeben' ? 'ok' : item.reviewStale ? 'warning' : 'neutral'}>{item.reviewStale ? 'Überholt' : statusLabel(item.status)}</Badge>
                </span>
                {item.goal ? <span className="line-clamp-2 text-sm text-muted">{item.goal}</span> : null}
                <span className="truncate text-xs text-muted">{item.ownerName}{item.reviewerName ? ` · Prüfung ${item.reviewerName}` : ' · Prüfung offen'}{item.areaName ? ` · ${item.areaName}` : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ProjectSnapshots projectId={project.id} canWrite={canWrite} />
      <Modal open={open} onOpenChange={setOpen} title="Änderungspaket anlegen">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Titel"><Input required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
          <Field label="Ziel"><Textarea required value={goal} onChange={(event) => setGoal(event.target.value)} /></Field>
          <Field label="Fachbereich">
            <Select aria-label="Fachbereich" value={areaId} onChange={(event) => setAreaId(event.target.value)}>
              <option value="">Keiner</option>
              <AreaOptions areas={areas.data} />
            </Select>
          </Field>
          <Field label="Verantwortlich">
            <Select aria-label="Verantwortlich" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              {members.data?.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
            </Select>
          </Field>
          <Field label="Prüfer">
            <Select aria-label="Prüfer" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}>
              <option value="">Noch niemand</option>
              {members.data?.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
            </Select>
          </Field>
          {create.isError ? <p role="alert" className="text-sm text-danger">{errorText(create.error)}</p> : null}
          <Button type="submit" variant="primary" disabled={create.isPending}>Anlegen</Button>
        </form>
      </Modal>
    </div>
  )
}

export function PackageDetailPage() {
  const { project, canWrite, user } = useOutletContext<ProjectOutlet>()
  const { packageId = '' } = useParams()
  const client = useQueryClient()
  const detail = useQuery({ queryKey: ['package', project.id, packageId], queryFn: () => api<PackageDetail>(`/api/v1/projects/${project.id}/packages/${packageId}`) })
  const [note, setNote] = useState('Ablauf anpassen')
  const [term, setTerm] = useState('')
  const [comment, setComment] = useState('')
  const [target, setTarget] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [reason, setReason] = useState('')
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ title: '', goal: '', areaId: '', ownerId: '', reviewerId: '' })
  const members = useQuery({ queryKey: ['members', project.id], queryFn: () => api<Member[]>(`/api/v1/projects/${project.id}/members`) })
  const areas = useQuery({ queryKey: ['areas', project.id], queryFn: () => api<Area[]>(`/api/v1/projects/${project.id}/areas`) })
  const impactId = params.get('auswirkung') ?? ''
  const impactOpener = useRef<HTMLButtonElement | null>(null)
  function showImpact(id: string) {
    const next = new URLSearchParams(params)
    if (id) next.set('auswirkung', id)
    else next.delete('auswirkung')
    setParams(next, { replace: true })
  }
  const [message, setMessage] = useState('')
  const search = useQuery({
    queryKey: ['search', project.id, term],
    queryFn: () => api<SearchHit[]>(`/api/v1/projects/${project.id}/search?q=${encodeURIComponent(term)}`),
    enabled: term.trim().length > 1,
  })
  function refresh(next?: PackageDetail) {
    if (next) client.setQueryData(['package', project.id, packageId], next)
    setMessage('')
  }
  function fail(error: unknown) {
    setMessage(errorText(error))
    if (error instanceof ApiError && error.code === 'version_conflict') void detail.refetch()
  }
  const add = useMutation({
    mutationFn: (hit: SearchHit) => api<PackageDetail>(`/api/v1/projects/${project.id}/packages/${packageId}/items`, { method: 'POST', body: { version: detail.data!.version, artifactId: hit.id, note } }),
    onSuccess: (next) => { refresh(next); setTerm('') },
    onError: fail,
  })
  const commentSave = useMutation({
    mutationFn: () => api<PackageDetail>(`/api/v1/projects/${project.id}/packages/${packageId}/comments`, { method: 'POST', body: { version: detail.data!.version, text: comment, artifactId: target || null, assigneeId: assigneeId || null } }),
    onSuccess: (next) => { refresh(next); setComment('') },
    onError: fail,
  })
  const act = useMutation({
    mutationFn: (action: 'submit' | 'approve' | 'request-changes') => api<PackageDetail>(`/api/v1/projects/${project.id}/packages/${packageId}/${action}`, { method: 'POST', body: action === 'request-changes' ? { version: detail.data!.version, reason } : { version: detail.data!.version } }),
    onSuccess: (next) => { refresh(next); setReason('') },
    onError: fail,
  })
  const saveMeta = useMutation({
    mutationFn: () => api<PackageDetail>(`/api/v1/projects/${project.id}/packages/${packageId}`, {
      method: 'PATCH',
      body: { version: detail.data!.version, title: draft.title, goal: draft.goal, areaId: draft.areaId || null, ownerId: draft.ownerId, reviewerId: draft.reviewerId || null },
    }),
    onSuccess: (next) => { refresh(next); setEditing(false) },
    onError: fail,
  })
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api<PackageDetail>(`/api/v1/projects/${project.id}/packages/${packageId}/items/${itemId}?version=${detail.data!.version}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: fail,
  })
  const handover = useMutation({
    mutationFn: () => api<{ markdown: string }>(`/api/v1/projects/${project.id}/packages/${packageId}/handover`),
    onSuccess: async (result) => {
      try { await navigator.clipboard.writeText(result.markdown) } catch { /* Der Download bleibt verfügbar. */ }
      const blob = new Blob([result.markdown], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${detail.data?.title ?? 'uebergabe'}.md`
      link.click()
      URL.revokeObjectURL(url)
      setMessage('Übergabe kopiert und heruntergeladen.')
    },
    onError: fail,
  })
  if (detail.isLoading) return <Loading />
  if (detail.isError || !detail.data) return <div className="p-6"><ErrorState error={detail.error} onRetry={() => void detail.refetch()} /></div>
  const item = detail.data
  const canReview = project.role === 'Owner' || (project.role === 'Editor' && item.reviewerId === user.id)
  const impact = item.items.find((entry) => entry.artifactId === impactId && !entry.missing)
  const primary = item.status === 'Freigegeben'
    ? <Button type="button" variant="primary" onClick={() => handover.mutate()}>Übergabe als Markdown</Button>
    : canWrite && (item.status === 'Entwurf' || item.reviewStale)
      ? <Button type="button" variant="primary" onClick={() => act.mutate('submit')}>Zur Prüfung einreichen</Button>
      : canReview && item.status === 'InPruefung'
        ? <Button type="button" variant="primary" onClick={() => act.mutate('approve')}>Freigeben</Button>
        : null
  return (
    <div className="grid w-full gap-6 px-4 py-6 md:px-6">
      <header className="grid gap-3">
        <Link className="text-sm text-muted underline-offset-2 hover:underline" to={`/projekte/${project.id}/aenderungen`}>Zur Änderungsliste</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
            <Badge tone={item.status === 'Freigegeben' ? 'ok' : item.reviewStale ? 'warning' : 'accent'}>{item.reviewStale ? 'Prüfstand überholt' : statusLabel(item.status)}</Badge>
          </div>
          {primary}
        </div>
        {editing ? (
          <form className="grid gap-3 rounded-xl border border-line bg-card p-4" onSubmit={(event) => { event.preventDefault(); saveMeta.mutate() }}>
            <Field label="Titel"><Input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
            <Field label="Ziel"><Textarea required value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Fachbereich">
                <Select aria-label="Fachbereich" value={draft.areaId} onChange={(event) => setDraft({ ...draft, areaId: event.target.value })}>
                  <option value="">Keiner</option>
                  <AreaOptions areas={areas.data} />
                </Select>
              </Field>
              <Field label="Verantwortlich">
                <Select aria-label="Verantwortlich" value={draft.ownerId} onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })}>
                  {members.data?.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
                </Select>
              </Field>
              <Field label="Prüfer">
                <Select aria-label="Prüfer" value={draft.reviewerId} onChange={(event) => setDraft({ ...draft, reviewerId: event.target.value })}>
                  <option value="">Noch niemand</option>
                  {members.data?.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={saveMeta.isPending}>Angaben speichern</Button>
              <Button type="button" onClick={() => setEditing(false)}>Abbrechen</Button>
            </div>
          </form>
        ) : (
          <div className="grid gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <dl className="grid flex-1 gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted">Verantwortlich</dt>
                  <dd className="truncate text-sm">{item.ownerName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Prüfung</dt>
                  <dd className="truncate text-sm">{item.reviewerName ?? 'nicht zugewiesen'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Bereich</dt>
                  <dd className="truncate text-sm">{item.areaName ?? 'keiner'}</dd>
                </div>
              </dl>
              {canWrite && item.status === 'Entwurf' ? (
                <Button size="sm" type="button" onClick={() => { setDraft({ title: item.title, goal: item.goal, areaId: item.areaId ?? '', ownerId: item.ownerId, reviewerId: item.reviewerId ?? '' }); setEditing(true) }}>Angaben bearbeiten</Button>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted">Ziel</p>
              <p className="text-sm">{item.goal}</p>
            </div>
          </div>
        )}
      </header>
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Betroffene Artefakte</h2>
          {canWrite && item.status !== 'Freigegeben' ? <Button size="sm" type="button" aria-expanded={adding} onClick={() => setAdding((value) => !value)}>Artefakt hinzufügen</Button> : null}
        </div>
        {adding ? (
          <div className="grid gap-3 rounded-xl border border-line bg-card p-4">
            <Field label="Artefakt suchen">
              <Input aria-label="Artefakt suchen" placeholder="Name oder Schlüssel" value={term} onChange={(event) => setTerm(event.target.value)} />
            </Field>
            <Field label="Notiz" hint="Kurz, was an diesem Artefakt zu tun ist.">
              <Input aria-label="Notiz zum Artefakt" value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            {term.trim().length > 1 && search.data?.length === 0 ? <p className="text-sm text-muted">Kein passendes Artefakt.</p> : null}
            <ul className="grid gap-1">
              {search.data?.map((hit) => (
                <li key={hit.id}>
                  <button className="w-full rounded-md px-2 py-1.5 text-left hover:bg-background" type="button" onClick={() => add.mutate(hit)}>
                    <span className="block text-xs text-muted">{searchTypeLabel(hit.type)}</span>
                    <span className="block truncate text-sm">{hit.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {item.items.length === 0 ? <p className="text-sm text-muted">Noch keine Artefakte im Paket.</p> : (
          <ul className="overflow-hidden rounded-xl border border-line bg-card">
            {item.items.map((entry) => (
              <li key={entry.id} className="grid gap-2 border-b border-line px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <span className="text-xs text-muted">{searchTypeLabel(entry.artifactType)}</span>
                  {entry.missing ? <span className="block truncate font-medium">{entry.artifactTitle}</span> : <Link className="block truncate font-medium hover:text-accent" to={artifactHref(project.id, entry.artifactType, entry.artifactId, entry.diagramId)}>{entry.artifactTitle}</Link>}
                  <span className="block truncate text-sm text-muted">{entry.missing ? 'nicht mehr im Projekt' : entry.note}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.missing ? null : (
                    <Button size="sm" type="button" onClick={(event) => { impactOpener.current = event.currentTarget; showImpact(entry.artifactId) }}>Auswirkungen ansehen</Button>
                  )}
                  {canWrite && item.status === 'Entwurf' ? <Button size="sm" type="button" variant="ghost" onClick={() => removeItem.mutate(entry.id)}>Entfernen</Button> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog.Root open={Boolean(impact)} onOpenChange={(open) => { if (!open) showImpact('') }}>
        <Dialog.Portal>
          <Dialog.Overlay className="studio-overlay fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content
            className="studio-drawer studio-drawer-end fixed inset-y-0 right-0 z-50 w-[min(32rem,100%)] overflow-auto border-l border-line bg-card p-4 shadow-overlay"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => { event.preventDefault(); impactOpener.current?.focus() }}
          >
            <Dialog.Title className="text-lg font-semibold">Auswirkungen</Dialog.Title>
            {impact ? <p className="mt-1 text-sm text-muted">Bezug: {impact.artifactTitle}</p> : null}
            <Dialog.Close className="mt-3 text-sm underline" type="button">Schließen</Dialog.Close>
            {impact ? <UsagePanel projectId={project.id} artifactId={impact.artifactId} title={impact.artifactTitle} heading={false} /> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Kommentare</h2>
        {item.comments.length === 0 ? <p className="text-sm text-muted">Keine Kommentare.</p> : null}
        <ul className="grid gap-2">
          {item.comments.map((entry) => (
            <li id={`kommentar-${entry.id}`} key={entry.id} className="rounded-lg border border-line bg-card px-3 py-2 text-sm">
              <p className="text-xs text-muted">{entry.authorName} · {entry.targetTitle}{entry.missing ? ' · Ziel nicht mehr im Projekt' : ''} · {entry.status}</p>
              <p>{entry.text}</p>
              {canWrite && entry.status === 'Offen' ? <button className="text-xs text-accent underline-offset-2 hover:underline" type="button" onClick={() => void api(`/api/v1/projects/${project.id}/packages/${packageId}/comments/${entry.id}/status`, { method: 'POST', body: { version: item.version, status: 'Erledigt' } }).then((next) => refresh(next as PackageDetail)).catch(fail)}>Erledigt</button> : null}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form className="grid gap-3 rounded-xl border border-line bg-card p-4" onSubmit={(event) => { event.preventDefault(); commentSave.mutate() }}>
            <Field label="Bezieht sich auf">
              <Select aria-label="Kommentarziel" value={target} onChange={(event) => setTarget(event.target.value)}>
                <option value="">Paket</option>
                {item.items.map((entry) => <option key={entry.id} value={entry.artifactId}>{entry.artifactTitle}</option>)}
              </Select>
            </Field>
            <Field label="Zuweisen an">
              <Select aria-label="Zuweisen an" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="">Paketverantwortliche Person</option>
                {members.data?.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
              </Select>
            </Field>
            <Field label="Kommentar">
              <Textarea aria-label="Kommentar" placeholder="Was soll geprüft oder geändert werden?" value={comment} onChange={(event) => setComment(event.target.value)} />
            </Field>
            <Button type="submit">Kommentar speichern</Button>
          </form>
        ) : null}
      </section>
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Prüfung</h2>
        {item.decisions.map((entry) => (
          <p key={entry.id} className="text-sm text-muted">{entry.actorName}: {entry.action}{entry.reason ? ` · ${entry.reason}` : ''}</p>
        ))}
        {item.reviewSnapshotId ? <p className="text-sm">Aktueller Prüfstand: <Link className="underline-offset-2 hover:underline" to={`/projekte/${project.id}/staende/${item.reviewSnapshotId}`}>Fassung öffnen</Link></p> : null}
        {item.approvedSnapshotId ? <p className="text-sm">Die Freigabe bezieht sich auf <Link className="underline-offset-2 hover:underline" to={`/projekte/${project.id}/staende/${item.approvedSnapshotId}`}>diesen Stand</Link>.</p> : null}
        {canReview && item.status === 'InPruefung' ? (
          <div className="flex flex-wrap items-end gap-2">
            <Input aria-label="Begründung" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Begründung" />
            <Button type="button" onClick={() => act.mutate('request-changes')}>Änderungen anfordern</Button>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function ProjectSnapshots({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const client = useQueryClient()
  const snapshots = useQuery({ queryKey: ['snapshots', projectId], queryFn: () => api<SnapshotSummary[]>(`/api/v1/projects/${projectId}/snapshots`) })
  const [name, setName] = useState('')
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const create = useMutation({
    mutationFn: () => api(`/api/v1/projects/${projectId}/snapshots`, { method: 'POST', body: { name } }),
    onSuccess: async () => {
      setName('')
      await client.invalidateQueries({ queryKey: ['snapshots', projectId] })
    },
  })
  const compare = useQuery({
    queryKey: ['compare', projectId, left, right],
    queryFn: () => api<{ changes: SnapshotChange[] }>(`/api/v1/projects/${projectId}/snapshot-compare?left=${left}&right=${right}`),
    enabled: Boolean(left && right && left !== right),
  })
  const projectSnapshots = snapshots.data?.filter((item) => item.scope === 'project') ?? []
  return (
    <section className="grid gap-3 rounded-xl border border-line bg-card p-4">
      <div>
        <h2 className="text-lg font-semibold">Projektstände</h2>
        <p className="mt-1 text-sm text-muted">Ein Stand hält das Projekt unter einem Namen fest und lässt sich später vergleichen.</p>
      </div>
      {canWrite ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <Field label="Name des Stands">
              <Input aria-label="Name des Stands" value={name} onChange={(event) => setName(event.target.value)} placeholder="Zum Beispiel Übergabe März" />
            </Field>
          </div>
          <Button type="submit" disabled={create.isPending || name.trim().length === 0}>Stand speichern</Button>
        </form>
      ) : null}
      {create.isError ? <p role="alert" className="text-sm text-danger">{errorText(create.error)}</p> : null}
      {snapshots.data?.length === 0 ? <p className="text-sm text-muted">Noch kein benannter Projektstand.</p> : (
        <ul className="divide-y divide-line">
          {snapshots.data?.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <Link className="min-w-0 truncate font-medium hover:text-accent" to={`/projekte/${projectId}/staende/${item.id}`}>{item.name}</Link>
              <span className="text-xs text-muted">{item.scope === 'package' ? 'Prüfstand' : 'Projekt'} · {item.createdByName} · {new Date(item.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </li>
          ))}
        </ul>
      )}
      {projectSnapshots.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Linker Stand" value={left} onChange={(event) => setLeft(event.target.value)}>
            <option value="">Ausgangsstand</option>
            {projectSnapshots.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Select aria-label="Rechter Stand" value={right} onChange={(event) => setRight(event.target.value)}>
            <option value="">Vergleichsstand</option>
            {projectSnapshots.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </div>
      ) : null}
      {compare.data ? <ChangeList projectId={projectId} changes={compare.data.changes} right={right} /> : null}
      {compare.isError ? <p role="alert" className="text-sm text-danger">{errorText(compare.error)}</p> : null}
    </section>
  )
}

function ChangeList({ projectId, changes, right }: { projectId: string; changes: SnapshotChange[]; right: string }) {
  const labels = { added: 'Hinzugefügt', changed: 'Geändert', removed: 'Entfernt', position: 'Nur Position' }
  if (changes.length === 0) return <p className="text-sm text-muted">Keine Unterschiede.</p>
  return (
    <ul className="grid gap-1 text-sm">
      {changes.map((change) => (
        <li key={`${change.change}-${change.type}-${change.id}`}>
          <span className="text-muted">{labels[change.change]} · {searchTypeLabel(change.type)} · </span>
          <Link className="underline-offset-2 hover:underline" to={`/projekte/${projectId}/staende/${right}?artefakt=${change.id}`}>{change.title}</Link>
          {change.fields.length ? <span className="text-muted"> · {change.fields.join(', ')}</span> : null}
        </li>
      ))}
    </ul>
  )
}

export function SnapshotPage() {
  const { project } = useOutletContext<ProjectOutlet>()
  const { snapshotId = '' } = useParams()
  const [params] = useSearchParams()
  const focus = params.get('artefakt')
  const detail = useQuery({ queryKey: ['snapshot', project.id, snapshotId], queryFn: () => api<SnapshotDetail>(`/api/v1/projects/${project.id}/snapshots/${snapshotId}`) })
  useEffect(() => {
    if (!focus || !detail.data) return
    document.getElementById(focus)?.scrollIntoView({ block: 'center' })
  }, [focus, detail.data])
  if (detail.isLoading) return <Loading />
  if (detail.isError || !detail.data) return <div className="p-6"><ErrorState error={detail.error} onRetry={() => void detail.refetch()} /></div>
  const live = new Set(detail.data.liveIds)
  return (
    <div className="grid w-full gap-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{detail.data.name}</h1>
        <p className="mt-1 text-sm text-muted">{detail.data.createdByName} · {detail.data.scope === 'package' ? 'Prüfstand' : 'Projektstand'}</p>
      </header>
      <ul className="grid gap-2">
        {detail.data.document.artifacts.filter((item) => item.type !== 'edge').map((item) => (
          <li key={item.id} id={item.id} className="rounded-lg border border-line bg-card px-3 py-2 text-sm">
            <p className="text-xs text-muted">{searchTypeLabel(item.type)}{item.areaName ? ` · ${item.areaName}` : ''}</p>
            <p className="font-medium">{item.title}</p>
            {item.content ? <p className="text-muted">{item.content}</p> : null}
            {live.has(item.id) ? <Link className="underline-offset-2 hover:underline" to={artifactHref(project.id, item.type, item.id, item.diagramId)}>Aktuelle Fassung</Link> : <p className="text-xs text-muted">Nur in dieser Fassung vorhanden.</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
