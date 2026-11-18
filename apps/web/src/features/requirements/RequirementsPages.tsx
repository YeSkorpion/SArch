import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useOutletContext, useParams, useSearchParams } from 'react-router'
import { LeaveGuard } from '../../components/LeaveGuard'
import { ConflictBanner, EmptyState, ErrorState, Loading, SaveBadge } from '../../components/states'
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Textarea } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { useAutosave } from '../../lib/autosave'
import { priorityLabel, requirementStatusLabel } from '../../lib/labels'
import { useRememberScroll } from '../../lib/scroll'
import type { Area, Impact, Page, Requirement, RequirementPriority, RequirementStatus } from '../../lib/types'
import { LinkPanel } from '../links/LinkPanel'
import { UsagePanel } from '../usage/UsagePanel'
import type { ProjectOutlet } from '../shell/Shell'
import { AcceptancePanel } from '../plan/PlanPages'
import { SourcesPanel } from '../plan/SourcesPanel'
import { AreaOptions } from '../areas/AreaOptions'

const statuses: RequirementStatus[] = ['Offen', 'InBearbeitung', 'Erledigt', 'Zurueckgestellt']
const priorities: RequirementPriority[] = ['Niedrig', 'Mittel', 'Hoch', 'Kritisch']

export function RequirementsPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const location = useLocation()
  useRememberScroll(`${location.pathname}${location.search}`)
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const priority = params.get('priority') ?? ''
  const missing = params.get('missing') ?? ''
  const q = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('seite') ?? '1') || 1)
  const query = new URLSearchParams()
  if (status) query.set('status', status)
  if (priority) query.set('priority', priority)
  if (missing) query.set('missing', missing)
  if (q) query.set('q', q)
  if (page > 1) query.set('page', String(page))
  const list = useQuery({
    queryKey: ['requirements', project.id, status, priority, missing, q, page],
    queryFn: () => api<Page<Requirement>>(`/api/v1/projects/${project.id}/requirements?${query.toString()}`),
  })
  const [open, setOpen] = useState(params.get('neu') === '1' && canWrite)
  const [title, setTitle] = useState('')
  useEffect(() => {
    if (params.get('neu') !== '1') return
    const next = new URLSearchParams(params)
    next.delete('neu')
    setParams(next, { replace: true })
  }, [params, setParams])
  const client = useQueryClient()
  const create = useMutation({
    mutationFn: () => api<Requirement>(`/api/v1/projects/${project.id}/requirements`, { method: 'POST', body: { title } }),
    onSuccess: async () => {
      setOpen(false)
      setTitle('')
      await client.invalidateQueries({ queryKey: ['requirements', project.id] })
    },
  })

  const filters = [
    status ? { key: 'status', label: requirementStatusLabel(status as RequirementStatus) } : null,
    priority ? { key: 'priority', label: priorityLabel(priority as RequirementPriority) } : null,
    missing === 'process' ? { key: 'missing', label: 'Ohne Prozessschritt' } : null,
    missing === 'screen' ? { key: 'missing', label: 'Ohne Screen' } : null,
    missing === 'component' ? { key: 'missing', label: 'Ohne Komponente' } : null,
    q ? { key: 'q', label: `„${q}“` } : null,
  ].filter((item): item is { key: string; label: string } => item !== null)
  const hasItems = (list.data?.items.length ?? 0) > 0
  const total = list.data?.totalCount ?? 0
  const pageSize = list.data?.pageSize ?? 30
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const createButton = canWrite ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Anforderung anlegen</Button> : undefined
  return (
    <div className="grid w-full gap-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Anforderungen"
        description="Schlüssel, Titel, Status und Priorität bleiben in der Liste sichtbar."
        action={hasItems || filters.length > 0 ? createButton : undefined}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-9 w-full sm:max-w-xs" aria-label="Anforderungen suchen" placeholder="Schlüssel oder Titel" value={q} onChange={(event) => setFilter(params, setParams, 'q', event.target.value)} />
        <Select className="studio-inline" aria-label="Status filtern" value={status} onChange={(event) => setFilter(params, setParams, 'status', event.target.value)}>
          <option value="">Status</option>
          {statuses.map((item) => <option key={item} value={item}>{requirementStatusLabel(item)}</option>)}
        </Select>
        <Select className="studio-inline" aria-label="Priorität filtern" value={priority} onChange={(event) => setFilter(params, setParams, 'priority', event.target.value)}>
          <option value="">Priorität</option>
          {priorities.map((item) => <option key={item} value={item}>{priorityLabel(item)}</option>)}
        </Select>
        <Select className="studio-inline" aria-label="Zuordnung filtern" value={missing} onChange={(event) => setFilter(params, setParams, 'missing', event.target.value)}>
          <option value="">Zuordnung</option>
          <option value="process">Ohne Prozessschritt</option>
          <option value="screen">Ohne Screen</option>
          <option value="component">Ohne Komponente</option>
        </Select>
        {filters.length > 0 ? (
          <Button size="sm" type="button" onClick={() => setParams(new URLSearchParams())}>Filter zurücksetzen</Button>
        ) : null}
        {list.data && total > 0 ? <span className="text-sm text-muted sm:ml-auto">{filters.length > 0 ? `${total} Treffer` : `${total} ${total === 1 ? 'Anforderung' : 'Anforderungen'}`}</span> : null}
      </div>
      {filters.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Aktive Filter">
          {filters.map((filter) => (
            <li key={filter.key}>
              <button className="rounded-full bg-card px-3 py-1 text-sm" type="button" onClick={() => setFilter(params, setParams, filter.key, '')}>
                {filter.label} entfernen
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {list.isLoading ? <Loading /> : null}
      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.data?.items.length === 0 && filters.length === 0 ? (
        <EmptyState title="Noch keine Anforderungen" body="Die erste Anforderung ist der Einstieg in das Projekt." action={createButton} />
      ) : null}
      {list.data?.items.length === 0 && filters.length > 0 ? (
        <EmptyState title="Keine Treffer für diese Filter" body="Passe die Filter an oder setze sie zurück." action={<Button type="button" onClick={() => setParams(new URLSearchParams())}>Filter zurücksetzen</Button>} />
      ) : null}
      {hasItems ? (
        <ul className="overflow-hidden rounded-xl border border-line bg-card">
          {list.data?.items.map((item) => (
            <li key={item.id} className="border-b border-line last:border-b-0">
              <Link className="grid gap-1 px-3 py-2.5 hover:bg-background sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-4" to={`/projekte/${project.id}/anforderungen/${item.id}`}>
                <span className="font-mono text-xs text-muted">{item.key}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.title}</span>
                  {item.description ? <span className="block truncate text-sm font-normal text-muted">{item.description}</span> : null}
                </span>
                <span className="flex flex-wrap gap-1 sm:justify-end">
                  <Badge tone={item.status === 'Erledigt' ? 'ok' : item.status === 'InBearbeitung' ? 'accent' : 'neutral'}>{requirementStatusLabel(item.status)}</Badge>
                  <Badge tone={item.priority === 'Kritisch' ? 'danger' : item.priority === 'Hoch' ? 'warning' : 'neutral'}>{priorityLabel(item.priority)}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {list.data && total > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">{from}–{to} von {total}</span>
          <div className="flex gap-2">
            <Button size="sm" type="button" disabled={page <= 1} onClick={() => setPage(params, setParams, page - 1)}>Vorherige Seite</Button>
            <Button size="sm" type="button" disabled={page * pageSize >= total} onClick={() => setPage(params, setParams, page + 1)}>Nächste Seite</Button>
          </div>
        </div>
      ) : null}
      <Modal open={open} onOpenChange={setOpen} title="Neue Anforderung">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Titel"><Input required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
          {create.isError ? <p role="alert" className="text-sm text-danger">{errorText(create.error)}</p> : null}
          <Button type="submit" variant="primary">Anlegen</Button>
        </form>
      </Modal>
    </div>
  )
}

function setFilter(params: URLSearchParams, setParams: (next: URLSearchParams) => void, key: string, value: string) {
  const next = new URLSearchParams(params)
  if (value) next.set(key, value)
  else next.delete(key)
  next.delete('seite')
  setParams(next)
}

function setPage(params: URLSearchParams, setParams: (next: URLSearchParams) => void, page: number) {
  const next = new URLSearchParams(params)
  if (page <= 1) next.delete('seite')
  else next.set('seite', String(page))
  setParams(next)
}

export function RequirementDetailPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const { requirementId = '' } = useParams()
  const query = useQuery({
    queryKey: ['requirement', project.id, requirementId],
    queryFn: () => api<Requirement>(`/api/v1/projects/${project.id}/requirements/${requirementId}`),
  })
  if (query.isLoading) return <Loading />
  if (query.isError) return <div className="p-6"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div>
  return <RequirementEditor projectId={project.id} canWrite={canWrite} initial={query.data!} onReload={() => query.refetch()} />
}

function RequirementEditor({ projectId, canWrite, initial, onReload }: { projectId: string; canWrite: boolean; initial: Requirement; onReload: () => Promise<unknown> }) {
  const [params] = useSearchParams()
  const client = useQueryClient()
  const areas = useQuery({ queryKey: ['areas', projectId], queryFn: () => api<Area[]>(`/api/v1/projects/${projectId}/areas`) })
  const [draft, setDraft] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const [version, setVersion] = useState(initial.version)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const impact = useQuery({
    queryKey: ['impact', projectId, initial.id],
    queryFn: () => api<Impact>(`/api/v1/projects/${projectId}/artifacts/${initial.id}/impact`),
    enabled: deleteOpen,
  })
  useEffect(() => {
    if (dirty || initial.version <= version) return
    setDraft(initial)
    setVersion(initial.version)
  }, [dirty, initial, version])
  const autosave = useAutosave({
    enabled: canWrite,
    dirty,
    version,
    signature: JSON.stringify(draft),
    save: async (currentVersion) => {
      const saved = await api<Requirement>(`/api/v1/projects/${projectId}/requirements/${initial.id}`, {
        method: 'PATCH',
        body: {
          version: currentVersion,
          title: draft.title,
          description: draft.description,
          status: draft.status,
          priority: draft.priority,
          tags: draft.tags,
          areaId: draft.areaId,
        },
      })
      setVersion(saved.version)
      setDirty(false)
      client.setQueryData(['requirement', projectId, initial.id], saved)
      return saved.version
    },
  })
  const remove = useMutation({
    mutationFn: () => api(`/api/v1/projects/${projectId}/artifacts/${initial.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      window.location.assign(`/projekte/${projectId}/anforderungen`)
    },
  })

  function update(next: Requirement) {
    setDraft(next)
    setDirty(true)
  }

  return (
    <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,1fr)_20rem] md:p-6">
      <LeaveGuard when={dirty || autosave.state === 'conflict' || autosave.state === 'error'} />
      <section className="grid gap-4">
        {params.get('von') === 'abdeckung' ? <Link className="text-sm text-muted underline-offset-2 hover:underline" to={`/projekte/${projectId}/abdeckung?${coverageReturn(params)}`}>Zurück zur Planungsabdeckung</Link> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{draft.key}</h1>
          <SaveBadge state={autosave.state} />
        </div>
        {autosave.state === 'conflict' ? (
          <ConflictBanner onReload={() => { setDirty(false); autosave.clearConflict(); void onReload() }} onKeep={() => autosave.retry()} />
        ) : null}
        {autosave.state === 'error' ? (
          <p role="alert" className="text-sm text-danger">Die Änderung konnte nicht gespeichert werden. <button className="underline" type="button" onClick={() => autosave.retry()}>Erneut versuchen</button></p>
        ) : null}
        <Field label="Titel"><Input value={draft.title} disabled={!canWrite} onChange={(event) => update({ ...draft, title: event.target.value })} /></Field>
        <Field label="Beschreibung"><Textarea value={draft.description} disabled={!canWrite} onChange={(event) => update({ ...draft, description: event.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select value={draft.status} disabled={!canWrite} onChange={(event) => update({ ...draft, status: event.target.value as RequirementStatus })}>
              {statuses.map((item) => <option key={item} value={item}>{requirementStatusLabel(item)}</option>)}
            </Select>
          </Field>
          <Field label="Priorität">
            <Select value={draft.priority} disabled={!canWrite} onChange={(event) => update({ ...draft, priority: event.target.value as RequirementPriority })}>
              {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Fachbereich">
          <Select aria-label="Fachbereich" value={draft.areaId ?? ''} disabled={!canWrite} onChange={(event) => update({ ...draft, areaId: event.target.value || null })}>
            <option value="">Ohne Bereich</option>
            <AreaOptions areas={areas.data} />
          </Select>
        </Field>
        <Field label="Tags" hint="Kommagetrennt, 2 bis 30 Zeichen">
          <Input value={draft.tags.join(', ')} disabled={!canWrite} onChange={(event) => update({ ...draft, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} />
        </Field>
        <AcceptancePanel projectId={projectId} requirementId={initial.id} canWrite={canWrite} />
        <div className="rounded-xl border border-line bg-card p-4">
          <SourcesPanel projectId={projectId} artifactId={initial.id} canWrite={canWrite} />
        </div>
        {canWrite ? <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)}>Anforderung löschen</Button> : null}
        <Modal open={deleteOpen} onOpenChange={setDeleteOpen} title="Anforderung löschen">
          {impact.isLoading ? <p>Auswirkungen werden geladen …</p> : null}
          {impact.data ? <ImpactList impact={impact.data} /> : null}
          {remove.isError ? <p role="alert" className="text-sm text-danger">{errorText(remove.error)}</p> : null}
          <Button type="button" variant="danger" disabled={impact.data ? !impact.data.canDelete : true} onClick={() => remove.mutate()}>Endgültig löschen</Button>
        </Modal>
      </section>
      <aside className="rounded-xl border border-line bg-card p-4">
        <LinkPanel projectId={projectId} artifactId={initial.id} mode="requirement" canWrite={canWrite} />
        <UsagePanel projectId={projectId} artifactId={initial.id} title={initial.title} />
      </aside>
    </div>
  )
}

function coverageReturn(params: URLSearchParams) {
  const next = new URLSearchParams()
  for (const key of ['bereich', 'status', 'fehlt', 'seite']) {
    const value = params.get(key)
    if (value) next.set(key, value)
  }
  return next
}

export function ImpactList({ impact }: { impact: Impact }) {
  const groups = [
    ['Verknüpfungen', impact.links],
    ['Kanten', impact.edges],
    ['Platzierungen', impact.placements],
    ['Unterseiten', impact.childPages],
    ['Navigationen', impact.navigations],
    ['Knoten', impact.nodes ?? []],
  ] as const
  return (
    <div className="grid gap-2 text-sm">
      {impact.blockReason ? <p role="alert">{impact.blockReason}</p> : <p>Diese Verbindungen werden mitgelöscht:</p>}
      {groups.map(([label, items]) => items.length > 0 ? (
        <div key={label}>
          <p className="font-medium">{label}</p>
          <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
        </div>
      ) : null)}
      {groups.every(([, items]) => items.length === 0) && !impact.blockReason ? <p>Keine weiteren Verbindungen.</p> : null}
    </div>
  )
}
