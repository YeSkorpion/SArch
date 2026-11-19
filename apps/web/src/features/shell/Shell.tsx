import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes,
  Cable,
  ChevronDown,
  CircleHelp,
  CircleUser,
  FileText,
  FolderTree,
  GitBranch,
  GitPullRequest,
  LayoutDashboard,
  ListChecks,
  Menu as MenuIcon,
  Milestone,
  PanelsTopLeft,
  Plus,
  Search,
  Settings,
  X,
  Table2,
  Waypoints,
} from 'lucide-react'
import { forwardRef, useDeferredValue, useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { Brand } from '../../components/Brand'
import { Button, Hint, Input, Menu, MenuItem, Select } from '../../components/ui'
import { ErrorState, Loading } from '../../components/states'
import { childAreas, rootAreas } from '../../lib/areas'
import { api } from '../../lib/api'
import { presenceArtifact, useTogether } from '../../lib/together'
import { artifactHref, roleLabel, searchHitMeta, searchTypeLabel } from '../../lib/labels'
import { readFlag, rememberFlag } from '../../lib/scroll'
import type { Area, Diagram, Document, Project, SavedView, SearchHit, User } from '../../lib/types'
import { CommandPalette } from './CommandPalette'

const nav = [
  ['Übersicht', '', LayoutDashboard],
  ['Bereiche', 'bereiche', FolderTree],
  ['Anforderungen', 'anforderungen', ListChecks],
  ['Planungsabdeckung', 'abdeckung', Waypoints],
  ['Meine Arbeit', 'arbeit', CircleUser],
  ['Datenmodell', 'daten', Table2],
  ['Schnittstellen', 'schnittstellen', Cable],
  ['Lieferung', 'lieferung', Milestone],
  ['Offene Punkte', 'offen', CircleHelp],
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
  const client = useQueryClient()
  const logout = useMutation({
    mutationFn: () => api('/api/v1/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      client.setQueryData(['me'], null)
      await navigate('/anmelden')
    },
  })
  const location = useLocation()
  const diagramId = location.pathname.match(/\/diagramme\/([^/?]+)/)?.[1]
  const diagram = useQuery({
    queryKey: ['diagram', projectId, diagramId],
    queryFn: () => api<Diagram>(`/api/v1/projects/${projectId}/diagrams/${diagramId}`),
    enabled: Boolean(projectId && diagramId),
  })
  const areaId = location.pathname.match(/\/bereiche\/([^/]+)/)?.[1]
  const areas = useQuery({
    queryKey: ['areas', projectId],
    queryFn: () => api<Area[]>(`/api/v1/projects/${projectId}/areas`),
    enabled: Boolean(projectId && areaId),
  })
  const documentMatch = location.pathname.match(/\/dokumente\/([^/]+)/)?.[1]
  const documentId = documentMatch && /^[0-9a-f-]{36}$/i.test(documentMatch) ? documentMatch : undefined
  const page = useQuery({
    queryKey: ['document', projectId, documentId],
    queryFn: () => api<Document>(`/api/v1/projects/${projectId}/documents/${documentId}`),
    enabled: Boolean(projectId && documentId),
  })
  const href = `${location.pathname}${location.search}`
  const label = tabLabel(location.pathname, project.data?.name ?? 'Projekt', diagram.data, areas.data?.find((item) => item.id === areaId)?.name, page.data?.title)
  const artifactId = presenceArtifact(location.pathname)
  const people = useTogether(projectId, label, artifactId)
  const tabs = useWorkspaceTabs(projectId ?? '', href, label)
  const samePage = artifactId ? people.filter((person) => person.artifactId === artifactId) : []

  if (!projectId) return null
  if (project.isLoading) return <Loading />
  if (project.isError || !project.data) return <div className="p-6"><ErrorState error={project.error} onRetry={() => void project.refetch()} /></div>

  const current = project.data
  const canWrite = !current.isArchived && (current.role === 'Owner' || current.role === 'Editor')
  const canManage = !current.isArchived && current.role === 'Owner'

  return (
    <div
      className="h-dvh overflow-hidden lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]"
      onClick={(event) => openFromLink(event, tabs.openNew)}
      onAuxClick={(event) => openFromLink(event, tabs.openNew)}
      onMouseDown={(event) => { if (event.button === 1) openFromLink(event, tabs.openNew) }}
    >
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2" href="#inhalt">
        Zum Inhalt
      </a>
      <aside className="hidden h-dvh flex-col border-r border-line bg-nav lg:flex">
        <div className="px-3 pt-4">
          <Brand to="/projekte" />
        </div>
        <ProjectSwitch projects={projects.data ?? [current]} current={current} onChange={(id) => void navigate(`/projekte/${id}`)} />
        <ProjectNav projectId={current.id} pathname={location.pathname} />
      </aside>
      <div className="flex h-dvh min-w-0 flex-col">
        <header className="z-30 flex h-14 shrink-0 items-center gap-2 bg-nav px-3 shadow-[inset_0_-1px_0_0_var(--line)]">
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
          <WorkspaceTabs tabs={tabs.tabs} activeId={tabs.activeId} onSelect={tabs.select} onClose={tabs.close} onNew={() => tabs.openNew(`/projekte/${current.id}`)} />
          <SearchBox projectId={current.id} onOpenPalette={(opener) => { paletteReturn.current = opener; setPaletteOpen(true) }} />
          {people.length > 0 ? (
            <div className="flex items-center gap-1" aria-label="Weitere Personen">
              {people.map((person) => (
                <span key={person.userId} className="grid h-8 min-w-8 place-items-center rounded-full bg-card px-1.5 text-xs font-semibold ring-1 ring-line" title={`${person.name}, ${person.label}`} aria-label={`${person.name}, ${person.label}`}>
                  {accountInitials(person.name)}
                </span>
              ))}
            </div>
          ) : null}
          <ThemeButton />
          <Menu className="min-w-44 p-1" trigger={<PersonButton name={user.displayName} role={roleLabel(current.role)} />}>
            <p className="truncate px-2 py-0.5 text-xs text-muted">{user.email}</p>
            <MenuItem onSelect={() => logout.mutate()}>Abmelden</MenuItem>
          </Menu>
        </header>
        {current.isArchived ? <p className="bg-warning/15 px-4 py-2 text-sm">Dieses Projekt ist archiviert und kann nur gelesen werden.</p> : null}
        {samePage.length > 0 ? <p className="bg-warning/15 px-4 py-2 text-sm">{togetherNames(samePage.map((person) => person.name))} diese Seite ebenfalls. Ungespeicherte Änderungen bleiben bei dir.</p> : null}
        {navOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button className="studio-overlay absolute inset-0 bg-black/40" type="button" aria-label="Navigation schließen" onClick={() => setNavOpen(false)} />
            <aside className="studio-drawer absolute inset-y-0 left-0 flex w-72 flex-col bg-nav p-3 shadow-overlay">
              <div className="px-2 pb-3 pt-1" onClick={() => setNavOpen(false)}>
                <Brand to="/projekte" />
              </div>
              <ProjectNav projectId={current.id} pathname={location.pathname} onNavigate={() => setNavOpen(false)} />
            </aside>
          </div>
        ) : null}
        <main id="inhalt" className="min-h-0 min-w-0 flex-1 overflow-auto">
          <div key={location.pathname} className="studio-page h-full min-h-full">
            <Outlet context={{ project: current, canWrite, canManage, user } satisfies ProjectOutlet} />
          </div>
        </main>
      </div>
      <CommandPalette projectId={current.id} projectName={current.name} open={paletteOpen} onOpenChange={setPaletteOpen} returnFocus={paletteReturn} />
    </div>
  )
}

function togetherNames(names: string[]) {
  const shown = names.slice(0, 3).join(' und ')
  return names.length === 1 ? `${shown} bearbeitet` : `${shown} bearbeiten`
}

function accountInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  return name.trim().slice(0, 2).toUpperCase() || '?'
}

function ThemeButton() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  return (
    <Button
      size="sm"
      className="theme-toggle h-8 w-8 px-0"
      type="button"
      aria-label="Darstellung"
      onClick={() => {
        const next = document.documentElement.classList.toggle('dark')
        localStorage.setItem('studio-theme', next ? 'dark' : 'light')
        setDark(next)
      }}
    >
      {dark ? <DarkThemeIcon /> : <LightThemeIcon />}
    </Button>
  )
}

function LightThemeIcon() {
  return (
    <svg className="theme-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <g className="theme-sun-rays">
        <path d="M12 2V4M12 20V22M4 12H2M6.31412 6.31412L4.8999 4.8999M17.6859 6.31412L19.1001 4.8999M6.31412 17.69L4.8999 19.1042M17.6859 17.69L19.1001 19.1042M22 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle className="theme-sun-core" cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function DarkThemeIcon() {
  return (
    <svg className="theme-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path className="theme-moon" d="M16.5 13C19.0768 13 21.2397 11.228 21.8366 8.83604C21.4087 8.94287 20.961 8.99958 20.5 8.99958C17.4624 8.99958 15 6.53715 15 3.49958C15 3.03881 15.0567 2.59128 15.1634 2.16357C12.7717 2.76068 11 4.92345 11 7.50003C11 8.41275 11.2223 9.27355 11.6158 10.0312" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path className="theme-star" d="M5 7V3M3 5H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path className="theme-cloud" d="M6 22C3.79086 22 2 20.2091 2 18C2 16.0221 3.43551 14.3796 5.32148 14.0573C6.12876 11.697 8.3662 10 11 10C13.2882 10 15.2772 11.2809 16.2892 13.1648C16.6744 13.0574 17.0805 13 17.5 13C19.9853 13 22 15.0147 22 17.5C22 19.9853 19.9853 22 17.5 22C13.6667 22 9.83333 22 6 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const PersonButton = forwardRef<HTMLButtonElement, { name: string; role: string } & ButtonHTMLAttributes<HTMLButtonElement>>(function PersonButton({ name, role, ...props }, ref) {
  return (
    <button ref={ref} {...props} className="flex max-w-48 items-center gap-1.5 rounded-full border border-line bg-card py-0.5 pr-2.5 pl-0.5 text-left hover:border-accent/40" type="button" aria-label={`${name}, ${role}`}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground" aria-hidden="true">{accountInitials(name)}</span>
      <span className="hidden min-w-0 leading-none lg:block">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate text-xs text-muted">{role}</span>
      </span>
    </button>
  )
})

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
  const location = useLocation()
  const [viewQuery, setViewQuery] = useState('')
  const areas = useQuery({ queryKey: ['areas', projectId], queryFn: () => api<Area[]>(`/api/v1/projects/${projectId}/areas`) })
  const views = useQuery({ queryKey: ['views', projectId, 'nav'], queryFn: () => api<SavedView[]>(`/api/v1/projects/${projectId}/views`) })
  const viewTerm = viewQuery.trim().toLowerCase()
  const shown = (views.data ?? []).filter((view) => `${view.name} ${view.areaName ?? ''} ${view.query}`.toLowerCase().includes(viewTerm))
  const scopes = [...new Set(shown.map((view) => view.scope))]
  const diagramId = pathname.match(/\/diagramme\/([^/]+)/)?.[1]
  const diagram = useQuery({
    queryKey: ['diagram', projectId, diagramId],
    queryFn: () => api<Diagram>(`/api/v1/projects/${projectId}/diagrams/${diagramId}`),
    enabled: Boolean(diagramId),
  })
  return (
    <nav className="grid min-h-0 flex-1 content-start gap-1 overflow-auto px-3 pb-3" aria-label="Projekt">
      {nav.map(([label, segment, Icon]) => (
        <NavLink
          key={label}
          to={segment ? `/projekte/${projectId}/${segment}` : `/projekte/${projectId}`}
          end={segment === ''}
          onClick={onNavigate}
          className={({ isActive }) => `flex items-center gap-2 rounded-md px-2 py-2 text-sm ${isActive || moduleActive(segment, pathname, diagram.data?.kind) ? 'bg-card font-semibold text-accent ring-1 ring-accent/30' : 'hover:bg-background'}`}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="min-w-0 break-words">{label}</span>
        </NavLink>
      ))}
      <NavFold id="areas" label="Fachbereiche">
        {areas.data?.length ? rootAreas(areas.data).map((area) => (
          <AreaNavLink key={area.id} area={area} areas={areas.data ?? []} projectId={projectId} depth={0} onNavigate={onNavigate} />
        )) : <p className="px-2 py-1 text-xs text-muted">Noch keine Bereiche.</p>}
      </NavFold>
      <NavFold id="views" label="Gespeicherte Ansichten" count={views.data?.length}>
        {views.data?.length ? (
          <div className="grid gap-1">
            {views.data.length > 6 ? (
              <Input className="h-8" aria-label="Ansichten suchen" placeholder="Ansichten suchen" value={viewQuery} onChange={(event) => setViewQuery(event.target.value)} />
            ) : null}
            {shown.length === 0 ? <p className="px-2 py-1 text-xs text-muted">Keine Treffer.</p> : (
              <div className="grid max-h-52 gap-2 overflow-auto">
                {scopes.map((scope) => (
                  <div key={scope}>
                    {scopes.length > 1 ? <p className="px-2 pb-0.5 text-xs text-muted">{scope === 'system' ? 'Systemarchitektur' : 'Prozesse'}</p> : null}
                    <div className="grid gap-0.5">
                      {shown.filter((view) => view.scope === scope).map((view) => (
                        <Link key={view.id} className={`block rounded-md px-2 py-1.5 hover:bg-background ${viewHref(projectId, view) === `${location.pathname}${location.search}` ? 'bg-card text-accent' : ''}`} to={viewHref(projectId, view)} onClick={onNavigate}>
                          <span className="block truncate text-sm">{view.name}</span>
                          <span className="block truncate text-xs text-muted">{view.unassigned ? 'Ohne Bereich' : view.areaName || 'Alle Bereiche'}{view.query ? ` · „${view.query}“` : ''}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : <p className="px-2 py-1 text-xs text-muted">Noch keine Ansichten.</p>}
      </NavFold>
      <Link className="mt-4 px-2 text-sm text-muted underline-offset-2 hover:underline" to="/projekte" onClick={onNavigate}>
        Alle Projekte
      </Link>
    </nav>
  )
}

function AreaNavLink({ area, areas, projectId, depth, onNavigate }: { area: Area; areas: Area[]; projectId: string; depth: number; onNavigate?: () => void }) {
  return (
    <div>
      <Link className="block rounded-md py-1.5 pr-2 text-sm break-words hover:bg-background" style={{ paddingLeft: 8 + depth * 12 }} to={`/projekte/${projectId}/prozesse?bereich=${area.id}`} onClick={onNavigate}>
        {area.name}
      </Link>
      {childAreas(areas, area.id).map((child) => (
        <AreaNavLink key={child.id} area={child} areas={areas} projectId={projectId} depth={depth + 1} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function NavFold({ id, label, count, children }: { id: string; label: string; count?: number; children: ReactNode }) {
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
        <span className="min-w-0 truncate">{label}</span>
        <span className="ml-auto flex items-center gap-1">
          {count ? <span className="tabular-nums">{count}</span> : null}
          <ChevronDown size={14} className={open ? 'rotate-180' : ''} aria-hidden="true" />
        </span>
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

type WorkspaceTab = { id: string; href: string; label: string }

function WorkspaceTabs({ tabs, activeId, onSelect, onClose, onNew }: { tabs: WorkspaceTab[]; activeId: string; onSelect: (tab: WorkspaceTab) => void; onClose: (id: string) => void; onNew: () => void }) {
  return (
    <div className="workspace-tabs flex min-w-0 flex-1 items-end gap-1 self-stretch overflow-x-auto pb-px" role="tablist" aria-label="Offene Tabs">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <div key={tab.id} className={`group relative flex h-9 max-w-56 shrink-0 items-center rounded-t-lg ${active ? 'z-10 border border-b-0 border-line bg-background text-foreground after:absolute after:-right-px after:-bottom-px after:-left-px after:h-0.5 after:bg-background' : 'text-muted hover:bg-card/70 hover:text-foreground'}`}>
            <button className={`min-w-0 truncate px-3 py-1 text-left text-sm ${active ? 'font-medium' : ''}`} type="button" role="tab" aria-selected={active} title={tab.label} onClick={() => onSelect(tab)}>{tab.label}</button>
            <button className="mr-1 grid h-5 w-5 shrink-0 place-items-center rounded-md text-muted hover:bg-foreground/10 hover:text-foreground" type="button" aria-label={`Tab ausblenden: ${tab.label}`} onClick={() => onClose(tab.id)}>
              <X size={12} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
        )
      })}
      <button className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-card hover:text-foreground" type="button" aria-label="Weiteren Tab öffnen" onClick={onNew}>
        <Plus size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}

function useWorkspaceTabs(projectId: string, href: string, label: string) {
  const navigate = useNavigate()
  const boot = useRef<WorkspaceTab[] | null>(null)
  if (boot.current === null) boot.current = initialTabs(projectId, href, label)
  const [tabs, setTabs] = useState(boot.current)
  const [activeId, setActiveId] = useState((boot.current.find((tab) => tab.href === href) ?? boot.current[0]).id)
  const seenProject = useRef(projectId)
  if (projectId && seenProject.current !== projectId) {
    seenProject.current = projectId
    const initial = initialTabs(projectId, href, label)
    setTabs(initial)
    setActiveId((initial.find((tab) => tab.href === href) ?? initial[0]).id)
  }

  useEffect(() => {
    if (!projectId) return
    setTabs((current) => {
      if (!current.some((tab) => tab.id === activeId)) return current
      const currentTab = current.find((tab) => tab.id === activeId)
      if (currentTab?.href === href && currentTab.label === label) return current
      return current.map((tab) => tab.id === activeId ? { ...tab, href, label } : tab)
    })
  }, [projectId, href, label, activeId])

  useEffect(() => {
    if (!projectId || tabs.length === 0) return
    sessionStorage.setItem(`studio-tabs-${projectId}`, JSON.stringify(tabs))
  }, [projectId, tabs])

  function select(tab: WorkspaceTab) {
    setActiveId(tab.id)
    void navigate(tab.href)
  }

  function openNew(nextHref: string) {
    const existing = tabs.find((tab) => tab.href === nextHref)
    if (existing) {
      select(existing)
      return
    }
    const created = { id: crypto.randomUUID(), href: nextHref, label: 'Neuer Tab' }
    setActiveId(created.id)
    setTabs((current) => [...current, created])
    void navigate(nextHref)
  }

  function close(id: string) {
    const remaining = tabs.filter((tab) => tab.id !== id)
    if (remaining.length === 0) {
      const fresh = { id: crypto.randomUUID(), href: `/projekte/${projectId}`, label: 'Übersicht' }
      setActiveId(fresh.id)
      setTabs([fresh])
      void navigate(fresh.href)
      return
    }
    if (activeId === id) {
      const fallback = remaining[remaining.length - 1]
      setActiveId(fallback.id)
      void navigate(fallback.href)
    }
    setTabs(remaining)
  }

  return { tabs, activeId, select, openNew, close }
}

function initialTabs(projectId: string, href: string, label: string) {
  const stored = readTabs(projectId)
  if (stored.length > 0) return stored
  return [{ id: crypto.randomUUID(), href: href || '/projekte', label: label || 'Übersicht' }]
}

function readTabs(projectId: string) {
  if (!projectId) return []
  try {
    const raw = sessionStorage.getItem(`studio-tabs-${projectId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WorkspaceTab[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((tab) => typeof tab?.id === 'string' && typeof tab.href === 'string' && tab.href.startsWith('/projekte/')).map((tab) => ({
      id: tab.id,
      href: tab.href,
      label: tab.label || 'Tab',
    }))
  } catch {
    return []
  }
}

function openFromLink(event: ReactMouseEvent, openNew: (href: string) => void) {
  if (event.shiftKey || event.altKey) return
  if (!(event.button === 1 || event.metaKey || event.ctrlKey)) return
  const anchor = (event.target as HTMLElement).closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return
  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/projekte/')) return
  event.preventDefault()
  openNew(`${url.pathname}${url.search}`)
}

function tabLabel(pathname: string, projectName: string, diagram?: Diagram, areaName?: string, pageTitle?: string) {
  if (/\/dokumente\/[^/]+/.test(pathname) && pageTitle) return pageTitle
  if (/\/diagramme\/[^/]+/.test(pathname) && diagram?.name) return diagram.name
  const crumbs = breadcrumb(pathname, projectName, diagram, areaName)
  const leaf = crumbs.at(-1)?.label
  if (!leaf || leaf === projectName) return 'Übersicht'
  return leaf
}

function breadcrumb(pathname: string, projectName: string, diagram?: Diagram, areaName?: string) {
  const parts = pathname.split('/').filter(Boolean)
  const crumbs = [{ href: `/projekte/${parts[1]}`, label: projectName }]
  const section = parts[2]
  const labels: Record<string, string> = {
    bereiche: 'Bereiche',
    anforderungen: 'Anforderungen',
    abdeckung: 'Planungsabdeckung',
    arbeit: 'Meine Arbeit',
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
  if (section === 'bereiche' && parts[3]) {
    crumbs.push({ href: pathname, label: areaName ?? 'Bereich' })
  }
  if (section === 'dokumente' && parts[3] === 'katalog') {
    crumbs.push({ href: `/projekte/${parts[1]}/dokumente/katalog`, label: 'Datenmodell' })
  }
  return crumbs
}
