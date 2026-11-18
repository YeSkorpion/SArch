import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { PanelsTopLeft } from 'lucide-react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router'
import { LeaveGuard } from '../../components/LeaveGuard'
import { ConflictBanner, EmptyState, ErrorState, Loading, SaveBadge } from '../../components/states'
import { WireframeThumb } from '../../components/previews'
import { Button, Field, Input, Modal, Select, Textarea } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { useAutosave } from '../../lib/autosave'
import { elementDefaults, elementLabel, parseWireframe, serializeWireframe, wireframeGroups, type WireElement, type Wireframe, type WireframeType } from '../../lib/wireframe'
import type { Screen, ScreenStatus } from '../../lib/types'
import { LinkPanel } from '../links/LinkPanel'
import { SourcesPanel } from '../plan/SourcesPanel'
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
  const listView = params.get('darstellung') === 'liste'
  function setView(next: 'karten' | 'liste') {
    const value = new URLSearchParams(params)
    if (next === 'liste') value.set('darstellung', 'liste')
    else value.delete('darstellung')
    setParams(value, { replace: true })
  }
  return (
    <div className="grid w-full gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">UI-Planung</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Screens mit Route und, wenn vorhanden, dem gespeicherten Wireframe.</p>
        </div>
        {canWrite && hasScreens ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Screen anlegen</Button> : null}
      </header>
      {hasScreens ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-sm" aria-label="Screens suchen" placeholder="Name oder Route" value={term} onChange={(event) => {
            const next = new URLSearchParams(params)
            if (event.target.value) next.set('q', event.target.value)
            else next.delete('q')
            setParams(next, { replace: true })
          }} />
          <div className="flex gap-1 rounded-lg bg-nav p-1">
            <button className={`rounded-md px-2 py-1 text-sm ${listView ? '' : 'bg-card font-medium text-accent'}`} type="button" aria-pressed={!listView} onClick={() => setView('karten')}>Karten</button>
            <button className={`rounded-md px-2 py-1 text-sm ${listView ? 'bg-card font-medium text-accent' : ''}`} type="button" aria-pressed={listView} onClick={() => setView('liste')}>Liste</button>
          </div>
        </div>
      ) : null}
      {screens.isLoading ? <Loading /> : null}
      {screens.isError ? <ErrorState error={screens.error} onRetry={() => void screens.refetch()} /> : null}
      {screens.data?.length === 0 ? <EmptyState title="Keine Screens" body="Plane Routen und Wireframes, bevor die Oberfläche gebaut wird." action={canWrite ? <Button type="button" variant="primary" onClick={() => setOpen(true)}>Screen anlegen</Button> : undefined} /> : null}
      {hasScreens && visible.length === 0 ? <EmptyState title="Keine Treffer" body="Kein Screen enthält diesen Namen oder diese Route." action={<Button type="button" onClick={() => setParams({}, { replace: true })}>Suche zurücksetzen</Button>} /> : null}
      {listView ? (
        <ul className="divide-y divide-line">
          {visible.map((screen) => (
            <li key={screen.id}>
              <Link className="flex items-center gap-3 py-2.5 hover:text-accent" to={`/projekte/${project.id}/ui/${screen.id}`}>
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
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((screen) => (
            <li key={screen.id} className="rounded-xl border border-line bg-card">
              <Link className="block rounded-xl hover:bg-background" to={`/projekte/${project.id}/ui/${screen.id}`}>
                <div className="p-2 pb-0"><WireframeThumb json={screen.wireframeJson} /></div>
                <span className="block truncate px-3 pt-2 font-medium">{screen.name}</span>
                <span className="block truncate px-3 font-mono text-xs text-muted">{screen.route}</span>
                <span className="block truncate px-3 pb-3 text-xs text-muted">{screen.purpose || screen.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
  const [screenOpen, setScreenOpen] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  useEffect(() => { setScreenOpen(selected === null) }, [selected])
  useEffect(() => {
    if (dirty || initial.version <= version) return
    setMeta({ name: initial.name, route: initial.route, purpose: initial.purpose, status: initial.status, notes: initial.notes })
    setWireframe(parseWireframe(initial.wireframeJson))
    setVersion(initial.version)
  }, [dirty, initial, version])
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
    const preset = elementDefaults(type)
    const frameWidth = frame === 'desktop' ? 960 : 390
    const frameHeight = frame === 'desktop' ? 640 : 780
    const bottom = elements.reduce((max, item) => Math.max(max, item.y + item.height), 8)
    const element: WireElement = {
      id: crypto.randomUUID(),
      type,
      x: type === 'nav' ? 0 : 16,
      y: type === 'nav' ? 0 : Math.min(bottom + 12, Math.max(8, frameHeight - preset.height - 8)),
      width: type === 'nav' ? frameWidth : Math.min(preset.width, frameWidth - 32),
      height: preset.height,
      text: preset.text,
      targetScreenId: null,
    }
    updateElements([...elements, element])
    setSelected(element.id)
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[32rem] flex-col">
      <LeaveGuard when={dirty || autosave.state === 'conflict'} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{meta.name}</h1>
        <SaveBadge state={autosave.state} />
        <Button size="sm" type="button" onClick={() => { setPreview((value) => !value); setPreviewScreen(initial) }}>{preview ? 'Zurück zum Entwurf' : 'Vorschau'}</Button>
        <Button size="sm" className="lg:hidden" type="button" onClick={() => setInspectorOpen(true)}>Inspektor</Button>
      </div>
      {autosave.state === 'conflict' ? (
        <ConflictBanner onReload={() => { setDirty(false); autosave.clearConflict(); void reload() }} onKeep={() => autosave.retry()} />
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        {!preview ? (
          <aside aria-label="Elemente" className="studio-scroll hidden w-52 shrink-0 border-r border-line bg-nav p-2 lg:block">
            {wireframeGroups.map((group) => (
              <div key={group.title} className="mb-3">
                <h2 className="px-1 pb-1 text-xs font-semibold text-muted">{group.title}</h2>
                <div className="grid gap-1">
                  {group.types.map((type) => (
                    <Button key={type} size="sm" className="justify-start" type="button" disabled={!canWrite} onClick={() => add(type)}>{elementLabel(type)}</Button>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        ) : null}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-background p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{preview ? 'Vorschau' : 'Entwurf'}</span>
            <Button size="sm" type="button" aria-pressed={frame === 'desktop'} variant={frame === 'desktop' ? 'primary' : 'secondary'} onClick={() => setFrame('desktop')}>Desktop</Button>
            <Button size="sm" type="button" aria-pressed={frame === 'mobile'} variant={frame === 'mobile' ? 'primary' : 'secondary'} onClick={() => setFrame('mobile')}>Mobil</Button>
          </div>
          <div className="relative mx-auto overflow-hidden border border-line bg-card shadow-sm" style={{ width: frame === 'desktop' ? 960 : 390, height: frame === 'desktop' ? 640 : 780, backgroundImage: 'radial-gradient(var(--grid) 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
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
          <aside aria-label="Eigenschaften" className="absolute inset-y-0 right-0 z-20 flex w-[min(22rem,100%)] flex-col border-l border-line bg-card shadow-overlay lg:static lg:w-72 lg:shadow-none">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2 lg:hidden">
              <h2 className="text-sm font-semibold">Eigenschaften</h2>
              <Button size="sm" type="button" onClick={() => setInspectorOpen(false)}>Schließen</Button>
            </div>
            <div className="studio-scroll min-h-0 flex-1">
              <section className="grid gap-3 p-3">
                {current ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold">Element · {elementLabel(current.type)}</h2>
                      {canWrite ? <Button size="sm" type="button" variant="ghost" onClick={() => { setSelected(null); updateElements(elements.filter((item) => item.id !== current.id)) }}>Element entfernen</Button> : null}
                    </div>
                    <Field label="Text" hint={textHint(current.type)}>
                      {current.type === 'list' || current.type === 'textarea' ? (
                        <Textarea className="min-h-16" rows={3} value={current.text} disabled={!canWrite} onChange={(event) => updateElements(elements.map((item) => item.id === current.id ? { ...item, text: event.target.value } : item))} />
                      ) : (
                        <Input className="h-9" value={current.text} disabled={!canWrite} onChange={(event) => updateElements(elements.map((item) => item.id === current.id ? { ...item, text: event.target.value } : item))} />
                      )}
                    </Field>
                    <div className="grid grid-cols-4 gap-1.5">
                      {([['x', 'X'], ['y', 'Y'], ['width', 'Breite'], ['height', 'Höhe']] as const).map(([key, label]) => (
                        <Field key={key} label={label}>
                          <Input className="h-8 px-2" type="number" value={current[key]} disabled={!canWrite} onChange={(event) => updateElements(elements.map((item) => item.id === current.id ? { ...item, [key]: Number(event.target.value) } : item))} />
                        </Field>
                      ))}
                    </div>
                    {current.type === 'button' || current.type === 'link' ? (
                      <Field label="Geplante Navigation">
                        <Select value={current.targetScreenId ?? ''} disabled={!canWrite} onChange={(event) => updateElements(elements.map((item) => item.id === current.id ? { ...item, targetScreenId: event.target.value || null } : item))}>
                          <option value="">Kein Ziel</option>
                          {screens.data?.filter((screen) => screen.id !== initial.id).map((screen) => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
                        </Select>
                      </Field>
                    ) : null}
                  </>
                ) : <p className="text-sm text-muted">Wähle ein Element auf der Fläche. Die Screen-Angaben liegen darunter.</p>}
              </section>
              <details className="border-t border-line" open={screenOpen} onToggle={(event) => setScreenOpen(event.currentTarget.open)}>
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Screen · {meta.name}</summary>
                <div className="grid gap-3 px-3 pb-3">
                  <Field label="Name"><Input className="h-9" value={meta.name} disabled={!canWrite} onChange={(event) => { setMeta({ ...meta, name: event.target.value }); setDirty(true) }} /></Field>
                  <Field label="Route"><Input className="h-9 font-mono" value={meta.route} disabled={!canWrite} onChange={(event) => { setMeta({ ...meta, route: event.target.value }); setDirty(true) }} /></Field>
                  <Field label="Ziel"><Textarea className="min-h-12" rows={2} value={meta.purpose} disabled={!canWrite} onChange={(event) => { setMeta({ ...meta, purpose: event.target.value }); setDirty(true) }} /></Field>
                  <Field label="Status">
                    <Select value={meta.status} disabled={!canWrite} onChange={(event) => { setMeta({ ...meta, status: event.target.value as ScreenStatus }); setDirty(true) }}>
                      {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </Select>
                  </Field>
                  <Field label="Notizen"><Textarea className="min-h-12" rows={2} value={meta.notes} disabled={!canWrite} onChange={(event) => { setMeta({ ...meta, notes: event.target.value }); setDirty(true) }} /></Field>
                </div>
              </details>
              <details className="border-t border-line">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Quellen und Aktualität</summary>
                <div className="px-3 pb-3">
                  <SourcesPanel projectId={projectId} artifactId={initial.id} canWrite={canWrite} />
                </div>
              </details>
              <details className="border-t border-line" open={moreOpen} onToggle={(event) => setMoreOpen(event.currentTarget.open)}>
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Verknüpfungen</summary>
                <div className="grid gap-4 px-3 pb-3">
                  <LinkPanel projectId={projectId} artifactId={initial.id} mode="screen" canWrite={canWrite} />
                  <UsagePanel projectId={projectId} artifactId={initial.id} title={initial.name} />
                  {canWrite ? <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)}>Screen löschen</Button> : null}
                </div>
              </details>
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
      if (mode === 'move') onChange({ ...origin, x: snap(origin.x + dx), y: snap(origin.y + dy) })
      else onChange({ ...origin, width: Math.max(16, snap(origin.width + dx)), height: Math.max(12, snap(origin.height + dy)) })
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const navigates = (element.type === 'button' || element.type === 'link') && preview && element.targetScreenId
  const body = navigates
    ? <button className={`h-full w-full ${element.type === 'link' ? 'text-left text-sm text-accent underline' : 'rounded-md bg-accent text-sm font-medium text-accent-foreground'}`} type="button" onClick={() => onNavigate(element.targetScreenId!)}>{element.text || elementLabel(element.type)}</button>
    : <WireFace element={element} />

  return (
    <div
      className={`absolute ${selected ? 'ring-2 ring-accent' : ''} ${chromeClass(element.type)}`}
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
      onPointerDown={(event) => { onSelect(); drag(event, 'move') }}
    >
      {body}
      {!preview ? <button className="absolute bottom-0 right-0 z-10 h-3 w-3 bg-accent" type="button" aria-label="Größe ändern" onPointerDown={(event) => drag(event, 'resize')} /> : null}
    </div>
  )
}

function snap(value: number) {
  return Math.round(value / 8) * 8
}

function textHint(type: WireframeType) {
  if (type === 'tabs' || type === 'table') return 'Einträge mit | trennen.'
  if (type === 'list') return 'Eine Zeile pro Punkt.'
  return undefined
}

function chromeClass(type: WireframeType) {
  if (type === 'card' || type === 'container' || type === 'nav' || type === 'table' || type === 'list') return 'overflow-hidden rounded-md border border-line bg-card'
  if (type === 'image') return 'overflow-hidden rounded-md border border-dashed border-line bg-nav'
  return 'overflow-hidden'
}

export function WireFace({ element }: { element: WireElement }) {
  const label = element.text || elementLabel(element.type)
  if (element.type === 'heading') return <div className="flex h-full items-center px-2 text-lg font-semibold">{label}</div>
  if (element.type === 'text') return <div className="h-full overflow-hidden px-2 py-1 text-sm text-muted">{label}</div>
  if (element.type === 'button') return <div className="flex h-full items-center justify-center rounded-md bg-accent px-2 text-sm font-medium text-accent-foreground">{label}</div>
  if (element.type === 'link') return <div className="flex h-full items-center px-1 text-sm text-accent underline">{label}</div>
  if (element.type === 'input' || element.type === 'search' || element.type === 'select') {
    return (
      <div className="flex h-full items-center justify-between gap-2 rounded-md border border-line bg-background px-2 text-sm text-muted">
        <span className="truncate">{element.type === 'search' ? `⌕ ${label}` : label}</span>
        {element.type === 'select' ? <span aria-hidden="true">▾</span> : null}
      </div>
    )
  }
  if (element.type === 'textarea') return <div className="h-full overflow-hidden rounded-md border border-line bg-background px-2 py-1 text-sm text-muted">{label}</div>
  if (element.type === 'checkbox' || element.type === 'switch') {
    return (
      <div className="flex h-full items-center gap-2 px-1 text-sm">
        <span className={element.type === 'switch' ? 'h-4 w-7 rounded-full bg-accent' : 'h-3.5 w-3.5 rounded-sm border border-line bg-accent'} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
    )
  }
  if (element.type === 'image') return <div className="grid h-full place-items-center text-xs text-muted">{label}</div>
  if (element.type === 'avatar') return <div className="grid h-full w-full place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{label.slice(0, 2)}</div>
  if (element.type === 'badge') return <div className="flex h-full items-center justify-center rounded-full bg-accent/15 px-2 text-xs font-medium text-accent">{label}</div>
  if (element.type === 'divider') return <div className="flex h-full items-center"><div className="h-px w-full bg-line" /></div>
  if (element.type === 'nav') return <div className="flex h-full items-center px-3 text-sm font-semibold">{label}</div>
  if (element.type === 'tabs') {
    const tabs = label.split('|').map((item) => item.trim()).filter(Boolean)
    return (
      <div className="flex h-full items-end gap-1 border-b border-line px-1">
        {tabs.map((tab, index) => <span key={`${tab}-${index}`} className={`px-2 py-1 text-xs ${index === 0 ? 'border-b-2 border-accent font-medium text-accent' : 'text-muted'}`}>{tab}</span>)}
      </div>
    )
  }
  if (element.type === 'table') {
    const columns = label.split('|').map((item) => item.trim()).filter(Boolean)
    return (
      <div className="grid h-full grid-rows-[auto_1fr_1fr] overflow-hidden text-xs">
        <div className="grid border-b border-line bg-nav" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}>
          {columns.map((column) => <span key={column} className="truncate px-2 py-1 font-medium">{column}</span>)}
        </div>
        <div className="grid border-b border-line" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}>
          {columns.map((column) => <span key={`${column}-a`} className="truncate px-2 py-1 text-muted">–</span>)}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}>
          {columns.map((column) => <span key={`${column}-b`} className="truncate px-2 py-1 text-muted">–</span>)}
        </div>
      </div>
    )
  }
  if (element.type === 'list') {
    const rows = label.split('\n').map((item) => item.trim()).filter(Boolean)
    return (
      <ul className="grid h-full content-start gap-1 overflow-hidden px-2 py-1 text-sm">
        {rows.map((row, index) => <li key={`${row}-${index}`} className="truncate">• {row}</li>)}
      </ul>
    )
  }
  return <div className="h-full overflow-hidden px-2 py-1 text-sm">{label}</div>
}
