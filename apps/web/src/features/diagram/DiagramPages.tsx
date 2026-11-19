import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { Circle, Database, Diamond, MoreHorizontal, Octagon, Square, StickyNote, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router'
import { LeaveGuard } from '../../components/LeaveGuard'
import { DiagramSvg, EmptyPreview, PreviewFrame, diagramStepCount, useDiagramPreview, useInView } from '../../components/previews'
import { ConflictBanner, EmptyState, ErrorState, Loading, SaveBadge } from '../../components/states'
import { Badge, Button, Field, Input, Menu, MenuItem, Modal, Select, Textarea } from '../../components/ui'
import { ApiError, api, errorText } from '../../lib/api'
import { useAutosave } from '../../lib/autosave'
import { motionMs, readFlag, rememberFlag, useRememberScroll } from '../../lib/scroll'
import { analyzeProcess } from '../../lib/diagramCheck'
import { componentKindLabel, nodeTypeLabel } from '../../lib/labels'
import type { AffectedFlow, Area, Component, Diagram, DiagramKind, DiagramSummary, EdgeKind, FlowPreview, Impact, SavedView } from '../../lib/types'
import { LinkPanel } from '../links/LinkPanel'
import { UsagePanel } from '../usage/UsagePanel'
import { ImpactList } from '../requirements/RequirementsPages'
import type { ProjectOutlet } from '../shell/Shell'
import { ComponentSchema, schemaCountLabel } from './ComponentSchema'
import { SourcesPanel } from '../plan/SourcesPanel'
import { AreaOptions } from '../areas/AreaOptions'
import '@xyflow/react/dist/style.css'

type NodeData = {
  nodeType: string
  title: string
  description: string
  eventName: string
  componentId: string | null
  color: string
  comment: string
}
type FlowNode = Node<NodeData, 'studio'>
type EdgeData = { kind: EdgeKind; condition: string; protocol: string; color: string }
type FlowEdge = Edge<EdgeData>

const tones = [
  { id: '', label: 'Standard' },
  { id: 'accent', label: 'Akzent' },
  { id: 'ok', label: 'Grün' },
  { id: 'warning', label: 'Gelb' },
  { id: 'danger', label: 'Rot' },
] as const

const nodeTypes = { studio: StudioNode }

export function DiagramListPage({ kind }: { kind: DiagramKind }) {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const location = useLocation()
  useRememberScroll(`${location.pathname}${location.search}`)
  const [params, setParams] = useSearchParams()
  const area = params.get('bereich') ?? ''
  const term = params.get('q') ?? ''
  const scope = kind === 'Process' ? 'processes' : 'system'
  const diagrams = useQuery({
    queryKey: ['diagrams', project.id, kind, area, term],
    queryFn: () => api<DiagramSummary[]>(diagramListUrl(project.id, kind, area, term)),
  })
  const areas = useQuery({
    queryKey: ['areas', project.id],
    queryFn: () => api<Area[]>(`/api/v1/projects/${project.id}/areas`),
  })
  const views = useQuery({
    queryKey: ['views', project.id, scope],
    queryFn: () => api<SavedView[]>(`/api/v1/projects/${project.id}/views?scope=${scope}`),
  })
  const [name, setName] = useState('')
  const [areaId, setAreaId] = useState('')
  const [open, setOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [viewQuery, setViewQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState<DiagramSummary | null>(null)
  const navigate = useNavigate()
  const client = useQueryClient()
  const create = useMutation({
    mutationFn: () => api<Diagram>(`/api/v1/projects/${project.id}/diagrams`, { method: 'POST', body: { name, kind, areaId: areaId || null } }),
    onSuccess: async (diagram) => {
      await client.invalidateQueries({ queryKey: ['diagrams', project.id] })
      await client.invalidateQueries({ queryKey: ['areas', project.id] })
      await navigate(`/projekte/${project.id}/diagramme/${diagram.id}`)
    },
  })
  const saveView = useMutation({
    mutationFn: () => api<SavedView>(`/api/v1/projects/${project.id}/views`, {
      method: 'POST',
      body: { name: viewName, scope, areaId: area && area !== 'none' ? area : null, unassigned: area === 'none', query: term },
    }),
    onSuccess: async () => {
      setViewOpen(false)
      setViewName('')
      await client.invalidateQueries({ queryKey: ['views', project.id, scope] })
    },
  })
  const removeView = useMutation({
    mutationFn: (id: string) => api(`/api/v1/projects/${project.id}/views/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['views', project.id, scope] }) },
  })
  function filter(next: { bereich?: string; q?: string }) {
    const value = new URLSearchParams(params)
    const bereich = next.bereich ?? area
    const query = next.q ?? term
    if (bereich) value.set('bereich', bereich)
    else value.delete('bereich')
    if (query) value.set('q', query)
    else value.delete('q')
    setParams(value)
  }
  const groups = new Map<string, DiagramSummary[]>()
  for (const diagram of diagrams.data ?? []) {
    const key = diagram.areaName ?? 'Ohne Bereich'
    groups.set(key, [...(groups.get(key) ?? []), diagram])
  }
  const title = kind === 'Process' ? 'Prozesse' : 'Systemarchitektur'
  const filtered = Boolean(area || term)
  const hasDiagrams = (diagrams.data?.length ?? 0) > 0
  return (
    <div className="grid w-full gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {kind === 'System' ? <ArchitectureTabs projectId={project.id} current="diagrams" /> : null}
        </div>
        {canWrite && (hasDiagrams || filtered) ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Diagramm anlegen</Button> : null}
      </header>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card p-2">
        <Input className="studio-inline max-w-xs" aria-label="Diagramme suchen" value={term} placeholder="Suchen" onChange={(event) => filter({ q: event.target.value })} />
        <Select className="studio-inline" aria-label="Bereich filtern" value={area} onChange={(event) => filter({ bereich: event.target.value })}>
          <option value="">Alle Bereiche</option>
          <option value="none">Ohne Bereich</option>
          <AreaOptions areas={areas.data} />
        </Select>
        {canWrite ? <Button size="sm" type="button" onClick={() => setViewOpen(true)}>Ansicht speichern</Button> : null}
        {filtered ? <Button size="sm" type="button" variant="ghost" onClick={() => filter({ bereich: '', q: '' })}>Filter zurücksetzen</Button> : null}
      </div>
      {views.data && views.data.length > 0 ? (
        <nav aria-label="Gespeicherte Ansichten" className="overflow-hidden rounded-xl border border-line bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <h2 className="text-sm font-semibold">Gespeicherte Ansichten</h2>
            <span className="text-xs text-muted">{views.data.length}</span>
            {views.data.length > 6 ? (
              <Input className="h-8 w-full sm:ml-auto sm:max-w-xs" aria-label="Ansichten suchen" placeholder="Ansichten suchen" value={viewQuery} onChange={(event) => setViewQuery(event.target.value)} />
            ) : null}
          </div>
          {shownViews(views.data, viewQuery).length === 0 ? <p className="px-3 py-2 text-sm text-muted">Keine Treffer.</p> : (
            <ul className={views.data.length > 6 ? 'max-h-52 overflow-auto' : undefined}>
              {shownViews(views.data, viewQuery).map((view) => {
                const matches = shownViews(views.data, viewQuery).filter((item) => viewMatches(item, area, term))
                const active = matches.length === 1 && matches[0].id === view.id
                return (
                  <li key={view.id} className={`flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0 ${active ? 'bg-accent/10' : ''}`}>
                    <Link className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent" aria-current={active ? 'page' : undefined} to={viewHref(project.id, kind, view)}>{view.name}</Link>
                    <span className="hidden max-w-[45%] truncate text-xs text-muted sm:block">{viewSummary(view)}</span>
                    {canWrite ? (
                      <button className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-background hover:text-foreground" type="button" aria-label={`Ansicht entfernen: ${view.name}`} onClick={() => removeView.mutate(view.id)}>
                        <X size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </nav>
      ) : null}
      {diagrams.isLoading ? <Loading /> : null}
      {diagrams.isError ? <ErrorState error={diagrams.error} onRetry={() => void diagrams.refetch()} /> : null}
      {diagrams.data?.length === 0 && filtered ? (
        <EmptyState title="Keine Treffer für diese Filter" body="Passe Bereich oder Suche an." action={<Button type="button" onClick={() => filter({ bereich: '', q: '' })}>Filter zurücksetzen</Button>} />
      ) : null}
      {diagrams.data?.length === 0 && !filtered ? (
        <EmptyState
          title="Keine Diagramme"
          body={kind === 'System' ? 'Lege ein Architekturdiagramm an, um Bausteine und Abhängigkeiten zu planen.' : 'Lege ein Prozessdiagramm an, um den Ablauf zu planen.'}
          action={canWrite ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Diagramm anlegen</Button> : undefined}
        />
      ) : null}
      {[...groups.entries()].map(([group, items]) => (
        <section key={group} className="grid gap-3">
          <h2 className="text-sm font-semibold text-muted">{group}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((diagram) => (
              <DiagramCard key={diagram.id} projectId={project.id} diagram={diagram} kind={kind} canWrite={canWrite} onDelete={() => setPendingDelete(diagram)} />
            ))}
          </ul>
        </section>
      ))}
      <DeleteDiagramDialog
        projectId={project.id}
        diagram={pendingDelete}
        listPath={kind === 'Process' ? 'prozesse' : 'system'}
        onOpenChange={(next) => { if (!next) setPendingDelete(null) }}
      />
      <Modal open={open} onOpenChange={setOpen} title="Neues Diagramm">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Name"><Input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Bereich">
            <Select value={areaId} onChange={(event) => setAreaId(event.target.value)}>
              <option value="">Ohne Bereich</option>
              <AreaOptions areas={areas.data} />
            </Select>
          </Field>
          {create.isError ? <p role="alert" className="text-sm text-danger">{errorText(create.error)}</p> : null}
          <Button type="submit" variant="primary">Anlegen</Button>
        </form>
      </Modal>
      <Modal open={viewOpen} onOpenChange={setViewOpen} title="Ansicht speichern">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); saveView.mutate() }}>
          <Field label="Name der Ansicht"><Input required value={viewName} onChange={(event) => setViewName(event.target.value)} /></Field>
          <p className="text-sm text-muted">Die Ansicht merkt sich den gewählten Bereich und den Suchtext für das ganze Projekt.</p>
          {saveView.isError ? <p role="alert" className="text-sm text-danger">{errorText(saveView.error)}</p> : null}
          <Button type="submit" variant="primary">Speichern</Button>
        </form>
      </Modal>
    </div>
  )
}

function DiagramCard({ projectId, diagram, kind, canWrite, onDelete }: { projectId: string; diagram: DiagramSummary; kind: DiagramKind; canWrite: boolean; onDelete: () => void }) {
  const { ref, visible } = useInView<HTMLLIElement>()
  const detail = useDiagramPreview(projectId, diagram.id, visible)
  const steps = detail.data ? diagramStepCount(detail.data.nodes) : 0
  const meta = [diagram.areaName, steps > 0 ? `${steps} ${steps === 1 ? 'Schritt' : 'Schritte'}` : null].filter(Boolean).join(' · ')
  return (
    <li ref={ref} className="relative rounded-xl border border-line bg-card">
      <Link className="block rounded-xl hover:bg-background/70" to={`/projekte/${projectId}/diagramme/${diagram.id}`}>
        <div className="p-2 pb-0">
          <PreviewFrame>
            {!visible || detail.isLoading || !detail.data ? <div className="h-full" /> : detail.data.nodes.length === 0 ? (
              <EmptyPreview icon="diagram" label="Noch kein Entwurf" />
            ) : (
              <DiagramSvg diagram={detail.data} kind={kind} />
            )}
          </PreviewFrame>
        </div>
        <span className="block truncate px-3 pt-2 font-medium">{diagram.name}</span>
        <span className="block truncate px-3 pb-3 text-xs text-muted">{meta || 'Ohne Bereich'}</span>
      </Link>
      {canWrite ? (
        <div className="absolute top-3 right-3">
          <Menu trigger={<button className="grid h-8 w-8 place-items-center rounded-md bg-card/90 hover:bg-background" type="button" aria-label={`Aktionen für ${diagram.name}`}><MoreHorizontal size={16} aria-hidden="true" /></button>}>
            <MenuItem onSelect={onDelete}>Löschen</MenuItem>
          </Menu>
        </div>
      ) : null}
    </li>
  )
}

function ArchitectureTabs({ projectId, current }: { projectId: string; current: 'diagrams' | 'components' }) {
  const item = (active: boolean) => `rounded-md px-3 py-1.5 text-sm ${active ? 'bg-card font-semibold text-accent' : 'text-muted hover:bg-card'}`
  return (
    <div className="flex w-fit gap-1 rounded-lg bg-nav p-1">
      <Link className={item(current === 'diagrams')} aria-current={current === 'diagrams' ? 'page' : undefined} to={`/projekte/${projectId}/system`}>Diagramme</Link>
      <Link className={item(current === 'components')} aria-current={current === 'components' ? 'page' : undefined} to={`/projekte/${projectId}/system/komponenten`}>Komponenten</Link>
    </div>
  )
}

function diagramListUrl(projectId: string, kind: DiagramKind, area: string, term: string) {
  const params = new URLSearchParams({ kind })
  if (area === 'none') params.set('unassigned', 'true')
  else if (area) params.set('areaId', area)
  if (term) params.set('q', term)
  return `/api/v1/projects/${projectId}/diagrams?${params.toString()}`
}

function shownViews(views: SavedView[], query: string) {
  const term = query.trim().toLowerCase()
  if (!term) return views
  return views.filter((view) => `${view.name} ${view.areaName ?? ''} ${view.query}`.toLowerCase().includes(term))
}

function viewMatches(view: SavedView, area: string, term: string) {
  const viewArea = view.unassigned ? 'none' : view.areaId ?? ''
  return viewArea === area && view.query === term
}

function viewSummary(view: SavedView) {
  const place = view.unassigned ? 'Ohne Bereich' : view.areaName || 'Alle Bereiche'
  return view.query ? `${place} · „${view.query}“` : place
}

function viewHref(projectId: string, kind: DiagramKind, view: SavedView) {
  const params = new URLSearchParams()
  if (view.unassigned) params.set('bereich', 'none')
  else if (view.areaId) params.set('bereich', view.areaId)
  if (view.query) params.set('q', view.query)
  const base = kind === 'Process' ? 'prozesse' : 'system'
  const query = params.toString()
  return `/projekte/${projectId}/${base}${query ? `?${query}` : ''}`
}

export function DiagramEditorPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const { diagramId = '' } = useParams()
  const diagram = useQuery({
    queryKey: ['diagram', project.id, diagramId],
    queryFn: () => api<Diagram>(`/api/v1/projects/${project.id}/diagrams/${diagramId}`),
  })
  if (diagram.isLoading) return <Loading />
  if (diagram.isError) return <div className="p-6"><ErrorState error={diagram.error} onRetry={() => void diagram.refetch()} /></div>
  return (
    <ReactFlowProvider>
      <DiagramCanvas projectId={project.id} canWrite={canWrite} initial={diagram.data!} reload={() => diagram.refetch()} />
    </ReactFlowProvider>
  )
}

function DiagramCanvas({ projectId, canWrite, initial, reload }: { projectId: string; canWrite: boolean; initial: Diagram; reload: () => Promise<unknown> }) {
  const [params] = useSearchParams()
  const focusId = params.get('node')
  const flowPreview = useQuery({
    queryKey: ['flow', projectId, initial.id],
    queryFn: () => api<FlowPreview>(`/api/v1/projects/${projectId}/diagrams/${initial.id}/flow`),
    enabled: initial.kind === 'Process',
  })
  const [nodes, setNodes] = useState<FlowNode[]>(() => initial.nodes.map((node) => toNode(node)))
  const [edges, setEdges] = useState<FlowEdge[]>(() => initial.edges.map(toEdge))
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [areaId, setAreaId] = useState<string | null>(initial.areaId)
  const [version, setVersion] = useState(initial.version)
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(focusId)
  const [selectedKind, setSelectedKind] = useState<'node' | 'edge' | null>(focusId ? 'node' : null)
  const [toolsOpen, setToolsOpen] = useState(() => readFlag('studio-panel-tools', true))
  const [inspectorOpen, setInspectorOpen] = useState(() => readFlag('studio-panel-inspector', window.matchMedia('(min-width: 1024px)').matches))
  const flow = useReactFlow()
  const [message, setMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [diagramDelete, setDiagramDelete] = useState(false)
  const [listOpen, setListOpen] = useState(true)
  const [inspectorWidth, setInspectorWidth] = useState(() => readPane('studio-pane-inspector', 320))
  const [listHeight, setListHeight] = useState(() => readPane('studio-pane-list', 280))
  const [toolsWidth, setToolsWidth] = useState(() => readPane('studio-pane-tools-dock', 240))
  const [listQuery, setListQuery] = useState('')
  const [listType, setListType] = useState('alle')
  const past = useRef<Array<{ nodes: FlowNode[]; edges: FlowEdge[] }>>([])
  const future = useRef<Array<{ nodes: FlowNode[]; edges: FlowEdge[] }>>([])
  const areas = useQuery({
    queryKey: ['areas', projectId],
    queryFn: () => api<Area[]>(`/api/v1/projects/${projectId}/areas`),
  })
  const components = useQuery({
    queryKey: ['components', projectId],
    queryFn: () => api<Component[]>(`/api/v1/projects/${projectId}/components`),
    enabled: initial.kind === 'System',
  })
  const impact = useQuery({
    queryKey: ['impact', projectId, pendingDelete],
    queryFn: () => api<Impact>(`/api/v1/projects/${projectId}/artifacts/${pendingDelete}/impact`),
    enabled: Boolean(pendingDelete),
    retry: false,
  })

  useEffect(() => {
    if (dirty || initial.version <= version) return
    setNodes(initial.nodes.map((node) => toNode(node, focusId)))
    setEdges(initial.edges.map(toEdge))
    setName(initial.name)
    setDescription(initial.description)
    setAreaId(initial.areaId)
    setVersion(initial.version)
  }, [dirty, focusId, initial, version])

  const signature = JSON.stringify({ name, description, areaId, nodes, edges })
  const autosave = useAutosave({
    enabled: canWrite,
    dirty,
    version,
    signature,
    save: async (currentVersion) => {
      const saved = await api<Diagram>(`/api/v1/projects/${projectId}/diagrams/${initial.id}`, {
        method: 'PUT',
        body: {
          version: currentVersion,
          name,
          description,
          areaId,
          nodes: nodes.map((node) => ({
            id: node.id,
            nodeType: node.data.nodeType,
            title: node.data.title,
            x: node.position.x,
            y: node.position.y,
            componentId: node.data.componentId,
            description: node.data.description,
            eventName: node.data.eventName,
            color: node.data.color || null,
            comment: node.data.comment || null,
          })),
          edges: edges.map((edge) => ({
            id: edge.id,
            kind: edge.data?.kind ?? (initial.kind === 'System' ? 'Dependency' : 'Sequence'),
            sourceId: edge.source,
            targetId: edge.target,
            label: edge.data?.condition || edge.label || '',
            condition: edge.data?.condition ?? '',
            protocol: edge.data?.protocol ?? '',
            color: edge.data?.color || null,
          })),
        },
      })
      setVersion(saved.version)
      setDirty(false)
      setMessage('')
      return saved.version
    },
  })

  const issues = useMemo(
    () => initial.kind === 'Process'
      ? analyzeProcess(
          nodes.map((node) => ({ id: node.id, nodeType: node.data.nodeType, title: node.data.title })),
          edges.map((edge) => ({ id: edge.id, sourceId: edge.source, targetId: edge.target, condition: edge.data?.condition })),
        )
      : [],
    [edges, initial.kind, nodes],
  )
  const selectedNode = nodes.find((node) => node.id === selectedId && selectedKind === 'node') ?? null
  const selectedEdge = edges.find((edge) => edge.id === selectedId && selectedKind === 'edge') ?? null

  function remember() {
    past.current.push({ nodes, edges })
    future.current = []
  }

  function undo() {
    const previous = past.current.pop()
    if (!previous) return
    future.current.push({ nodes, edges })
    setNodes(previous.nodes)
    setEdges(previous.edges)
    setDirty(true)
  }

  function redo() {
    const next = future.current.pop()
    if (!next) return
    past.current.push({ nodes, edges })
    setNodes(next.nodes)
    setEdges(next.edges)
    setDirty(true)
  }

  function addProcessNode(nodeType: string, position: { x: number; y: number }) {
    remember()
    const id = crypto.randomUUID()
    const title = nodeType === 'note' ? 'Kommentar' : nodeType === 'source' ? 'Datenquelle' : nodeTypeLabel(nodeType)
    setNodes((current) => [...current, {
      id,
      type: 'studio',
      position,
      data: { nodeType, title, description: '', eventName: '', componentId: null, color: '', comment: '' },
    }])
    setSelectedId(id)
    setSelectedKind('node')
    setDirty(true)
  }

  function addPlacement(component: Component, position: { x: number; y: number }) {
    remember()
    const id = crypto.randomUUID()
    setNodes((current) => [...current, {
      id,
      type: 'studio',
      position,
      data: { nodeType: 'placement', title: component.name, description: component.description, eventName: '', componentId: component.id, color: '', comment: '' },
    }])
    setSelectedId(id)
    setSelectedKind('node')
    setDirty(true)
  }

  function requestDeleteNode(id: string) {
    if (!initial.nodes.some((node) => node.id === id)) {
      removeNode(id)
      return
    }
    setPendingDelete(id)
  }

  function dropPosition(event: ReactDragEvent) {
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    return { x: point.x - 72, y: point.y - 20 }
  }

  function onCanvasDragOver(event: ReactDragEvent) {
    if (!canWrite || !Array.from(event.dataTransfer.types).includes(toolMime)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onCanvasDrop(event: ReactDragEvent) {
    const payload = event.dataTransfer.getData(toolMime)
    if (!canWrite || !payload) return
    event.preventDefault()
    const position = dropPosition(event)
    if (payload.startsWith('node:')) {
      addProcessNode(payload.slice('node:'.length), position)
      return
    }
    if (!payload.startsWith('component:')) return
    const component = (components.data ?? []).find((item) => item.id === payload.slice('component:'.length))
    if (component) addPlacement(component, position)
  }

  function removeNode(id: string) {
    remember()
    setNodes((current) => current.filter((node) => node.id !== id))
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id))
    setPendingDelete(null)
    setDirty(true)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if (event.key === 'Delete' && !event.repeat && canWrite && !pendingDelete && !diagramDelete && selectedKind === 'node' && selectedId) {
        event.preventDefault()
        requestDeleteNode(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const listTerm = listQuery.trim().toLowerCase()
  const presentTypes = [...new Set(nodes.map((node) => node.data.nodeType))].sort((a, b) => listTypeRank(a) - listTypeRank(b))
  const shownNodes = nodes.filter((node) => {
    if (listType !== 'alle' && node.data.nodeType !== listType) return false
    if (!listTerm) return true
    return `${nodeTypeLabel(node.data.nodeType)} ${node.data.title} ${node.data.comment}`.toLowerCase().includes(listTerm)
  })
  const shownEdges = edges.filter((edge) => {
    if (listTerm && !edgeCaption(edge, nodes).toLowerCase().includes(listTerm)) return false
    if (listType === 'alle') return true
    const source = nodes.find((node) => node.id === edge.source)?.data.nodeType
    const target = nodes.find((node) => node.id === edge.target)?.data.nodeType
    return source === listType || target === listType
  })
  const listFiltered = listTerm.length > 0 || listType !== 'alle'

  useEffect(() => {
    if (!selectedId || !listOpen) return
    const row = document.getElementById(`studio-row-${selectedId}`)
    const list = row?.closest('ul')
    if (!row || !(list instanceof HTMLElement)) return
    const rowBox = row.getBoundingClientRect()
    const listBox = list.getBoundingClientRect()
    if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top
    else if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom
  }, [selectedId, selectedKind, listOpen, listTerm, listType])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LeaveGuard when={dirty || autosave.state === 'conflict' || autosave.state === 'error'} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
          <Input className="h-9 min-w-0 flex-1 sm:max-w-xs" aria-label="Diagrammname" value={name} disabled={!canWrite} onChange={(event) => { setName(event.target.value); setDirty(true) }} />
          <Select className="studio-inline max-w-40" aria-label="Bereich" value={areaId ?? ''} disabled={!canWrite} onChange={(event) => { setAreaId(event.target.value || null); setDirty(true) }}>
            <option value="">Ohne Bereich</option>
            <AreaOptions areas={areas.data} />
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveBadge state={autosave.state} />
          <Button size="sm" type="button" onClick={undo}>Rückgängig</Button>
          <Button size="sm" type="button" onClick={redo}>Wiederholen</Button>
          <Button size="sm" type="button" onClick={() => void flow.fitView({ duration: motionMs(240), padding: 0.2 })}>Einpassen</Button>
          {initial.kind === 'Process' && flowPreview.data?.ready ? <Button asChild size="sm"><Link to={`/projekte/${projectId}/diagramme/${initial.id}/ablauf`}>Ablauf ansehen</Link></Button> : null}
          <Button size="sm" type="button" aria-expanded={inspectorOpen} onClick={() => { const next = !inspectorOpen; setInspectorOpen(next); rememberFlag('studio-panel-inspector', next) }}>Inspektor</Button>
          {canWrite ? (
            <Menu trigger={<Button size="sm" type="button" aria-label="Weitere Aktionen"><MoreHorizontal size={16} /></Button>}>
              <MenuItem onSelect={() => setDiagramDelete(true)}>Diagramm löschen</MenuItem>
            </Menu>
          ) : null}
        </div>
      </div>
      {autosave.state === 'conflict' ? (
        <ConflictBanner onReload={() => { setDirty(false); autosave.clearConflict(); void reload() }} onKeep={() => autosave.retry()} />
      ) : null}
      {message ? <p role="alert" className="px-3 py-2 text-sm text-danger">{message}</p> : null}
      <div className="relative flex min-h-0 flex-1">
        {toolsOpen ? (
          <aside aria-label="Werkzeuge" className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-line bg-nav" style={{ width: toolsWidth }}>
            <button className="absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize hover:bg-accent/50" type="button" aria-label="Breite der Werkzeuge ändern" onPointerDown={(event) => dragPane(event, 'x', 1, toolsWidth, 200, 420, setToolsWidth, 'studio-pane-tools-dock')} />
            <Palette kind={initial.kind} canWrite={canWrite} components={components.data ?? []} />
          </aside>
        ) : null}
        <div className="relative min-w-0 flex-1" onDragOver={onCanvasDragOver} onDrop={onCanvasDrop}>
          {toolsOpen ? null : (
            <Button className="absolute left-3 top-3 z-10" size="sm" type="button" onClick={() => { setToolsOpen(true); rememberFlag('studio-panel-tools', true) }}>Werkzeuge</Button>
          )}
          {initial.kind === 'Process' && nodes.length === 0 && canWrite ? (
            <p className="pointer-events-none absolute inset-x-0 top-8 z-10 px-6 text-center text-sm text-muted">Ziehe ein Werkzeug auf die Stelle, an der der Knoten stehen soll.</p>
          ) : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={null}
            onNodesChange={(changes) => {
              setNodes((current) => changes.applyTo(current))
              if (changes.getByType('position').length > 0) setDirty(true)
            }}
            onEdgesChange={(changes) => setEdges((current) => changes.applyTo(current))}
            onNodeDragStart={remember}
            onConnect={(connection: Connection) => {
              if (!connection.source || !connection.target || connection.source === connection.target) return
              remember()
              setEdges((current) => addEdge({
                ...connection,
                id: crypto.randomUUID(),
                label: '',
                data: { kind: initial.kind === 'System' ? 'Dependency' : 'Sequence', condition: '', protocol: '', color: '' },
              }, current))
              setDirty(true)
            }}
            onSelectionChange={({ nodes: pickedNodes, edges: pickedEdges }) => {
              if (pickedNodes[0]) {
                setSelectedId(pickedNodes[0].id)
                setSelectedKind('node')
              } else if (pickedEdges[0]) {
                setSelectedId(pickedEdges[0].id)
                setSelectedKind('edge')
              }
            }}
          >
            <Background gap={22} size={1.1} color="var(--grid)" />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap position="bottom-right" pannable zoomable style={{ width: 128, height: 84 }} />
            <FocusNode nodeId={focusId} />
          </ReactFlow>
        </div>
        {inspectorOpen ? (
          <aside aria-label="Inspektor" className="absolute inset-y-0 right-0 z-20 w-full overflow-auto border-l border-line bg-card p-4 shadow-overlay lg:relative lg:w-[var(--inspector)] lg:max-w-[46vw] lg:shrink-0 lg:shadow-none" style={{ ['--inspector' as string]: `${inspectorWidth}px` }}>
            <button className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize hover:bg-accent/50 lg:block" type="button" aria-label="Breite des Inspektors ändern" onPointerDown={(event) => dragPane(event, 'x', -1, inspectorWidth, 240, 560, setInspectorWidth, 'studio-pane-inspector')} />
            <div className="mb-3 flex items-center justify-between lg:hidden">
              <h2 className="font-semibold">Inspektor</h2>
              <Button size="sm" type="button" onClick={() => { setInspectorOpen(false); rememberFlag('studio-panel-inspector', false) }}>Schließen</Button>
            </div>
            {initial.kind === 'Process' ? (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-semibold">Quellen und Aktualität</summary>
                <div className="pt-2">
                  <SourcesPanel projectId={projectId} artifactId={initial.id} canWrite={canWrite} />
                  {selectedNode && ['action', 'decision', 'event'].includes(String(selectedNode.data?.nodeType)) ? (
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="mb-2 text-xs text-muted">Quellen dieses Schritts</p>
                      <SourcesPanel projectId={projectId} artifactId={selectedNode.id} canWrite={canWrite} />
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
            <details className="mb-4" open>
              <summary className="cursor-pointer text-sm font-semibold">Prüfung{issues.length > 0 ? ` (${issues.length})` : ''}</summary>
              <IssueList issues={issues} onSelect={(id) => { setSelectedId(id); setSelectedKind('node'); void flow.fitView({ nodes: [{ id }], duration: motionMs(240), padding: 0.6 }) }} />
            </details>
            <Inspector
              projectId={projectId}
              canWrite={canWrite}
              kind={initial.kind}
              description={description}
              onDescription={(value) => { setDescription(value); setDirty(true) }}
              node={selectedNode}
              edge={selectedEdge}
              onNode={(next) => {
                setNodes((current) => current.map((item) => item.id === next.id ? next : item))
                setDirty(true)
              }}
              onEdge={(next) => {
                setEdges((current) => current.map((item) => item.id === next.id ? next : item))
                setDirty(true)
              }}
              onDeleteNode={(id) => requestDeleteNode(id)}
              onDeleteEdge={(id) => {
                remember()
                setEdges((current) => current.filter((edge) => edge.id !== id))
                setDirty(true)
              }}
            />
          </aside>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col border-t border-line bg-nav/40" style={listOpen ? { height: listHeight } : undefined}>
        {listOpen ? <button className="h-1.5 shrink-0 cursor-row-resize hover:bg-accent/50" type="button" aria-label="Höhe der Knotenliste ändern" onPointerDown={(event) => dragPane(event, 'y', -1, listHeight, 160, 640, setListHeight, 'studio-pane-list')} /> : null}
        <button className="flex w-full shrink-0 items-center justify-between px-3 py-2 text-left text-sm font-semibold" type="button" aria-expanded={listOpen} onClick={() => setListOpen((open) => !open)}>
          <span>Knoten und Kanten</span>
          <span className="text-xs font-normal text-muted">{nodes.length} Knoten · {edges.length} Kanten</span>
        </button>
        {listOpen ? (
          <div className="grid min-h-0 flex-1 gap-3 overflow-auto px-3 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-9 max-w-sm" aria-label="Knoten und Kanten suchen" placeholder="Suchen" value={listQuery} onChange={(event) => setListQuery(event.target.value)} />
              {presentTypes.length > 1 ? (
                <div className="flex flex-wrap gap-1" role="group" aria-label="Nach Knotentyp filtern">
                  <Button size="sm" type="button" aria-pressed={listType === 'alle'} variant={listType === 'alle' ? 'primary' : 'secondary'} onClick={() => setListType('alle')}>Alle</Button>
                  {presentTypes.map((type) => (
                    <Button key={type} size="sm" type="button" aria-pressed={listType === type} variant={listType === type ? 'primary' : 'secondary'} onClick={() => setListType(type)}>{nodeTypeLabel(type)}</Button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <section aria-label="Knoten">
                <h3 className="mb-1 text-xs font-medium text-muted">Knoten{listFiltered ? ` · ${shownNodes.length} von ${nodes.length}` : ''}</h3>
                {nodes.length === 0 ? <p className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-muted">Noch keine Knoten.</p> : shownNodes.length === 0 ? <p className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-muted">Keine Treffer.</p> : (
                  <ul className="divide-y divide-line overflow-auto rounded-lg border border-line bg-card">
                    {shownNodes.map((node) => {
                      const active = selectedKind === 'node' && selectedId === node.id
                      return (
                        <li id={`studio-row-${node.id}`} key={node.id} className={`flex items-center gap-2 px-2 py-1.5 ${active ? 'bg-accent/10' : ''}`}>
                          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => { setSelectedId(node.id); setSelectedKind('node') }}>
                            <span className="text-xs text-muted">{nodeTypeLabel(node.data.nodeType)}:</span>
                            {' '}
                            <span className="font-medium">{node.data.title}</span>
                          </button>
                          {canWrite && selectedKind === 'node' && selectedId && selectedId !== node.id ? (
                            <Button className="studio-row-action shrink-0" size="sm" type="button" aria-label={`Mit ${node.data.title} verbinden`} onClick={() => {
                              remember()
                              setEdges((current) => addEdge({
                                id: crypto.randomUUID(),
                                source: selectedId,
                                target: node.id,
                                label: '',
                                data: { kind: initial.kind === 'System' ? 'Dependency' : 'Sequence', condition: '', protocol: '', color: '' },
                              }, current))
                              setDirty(true)
                            }}>Verbinden</Button>
                          ) : null}
                          {canWrite ? <Button className="studio-row-action shrink-0" size="sm" type="button" variant="ghost" onClick={() => void (async () => {
                            if (!initial.nodes.some((item) => item.id === node.id)) removeNode(node.id)
                            else setPendingDelete(node.id)
                          })()}>Löschen</Button> : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
              <section aria-label="Kanten">
                <h3 className="mb-1 text-xs font-medium text-muted">Kanten{listFiltered ? ` · ${shownEdges.length} von ${edges.length}` : ''}</h3>
                {edges.length === 0 ? <p className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-muted">Noch keine Kanten.</p> : shownEdges.length === 0 ? <p className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-muted">Keine Treffer.</p> : (
                  <ul className="divide-y divide-line overflow-auto rounded-lg border border-line bg-card">
                    {shownEdges.map((edge) => {
                      const active = selectedKind === 'edge' && selectedId === edge.id
                      return (
                        <li id={`studio-row-${edge.id}`} key={edge.id} className={`flex items-center gap-2 px-2 py-1.5 ${active ? 'bg-accent/10' : ''}`}>
                          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => { setSelectedId(edge.id); setSelectedKind('edge') }}>
                            <span className="font-medium">Kante {edgeCaption(edge, nodes)}</span>
                          </button>
                          {canWrite ? <Button className="studio-row-action shrink-0" size="sm" type="button" variant="ghost" onClick={() => { remember(); setEdges((current) => current.filter((item) => item.id !== edge.id)); setDirty(true) }}>Löschen</Button> : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </div>
      <DeleteDiagramDialog
        projectId={projectId}
        diagram={diagramDelete ? { id: initial.id, name } : null}
        listPath={initial.kind === 'Process' ? 'prozesse' : 'system'}
        onOpenChange={(next) => { if (!next) setDiagramDelete(false) }}
      />
      <Modal open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null) }} title="Knoten entfernen">
        {impact.isPending ? <p>Auswirkungen werden geladen …</p> : null}
        {impact.data ? <ImpactList impact={impact.data} /> : null}
        {impact.isError ? <p role="alert">{impact.error instanceof ApiError && impact.error.status === 404 ? 'Der Knoten ist noch nicht gespeichert.' : errorText(impact.error)}</p> : null}
        <Button type="button" variant="danger" onClick={() => pendingDelete && removeNode(pendingDelete)}>Entfernen</Button>
      </Modal>
    </div>
  )
}

function DeleteDiagramDialog({ projectId, diagram, listPath, onOpenChange }: { projectId: string; diagram: { id: string; name: string } | null; listPath: string; onOpenChange: (open: boolean) => void }) {
  const impact = useQuery({
    queryKey: ['impact', projectId, diagram?.id],
    queryFn: () => api<Impact>(`/api/v1/projects/${projectId}/artifacts/${diagram!.id}/impact`),
    enabled: Boolean(diagram),
  })
  const remove = useMutation({
    mutationFn: () => api(`/api/v1/projects/${projectId}/diagrams/${diagram!.id}`, { method: 'DELETE' }),
    onSuccess: () => { window.location.assign(`/projekte/${projectId}/${listPath}`) },
  })
  return (
    <Modal open={Boolean(diagram)} onOpenChange={onOpenChange} title={`${diagram?.name ?? 'Diagramm'} löschen`}>
      {impact.isLoading ? <p>Auswirkungen werden geladen …</p> : null}
      {impact.data ? <ImpactList impact={impact.data} /> : null}
      {impact.isError ? <p role="alert" className="text-sm text-danger">{errorText(impact.error)}</p> : null}
      {remove.isError ? <p role="alert" className="text-sm text-danger">{errorText(remove.error)}</p> : null}
      <p className="text-sm text-muted">Knoten, Kanten und Verknüpfungen dieses Diagramms werden mitgelöscht. Komponenten bleiben im Projekt erhalten.</p>
      <Button type="button" variant="danger" disabled={!diagram || remove.isPending} onClick={() => remove.mutate()}>Endgültig löschen</Button>
    </Modal>
  )
}

function FocusNode({ nodeId }: { nodeId: string | null }) {
  const flow = useReactFlow()
  useEffect(() => {
    if (!nodeId) return
    const timer = window.setTimeout(() => {
      void flow.fitView({ nodes: [{ id: nodeId }], duration: motionMs(240), padding: 0.6 })
    }, 80)
    return () => window.clearTimeout(timer)
  }, [flow, nodeId])
  return null
}

const toolMime = 'application/sarch-tool'

const processTools = [
  ['start', Circle],
  ['action', Square],
  ['decision', Diamond],
  ['event', Zap],
  ['end', Octagon],
  ['note', StickyNote],
  ['source', Database],
] as const

function beginToolDrag(event: ReactDragEvent<HTMLButtonElement>, payload: string) {
  event.dataTransfer.setData(toolMime, payload)
  event.dataTransfer.effectAllowed = 'copy'
}

function Palette({ kind, canWrite, components }: { kind: DiagramKind; canWrite: boolean; components: Component[] }) {
  if (!canWrite) return <p className="p-3 text-sm text-muted">Nur zur Ansicht.</p>
  if (kind === 'Process') {
    return (
      <div className="grid gap-1 p-2">
        <h2 className="px-2 py-1 text-xs font-semibold text-muted">Werkzeuge</h2>
        <p className="px-2 pb-1 text-xs text-muted">Auf die Fläche ziehen.</p>
        {processTools.map(([type, Icon]) => (
          <Button key={type} size="sm" className="cursor-grab justify-start active:cursor-grabbing" type="button" draggable title="Auf die Fläche ziehen" onDragStart={(event) => beginToolDrag(event, `node:${type}`)}>
            <Icon size={14} aria-hidden="true" />
            {nodeTypeLabel(type)}
          </Button>
        ))}
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 gap-1 border-b border-line p-2">
        <p className="px-2 pb-1 text-xs text-muted">Auf die Fläche ziehen.</p>
        <Button size="sm" className="w-full cursor-grab justify-start active:cursor-grabbing" type="button" draggable title="Auf die Fläche ziehen" onDragStart={(event) => beginToolDrag(event, 'node:note')}>
          <StickyNote size={14} aria-hidden="true" />
          Kommentar
        </Button>
        <Button size="sm" className="w-full cursor-grab justify-start active:cursor-grabbing" type="button" draggable title="Auf die Fläche ziehen" onDragStart={(event) => beginToolDrag(event, 'node:source')}>
          <Database size={14} aria-hidden="true" />
          Datenquelle
        </Button>
      </div>
      <h2 className="shrink-0 px-3 py-2 text-sm font-semibold">Komponenten</h2>
      {components.length === 0 ? <p className="px-3 text-sm text-muted">Lege zuerst eine Komponente an.</p> : (
        <div className="studio-scroll min-h-0 flex-1 px-2 pb-3">
          <div className="grid gap-1">
            {components.map((component) => (
              <Button key={component.id} size="sm" className="h-auto min-h-8 w-full cursor-grab justify-start whitespace-normal py-1.5 text-left active:cursor-grabbing" type="button" draggable title="Auf die Fläche ziehen" onDragStart={(event) => beginToolDrag(event, `component:${component.id}`)}>{component.name}</Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function IssueList({ issues, onSelect }: { issues: Array<{ code: string; message: string; nodeId: string | null }>; onSelect: (id: string) => void }) {
  if (issues.length === 0) return <p className="mt-4 text-sm text-muted">Keine Modellierungshinweise.</p>
  return (
    <ul className="mt-4 grid gap-2">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`}>
          {issue.nodeId ? (
            <button className="text-left text-sm underline" type="button" onClick={() => onSelect(issue.nodeId!)}>{issue.message}</button>
          ) : (
            <p className="text-sm">{issue.message}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

function Inspector(props: {
  projectId: string
  canWrite: boolean
  kind: DiagramKind
  description: string
  onDescription: (value: string) => void
  node: FlowNode | null
  edge: FlowEdge | null
  onNode: (node: FlowNode) => void
  onEdge: (edge: FlowEdge) => void
  onDeleteNode: (id: string) => void
  onDeleteEdge: (id: string) => void
}) {
  if (props.node) {
    const node = props.node
    const step = node.data.nodeType === 'action' || node.data.nodeType === 'decision' || node.data.nodeType === 'event'
    return (
      <div className="grid gap-4">
        <section className="grid gap-3">
        <h2 className="text-sm font-semibold">Eigenschaften</h2>
        <p className="text-xs text-muted">{nodeTypeLabel(node.data.nodeType)}</p>
        <Field label="Titel">
          <Input value={node.data.title} disabled={!props.canWrite || node.data.nodeType === 'placement'} onChange={(event) => props.onNode({ ...node, data: { ...node.data, title: event.target.value } })} />
        </Field>
        <Field label="Beschreibung">
          <Textarea value={node.data.description} disabled={!props.canWrite} onChange={(event) => props.onNode({ ...node, data: { ...node.data, description: event.target.value } })} />
        </Field>
        <Field label="Kommentar">
          <Textarea value={node.data.comment} aria-label="Kommentar" disabled={!props.canWrite} placeholder={node.data.nodeType === 'note' ? 'Hinweis neben dem Ablauf' : 'Notiz an diesem Knoten'} onChange={(event) => props.onNode({ ...node, data: { ...node.data, comment: event.target.value } })} />
        </Field>
        <ToneField value={node.data.color} disabled={!props.canWrite} onChange={(color) => props.onNode({ ...node, data: { ...node.data, color } })} />
        {node.data.nodeType === 'event' || node.data.nodeType === 'action' ? (
          <Field label="Ereignisname">
            <Input value={node.data.eventName} disabled={!props.canWrite} onChange={(event) => props.onNode({ ...node, data: { ...node.data, eventName: event.target.value } })} />
          </Field>
        ) : null}
        <p className="text-sm text-muted">Position {Math.round(node.position.x)}, {Math.round(node.position.y)}</p>
        {props.canWrite ? <Button type="button" variant="danger" onClick={() => props.onDeleteNode(node.id)}>Knoten entfernen</Button> : null}
        </section>
        {step ? (
          <section className="grid gap-3 border-t border-line pt-3">
            <LinkPanel projectId={props.projectId} artifactId={node.id} mode="step" nodeType={node.data.nodeType} canWrite={props.canWrite} />
            <UsagePanel projectId={props.projectId} artifactId={node.id} title={node.data.title || 'Prozessschritt'} />
          </section>
        ) : null}
      </div>
    )
  }
  if (props.edge) {
    const edge = props.edge
    return (
      <div className="grid gap-3">
        <h2 className="font-semibold">Kante</h2>
        {props.kind === 'Process' ? (
          <Field label="Bedingung">
            <Input value={edge.data?.condition ?? ''} disabled={!props.canWrite} onChange={(event) => props.onEdge(paint(edge, { kind: 'Sequence', condition: event.target.value, protocol: '', color: edge.data?.color ?? '' }))} />
          </Field>
        ) : (
          <>
            <Field label="Bezeichnung">
              <Input value={edge.data?.condition ?? ''} disabled={!props.canWrite} onChange={(event) => props.onEdge(paint(edge, { kind: edge.data?.kind ?? 'Dependency', condition: event.target.value, protocol: edge.data?.protocol ?? '', color: edge.data?.color ?? '' }))} />
            </Field>
            <Field label="Protokoll">
              <Input value={edge.data?.protocol ?? ''} disabled={!props.canWrite} onChange={(event) => props.onEdge(paint(edge, { kind: edge.data?.kind ?? 'Dependency', condition: edge.data?.condition ?? '', protocol: event.target.value, color: edge.data?.color ?? '' }))} />
            </Field>
            <Field label="Art">
              <Select value={edge.data?.kind ?? 'Dependency'} disabled={!props.canWrite} onChange={(event) => props.onEdge(paint(edge, { kind: event.target.value as EdgeKind, condition: edge.data?.condition ?? '', protocol: edge.data?.protocol ?? '', color: edge.data?.color ?? '' }))}>
                <option value="Dependency">Abhängigkeit</option>
                <option value="DataFlow">Datenfluss</option>
              </Select>
            </Field>
          </>
        )}
        <ToneField value={edge.data?.color ?? ''} disabled={!props.canWrite} onChange={(color) => props.onEdge(paint(edge, { kind: edge.data?.kind ?? (props.kind === 'Process' ? 'Sequence' : 'Dependency'), condition: edge.data?.condition ?? '', protocol: edge.data?.protocol ?? '', color }))} />
        {props.canWrite ? <Button type="button" onClick={() => props.onDeleteEdge(edge.id)}>Kante entfernen</Button> : null}
      </div>
    )
  }
  return (
    <div className="grid gap-3">
      <h2 className="text-sm font-semibold">Eigenschaften</h2>
      <p className="text-xs text-muted">Diagramm</p>
      <Field label="Beschreibung">
        <Textarea value={props.description} disabled={!props.canWrite} onChange={(event) => props.onDescription(event.target.value)} />
      </Field>
      <p className="text-sm text-muted">Wähle einen Knoten oder eine Kante. Die grafische Bearbeitung ist für den Desktop ausgelegt; die Liste darunter bleibt per Tastatur nutzbar.</p>
    </div>
  )
}

function StudioNode({ data, selected }: NodeProps<FlowNode>) {
  const shape = data.nodeType === 'start' || data.nodeType === 'end' ? 'rounded-full' : data.nodeType === 'decision' ? 'rounded-md border-dashed' : data.nodeType === 'event' ? 'rounded-md border-double' : 'rounded-md'
  return (
    <div className={`studio-node min-w-40 border bg-card px-3 py-2 text-sm shadow-sm ${shape} ${data.nodeType === 'note' ? 'is-note' : ''} ${data.nodeType === 'source' ? 'is-source' : ''} ${selected ? 'ring-2 ring-accent' : 'border-line'} ${data.nodeType === 'placement' && !data.color ? 'border-l-4 border-l-accent' : ''}`} data-tone={data.color || undefined}>
      <Handle type="target" position={Position.Left} />
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{nodeTypeLabel(data.nodeType)}</div>
      <div className="font-medium break-words">{data.title || 'Ohne Titel'}</div>
      {data.comment ? <p className="mt-1 line-clamp-3 text-xs leading-snug text-muted">{data.comment}</p> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function ToneField({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (color: string) => void }) {
  return (
    <div className="grid gap-1">
      <span className="text-sm" id="diagramm-farbe">Farbe</span>
      <div className="flex flex-wrap gap-1" role="group" aria-labelledby="diagramm-farbe">
        {tones.map((tone) => (
          <button
            key={tone.id || 'standard'}
            className={`studio-tone tone-${tone.id || 'standard'}`}
            type="button"
            aria-pressed={value === tone.id}
            disabled={disabled}
            onClick={() => onChange(tone.id)}
          >
            {tone.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function paint(edge: FlowEdge, data: EdgeData): FlowEdge {
  return { ...edge, label: data.condition, className: data.color ? `tone-${data.color}` : undefined, data }
}

function readPane(key: string, fallback: number) {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function dragPane(event: ReactPointerEvent, axis: 'x' | 'y', direction: 1 | -1, current: number, min: number, max: number, set: (value: number) => void, key: string) {
  event.preventDefault()
  event.stopPropagation()
  const start = axis === 'x' ? event.clientX : event.clientY
  let latest = current
  function move(next: PointerEvent) {
    const delta = (axis === 'x' ? next.clientX : next.clientY) - start
    latest = Math.min(max, Math.max(min, current + delta * direction))
    set(latest)
  }
  function up() {
    localStorage.setItem(key, String(Math.round(latest)))
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function listTypeRank(type: string) {
  const order = ['start', 'event', 'action', 'decision', 'end', 'note', 'source', 'placement']
  const index = order.indexOf(type)
  return index === -1 ? order.length : index
}

function edgeCaption(edge: FlowEdge, nodes: FlowNode[]) {
  const source = nodes.find((node) => node.id === edge.source)?.data.title ?? 'Quelle'
  const target = nodes.find((node) => node.id === edge.target)?.data.title ?? 'Ziel'
  const condition = edge.data?.condition || (typeof edge.label === 'string' ? edge.label : '')
  return condition ? `${source} → ${target}: ${condition}` : `${source} → ${target}`
}

function toNode(node: Diagram['nodes'][number], selectedId?: string | null): FlowNode {
  return {
    id: node.id,
    type: 'studio',
    selected: node.id === selectedId,
    position: { x: node.x, y: node.y },
    data: {
      nodeType: node.nodeType,
      title: node.componentName || node.title,
      description: node.description ?? '',
      eventName: node.eventName ?? '',
      componentId: node.componentId,
      color: node.color ?? '',
      comment: node.comment ?? '',
    },
  }
}

function toEdge(edge: Diagram['edges'][number]): FlowEdge {
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    label: edge.condition || edge.label || '',
    interactionWidth: 20,
    className: edge.color ? `tone-${edge.color}` : undefined,
    data: { kind: edge.kind, condition: edge.condition || edge.label || '', protocol: edge.protocol ?? '', color: edge.color ?? '' },
  }
}

export function ComponentsPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const components = useQuery({ queryKey: ['components', project.id], queryFn: () => api<Component[]>(`/api/v1/projects/${project.id}/components`) })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Component['kind']>('Service')
  const client = useQueryClient()
  const create = useMutation({
    mutationFn: () => api(`/api/v1/projects/${project.id}/components`, { method: 'POST', body: { name, kind, description: '' } }),
    onSuccess: async () => {
      setOpen(false)
      setName('')
      await client.invalidateQueries({ queryKey: ['components', project.id] })
    },
  })
  return (
    <div className="grid w-full gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-3">
          <h1 className="text-2xl font-semibold">Komponenten</h1>
          <ArchitectureTabs projectId={project.id} current="components" />
        </div>
        {canWrite ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Komponente anlegen</Button> : null}
      </header>
      {components.isLoading ? <Loading /> : null}
      {components.isError ? <ErrorState error={components.error} onRetry={() => void components.refetch()} /> : null}
      {components.data?.length === 0 ? <EmptyState title="Keine Komponenten" body="Komponenten lassen sich in mehreren Systemdiagrammen platzieren." /> : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {components.data?.map((component) => (
          <li key={component.id}>
            <Link className="flex h-full flex-col gap-2 rounded-xl border border-line bg-card p-4 hover:bg-background" to={`/projekte/${project.id}/system/komponenten/${component.id}`}>
              <span className="text-xs font-medium text-accent">{componentKindLabel(component.kind)}</span>
              <span className="font-semibold">{component.name}</span>
              {component.technology || component.description ? <span className="line-clamp-2 text-sm text-muted">{component.technology || component.description}</span> : null}
              <span className="mt-auto text-xs text-muted">{component.placementCount} {component.placementCount === 1 ? 'Platzierung' : 'Platzierungen'}{component.detailCount > 0 ? ` · ${schemaCountLabel(component.kind, component.detailCount)}` : ''}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Modal open={open} onOpenChange={setOpen} title="Neue Komponente">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Name"><Input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Art">
            <Select value={kind} onChange={(event) => setKind(event.target.value as Component['kind'])}>
              <option value="Client">Client</option>
              <option value="Api">API</option>
              <option value="Service">Service</option>
              <option value="Database">Datenbank</option>
              <option value="Queue">Queue</option>
              <option value="External">Externes System</option>
            </Select>
          </Field>
          {create.isError ? <p className="text-sm text-danger">{errorText(create.error)}</p> : null}
          <Button type="submit" variant="primary">Anlegen</Button>
        </form>
      </Modal>
    </div>
  )
}

export function ComponentDetailPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const { componentId = '' } = useParams()
  const query = useQuery({
    queryKey: ['component', project.id, componentId],
    queryFn: () => api<Component>(`/api/v1/projects/${project.id}/components/${componentId}`),
  })
  const effects = useQuery({
    queryKey: ['effects', project.id, componentId],
    queryFn: () => api<AffectedFlow[]>(`/api/v1/projects/${project.id}/components/${componentId}/effects`),
  })
  const [draft, setDraft] = useState<Component | null>(null)
  const client = useQueryClient()
  useEffect(() => { if (query.data) setDraft(query.data) }, [query.data])
  const save = useMutation({
    mutationFn: () => api<Component>(`/api/v1/projects/${project.id}/components/${componentId}`, {
      method: 'PATCH',
      body: { version: draft!.version, name: draft!.name, description: draft!.description, kind: draft!.kind, technology: draft!.technology },
    }),
    onSuccess: async (saved) => {
      setDraft(saved)
      await client.invalidateQueries({ queryKey: ['components', project.id] })
      await client.invalidateQueries({ queryKey: ['diagram', project.id] })
      await client.invalidateQueries({ queryKey: ['effects', project.id, componentId] })
      await client.invalidateQueries({ queryKey: ['overview', project.id] })
    },
  })
  const remove = useMutation({
    mutationFn: () => api(`/api/v1/projects/${project.id}/artifacts/${componentId}`, { method: 'DELETE' }),
    onSuccess: () => { window.location.assign(`/projekte/${project.id}/system/komponenten`) },
  })
  if (query.isLoading || !draft) return <Loading />
  if (query.isError) return <div className="p-6"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div>
  const placements = `${draft.placementCount} ${draft.placementCount === 1 ? 'Platzierung' : 'Platzierungen'}`
  return (
    <div className="grid w-full items-start gap-6 px-4 py-6 md:px-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 content-start gap-4">
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                <span className="mb-1 block text-sm font-normal text-muted">Komponente</span>
                {draft.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="accent">{componentKindLabel(draft.kind)}</Badge>
                {draft.technology ? <span className="text-sm text-muted">{draft.technology}</span> : null}
                <span className="text-sm text-muted">{placements}</span>
              </div>
            </div>
            {canWrite ? <Button type="submit" variant="primary">Speichern</Button> : null}
          </header>
          <section className="grid gap-4 rounded-xl border border-line bg-card p-4 md:p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name"><Input value={draft.name} disabled={!canWrite} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
              <Field label="Art">
                <Select aria-label="Art" value={draft.kind} disabled={!canWrite} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Component['kind'] })}>
                  <option value="Client">Client</option>
                  <option value="Api">API</option>
                  <option value="Service">Service</option>
                  <option value="Database">Datenbank</option>
                  <option value="Queue">Queue</option>
                  <option value="External">Externes System</option>
                </Select>
              </Field>
              <Field label="Technologie"><Input value={draft.technology ?? ''} disabled={!canWrite} onChange={(event) => setDraft({ ...draft, technology: event.target.value })} /></Field>
            </div>
            <Field label="Beschreibung"><Textarea className="min-h-20" value={draft.description} disabled={!canWrite} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
            <p className="text-sm text-muted">{draft.placementCount} Platzierungen. Eine Umbenennung gilt für alle Diagramme. Das Entfernen einer Platzierung löscht die Komponente nicht.</p>
          </section>
          {save.isError ? <p role="alert" className="text-sm text-danger">{errorText(save.error)}</p> : null}
        </form>
        <ComponentSchema projectId={project.id} componentId={componentId} kind={draft.kind} canWrite={canWrite} />
        <section className="grid gap-3 rounded-xl border border-line bg-card p-4 md:p-5">
          <h2 className="font-semibold">Auswirkung auf Abläufe</h2>
          {effects.isLoading ? <p className="text-sm text-muted">Wird geladen …</p> : null}
          {effects.data?.length === 0 ? <p className="text-sm text-muted">Kein Prozessschritt verwendet diese Komponente.</p> : null}
          <ul className="grid gap-2">
            {effects.data?.map((flow) => (
              <li key={flow.nodeId}>
                <Link className="block rounded-lg border border-line px-3 py-2 hover:bg-background" to={`/projekte/${project.id}/diagramme/${flow.diagramId}?node=${flow.nodeId}`}>
                  <span className="block text-xs text-muted">{[flow.areaName, flow.diagramName].filter(Boolean).join(' · ')}</span>
                  <span className="block font-medium">{flow.nodeTitle}</span>
                  {flow.rationale ? <span className="mt-1 block text-sm text-muted">{flow.rationale}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-line bg-card p-4 md:p-5">
          <SourcesPanel projectId={project.id} artifactId={componentId} canWrite={canWrite} />
        </section>
        {canWrite ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <p className="text-sm text-muted">Löschen entfernt die Komponente aus allen Diagrammen.</p>
            <Button type="button" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>Komponente löschen</Button>
            {remove.isError ? <p role="alert" className="w-full text-sm text-danger">{errorText(remove.error)}</p> : null}
          </div>
        ) : null}
      </div>
      <aside className="grid content-start gap-4 xl:sticky xl:top-4">
        <div className="rounded-xl border border-line bg-card p-4">
          <LinkPanel projectId={project.id} artifactId={componentId} mode="component" canWrite={canWrite} />
        </div>
        <div className="rounded-xl border border-line bg-card p-4">
          <UsagePanel projectId={project.id} artifactId={componentId} title={draft.name} />
        </div>
      </aside>
    </div>
  )
}
