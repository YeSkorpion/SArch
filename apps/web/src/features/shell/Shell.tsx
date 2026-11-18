import { useQuery } from '@tanstack/react-query'
import {
  Boxes,
  ChevronDown,
  FileText,
  FolderTree,
  GitBranch,
  GitPullRequest,
  LayoutDashboard,
  ListChecks,
  Menu as MenuIcon,
  PanelsTopLeft,
  Search,
  Settings,
} from 'lucide-react'
import { useDeferredValue, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { Brand } from '../../components/Brand'
import { Button, Hint, Menu, MenuItem, Select } from '../../components/ui'
import { ErrorState, Loading } from '../../components/states'
import { api } from '../../lib/api'
import { artifactHref, roleLabel, searchHitMeta, searchTypeLabel } from '../../lib/labels'
import { readFlag, rememberFlag } from '../../lib/scroll'
import type { Area, Diagram, Project, SavedView, SearchHit, User } from '../../lib/types'
import { CommandPalette } from './CommandPalette'

const nav = [
  ['Übersicht', '', LayoutDashboard],
  ['Bereiche', 'bereiche', FolderTree],
  ['Anforderungen', 'anforderungen', ListChecks],
  ['Prozesse', 'prozesse', GitBranch],
  ['UI-Planung', 'ui', PanelsTopLeft],
  ['Systemarchitektur', 'system', Boxes],
  ['Dokumentation', 'dokumente', FileText],
  ['Änderungen', 'aenderungen', GitPullRequest],
  ['Einstellungen', 'einstellungen', Settings],
] as const

export type ProjectOutlet = { project: Project; canWrite: boolean; canManage: boolean; user: User }

export function Shell({ user }: { user: User }) {
  const { projectId } = useParams()
  const [navOpen, setNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteReturn = useRef<HTMLElement | null>(null)
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/api/v1/projects') })
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/api/v1/projects/${projectId}`),
    enabled: Boolean(projectId),
  })
  const navigate = useNavigate()
  const location = useLocation()
  const diagramId = location.pathname.match(/\/diagramme\/([^/?]+)/)?.[1]
  const diagram = useQuery({
    queryKey: ['diagram', projectId, diagramId],
    queryFn: () => api<Diagram>(`/api/v1/projects/${projectId}/diagrams/${diagramId}`),
    enabled: Boolean(projectId && diagramId),
  })

  if (!projectId) return null
  if (project.isLoading) return <Loading />
  if (project.isError || !project.data) return <div className="p-6"><ErrorState error={project.error} onRetry={() => void project.refetch()} /></div>

  const current = project.data
  const canWrite = !current.isArchived && (current.role === 'Owner' || current.role === 'Editor')
  const canManage = !current.isArchived && current.role === 'Owner'
  const crumbs = breadcrumb(location.pathname, current.name, diagram.data)

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2" href="#inhalt">
        Zum Inhalt
      </a>
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-nav lg:flex">
        <div className="px-3 pt-4">
          <Brand to="/projekte" />
        </div>
        <ProjectSwitch projects={projects.data ?? [current]} current={current} onChange={(id) => void navigate(`/projekte/${id}`)} />
        <Menu trigger={<button className="mx-3 mb-2 truncate text-left text-xs text-muted" type="button">{roleLabel(current.role)}</button>}>
          <MenuItem onSelect={() => void navigate(`/projekte/${current.id}/einstellungen`)}>Projekteinstellungen</MenuItem>
        </Menu>
        <ProjectNav projectId={current.id} pathname={location.pathname} />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-nav px-3">
          <span className="inline-flex shrink-0 lg:hidden">
            <Brand mark to="/projekte" />
          </span>
          <Hint label="Navigation">
            <Button className="lg:hidden" size="sm" type="button" aria-label="Navigation öffnen" onClick={() => setNavOpen(true)}>
              <MenuIcon size={16} />
              <span>Menü</span>
            </Button>
          </Hint>
          <div className="lg:hidden">
            <ProjectSwitch projects={projects.data ?? [current]} current={current} onChange={(id) => void navigate(`/projekte/${id}`)} compact />
          </div>
          <nav aria-label="Brotkrumen" className="hidden min-w-0 flex-1 truncate text-sm text-muted md:block">
            {crumbs.map((crumb, index) => (
              <span key={crumb.href}>
                {index > 0 ? ' / ' : ''}
                <Link className="underline-offset-2 hover:underline" to={crumb.href}>{crumb.label}</Link>
              </span>
            ))}
          </nav>
          <SearchBox projectId={current.id} onOpenPalette={(opener) => { paletteReturn.current = opener; setPaletteOpen(true) }} />
          <Button
            size="sm"
            type="button"
            onClick={() => {
              const dark = document.documentElement.classList.toggle('dark')
              localStorage.setItem('studio-theme', dark ? 'dark' : 'light')
            }}
          >
            Darstellung
          </Button>
          <Menu trigger={<button className="hidden max-w-32 truncate text-sm text-muted xl:inline" type="button">{user.displayName}</button>}>
            <p className="px-2 py-1 text-xs text-muted">Rolle: {roleLabel(current.role)}</p>
          </Menu>
        </header>
        {current.isArchived ? <p className="bg-warning/15 px-4 py-2 text-sm">Dieses Projekt ist archiviert und kann nur gelesen werden.</p> : null}
        {navOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button className="studio-overlay absolute inset-0 bg-black/40" type="button" aria-label="Navigation schließen" onClick={() => setNavOpen(false)} />
            <aside className="studio-drawer absolute inset-y-0 left-0 flex w-72 flex-col bg-nav p-3 shadow-overlay">
              <div className="px-2 pb-3 pt-1" onClick={() => setNavOpen(false)}>
                <Brand to="/projekte" />
              </div>
              <Menu trigger={<button className="px-2 pb-2 text-left text-xs text-muted" type="button">{roleLabel(current.role)}</button>}>
                <MenuItem onSelect={() => { setNavOpen(false); void navigate(`/projekte/${current.id}/einstellungen`) }}>Projekteinstellungen</MenuItem>
              </Menu>
              <ProjectNav projectId={current.id} pathname={location.pathname} onNavigate={() => setNavOpen(false)} />
            </aside>
          </div>
        ) : null}
        <main id="inhalt" className="min-w-0 overflow-x-clip">
          <Outlet context={{ project: current, canWrite, canManage, user } satisfies ProjectOutlet} />
        </main>
      </div>
      <CommandPalette projectId={current.id} projectName={current.name} open={paletteOpen} onOpenChange={setPaletteOpen} returnFocus={paletteReturn} />
    </div>
  )
}

function ProjectSwitch({ projects, current, onChange, compact = false }: { projects: Project[]; current: Project; onChange: (id: string) => void; compact?: boolean }) {
  return (
    <div className={compact ? '' : 'border-b border-line p-3'}>
      <Select className={compact ? 'max-w-36' : 'w-full'} title={current.name} aria-label="Projektwechsel" value={current.id} onChange={(event) => onChange(event.target.value)}>
        {projects.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.isArchived ? ' (archiviert)' : ''}
          </option>
        ))}
      </Select>
    </div>
  )
}

function ProjectNav({ projectId, pathname, onNavigate }: { projectId: string; pathname: string; onNavigate?: () => void }) {
  const areas = useQuery({ queryKey: ['areas', projectId], queryFn: () => api<Area[]>(`/api/v1/projects/${projectId}/areas`) })
  const views = useQuery({ queryKey: ['views', projectId, 'nav'], queryFn: () => api<SavedView[]>(`/api/v1/projects/${projectId}/views`) })
  const diagramId = pathname.match(/\/diagramme\/([^/]+)/)?.[1]
  const diagram = useQuery({
    queryKey: ['diagram', projectId, diagramId],
    queryFn: () => api<Diagram>(`/api/v1/projects/${projectId}/diagrams/${diagramId}`),
    enabled: Boolean(diagramId),
  })
  return (
    <nav className="grid min-h-0 flex-1 content-start gap-1 overflow-auto px-3 pb-3" aria-label="Projekt">
      <p className="px-2 pb-1 text-xs font-medium text-muted">Module</p>
      {nav.map(([label, segment, Icon]) => (
        <NavLink
          key={label}
          to={segment ? `/projekte/${projectId}/${segment}` : `/projekte/${projectId}`}
          end={segment === ''}
          onClick={onNavigate}
          className={({ isActive }) => `flex items-center gap-2 rounded-md px-2 py-2 text-sm ${isActive || moduleActive(segment, pathname, diagram.data?.kind) ? 'bg-accent/12 font-semibold text-accent' : 'hover:bg-background'}`}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="min-w-0 break-words">{label}</span>
        </NavLink>
      ))}
      <NavFold id="areas" label="Fachbereiche">
        {areas.data?.length ? areas.data.map((area) => (
          <Link key={area.id} className="block rounded-md px-2 py-1.5 text-sm break-words hover:bg-background" to={`/projekte/${projectId}/prozesse?bereich=${area.id}`} onClick={onNavigate}>
            {area.name}
          </Link>
        )) : <p className="px-2 py-1 text-xs text-muted">Noch keine Bereiche.</p>}
      </NavFold>
      <NavFold id="views" label="Gespeicherte Ansichten">
        {views.data?.length ? views.data.map((view) => (
          <Link key={view.id} className="block rounded-md px-2 py-1.5 text-sm break-words hover:bg-background" to={viewHref(projectId, view)} onClick={onNavigate}>
            {view.name}
          </Link>
        )) : <p className="px-2 py-1 text-xs text-muted">Noch keine Ansichten.</p>}
      </NavFold>
      <Link className="mt-4 px-2 text-sm text-muted underline-offset-2 hover:underline" to="/projekte" onClick={onNavigate}>
        Alle Projekte
      </Link>
    </nav>
  )
}

function NavFold({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => readFlag(`studio-nav-${id}`, false))
  return (
    <div className="mt-3">
      <button
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted hover:bg-background"
        type="button"
        aria-expanded={open}
        onClick={() => {
          const next = !open
          setOpen(next)
          rememberFlag(`studio-nav-${id}`, next)
        }}
      >
        {label}
        <ChevronDown size={14} className={open ? 'rotate-180' : ''} aria-hidden="true" />
      </button>
      {open ? <div className="mt-1 grid gap-0.5 pl-2">{children}</div> : null}
    </div>
  )
}

function SearchBox({ projectId, onOpenPalette }: { projectId: string; onOpenPalette: (opener: HTMLElement) => void }) {
  const [term, setTerm] = useState('')
  const deferred = useDeferredValue(term.trim())
  const navigate = useNavigate()
  const results = useQuery({
    queryKey: ['search', projectId, deferred],
    queryFn: () => api<SearchHit[]>(`/api/v1/projects/${projectId}/search?q=${encodeURIComponent(deferred)}`),
    enabled: deferred.length > 0,
  })
  const groups = new Map<string, SearchHit[]>()
  for (const hit of results.data ?? []) groups.set(hit.type, [...(groups.get(hit.type) ?? []), hit])
  return (
    <div className="relative w-40 sm:w-64">
      <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" size={14} aria-hidden="true" />
      <input
        className="h-9 w-full rounded-md border border-line bg-background pr-16 pl-8 text-sm"
        value={term}
        placeholder="Suchen"
        aria-label="Projektsuche"
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault()
            onOpenPalette(event.currentTarget)
          }
        }}
      />
      <button className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-muted" type="button" aria-label="Schnellsuche öffnen" onClick={(event) => onOpenPalette(event.currentTarget)}>
        Strg+K
      </button>
      {deferred ? (
        <div className="studio-menu absolute right-0 z-20 mt-1 max-h-80 w-[min(24rem,80vw)] overflow-auto rounded-md border border-line bg-card p-1 shadow-overlay">
          {results.isLoading ? <p className="px-2 py-1 text-sm text-muted">Wird gesucht …</p> : null}
          {results.data?.length === 0 ? <p className="px-2 py-1 text-sm text-muted">Keine Treffer in diesem Projekt.</p> : null}
          {[...groups.entries()].map(([type, hits]) => (
            <section key={type}>
              <h2 className="px-2 pt-2 text-xs text-muted">{searchTypeLabel(type)}</h2>
              <ul>
                {hits.map((hit) => (
                  <li key={`${hit.type}-${hit.id}`}>
                    <button
                      className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-background"
                      type="button"
                      onClick={() => {
                        setTerm('')
                        void navigate(artifactHref(projectId, hit.type, hit.id, hit.diagramId))
                      }}
                    >
                      <span className="block truncate font-medium">{hit.title}</span>
                      <span className="block truncate text-muted">{searchHitMeta(hit.type, hit.subtitle)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function moduleActive(segment: string, pathname: string, kind?: Diagram['kind']) {
  if (segment === 'prozesse' && kind === 'Process') return true
  if (segment === 'system' && (kind === 'System' || pathname.includes('/system/'))) return true
  return false
}

function viewHref(projectId: string, view: SavedView) {
  const params = new URLSearchParams()
  if (view.unassigned) params.set('bereich', 'none')
  else if (view.areaId) params.set('bereich', view.areaId)
  if (view.query) params.set('q', view.query)
  const base = view.scope === 'system' ? 'system' : 'prozesse'
  const query = params.toString()
  return `/projekte/${projectId}/${base}${query ? `?${query}` : ''}`
}

function breadcrumb(pathname: string, projectName: string, diagram?: Diagram) {
  const parts = pathname.split('/').filter(Boolean)
  const crumbs = [{ href: `/projekte/${parts[1]}`, label: projectName }]
  const section = parts[2]
  const labels: Record<string, string> = {
    bereiche: 'Bereiche',
    anforderungen: 'Anforderungen',
    prozesse: 'Prozesse',
    ui: 'UI-Planung',
    system: 'Systemarchitektur',
    komponenten: 'Komponenten',
    dokumente: 'Dokumentation',
    aenderungen: 'Änderungen',
    staende: 'Projektstände',
    einstellungen: 'Einstellungen',
  }
  if (section === 'diagramme') {
    const moduleLabel = diagram?.kind === 'System' ? 'Systemarchitektur' : 'Prozesse'
    const moduleHref = diagram?.kind === 'System' ? 'system' : 'prozesse'
    crumbs.push({ href: `/projekte/${parts[1]}/${moduleHref}`, label: moduleLabel })
    crumbs.push({ href: pathname, label: diagram?.name ?? 'Diagramm' })
  } else if (section && labels[section]) {
    crumbs.push({ href: `/projekte/${parts[1]}/${section}`, label: labels[section] })
  }
  if (section === 'system' && parts[3] === 'komponenten') {
    crumbs.push({ href: `/projekte/${parts[1]}/system/komponenten`, label: 'Komponenten' })
  }
  return crumbs
}
