import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Brand } from '../../components/Brand'
import { Button, Field, Input, Textarea } from '../../components/ui'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { api, errorText } from '../../lib/api'
import { roleLabel } from '../../lib/labels'
import type { Project, TransferPreview, User } from '../../lib/types'

export function ProjectsPage({ user }: { user: User }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/api/v1/projects') })
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
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

  return (
    <main className="grid w-full gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Brand to="/projekte" />
          <p className="mt-4 text-sm text-muted">Angemeldet als {user.displayName}</p>
          <h1 className="text-3xl font-semibold tracking-tight">Projekte</h1>
        </div>
        <Button type="button" onClick={() => logout.mutate()}>Abmelden</Button>
      </header>
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">Neues Projekt</h2>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <Field label="Name">
            <Input required value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Beschreibung">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          {create.isError ? <p role="alert" className="text-sm text-danger">{errorText(create.error)}</p> : null}
          <Button type="submit" variant="primary" disabled={create.isPending}>Projekt anlegen</Button>
        </form>
      </section>
      <ImportProject onImported={(id) => void navigate(`/projekte/${id}`)} />
      {projects.isLoading ? <Loading /> : null}
      {projects.isError ? <ErrorState error={projects.error} onRetry={() => void projects.refetch()} /> : null}
      {projects.data?.length === 0 ? <EmptyState title="Noch kein Projekt" body="Lege das erste Projekt an, um Anforderungen und Entwürfe zu sammeln." /> : null}
      <ul className="grid gap-3">
        {projects.data?.map((project) => (
          <li key={project.id}>
            <Link className="block rounded-xl border border-line bg-card p-4 hover:border-accent" to={`/projekte/${project.id}`}>
              <span className="font-semibold">{project.name}</span>
              <span className="mt-1 block text-sm text-muted">
                {roleLabel(project.role)}
                {project.isArchived ? ' · archiviert' : ''}
                {project.description ? ` · ${project.description}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
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
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="text-lg font-semibold">Projekt importieren</h2>
      <p className="mt-1 text-sm text-muted">Der Import legt ein neues Projekt an. Du wirst Eigentümerin oder Eigentümer.</p>
      <input
        className="mt-3 text-sm"
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
    </section>
  )
}
