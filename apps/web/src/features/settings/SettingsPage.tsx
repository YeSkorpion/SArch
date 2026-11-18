import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router'
import { Button, Field, Input, Select, Textarea } from '../../components/ui'
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

  return (
    <div className="grid w-full gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>
      <form className="grid gap-3 rounded-xl border border-line bg-card p-4" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        <Field label="Name"><Input value={name} disabled={!canManage} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Beschreibung"><Textarea value={description} disabled={!canManage} onChange={(event) => setDescription(event.target.value)} /></Field>
        {canManage ? <Button type="submit" variant="primary">Speichern</Button> : <p className="text-sm text-muted">Nur Eigentümer ändern die Projekteinstellungen.</p>}
      </form>
      {canManage ? (
        <Button type="button" onClick={() => archive.mutate()}>{project.isArchived ? 'Projekt wieder öffnen' : 'Projekt archivieren'}</Button>
      ) : null}
      {project.role === 'Owner' ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-semibold">Projekt exportieren</h2>
          <p className="text-sm text-muted">Überträgt die fachlichen Projektdaten. Konten, Sitzungen und Mitgliedschaften bleiben in dieser Installation.</p>
          <Button type="button" onClick={() => void exportProject(project.id, project.name)}>Projekt exportieren</Button>
        </section>
      ) : null}
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Mitglieder</h2>
        <ul className="grid gap-2">
          {members.data?.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-3 text-sm">
              <span>{member.displayName} · {member.email} · {roleLabel(member.role)}</span>
              {canManage ? (
                <span className="flex gap-2">
                  <Button size="sm" type="button" onClick={() => changeRole.mutate(member)}>Rolle wechseln</Button>
                  <Button size="sm" type="button" onClick={() => remove.mutate(member.userId)}>Entfernen</Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {canManage ? (
          <form className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]" onSubmit={(event) => { event.preventDefault(); add.mutate() }}>
            <Input type="email" required placeholder="E-Mail" aria-label="E-Mail des Mitglieds" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Select aria-label="Rolle" value={role} onChange={(event) => setRole(event.target.value as ProjectRole)}>
              <option value="Owner">Eigentümer</option>
              <option value="Editor">Bearbeiter</option>
              <option value="Viewer">Betrachter</option>
            </Select>
            <Button type="submit" variant="primary">Hinzufügen</Button>
          </form>
        ) : null}
      </section>
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </div>
  )
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
