import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router'
import { Badge, Button, Field, Input, PageHeader, Select, Textarea } from '../../components/ui'
import { ErrorState, Loading } from '../../components/states'
import { api, errorText } from '../../lib/api'
import { roleLabel } from '../../lib/labels'
import type { Member, Project, ProjectRole } from '../../lib/types'
import type { ProjectOutlet } from '../shell/Shell'

export function SettingsPage() {
  const { project, canManage } = useOutletContext<ProjectOutlet>()
  const client = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [version, setVersion] = useState(project.version)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProjectRole>('Editor')
  const [message, setMessage] = useState('')
  const members = useQuery({
    queryKey: ['members', project.id],
    queryFn: () => api<Member[]>(`/api/v1/projects/${project.id}/members`),
  })
  const save = useMutation({
    mutationFn: () => api<Project>(`/api/v1/projects/${project.id}`, { method: 'PATCH', body: { version, name, description } }),
    onSuccess: async (next) => {
      setVersion(next.version)
      setMessage('Projekteinstellungen gespeichert.')
      await client.invalidateQueries({ queryKey: ['project', project.id] })
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const archive = useMutation({
    mutationFn: () => api<Project>(`/api/v1/projects/${project.id}/${project.isArchived ? 'restore' : 'archive'}`, { method: 'POST', body: { version } }),
    onSuccess: async (next) => {
      setVersion(next.version)
      await client.invalidateQueries({ queryKey: ['project', project.id] })
      await navigate(`/projekte/${project.id}`)
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const add = useMutation({
    mutationFn: () => api(`/api/v1/projects/${project.id}/members`, { method: 'POST', body: { email, role } }),
    onSuccess: async () => {
      setEmail('')
      setMessage('Mitglied hinzugefügt.')
      await client.invalidateQueries({ queryKey: ['members', project.id] })
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const changeRole = useMutation({
    mutationFn: (member: Member) => api(`/api/v1/projects/${project.id}/members/${member.userId}`, { method: 'PATCH', body: { role: member.role === 'Viewer' ? 'Editor' : 'Viewer' } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['members', project.id] })
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/api/v1/projects/${project.id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['members', project.id] })
    },
    onError: (error) => setMessage(errorText(error)),
  })

  if (members.isLoading) return <Loading />
  if (members.isError) return <div className="p-6"><ErrorState error={members.error} onRetry={() => void members.refetch()} /></div>

  const people = members.data ?? []
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-6 md:px-6">
      <PageHeader title="Einstellungen" description="Name, Export und die Personen, die an diesem Projekt arbeiten." />
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      <form className="grid gap-4 rounded-xl border border-line bg-card p-4" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Projekt</h2>
          {canManage ? <Button type="submit" variant="primary" size="sm" disabled={save.isPending}>Speichern</Button> : <p className="text-sm text-muted">Nur Eigentümer ändern die Projekteinstellungen.</p>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name"><Input value={name} disabled={!canManage} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Beschreibung"><Textarea className="min-h-20" value={description} disabled={!canManage} onChange={(event) => setDescription(event.target.value)} /></Field>
        </div>
      </form>
      {canManage || project.role === 'Owner' ? (
        <section className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {canManage ? (
            <div className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{project.isArchived ? 'Archiviert' : 'Aktiv'}</h2>
                <p className="text-sm text-muted">Ein archiviertes Projekt bleibt lesbar. Änderungen sind dann gesperrt.</p>
              </div>
              <Button size="sm" type="button" disabled={archive.isPending} onClick={() => archive.mutate()}>{project.isArchived ? 'Projekt wieder öffnen' : 'Projekt archivieren'}</Button>
            </div>
          ) : null}
          {project.role === 'Owner' ? (
            <div className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Export</h2>
                <p className="text-sm text-muted">Fachliche Projektdaten. Konten, Sitzungen und Mitgliedschaften bleiben in dieser Installation.</p>
              </div>
              <Button size="sm" type="button" onClick={() => void exportProject(project.id, project.name)}>Projekt exportieren</Button>
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="overflow-hidden rounded-xl border border-line bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="font-semibold">Mitglieder</h2>
          <span className="text-sm text-muted">{people.length === 1 ? '1 Person' : `${people.length} Personen`}</span>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {people.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-background text-xs font-semibold" aria-hidden="true">{initials(member.displayName)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{member.displayName}</span>
                <span className="block truncate text-xs text-muted">{member.email}</span>
              </span>
              <Badge>{roleLabel(member.role)}</Badge>
              {canManage ? (
                <span className="flex gap-1">
                  <Button size="sm" type="button" disabled={changeRole.isPending} onClick={() => changeRole.mutate(member)}>Rolle wechseln</Button>
                  <Button size="sm" type="button" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(member.userId)}>Entfernen</Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {canManage ? (
          <form className="grid gap-2 border-t border-line p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-center" onSubmit={(event) => { event.preventDefault(); add.mutate() }}>
            <Input type="email" required placeholder="E-Mail" aria-label="E-Mail des Mitglieds" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Select aria-label="Rolle" value={role} onChange={(event) => setRole(event.target.value as ProjectRole)}>
              <option value="Owner">Eigentümer</option>
              <option value="Editor">Bearbeiter</option>
              <option value="Viewer">Betrachter</option>
            </Select>
            <Button type="submit" variant="primary" size="sm" disabled={add.isPending}>Hinzufügen</Button>
          </form>
        ) : null}
      </section>
    </div>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  return (parts[0] ?? '').slice(0, 2).toUpperCase()
}

async function exportProject(projectId: string, name: string) {
  const file = await api<unknown>(`/api/v1/projects/${projectId}/export`)
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.sarch.json`
  link.click()
  URL.revokeObjectURL(url)
}
