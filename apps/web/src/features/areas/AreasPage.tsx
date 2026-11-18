import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { Button, ConfirmDialog, Field, Input, Menu, MenuItem, Modal, PageHeader, Textarea } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import type { Area } from '../../lib/types'
import type { ProjectOutlet } from '../shell/Shell'

export function AreasPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const client = useQueryClient()
  const areas = useQuery({
    queryKey: ['areas', project.id],
    queryFn: () => api<Area[]>(`/api/v1/projects/${project.id}/areas`),
  })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Area | null>(null)
  const create = useMutation({
    mutationFn: () => api<Area>(`/api/v1/projects/${project.id}/areas`, { method: 'POST', body: { name, description } }),
    onSuccess: async () => {
      setName('')
      setDescription('')
      setOpen(false)
      setMessage('Bereich angelegt.')
      await client.invalidateQueries({ queryKey: ['areas', project.id] })
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/projects/${project.id}/areas/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setPendingDelete(null)
      setMessage('Bereich gelöscht.')
      await client.invalidateQueries({ queryKey: ['areas', project.id] })
    },
    onError: (error) => setMessage(errorText(error)),
  })
  const hasAreas = (areas.data?.length ?? 0) > 0
  const createButton = canWrite ? <Button type="button" variant="primary" onClick={() => { setMessage(''); setOpen(true) }}>Bereich anlegen</Button> : undefined

  return (
    <div className="grid w-full max-w-6xl gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Bereiche" description="Bereiche bündeln Prozesse und Systemdiagramme." action={hasAreas ? createButton : undefined} />
      {message && !open ? <p className="text-sm" role="status">{message}</p> : null}
      {areas.isLoading ? <Loading /> : null}
      {areas.isError ? <ErrorState error={areas.error} onRetry={() => void areas.refetch()} /> : null}
      {areas.data?.length === 0 ? (
        <EmptyState title="Keine Bereiche" body="Lege Bereiche wie Bestellung, Versand oder Identität an und ordne die Diagramme dort ein." action={createButton} />
      ) : null}
      <ul className="divide-y divide-line">
        {areas.data?.map((area) => (
          <li key={area.id} className="flex items-start gap-3 py-3">
            <Link className="min-w-0 flex-1 rounded-md hover:text-accent" to={`/projekte/${project.id}/prozesse?bereich=${area.id}`}>
              <h2 className="font-medium break-words">{area.name}</h2>
              {area.description ? <p className="line-clamp-2 text-sm text-muted">{area.description}</p> : null}
              <p className="text-sm text-muted">{area.diagramCount} Diagramme</p>
            </Link>
            {canWrite ? (
              <Menu trigger={<button className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-background" type="button" aria-label={`Aktionen für ${area.name}`}><MoreHorizontal size={16} aria-hidden="true" /></button>}>
                <MenuItem onSelect={() => setPendingDelete(area)}>Löschen</MenuItem>
              </Menu>
            ) : null}
          </li>
        ))}
      </ul>
      <Modal open={open} onOpenChange={setOpen} title="Bereich anlegen">
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Name"><Input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Beschreibung"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          {message && open ? <p className="text-sm" role="alert">{message}</p> : null}
          {create.isPending ? <p className="text-sm text-muted">Wird gespeichert</p> : null}
          <Button type="submit" variant="primary" disabled={create.isPending}>Anlegen</Button>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => { if (!next) setPendingDelete(null) }}
        title="Bereich löschen"
        description={pendingDelete ? `„${pendingDelete.name}“ wird gelöscht. Das ist nur möglich, wenn dem Bereich keine Diagramme mehr zugeordnet sind.` : ''}
        confirmLabel="Löschen"
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </div>
  )
}
