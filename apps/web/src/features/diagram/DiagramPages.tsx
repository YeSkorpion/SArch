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
import { Circle, Diamond, MoreHorizontal, Octagon, Square, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router'
import { LeaveGuard } from '../../components/LeaveGuard'
import { EmptyState, ErrorState, Loading, SaveBadge } from '../../components/states'
import { Button, Field, Input, Menu, MenuItem, Modal, Select, Textarea } from '../../components/ui'
import { ApiError, api, errorText } from '../../lib/api'
import { useAutosave } from '../../lib/autosave'
import { motionMs, readFlag, rememberFlag, useRememberScroll } from '../../lib/scroll'
import { analyzeProcess } from '../../lib/diagramCheck'
import { nodeTypeLabel } from '../../lib/labels'
import type { AffectedFlow, Area, Component, Diagram, DiagramKind, DiagramSummary, EdgeKind, Impact, SavedView } from '../../lib/types'
import { LinkPanel } from '../links/LinkPanel'
import { UsagePanel } from '../usage/UsagePanel'
import { ImpactList } from '../requirements/RequirementsPages'
import type { ProjectOutlet } from '../shell/Shell'
import '@xyflow/react/dist/style.css'

type NodeData = {
  nodeType: string
  title: string
  description: string
  eventName: string
  componentId: string | null
}
type FlowNode = Node<NodeData, 'studio'>
type EdgeData = { kind: EdgeKind; condition: string; protocol: string }
type FlowEdge = Edge<EdgeData>

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
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-3">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {kind === 'System' ? <ArchitectureTabs projectId={project.id} current="diagrams" /> : null}
        </div>
        {canWrite && (hasDiagrams || filtered) ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Diagramm anlegen</Button> : null}
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <Select className="studio-inline" aria-label="Bereich filtern" value={area} onChange={(event) => filter({ bereich: event.target.value })}>
          <option value="">Alle Bereiche</option>
          <option value="none">Ohne Bereich</option>
          {areas.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <Input className="studio-inline max-w-xs" aria-label="Diagramme suchen" value={term} placeholder="Suchen" onChange={(event) => filter({ q: event.target.value })} />
        {canWrite ? <Button size="sm" type="button" onClick={() => setViewOpen(true)}>Ansicht speichern</Button> : null}
      </div>
      {views.data && views.data.length > 0 ? (
        <nav aria-label="Gespeicherte Ansichten" className="flex flex-wrap gap-2">
          {views.data.map((view) => (
            <span key={view.id} className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-1 text-sm">
              <Link className="underline" to={viewHref(project.id, kind, view)}>{view.name}</Link>
              {canWrite ? <Button size="sm" type="button" variant="ghost" onClick={() => removeView.mutate(view.id)}>Entfernen</Button> : null}
            </span>
          ))}
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
        <section key={group} className="grid gap-2">
          <h2 className="text-sm font-semibold text-muted">{group}</h2>
          <ul className="grid gap-2">
            {items.map((diagram) => (
              <li key={diagram.id} className="flex items-center gap-2 border-b border-line">
                <Link className="min-w-0 flex-1 py-2.5 font-medium break-words" to={`/projekte/${project.id}/diagramme/${diagram.id}`}>{diagram.name}</Link>
                {canWrite ? <Button className="mr-2" size="sm" type="button" variant="danger" onClick={() => setPendingDelete(diagram)}>Löschen</Button> : null}
              </li>
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
              {areas.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
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
    if (dirty) return
    setNodes(initial.nodes.map((node) => toNode(node, focusId)))
    setEdges(initial.edges.map(toEdge))
    setName(initial.name)
    setDescription(initial.description)
    setAreaId(initial.areaId)
    setVersion(initial.version)
    // Nur anwenden, wenn der Serverstand neu geladen wurde. Ein abgeschlossenes Speichern darf den Entwurf nicht zurücksetzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

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
          })),
          edges: edges.map((edge) => ({
            id: edge.id,
            kind: edge.data?.kind ?? (initial.kind === 'System' ? 'Dependency' : 'Sequence'),
            sourceId: edge.source,
            targetId: edge.target,
            label: edge.data?.condition || edge.label || '',
            condition: edge.data?.condition ?? '',
            protocol: edge.data?.protocol ?? '',
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

  function addProcessNode(nodeType: string) {
    remember()
    const id = crypto.randomUUID()
    setNodes((current) => [...current, {
      id,
      type: 'studio',
      position: { x: 80 + current.length * 28, y: 80 + current.length * 16 },
      data: { nodeType, title: nodeTypeLabel(nodeType), description: '', eventName: '', componentId: null },
    }])
    setSelectedId(id)
    setSelectedKind('node')
    setDirty(true)
  }

  function addPlacement(component: Component) {
    remember()
    const id = crypto.randomUUID()
    setNodes((current) => [...current, {
      id,
      type: 'studio',
      position: { x: 80 + current.length * 28, y: 120 },
      data: { nodeType: 'placement', title: component.name, description: component.description, eventName: '', componentId: component.id },
    }])
    setDirty(true)
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[32rem] flex-col">
      <LeaveGuard when={dirty || autosave.state === 'conflict' || autosave.state === 'error'} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
          <Input className="h-9 min-w-0 flex-1 sm:max-w-xs" aria-label="Diagrammname" value={name} disabled={!canWrite} onChange={(event) => { setName(event.target.value); setDirty(true) }} />
          <Select className="studio-inline max-w-40" aria-label="Bereich" value={areaId ?? ''} disabled={!canWrite} onChange={(event) => { setAreaId(event.target.value || null); setDirty(true) }}>
            <option value="">Ohne Bereich</option>
            {areas.data?.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveBadge state={autosave.state} />
          <Button size="sm" type="button" onClick={undo}>Rückgängig</Button>
          <Button size="sm" type="button" onClick={redo}>Wiederholen</Button>
          <Button size="sm" type="button" onClick={() => void flow.fitView({ duration: motionMs(240), padding: 0.2 })}>Einpassen</Button>
          <Button size="sm" type="button" aria-expanded={inspectorOpen} onClick={() => { const next = !inspectorOpen; setInspectorOpen(next); rememberFlag('studio-panel-inspector', next) }}>Inspektor</Button>
          {canWrite ? (
            <Menu trigger={<Button size="sm" type="button" aria-label="Weitere Aktionen"><MoreHorizontal size={16} /></Button>}>
              <MenuItem onSelect={() => setDiagramDelete(true)}>Diagramm löschen</MenuItem>
            </Menu>
          ) : null}
        </div>
      </div>
      {autosave.state === 'conflict' ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-warning px-3 py-2 text-sm" role="alert">
          Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.
          <Button size="sm" type="button" onClick={() => { setDirty(false); autosave.clearConflict(); void reload() }}>Serverstand laden</Button>
        </div>
      ) : null}
      {message ? <p role="alert" className="px-3 py-2 text-sm text-danger">{message}</p> : null}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {toolsOpen ? (
            <aside aria-label="Werkzeuge" className="absolute left-3 top-3 z-10 max-h-[calc(100%-5rem)] overflow-auto rounded-lg border border-line bg-card p-1 shadow-overlay">
              <Palette kind={initial.kind} canWrite={canWrite} components={components.data ?? []} onProcess={addProcessNode} onComponent={addPlacement} />
            </aside>
          ) : (
            <Button className="absolute left-3 top-3 z-10" size="sm" type="button" onClick={() => { setToolsOpen(true); rememberFlag('studio-panel-tools', true) }}>Werkzeuge</Button>
          )}
          {initial.kind === 'Process' && nodes.length === 0 && canWrite ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
              <Button className="pointer-events-auto" type="button" variant="primary" onClick={() => addProcessNode('start')}>Startknoten hinzufügen</Button>
            </div>
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
                data: { kind: initial.kind === 'System' ? 'Dependency' : 'Sequence', condition: '', protocol: '' },
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
          <aside aria-label="Inspektor" className="absolute inset-y-0 right-0 z-20 w-[min(22rem,100%)] overflow-auto border-l border-line bg-card p-4 shadow-overlay lg:static lg:w-80 lg:shadow-none">
            <div className="mb-3 flex items-center justify-between lg:hidden">
              <h2 className="font-semibold">Inspektor</h2>
              <Button size="sm" type="button" onClick={() => { setInspectorOpen(false); rememberFlag('studio-panel-inspector', false) }}>Schließen</Button>
            </div>
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
              onDeleteNode={async (id) => {
                if (!initial.nodes.some((node) => node.id === id)) {
                  removeNode(id)
                  return
                }
                setPendingDelete(id)
              }}
              onDeleteEdge={(id) => {
                remember()
                setEdges((current) => current.filter((edge) => edge.id !== id))
                setDirty(true)
              }}
            />
          </aside>
        ) : null}
      </div>
      <div className="border-t border-line">
        <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold" type="button" aria-expanded={listOpen} onClick={() => setListOpen((open) => !open)}>
          Knoten und Kanten
        </button>
        {listOpen ? <ul className="grid max-h-48 gap-1 overflow-auto px-3 pb-3 md:grid-cols-2">
          {nodes.map((node) => (
            <li key={node.id} className="flex items-center justify-between gap-2 text-sm">
              <button type="button" className="underline" onClick={() => { setSelectedId(node.id); setSelectedKind('node') }}>{nodeTypeLabel(node.data.nodeType)}: {node.data.title}</button>
              {canWrite && selectedKind === 'node' && selectedId && selectedId !== node.id ? (
                <Button size="sm" type="button" aria-label={`Mit ${node.data.title} verbinden`} onClick={() => {
                  remember()
                  setEdges((current) => addEdge({
                    id: crypto.randomUUID(),
                    source: selectedId,
                    target: node.id,
                    label: '',
                    data: { kind: initial.kind === 'System' ? 'Dependency' : 'Sequence', condition: '', protocol: '' },
                  }, current))
                  setDirty(true)
                }}>Verbinden</Button>
              ) : null}
              {canWrite ? <Button size="sm" type="button" onClick={() => void (async () => {
                if (!initial.nodes.some((item) => item.id === node.id)) removeNode(node.id)
                else setPendingDelete(node.id)
              })()}>Löschen</Button> : null}
            </li>
          ))}
          {edges.map((edge) => (
            <li key={edge.id} className="flex items-center justify-between gap-2 text-sm">
              <button type="button" className="underline" onClick={() => { setSelectedId(edge.id); setSelectedKind('edge') }}>Kante {edgeCaption(edge, nodes)}</button>
              {canWrite ? <Button size="sm" type="button" onClick={() => { remember(); setEdges((current) => current.filter((item) => item.id !== edge.id)); setDirty(true) }}>Löschen</Button> : null}
            </li>
          ))}
        </ul> : null}
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

const processTools = [
  ['start', Circle],
  ['action', Square],
  ['decision', Diamond],
  ['event', Zap],
  ['end', Octagon],
] as const

function Palette({ kind, canWrite, components, onProcess, onComponent }: { kind: DiagramKind; canWrite: boolean; components: Component[]; onProcess: (type: string) => void; onComponent: (component: Component) => void }) {
  if (!canWrite) return <p className="text-sm text-muted">Nur zur Ansicht.</p>
  if (kind === 'Process') {
    return (
      <div className="grid gap-1">
        <h2 className="px-2 py-1 text-xs font-semibold text-muted">Werkzeuge</h2>
        {processTools.map(([type, Icon]) => (
          <Button key={type} size="sm" className="justify-start" type="button" onClick={() => onProcess(type)}>
            <Icon size={14} aria-hidden="true" />
            {nodeTypeLabel(type)}
          </Button>
        ))}
      </div>
    )
  }
  return (
    <div className="grid gap-2">
      <h2 className="text-sm font-semibold">Komponenten</h2>
      {components.length === 0 ? <p className="text-sm text-muted">Lege zuerst eine Komponente an.</p> : null}
      {components.map((component) => (
        <Button key={component.id} size="sm" type="button" onClick={() => onComponent(component)}>{component.name}</Button>
      ))}
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
            <Input value={edge.data?.condition ?? ''} disabled={!props.canWrite} onChange={(event) => props.onEdge({ ...edge, label: event.target.value, data: { kind: 'Sequence', condition: event.target.value, protocol: '' } })} />
          </Field>
        ) : (
          <>
            <Field label="Bezeichnung">
              <Input value={edge.data?.condition ?? ''} disabled={!props.canWrite} onChange={(event) => props.onEdge({ ...edge, label: event.target.value, data: { kind: edge.data?.kind ?? 'Dependency', condition: event.target.value, protocol: edge.data?.protocol ?? '' } })} />
            </Field>
            <Field label="Protokoll">
              <Input value={edge.data?.protocol ?? ''} disabled={!props.canWrite} onChange={(event) => props.onEdge({ ...edge, data: { kind: edge.data?.kind ?? 'Dependency', condition: edge.data?.condition ?? '', protocol: event.target.value } })} />
            </Field>
            <Field label="Art">
              <select className="h-10 rounded-md border border-line bg-card px-3 text-sm" value={edge.data?.kind ?? 'Dependency'} disabled={!props.canWrite} onChange={(event) => props.onEdge({ ...edge, data: { kind: event.target.value as EdgeKind, condition: edge.data?.condition ?? '', protocol: edge.data?.protocol ?? '' } })}>
                <option value="Dependency">Abhängigkeit</option>
                <option value="DataFlow">Datenfluss</option>
              </select>
            </Field>
          </>
        )}
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
    <div className={`min-w-40 border bg-card px-3 py-2 text-sm shadow-sm ${shape} ${selected ? 'border-accent ring-2 ring-accent' : 'border-line'} ${data.nodeType === 'placement' ? 'border-l-4 border-l-accent' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{nodeTypeLabel(data.nodeType)}</div>
      <div className="font-medium break-words">{data.title || 'Ohne Titel'}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
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
    data: { kind: edge.kind, condition: edge.condition || edge.label || '', protocol: edge.protocol ?? '' },
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
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 md:px-8">
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
      <ul className="grid gap-2">
        {components.data?.map((component) => (
          <li key={component.id}>
            <Link className="block rounded-lg border border-line bg-card p-3" to={`/projekte/${project.id}/system/komponenten/${component.id}`}>
              {component.name}
              <span className="mt-1 block text-sm text-muted">{component.placementCount} Platzierungen</span>
            </Link>
          </li>
        ))}
      </ul>
      <Modal open={open} onOpenChange={setOpen} title="Neue Komponente">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Name"><Input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Art">
            <select className="h-10 rounded-md border border-line bg-card px-3" value={kind} onChange={(event) => setKind(event.target.value as Component['kind'])}>
              <option value="Client">Client</option>
              <option value="Api">API</option>
              <option value="Service">Service</option>
              <option value="Database">Datenbank</option>
              <option value="Queue">Queue</option>
              <option value="External">Externes System</option>
            </select>
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
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_20rem] md:p-6">
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        <h1 className="text-2xl font-semibold">Komponente</h1>
        <Field label="Name"><Input value={draft.name} disabled={!canWrite} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <Field label="Beschreibung"><Textarea value={draft.description} disabled={!canWrite} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
        <Field label="Technologie"><Input value={draft.technology ?? ''} disabled={!canWrite} onChange={(event) => setDraft({ ...draft, technology: event.target.value })} /></Field>
        <p className="text-sm text-muted">{draft.placementCount} Platzierungen. Eine Umbenennung gilt für alle Diagramme. Das Entfernen einer Platzierung löscht die Komponente nicht.</p>
        <section className="grid gap-2">
          <h2 className="font-semibold">Auswirkung auf Abläufe</h2>
          {effects.isLoading ? <p className="text-sm text-muted">Wird geladen …</p> : null}
          {effects.data?.length === 0 ? <p className="text-sm text-muted">Kein Prozessschritt verwendet diese Komponente.</p> : null}
          <ul className="grid gap-2">
            {effects.data?.map((flow) => (
              <li key={flow.nodeId} className="rounded-md border border-line p-2 text-sm">
                <Link className="font-medium underline" to={`/projekte/${project.id}/diagramme/${flow.diagramId}?node=${flow.nodeId}`}>
                  {(flow.areaName ? `${flow.areaName} · ` : '') + `${flow.diagramName}: ${flow.nodeTitle}`}
                </Link>
                {flow.rationale ? <p className="text-muted">{flow.rationale}</p> : null}
              </li>
            ))}
          </ul>
        </section>
        {save.isError || remove.isError ? <p role="alert" className="text-sm text-danger">{errorText(save.error ?? remove.error)}</p> : null}
        {canWrite ? <div className="flex gap-2"><Button type="submit" variant="primary">Speichern</Button><Button type="button" variant="danger" onClick={() => remove.mutate()}>Komponente löschen</Button></div> : null}
      </form>
      <aside className="rounded-xl border border-line bg-card p-4">
        <LinkPanel projectId={project.id} artifactId={componentId} mode="component" canWrite={canWrite} />
        <UsagePanel projectId={project.id} artifactId={componentId} title={draft.name} />
      </aside>
    </div>
  )
}
