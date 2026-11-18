import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { DiagramSvg, EmptyPreview, PreviewFrame, diagramStepCount, useDiagramPreview, useInView } from '../../components/previews'
import { Button, ConfirmDialog, Field, Input, Menu, MenuItem, Modal, PageHeader, Textarea } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import type { Area, DiagramKind, DiagramSummary, PackageSummary } from '../../lib/types'
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
  const [message, setMessage] = useState('')
  const [term, setTerm] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Area | null>(null)
  const create = useMutation({
    mutationFn: () => api<Area>(`/api/v1/projects/${project.id}/areas`, { method: 'POST', body: { name, description } }),
    onSuccess: async () => {
      setName('')
      setDescription('')
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
  const visible = (areas.data ?? []).filter((area) => !needle || area.name.toLowerCase().includes(needle) || area.description.toLowerCase().includes(needle))
  const createButton = canWrite ? <Button type="button" variant="primary" onClick={() => { setMessage(''); setOpen(true) }}>Bereich anlegen</Button> : undefined

  return (
    <div className="grid w-full gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Bereiche" description="Fachbereiche bündeln die Diagramme eines Themas." action={hasAreas ? createButton : undefined} />
      {hasAreas ? <Input aria-label="Bereiche suchen" placeholder="Name oder Beschreibung" value={term} onChange={(event) => setTerm(event.target.value)} /> : null}
      {message && !open ? <p className="text-sm" role="status">{message}</p> : null}
      {areas.isLoading ? <Loading /> : null}
      {areas.isError ? <ErrorState error={areas.error} onRetry={() => void areas.refetch()} /> : null}
      {areas.data?.length === 0 ? (
        <EmptyState title="Keine Bereiche" body="Lege Bereiche wie Bestellung, Versand oder Identität an und ordne die Diagramme dort ein." action={createButton} />
      ) : null}
      {hasAreas && visible.length === 0 ? <EmptyState title="Keine Treffer" body="Kein Bereich enthält diesen Namen oder diese Beschreibung." action={<Button type="button" onClick={() => setTerm('')}>Suche zurücksetzen</Button>} /> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((area) => (
          <li key={area.id} className="relative rounded-xl border border-line bg-card">
            <Link className="block rounded-xl p-3 pr-12 hover:bg-background" to={`/projekte/${project.id}/bereiche/${area.id}`}>
              <h2 className="truncate font-medium">{area.name}</h2>
              {area.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{area.description}</p> : null}
              <p className="mt-2 text-xs text-muted">{area.diagramCount} {area.diagramCount === 1 ? 'Diagramm' : 'Diagramme'}</p>
            </Link>
            {canWrite ? (
              <div className="absolute top-2 right-2">
                <Menu trigger={<button className="grid h-8 w-8 place-items-center rounded-md hover:bg-background" type="button" aria-label={`Aktionen für ${area.name}`}><MoreHorizontal size={16} aria-hidden="true" /></button>}>
                  <MenuItem onSelect={() => setPendingDelete(area)}>Löschen</MenuItem>
                </Menu>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Modal open={open} onOpenChange={setOpen} title="Bereich anlegen">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Name"><Input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Beschreibung"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          {message && open ? <p className="text-sm" role="alert">{message}</p> : null}
          {create.isPending ? <p className="text-sm text-muted">Wird gespeichert</p> : null}
          <Button type="submit" variant="primary" disabled={create.isPending}>Anlegen</Button>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => { if (!next) setPendingDelete(null) }}
        title="Bereich löschen"
        description={pendingDelete ? `„${pendingDelete.name}“ wird gelöscht. Das ist nur möglich, wenn dem Bereich keine Diagramme mehr zugeordnet sind.` : ''}
        confirmLabel="Löschen"
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </div>
  )
}

export function AreaDetailPage() {
  const { project } = useOutletContext<ProjectOutlet>()
  const { areaId = '' } = useParams()
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
  const area = areas.data?.find((item) => item.id === areaId)
  if (areas.isLoading) return <Loading />
  if (areas.isError) return <div className="p-6"><ErrorState error={areas.error} onRetry={() => void areas.refetch()} /></div>
  if (!area) return <div className="p-6"><EmptyState title="Bereich nicht gefunden" body="Der Bereich gehört nicht zu diesem Projekt." action={<Button asChild><Link to={`/projekte/${project.id}/bereiche`}>Alle Bereiche</Link></Button>} /></div>
  const areaPackages = (packages.data ?? []).filter((item) => item.areaId === area.id)
  return (
    <div className="grid w-full gap-6 px-4 py-6 md:px-6">
      <header>
        <Link className="text-sm text-muted underline-offset-2 hover:underline" to={`/projekte/${project.id}/bereiche`}>Alle Bereiche</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{area.name}</h1>
        {area.description ? <p className="mt-2 max-w-3xl text-sm text-muted">{area.description}</p> : null}
        <p className="mt-2 text-xs text-muted">{area.diagramCount} {area.diagramCount === 1 ? 'Diagramm' : 'Diagramme'}</p>
      </header>
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
      {!processes.isLoading && !systems.isLoading && (processes.data?.length ?? 0) === 0 && (systems.data?.length ?? 0) === 0 && areaPackages.length === 0 ? (
        <EmptyState title="Noch nichts zugeordnet" body="Diagramme lassen sich in den Modulübersichten diesem Bereich zuordnen." />
      ) : null}
    </div>
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
