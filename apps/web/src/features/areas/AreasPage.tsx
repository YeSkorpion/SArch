import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { DiagramSvg, EmptyPreview, PreviewFrame, diagramStepCount, useDiagramPreview, useInView } from '../../components/previews'
import { Button, ConfirmDialog, Field, Input, Menu, MenuItem, Modal, PageHeader, Select, Textarea } from '../../components/ui'
import { childAreas, descendantIds, rootAreas } from '../../lib/areas'
import { api, errorText } from '../../lib/api'
import type { Area, DiagramKind, DiagramSummary, PackageSummary } from '../../lib/types'
import { AreaOptions } from './AreaOptions'
import type { ProjectOutlet } from '../shell/Shell'

export function AreasPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const client = useQueryClient()
  const areas = useQuery({
    queryKey: ['areas', project.id],
    queryFn: () => api<Area[]>(`/api/v1/projects/${project.id}/areas`),
  })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parentId, setParentId] = useState('')
  const [message, setMessage] = useState('')
  const [term, setTerm] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Area | null>(null)
  const create = useMutation({
    mutationFn: () => api<Area>(`/api/v1/projects/${project.id}/areas`, { method: 'POST', body: { name, description, parentId: parentId || null } }),
    onSuccess: async () => {
      setName('')
      setDescription('')
      setParentId('')
      setOpen(false)
      setMessage('Bereich angelegt.')
      await client.invalidateQueries({ queryKey: ['areas', project.id] })
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/projects/${project.id}/areas/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setPendingDelete(null)
      setMessage('Bereich gelöscht.')
      await client.invalidateQueries({ queryKey: ['areas', project.id] })
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const hasAreas = (areas.data?.length ?? 0) > 0
  const needle = term.trim().toLowerCase()
  const list = areas.data ?? []
  const visible = needle
    ? list.filter((area) => area.name.toLowerCase().includes(needle) || area.description.toLowerCase().includes(needle))
    : rootAreas(list)
  const createButton = canWrite ? <Button type="button" variant="primary" onClick={() => { setMessage(''); setParentId(''); setOpen(true) }}>Bereich anlegen</Button> : undefined

  return (
    <div className="grid w-full gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Bereiche" description="Fachbereiche können Unterbereiche haben und bündeln die Diagramme eines Themas." action={hasAreas ? createButton : undefined} />
      {hasAreas ? <Input aria-label="Bereiche suchen" placeholder="Name oder Beschreibung" value={term} onChange={(event) => setTerm(event.target.value)} /> : null}
      {message && !open ? <p className="text-sm" role="status">{message}</p> : null}
      {areas.isLoading ? <Loading /> : null}
      {areas.isError ? <ErrorState error={areas.error} onRetry={() => void areas.refetch()} /> : null}
      {areas.data?.length === 0 ? (
        <EmptyState title="Keine Bereiche" body="Lege Bereiche wie Bestellung, Versand oder Identität an. Unterbereiche fassen ein Thema weiter auf." action={createButton} />
      ) : null}
      {hasAreas && visible.length === 0 ? <EmptyState title="Keine Treffer" body="Kein Bereich enthält diesen Namen oder diese Beschreibung." action={<Button type="button" onClick={() => setTerm('')}>Suche zurücksetzen</Button>} /> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((area) => (
          <AreaCard key={area.id} projectId={project.id} area={area} areas={list} nested={!needle} canWrite={canWrite} onDelete={setPendingDelete} />
        ))}
      </ul>
      <AreaDialog
        open={open}
        title="Bereich anlegen"
        areas={list}
        name={name}
        description={description}
        parentId={parentId}
        message={message}
        pending={create.isPending}
        onName={setName}
        onDescription={setDescription}
        onParent={setParentId}
        onClose={() => setOpen(false)}
        onSubmit={() => create.mutate()}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => { if (!next) setPendingDelete(null) }}
        title="Bereich löschen"
        description={pendingDelete ? `„${pendingDelete.name}“ wird gelöscht. Das ist nur möglich, wenn keine Diagramme und keine Unterbereiche mehr zugeordnet sind.` : ''}
        confirmLabel="Löschen"
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </div>
  )
}

export function AreaDetailPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const { areaId = '' } = useParams()
  const client = useQueryClient()
  const areas = useQuery({ queryKey: ['areas', project.id], queryFn: () => api<Area[]>(`/api/v1/projects/${project.id}/areas`) })
  const processes = useQuery({
    queryKey: ['diagrams', project.id, 'Process', areaId, ''],
    queryFn: () => api<DiagramSummary[]>(`/api/v1/projects/${project.id}/diagrams?kind=Process&areaId=${areaId}`),
  })
  const systems = useQuery({
    queryKey: ['diagrams', project.id, 'System', areaId, ''],
    queryFn: () => api<DiagramSummary[]>(`/api/v1/projects/${project.id}/diagrams?kind=System&areaId=${areaId}`),
  })
  const packages = useQuery({ queryKey: ['packages', project.id], queryFn: () => api<PackageSummary[]>(`/api/v1/projects/${project.id}/packages`) })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parentDraft, setParentDraft] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const list = areas.data ?? []
  const area = list.find((item) => item.id === areaId)
  const children = area ? childAreas(list, area.id) : []
  const parentValue = parentDraft ?? area?.parentId ?? ''
  const blocked = area ? descendantIds(list, area.id) : new Set<string>()
  const create = useMutation({
    mutationFn: () => api<Area>(`/api/v1/projects/${project.id}/areas`, { method: 'POST', body: { name, description, parentId: areaId } }),
    onSuccess: async () => {
      setName('')
      setDescription('')
      setOpen(false)
      setMessage('Unterbereich angelegt.')
      await client.invalidateQueries({ queryKey: ['areas', project.id] })
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const move = useMutation({
    mutationFn: () => api<Area>(`/api/v1/projects/${project.id}/areas/${areaId}`, { method: 'PUT', body: { name: area?.name ?? '', description: area?.description ?? '', parentId: parentValue || null } }),
    onSuccess: async () => {
      setParentDraft(null)
      setMessage('Überordnung gespeichert.')
      await client.invalidateQueries({ queryKey: ['areas', project.id] })
    },
    onError: (error) => setMessage(errorText(error)),
  })
  if (areas.isLoading) return <Loading />
  if (areas.isError) return <div className="p-6"><ErrorState error={areas.error} onRetry={() => void areas.refetch()} /></div>
  if (!area) return <div className="p-6"><EmptyState title="Bereich nicht gefunden" body="Der Bereich gehört nicht zu diesem Projekt." action={<Button asChild><Link to={`/projekte/${project.id}/bereiche`}>Alle Bereiche</Link></Button>} /></div>
  const areaPackages = (packages.data ?? []).filter((item) => item.areaId === area.id)
  const ancestors = ancestorAreas(list, area)
  return (
    <div className="grid w-full gap-6 px-4 py-6 md:px-6">
      <header>
        <p className="text-sm text-muted">
          <Link className="underline-offset-2 hover:underline" to={`/projekte/${project.id}/bereiche`}>Alle Bereiche</Link>
          {ancestors.map((item) => (
            <span key={item.id}>
              {' / '}
              <Link className="underline-offset-2 hover:underline" to={`/projekte/${project.id}/bereiche/${item.id}`}>{item.name}</Link>
            </span>
          ))}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{area.name}</h1>
          {canWrite ? <Button type="button" variant="primary" onClick={() => { setMessage(''); setOpen(true) }}>Unterbereich anlegen</Button> : null}
        </div>
        {area.description ? <p className="mt-2 max-w-3xl text-sm text-muted">{area.description}</p> : null}
        <p className="mt-2 text-xs text-muted">{area.diagramCount} {area.diagramCount === 1 ? 'Diagramm' : 'Diagramme'} · {children.length} {children.length === 1 ? 'Unterbereich' : 'Unterbereiche'}</p>
        <Link className="mt-3 inline-block text-sm text-accent underline-offset-2 hover:underline" to={`/projekte/${project.id}/abdeckung?bereich=${area.id}`}>Planungsabdeckung</Link>
      </header>
      {message && !open ? <p className="text-sm" role="status">{message}</p> : null}
      <section>
        <h2 className="text-lg font-semibold">Unterbereiche</h2>
        {children.length === 0 ? <p className="mt-2 text-sm text-muted">Noch kein Unterbereich.</p> : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-card">
            {children.map((child) => (
              <li key={child.id}>
                <Link className="block px-3 py-2 hover:bg-background" to={`/projekte/${project.id}/bereiche/${child.id}`}>
                  <span className="font-medium">{child.name}</span>
                  <span className="block text-xs text-muted">{child.diagramCount} {child.diagramCount === 1 ? 'Diagramm' : 'Diagramme'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {canWrite ? (
        <form className="grid max-w-xl gap-3 rounded-xl border border-line bg-card p-4" onSubmit={(event) => { event.preventDefault(); move.mutate() }}>
          <Field label="Übergeordneter Bereich">
            <Select aria-label="Übergeordneter Bereich" value={parentValue} onChange={(event) => setParentDraft(event.target.value)}>
              <option value="">Keiner</option>
              <AreaOptions areas={list.filter((item) => item.id !== area.id && !blocked.has(item.id))} />
            </Select>
          </Field>
          <Button type="submit" disabled={move.isPending || parentValue === (area.parentId ?? '')}>Speichern</Button>
          {move.isError ? <p role="alert" className="text-sm text-danger">{errorText(move.error)}</p> : null}
        </form>
      ) : null}
      <AreaDialog
        open={open}
        title="Unterbereich anlegen"
        areas={list}
        name={name}
        description={description}
        parentId={area.id}
        parentLocked
        message={message}
        pending={create.isPending}
        onName={setName}
        onDescription={setDescription}
        onParent={() => undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => create.mutate()}
      />
      {processes.isError ? <ErrorState error={processes.error} onRetry={() => void processes.refetch()} /> : null}
      {systems.isError ? <ErrorState error={systems.error} onRetry={() => void systems.refetch()} /> : null}
      <ContentGroup title="Prozesse" items={processes.data ?? []} projectId={project.id} kind="Process" allHref={`/projekte/${project.id}/prozesse?bereich=${area.id}`} allLabel="Alle Prozesse ansehen" loading={processes.isLoading} />
      <ContentGroup title="Systemarchitektur" items={systems.data ?? []} projectId={project.id} kind="System" allHref={`/projekte/${project.id}/system?bereich=${area.id}`} allLabel="Alle Diagramme ansehen" loading={systems.isLoading} />
      {areaPackages.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold">Änderungspakete</h2>
          <ul className="mt-2 divide-y divide-line">
            {areaPackages.slice(0, 4).map((item) => (
              <li key={item.id}>
                <Link className="block py-2 hover:text-accent" to={`/projekte/${project.id}/aenderungen/${item.id}`}>
                  <span className="font-medium">{item.title}</span>
                  <span className="block text-xs text-muted">{item.status === 'InPruefung' ? 'In Prüfung' : item.status}</span>
                </Link>
              </li>
            ))}
          </ul>
          {areaPackages.length > 4 ? <Link className="mt-2 inline-block text-sm text-accent underline-offset-2 hover:underline" to={`/projekte/${project.id}/aenderungen`}>Alle Änderungspakete ansehen</Link> : null}
        </section>
      ) : null}
      {!processes.isLoading && !systems.isLoading && (processes.data?.length ?? 0) === 0 && (systems.data?.length ?? 0) === 0 && areaPackages.length === 0 && children.length === 0 ? (
        <EmptyState title="Noch nichts zugeordnet" body="Lege einen Unterbereich an oder ordne Diagramme in den Modulübersichten diesem Bereich zu." />
      ) : null}
    </div>
  )
}

function ancestorAreas(areas: Area[], area: Area) {
  const chain: Area[] = []
  let parentId = area.parentId
  const seen = new Set([area.id])
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = areas.find((item) => item.id === parentId)
    if (!parent) break
    chain.unshift(parent)
    parentId = parent.parentId
  }
  return chain
}

function AreaCard({ projectId, area, areas, nested, canWrite, onDelete }: { projectId: string; area: Area; areas: Area[]; nested: boolean; canWrite: boolean; onDelete: (area: Area) => void }) {
  const children = nested ? childAreas(areas, area.id) : []
  return (
    <li className="rounded-xl border border-line bg-card">
      <div className="relative">
        <AreaLink projectId={projectId} area={area} heading />
        {canWrite ? <AreaMenu area={area} onDelete={onDelete} /> : null}
      </div>
      {children.length > 0 ? (
        <ul className="grid gap-1 border-t border-line px-3 py-2">
          {children.map((child) => <AreaBranch key={child.id} projectId={projectId} area={child} areas={areas} canWrite={canWrite} onDelete={onDelete} />)}
        </ul>
      ) : null}
    </li>
  )
}

function AreaBranch({ projectId, area, areas, canWrite, onDelete }: { projectId: string; area: Area; areas: Area[]; canWrite: boolean; onDelete: (area: Area) => void }) {
  const children = childAreas(areas, area.id)
  return (
    <li>
      <div className="relative">
        <AreaLink projectId={projectId} area={area} />
        {canWrite ? <AreaMenu area={area} onDelete={onDelete} /> : null}
      </div>
      {children.length > 0 ? (
        <ul className="mt-1 grid gap-1 border-l border-line pl-3">
          {children.map((child) => <AreaBranch key={child.id} projectId={projectId} area={child} areas={areas} canWrite={canWrite} onDelete={onDelete} />)}
        </ul>
      ) : null}
    </li>
  )
}

function AreaLink({ projectId, area, heading = false }: { projectId: string; area: Area; heading?: boolean }) {
  return (
    <Link className={`block rounded-xl hover:bg-background ${heading ? 'p-3 pr-12' : 'px-2 py-1.5 pr-10'}`} to={`/projekte/${projectId}/bereiche/${area.id}`}>
      {heading ? <h2 className="truncate font-medium">{area.name}</h2> : <span className="block truncate text-sm font-medium">{area.name}</span>}
      {heading && area.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{area.description}</p> : null}
      <p className={`${heading ? 'mt-2' : 'mt-0.5'} text-xs text-muted`}>{area.diagramCount} {area.diagramCount === 1 ? 'Diagramm' : 'Diagramme'}</p>
    </Link>
  )
}

function AreaMenu({ area, onDelete }: { area: Area; onDelete: (area: Area) => void }) {
  return (
    <div className="absolute top-2 right-2">
      <Menu trigger={<button className="grid h-8 w-8 place-items-center rounded-md hover:bg-background" type="button" aria-label={`Aktionen für ${area.name}`}><MoreHorizontal size={16} aria-hidden="true" /></button>}>
        <MenuItem onSelect={() => onDelete(area)}>Löschen</MenuItem>
      </Menu>
    </div>
  )
}

function AreaDialog({ open, title, areas, name, description, parentId, parentLocked = false, message, pending, onName, onDescription, onParent, onClose, onSubmit }: {
  open: boolean
  title: string
  areas: Area[]
  name: string
  description: string
  parentId: string
  parentLocked?: boolean
  message: string
  pending: boolean
  onName: (value: string) => void
  onDescription: (value: string) => void
  onParent: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <Modal open={open} onOpenChange={(next) => { if (!next) onClose() }} title={title}>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        <Field label="Name"><Input required value={name} onChange={(event) => onName(event.target.value)} /></Field>
        <Field label="Beschreibung"><Textarea value={description} onChange={(event) => onDescription(event.target.value)} /></Field>
        <Field label="Übergeordneter Bereich">
          <Select aria-label="Übergeordneter Bereich" value={parentId} disabled={parentLocked} onChange={(event) => onParent(event.target.value)}>
            <option value="">Keiner</option>
            <AreaOptions areas={areas} />
          </Select>
        </Field>
        {message && open ? <p className="text-sm" role="alert">{message}</p> : null}
        {pending ? <p className="text-sm text-muted">Wird gespeichert</p> : null}
        <Button type="submit" variant="primary" disabled={pending}>Anlegen</Button>
      </form>
    </Modal>
  )
}

function ContentGroup({ title, items, projectId, kind, allHref, allLabel, loading }: { title: string; items: DiagramSummary[]; projectId: string; kind: DiagramKind; allHref: string; allLabel: string; loading: boolean }) {
  if (!loading && items.length === 0) return null
  const shown = items.slice(0, 4)
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {items.length > shown.length ? <Link className="text-sm text-accent underline-offset-2 hover:underline" to={allHref}>{allLabel}</Link> : null}
      </div>
      {loading ? <Loading /> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((diagram) => (
          <AreaDiagram key={diagram.id} projectId={projectId} diagram={diagram} kind={kind} />
        ))}
      </ul>
    </section>
  )
}

function AreaDiagram({ projectId, diagram, kind }: { projectId: string; diagram: DiagramSummary; kind: DiagramKind }) {
  const { ref, visible } = useInView<HTMLLIElement>()
  const detail = useDiagramPreview(projectId, diagram.id, visible)
  const steps = detail.data ? diagramStepCount(detail.data.nodes) : 0
  return (
    <li ref={ref} className="rounded-xl border border-line bg-card">
      <Link className="block rounded-xl hover:bg-background" to={`/projekte/${projectId}/diagramme/${diagram.id}`}>
        <div className="p-2 pb-0">
          <PreviewFrame>
            {!visible || !detail.data ? <div className="h-full" /> : detail.data.nodes.length === 0 ? <EmptyPreview icon="diagram" label="Noch kein Entwurf" /> : <DiagramSvg diagram={detail.data} kind={kind} />}
          </PreviewFrame>
        </div>
        <span className="block truncate px-3 pt-2 font-medium">{diagram.name}</span>
        <span className="block truncate px-3 pb-3 text-xs text-muted">{steps > 0 ? `${steps} ${steps === 1 ? 'Schritt' : 'Schritte'}` : 'Diagramm'}</span>
      </Link>
    </li>
  )
}
