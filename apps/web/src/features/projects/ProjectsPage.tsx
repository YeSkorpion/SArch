import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Brand } from '../../components/Brand'
import { Badge, Button, Field, Input, Select } from '../../components/ui'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { api, errorText } from '../../lib/api'
import { cn } from '../../lib/cn'
import { roleLabel } from '../../lib/labels'
import type { Project, ProjectRole, TransferPreview, User } from '../../lib/types'

const pageSize = 30
const statuses = [
  ['all', 'Alle'],
  ['active', 'Aktiv'],
  ['archived', 'Archiviert'],
] as const

export function ProjectsPage({ user }: { user: User }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/api/v1/projects') })
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<(typeof statuses)[number][0]>('all')
  const [role, setRole] = useState<'' | ProjectRole>('')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')
  const [limit, setLimit] = useState(pageSize)
  const create = useMutation({
    mutationFn: () => api<Project>('/api/v1/projects', { method: 'POST', body: { name, description } }),
    onSuccess: async (project) => {
      await client.invalidateQueries({ queryKey: ['projects'] })
      await navigate(`/projekte/${project.id}`)
    },
  })
  const logout = useMutation({
    mutationFn: () => api('/api/v1/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      client.setQueryData(['me'], null)
      await navigate('/anmelden')
    },
  })
  useEffect(() => {
    setLimit(pageSize)
  }, [query, status, role, sort])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const items = (projects.data ?? []).filter((project) => {
      if (status === 'active' && project.isArchived) return false
      if (status === 'archived' && !project.isArchived) return false
      if (role && project.role !== role) return false
      if (!needle) return true
      return project.name.toLowerCase().includes(needle) || project.description.toLowerCase().includes(needle)
    })
    items.sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name, 'de')
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    })
    return items
  }, [projects.data, query, role, sort, status])

  const total = projects.data?.length ?? 0
  const narrowed = query.trim() !== '' || status !== 'all' || role !== ''
  const visible = filtered.slice(0, limit)

  return (
    <main className="grid w-full gap-5 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <Brand to="/projekte" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Projekte</h1>
            <p className="truncate text-sm text-muted">Angemeldet als {user.displayName}</p>
          </div>
        </div>
        <Button size="sm" type="button" onClick={() => logout.mutate()}>Abmelden</Button>
      </header>

      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="text-base font-semibold">Neues Projekt</h2>
        <form
          className="mt-3 grid gap-3 md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <Field label="Name">
            <Input required autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Beschreibung">
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Button className="w-full md:w-auto" type="submit" variant="primary" disabled={create.isPending}>Projekt anlegen</Button>
        </form>
        {create.isError ? <p role="alert" className="mt-3 text-sm text-danger">{errorText(create.error)}</p> : null}
      </section>

      <ImportProject onImported={(id) => void navigate(`/projekte/${id}`)} />

      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Input
          className="h-9 w-full sm:max-w-xs"
          aria-label="Projekte suchen"
          placeholder="Name oder Beschreibung"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="inline-flex rounded-md border border-line bg-card p-0.5" role="group" aria-label="Projektstatus">
          {statuses.map(([value, label]) => (
            <button
              key={value}
              className={cn('rounded px-2.5 py-1 text-sm', status === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground')}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <Select className="studio-inline" aria-label="Rolle filtern" value={role} onChange={(event) => setRole(event.target.value as '' | ProjectRole)}>
          <option value="">Alle Rollen</option>
          <option value="Owner">Eigentümer</option>
          <option value="Editor">Bearbeiter</option>
          <option value="Viewer">Betrachter</option>
        </Select>
        <Select className="studio-inline" aria-label="Sortierung" value={sort} onChange={(event) => setSort(event.target.value as 'recent' | 'name')}>
          <option value="recent">Zuletzt geändert</option>
          <option value="name">Name</option>
        </Select>
        {narrowed ? <Button size="sm" type="button" onClick={() => { setQuery(''); setStatus('all'); setRole('') }}>Filter zurücksetzen</Button> : null}
        {total > 0 ? <span className="text-sm text-muted sm:ml-auto">{narrowed ? `${filtered.length} von ${total}` : `${total} ${total === 1 ? 'Projekt' : 'Projekte'}`}</span> : null}
      </div>

      {projects.isLoading ? <Loading /> : null}
      {projects.isError ? <ErrorState error={projects.error} onRetry={() => void projects.refetch()} /> : null}
      {projects.data && total === 0 ? <EmptyState title="Noch kein Projekt" body="Lege das erste Projekt an, um Anforderungen und Entwürfe zu sammeln." /> : null}
      {projects.data && total > 0 && filtered.length === 0 ? (
        <EmptyState
          title="Keine Treffer für diese Filter"
          body="Passe die Suche an oder setze die Filter zurück."
          action={<Button type="button" onClick={() => { setQuery(''); setStatus('all'); setRole('') }}>Filter zurücksetzen</Button>}
        />
      ) : null}
      {visible.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <div className="hidden border-b border-line px-4 py-2 text-xs font-medium text-muted md:grid md:grid-cols-[minmax(0,1.6fr)_9rem_10rem] md:gap-4">
            <span>Projekt</span>
            <span>Rolle</span>
            <span>Geändert</span>
          </div>
          <ul className="divide-y divide-line">
            {visible.map((project) => <ProjectRow key={project.id} project={project} />)}
          </ul>
        </div>
      ) : null}
      {filtered.length > limit ? (
        <div className="flex justify-center">
          <Button type="button" onClick={() => setLimit((current) => current + pageSize)}>Weitere Projekte anzeigen</Button>
        </div>
      ) : null}
    </main>
  )
}

function ProjectRow({ project }: { project: Project }) {
  const titleId = useId()
  return (
    <li>
      <Link
        className="grid gap-1 px-4 py-3 hover:bg-background md:grid-cols-[minmax(0,1.6fr)_9rem_10rem] md:items-center md:gap-4"
        aria-labelledby={titleId}
        to={`/projekte/${project.id}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent/12 text-xs font-semibold text-accent">
            {projectMark(project.name)}
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span id={titleId} className="truncate font-medium" title={project.name}>{project.name}</span>
              {project.isArchived ? <Badge tone="warning">Archiviert</Badge> : null}
            </span>
            <span className="block truncate text-sm text-muted" title={project.description || undefined}>{project.description || 'Ohne Beschreibung'}</span>
          </span>
        </span>
        <span className="text-sm text-muted md:text-foreground">{roleLabel(project.role)}</span>
        <span className="text-sm text-muted">{changedLabel(project.updatedAt)}</span>
      </Link>
    </li>
  )
}

function ImportProject({ onImported }: { onImported: (id: string) => void }) {
  const client = useQueryClient()
  const [preview, setPreview] = useState<TransferPreview | null>(null)
  const [file, setFile] = useState<unknown>(null)
  const [message, setMessage] = useState('')
  const confirm = useMutation({
    mutationFn: () => api<{ id: string }>('/api/v1/projects/import', { method: 'POST', body: file }),
    onSuccess: async (project) => {
      await client.invalidateQueries({ queryKey: ['projects'] })
      onImported(project.id)
    },
  })
  return (
    <details className="group rounded-xl border border-line bg-card px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        Projekt importieren
        <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-2 text-sm text-muted">Der Import legt ein neues Projekt an. Du wirst Eigentümerin oder Eigentümer.</p>
      <input
        className="mt-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium"
        type="file"
        accept="application/json,.json"
        aria-label="Projektdatei"
        onChange={(event) => {
          const selected = event.target.files?.[0]
          setPreview(null)
          setFile(null)
          setMessage('')
          if (!selected) return
          void selected.text().then(async (text) => {
            try {
              const parsed = JSON.parse(text) as unknown
              setFile(parsed)
              setPreview(await api<TransferPreview>('/api/v1/projects/import/preview', { method: 'POST', body: parsed }))
            } catch (error) {
              setMessage(errorText(error))
            }
          })
        }}
      />
      {message ? <p role="alert" className="mt-2 text-sm text-danger">{message}</p> : null}
      {preview ? (
        <div className="mt-3 grid gap-2 text-sm">
          <p>{preview.summary.requirements} Anforderungen, {preview.summary.diagrams} Diagramme, {preview.summary.documents} Dokumente, {preview.summary.packages} Änderungspakete, {preview.summary.snapshots} Stände.</p>
          {preview.errors.length ? <ul className="text-danger">{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
          {preview.valid ? <Button type="button" variant="primary" disabled={confirm.isPending} onClick={() => confirm.mutate()}>Importieren</Button> : null}
          {confirm.isError ? <p role="alert" className="text-danger">{errorText(confirm.error)}</p> : null}
        </div>
      ) : null}
    </details>
  )
}

function projectMark(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length >= 2 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : name.trim().slice(0, 2)
  return letters.toUpperCase()
}

function changedLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}
