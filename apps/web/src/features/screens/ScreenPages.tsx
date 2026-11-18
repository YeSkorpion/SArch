import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { PanelsTopLeft } from 'lucide-react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router'
import { LeaveGuard } from '../../components/LeaveGuard'
import { EmptyState, ErrorState, Loading, SaveBadge } from '../../components/states'
import { Button, Field, Input, Modal, Select, Textarea } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { useAutosave } from '../../lib/autosave'
import { elementLabel, parseWireframe, serializeWireframe, type WireElement, type Wireframe, type WireframeType } from '../../lib/wireframe'
import type { Screen, ScreenStatus } from '../../lib/types'
import { LinkPanel } from '../links/LinkPanel'
import { UsagePanel } from '../usage/UsagePanel'
import { ImpactList } from '../requirements/RequirementsPages'
import type { ProjectOutlet } from '../shell/Shell'
import type { Impact } from '../../lib/types'

const statuses: ScreenStatus[] = ['Entwurf', 'Review', 'Abgestimmt']

export function ScreensPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const screens = useQuery({ queryKey: ['screens', project.id], queryFn: () => api<Screen[]>(`/api/v1/projects/${project.id}/screens`) })
  const [params, setParams] = useSearchParams()
  const term = params.get('q') ?? ''
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [route, setRoute] = useState('/')
  const navigate = useNavigate()
  const client = useQueryClient()
  const create = useMutation({
    mutationFn: () => api<Screen>(`/api/v1/projects/${project.id}/screens`, { method: 'POST', body: { name, route, purpose: '' } }),
    onSuccess: async (screen) => {
      await client.invalidateQueries({ queryKey: ['screens', project.id] })
      await navigate(`/projekte/${project.id}/ui/${screen.id}`)
    },
  })
  const hasScreens = (screens.data?.length ?? 0) > 0
  const needle = term.trim().toLowerCase()
  const visible = (screens.data ?? []).filter((screen) => !needle || screen.name.toLowerCase().includes(needle) || screen.route.toLowerCase().includes(needle))
  return (
    <div className="grid w-full max-w-6xl gap-6 px-4 py-6 md:px-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">UI-Planung</h1>
          <p className="mt-1 text-sm text-muted">Suche über Name und Route aller sichtbaren Screens.</p>
        </div>
        {canWrite && hasScreens ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Screen anlegen</Button> : null}
      </header>
      {hasScreens ? (
        <Input aria-label="Screens suchen" placeholder="Name oder Route" value={term} onChange={(event) => {
          const next = new URLSearchParams(params)
          if (event.target.value) next.set('q', event.target.value)
          else next.delete('q')
          setParams(next, { replace: true })
        }} />
      ) : null}
      {screens.isLoading ? <Loading /> : null}
      {screens.isError ? <ErrorState error={screens.error} onRetry={() => void screens.refetch()} /> : null}
      {screens.data?.length === 0 ? <EmptyState title="Keine Screens" body="Plane Routen und Wireframes, bevor die Oberfläche gebaut wird." action={canWrite ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Screen anlegen</Button> : undefined} /> : null}
      {hasScreens && visible.length === 0 ? <EmptyState title="Keine Treffer" body="Kein Screen enthält diesen Namen oder diese Route." action={<Button type="button" onClick={() => setParams({}, { replace: true })}>Suche zurücksetzen</Button>} /> : null}
      <ul className="divide-y divide-line">
        {visible.map((screen) => (
          <li key={screen.id}>
            <Link className="flex items-center gap-3 py-2.5" to={`/projekte/${project.id}/ui/${screen.id}`}>
              <ScreenMark json={screen.wireframeJson} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{screen.name}</span>
                <span className="block truncate font-mono text-xs text-muted">{screen.route}</span>
                {screen.purpose ? <span className="block truncate text-xs text-muted">{screen.purpose}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Modal open={open} onOpenChange={setOpen} title="Neuer Screen">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Name"><Input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Route" hint="Beginnt mit /"><Input required value={route} onChange={(event) => setRoute(event.target.value)} /></Field>
          {create.isError ? <p className="text-sm text-danger">{errorText(create.error)}</p> : null}
          <Button type="submit" variant="primary">Anlegen</Button>
        </form>
      </Modal>
    </div>
  )
}

function ScreenMark({ json }: { json: string }) {
  let elements: WireElement[] = []
  try {
    elements = parseWireframe(json).desktop.elements
  } catch {
    elements = []
  }
  if (elements.length === 0) {
    return <span className="grid h-10 w-14 shrink-0 place-items-center rounded-md bg-nav text-muted"><PanelsTopLeft size={16} aria-hidden="true" /></span>
  }
  return (
    <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-nav" aria-hidden="true">
      {elements.slice(0, 6).map((element) => (
        <span
          key={element.id}
          className="absolute rounded-[1px] bg-accent/50"
          style={{ left: `${(element.x / 960) * 100}%`, top: `${(element.y / 640) * 100}%`, width: `${Math.max((element.width / 960) * 100, 8)}%`, height: `${Math.max((element.height / 640) * 100, 8)}%` }}
        />
      ))}
    </span>
  )
}

export function ScreenEditorPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const { screenId = '' } = useParams()
  const screen = useQuery({
    queryKey: ['screen', project.id, screenId],
    queryFn: () => api<Screen>(`/api/v1/projects/${project.id}/screens/${screenId}`),
  })
  if (screen.isLoading) return <Loading />
  if (screen.isError) return <div className="p-6"><ErrorState error={screen.error} onRetry={() => void screen.refetch()} /></div>
  return <ScreenEditor projectId={project.id} canWrite={canWrite} initial={screen.data!} reload={() => screen.refetch()} />
}

function ScreenEditor({ projectId, canWrite, initial, reload }: { projectId: string; canWrite: boolean; initial: Screen; reload: () => Promise<unknown> }) {
  const screens = useQuery({ queryKey: ['screens', projectId], queryFn: () => api<Screen[]>(`/api/v1/projects/${projectId}/screens`) })
  const [meta, setMeta] = useState({ name: initial.name, route: initial.route, purpose: initial.purpose, status: initial.status, notes: initial.notes })
  const [wireframe, setWireframe] = useState<Wireframe>(() => parseWireframe(initial.wireframeJson))
  const [frame, setFrame] = useState<'desktop' | 'mobile'>('desktop')
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [previewScreen, setPreviewScreen] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const [version, setVersion] = useState(initial.version)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  useEffect(() => {
    if (dirty) return
    setMeta({ name: initial.name, route: initial.route, purpose: initial.purpose, status: initial.status, notes: initial.notes })
    setWireframe(parseWireframe(initial.wireframeJson))
    setVersion(initial.version)
    // Nur anwenden, wenn der Serverstand neu geladen wurde. Ein abgeschlossenes Speichern darf den Entwurf nicht zurücksetzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])
  const autosave = useAutosave({
    enabled: canWrite && !preview,
    dirty,
    version,
    signature: JSON.stringify({ meta, wireframe }),
    save: async (currentVersion) => {
      const saved = await api<Screen>(`/api/v1/projects/${projectId}/screens/${initial.id}`, {
        method: 'PUT',
        body: { version: currentVersion, ...meta, wireframeJson: serializeWireframe(wireframe) },
      })
      setVersion(saved.version)
      setDirty(false)
      return saved.version
    },
  })
  const impact = useQuery({
    queryKey: ['impact', projectId, initial.id],
    queryFn: () => api<Impact>(`/api/v1/projects/${projectId}/artifacts/${initial.id}/impact`),
    enabled: deleteOpen,
  })
  const remove = useMutation({
    mutationFn: () => api(`/api/v1/projects/${projectId}/artifacts/${initial.id}`, { method: 'DELETE' }),
    onSuccess: () => { window.location.assign(`/projekte/${projectId}/ui`) },
  })
  const elements = frame === 'desktop' ? wireframe.desktop.elements : wireframe.mobile.elements
  const current = elements.find((item) => item.id === selected) ?? null
  const shown = preview ? parseWireframe(previewScreen.wireframeJson)[frame].elements : elements

  function updateElements(next: WireElement[]) {
    setWireframe((currentFrame) => frame === 'desktop'
      ? { ...currentFrame, desktop: { elements: next } }
      : { ...currentFrame, mobile: { elements: next } })
    setDirty(true)
  }

  function add(type: WireframeType) {
    const element: WireElement = { id: crypto.randomUUID(), type, x: 24, y: 24 + elements.length * 12, width: type === 'button' ? 140 : 180, height: type === 'input' ? 40 : 72, text: elementLabel(type), targetScreenId: null }
    updateElements([...elements, element])
    setSelected(element.id)
  }

  return (
    <div className="grid gap-3 p-3">
      <LeaveGuard when={dirty || autosave.state === 'conflict'} />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{meta.name}</h1>
        <SaveBadge state={autosave.state} />
        <Button size="sm" type="button" onClick={() => { setPreview((value) => !value); setPreviewScreen(initial) }}>{preview ? 'Zurück zum Entwurf' : 'Vorschau'}</Button>
        <Button size="sm" className="lg:hidden" type="button" onClick={() => setInspectorOpen(true)}>Inspektor</Button>
      </div>
      {autosave.state === 'conflict' ? (
        <div role="alert" className="rounded-md border border-warning p-3 text-sm">
          Der Entwurf wurde zwischenzeitlich gespeichert. Deine lokalen Änderungen bleiben erhalten.
          <Button className="ml-2" size="sm" type="button" onClick={() => { setDirty(false); autosave.clearConflict(); void reload() }}>Serverstand laden</Button>
        </div>
      ) : null}
      <div className="relative flex min-h-[36rem] gap-3">
        {!preview ? (
          <aside className="hidden w-44 shrink-0 lg:block">
            <div className="grid gap-2">
              {(['text', 'button', 'input', 'image', 'card', 'container'] as WireframeType[]).map((type) => (
                <Button key={type} size="sm" type="button" disabled={!canWrite} onClick={() => add(type)}>{elementLabel(type)}</Button>
              ))}
            </div>
          </aside>
        ) : null}
        <div className="min-w-0 flex-1 overflow-auto rounded-lg border border-line bg-background p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{preview ? 'Vorschau' : 'Entwurf'}</span>
            <Button size="sm" type="button" aria-pressed={frame === 'desktop'} variant={frame === 'desktop' ? 'primary' : 'secondary'} onClick={() => setFrame('desktop')}>Desktop</Button>
            <Button size="sm" type="button" aria-pressed={frame === 'mobile'} variant={frame === 'mobile' ? 'primary' : 'secondary'} onClick={() => setFrame('mobile')}>Mobil</Button>
          </div>
          <div className="relative mx-auto border border-line bg-card shadow-sm" style={{ width: frame === 'desktop' ? 960 : 390, height: frame === 'desktop' ? 640 : 780 }}>
            {shown.map((element) => (
              <WireBox
                key={element.id}
                element={element}
                selected={element.id === selected}
                preview={preview}
                onSelect={() => setSelected(element.id)}
                onChange={(next) => updateElements(shown.map((item) => item.id === next.id ? next : item))}
                onNavigate={(target) => {
                  const screen = screens.data?.find((item) => item.id === target)
                  if (screen) setPreviewScreen(screen)
                }}
              />
            ))}
          </div>
        </div>
        {inspectorOpen && !preview ? (
          <aside className="absolute right-0 top-0 z-20 h-full w-[min(22rem,100%)] overflow-auto border-l border-line bg-card p-4 lg:static lg:h-auto lg:w-80">
            <Button className="mb-3 lg:hidden" size="sm" type="button" onClick={() => setInspectorOpen(false)}>Schließen</Button>
            <div className="grid gap-3">
              <h2 className="text-sm font-semibold">Eigenschaften</h2>
              <Field label="Name"><Input value={meta.name} disabled={!canWrite} onChange={(event) => { setMeta({ ...meta, name: event.target.value }); setDirty(true) }} /></Field>
              <Field label="Route"><Input className="font-mono" value={meta.route} disabled={!canWrite} onChange={(event) => { setMeta({ ...meta, route: event.target.value }); setDirty(true) }} /></Field>
              <Field label="Ziel"><Textarea value={meta.purpose} disabled={!canWrite} onChange={(event) => { setMeta({ ...meta, purpose: event.target.value }); setDirty(true) }} /></Field>
              <Field label="Status">
                <Select value={meta.status} disabled={!canWrite} onChange={(event) => { setMeta({ ...meta, status: event.target.value as ScreenStatus }); setDirty(true) }}>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
              </Field>
              <Field label="Notizen"><Textarea value={meta.notes} disabled={!canWrite} onChange={(event) => { setMeta({ ...meta, notes: event.target.value }); setDirty(true) }} /></Field>
              {current ? (
                <>
                  <h2 className="border-t border-line pt-3 text-sm font-semibold">Element · {elementLabel(current.type)}</h2>
                  <Field label="Text"><Input value={current.text} disabled={!canWrite} onChange={(event) => updateElements(elements.map((item) => item.id === current.id ? { ...item, text: event.target.value } : item))} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    {([['x', 'X'], ['y', 'Y'], ['width', 'Breite'], ['height', 'Höhe']] as const).map(([key, label]) => (
                      <Field key={key} label={label}>
                        <Input type="number" value={current[key]} disabled={!canWrite} onChange={(event) => updateElements(elements.map((item) => item.id === current.id ? { ...item, [key]: Number(event.target.value) } : item))} />
                      </Field>
                    ))}
                  </div>
                  {canWrite ? <Button type="button" variant="danger" onClick={() => { setSelected(null); updateElements(elements.filter((item) => item.id !== current.id)) }}>Element entfernen</Button> : null}
                  {current.type === 'button' ? (
                    <Field label="Geplante Navigation">
                      <Select value={current.targetScreenId ?? ''} disabled={!canWrite} onChange={(event) => updateElements(elements.map((item) => item.id === current.id ? { ...item, targetScreenId: event.target.value || null } : item))}>
                        <option value="">Kein Ziel</option>
                        {screens.data?.filter((screen) => screen.id !== initial.id).map((screen) => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
                      </Select>
                    </Field>
                  ) : null}
                </>
              ) : <p className="text-sm text-muted">Wähle ein Element oder ändere die Screen-Eigenschaften.</p>}
              <LinkPanel projectId={projectId} artifactId={initial.id} mode="screen" canWrite={canWrite} />
              <UsagePanel projectId={projectId} artifactId={initial.id} title={initial.name} />
              {canWrite ? <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)}>Screen löschen</Button> : null}
            </div>
          </aside>
        ) : null}
      </div>
      <Modal open={deleteOpen} onOpenChange={setDeleteOpen} title="Screen löschen">
        {impact.data ? <ImpactList impact={impact.data} /> : <p>Auswirkungen werden geladen …</p>}
        {remove.isError ? <p className="text-sm text-danger">{errorText(remove.error)}</p> : null}
        <Button type="button" variant="danger" disabled={impact.data ? !impact.data.canDelete : true} onClick={() => remove.mutate()}>Endgültig löschen</Button>
      </Modal>
    </div>
  )
}

function WireBox({ element, selected, preview, onSelect, onChange, onNavigate }: { element: WireElement; selected: boolean; preview: boolean; onSelect: () => void; onChange: (element: WireElement) => void; onNavigate: (id: string) => void }) {
  function drag(event: ReactPointerEvent, mode: 'move' | 'resize') {
    if (preview) return
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const origin = { ...element }
    function move(next: PointerEvent) {
      const dx = next.clientX - startX
      const dy = next.clientY - startY
      if (mode === 'move') onChange({ ...origin, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) })
      else onChange({ ...origin, width: Math.max(8, Math.round(origin.width + dx)), height: Math.max(8, Math.round(origin.height + dy)) })
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const body = element.type === 'button' && preview && element.targetScreenId
    ? <button className="h-full w-full rounded bg-accent text-accent-foreground" type="button" onClick={() => onNavigate(element.targetScreenId!)}>{element.text || 'Button'}</button>
    : <div className="h-full w-full overflow-hidden p-1 text-xs">{element.text || elementLabel(element.type)}</div>

  return (
    <div
      className={`absolute border ${selected ? 'border-accent' : 'border-line'} ${element.type === 'container' || element.type === 'card' ? 'bg-background' : 'bg-card'}`}
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
      onPointerDown={(event) => { onSelect(); drag(event, 'move') }}
    >
      {body}
      {!preview ? <button className="absolute bottom-0 right-0 h-3 w-3 bg-accent" type="button" aria-label="Größe ändern" onPointerDown={(event) => drag(event, 'resize')} /> : null}
    </div>
  )
}
