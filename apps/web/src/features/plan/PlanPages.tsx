import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { Badge, Button, Field, Input, PageHeader, Select, Textarea } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import type { Component, Criterion, DataEntity, DeliveryPlan, OpenPoint, OpenPointKind, Requirement, Screen, ServiceContract } from '../../lib/types'
import type { ProjectOutlet } from '../shell/Shell'

const fieldTypes = ['Text', 'Zahl', 'Datum', 'Wahrheitswert', 'Referenz', 'Liste']
const pointKinds: OpenPointKind[] = ['Frage', 'Annahme', 'Risiko']

function shell() {
  return 'grid w-full gap-4 px-4 py-6 md:px-6'
}

function packageLabel(status: string) {
  if (status === 'InPruefung') return 'In Prüfung'
  if (status === 'Freigegeben') return 'Freigegeben'
  return 'Entwurf'
}

function pointLabel(kind: OpenPointKind) {
  return kind
}

export function AcceptancePanel({ projectId, requirementId, canWrite }: { projectId: string; requirementId: string; canWrite: boolean }) {
  const client = useQueryClient()
  const criteria = useQuery({ queryKey: ['criteria', projectId, requirementId], queryFn: () => api<Criterion[]>(`/api/v1/projects/${projectId}/requirements/${requirementId}/criteria`) })
  const [text, setText] = useState('')
  const save = useMutation({
    mutationFn: (items: { id?: string; text: string; done: boolean }[]) => api<Criterion[]>(`/api/v1/projects/${projectId}/requirements/${requirementId}/criteria`, { method: 'PUT', body: { items } }),
    onSuccess: (saved) => {
      client.setQueryData(['criteria', projectId, requirementId], saved)
      setText('')
    },
  })
  const current = criteria.data ?? []
  function persist(items: { id?: string; text: string; done: boolean }[]) {
    save.mutate(items)
  }
  return (
    <section className="grid gap-3 rounded-xl border border-line bg-card p-4">
      <div>
        <h2 className="font-semibold">Fertig, wenn</h2>
        <p className="text-sm text-muted">Kurze Kriterien, an denen die Anforderung abgenommen wird.</p>
      </div>
      {criteria.isLoading ? <p className="text-sm text-muted">Wird geladen …</p> : null}
      {criteria.isError ? <p role="alert" className="text-sm text-danger">{errorText(criteria.error)}</p> : null}
      <ul className="grid gap-2">
        {current.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <input
              className="mt-2"
              type="checkbox"
              checked={item.done}
              disabled={!canWrite || save.isPending}
              aria-label={`Kriterium erfüllt: ${item.text}`}
              onChange={() => persist(current.map((entry) => ({ id: entry.id, text: entry.text, done: entry.id === item.id ? !entry.done : entry.done })))}
            />
            <Input
              value={item.text}
              disabled={!canWrite || save.isPending}
              aria-label="Abnahmekriterium"
              onChange={(event) => client.setQueryData<Criterion[]>(['criteria', projectId, requirementId], current.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry))}
              onBlur={() => {
                const live = client.getQueryData<Criterion[]>(['criteria', projectId, requirementId]) ?? current
                persist(live.map((entry) => ({ id: entry.id, text: entry.text, done: entry.done })))
              }}
            />
            {canWrite ? <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => persist(current.filter((entry) => entry.id !== item.id).map((entry) => ({ id: entry.id, text: entry.text, done: entry.done })))}>Entfernen</Button> : null}
          </li>
        ))}
      </ul>
      {current.length === 0 && !criteria.isLoading ? <p className="text-sm text-muted">Noch kein Kriterium.</p> : null}
      {canWrite ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (text.trim()) persist([...current.map((entry) => ({ id: entry.id, text: entry.text, done: entry.done })), { text: text.trim(), done: false }]) }}>
          <Field label="Neues Kriterium"><Input value={text} aria-label="Neues Abnahmekriterium" placeholder="Die Bestellung ist freigegeben." onChange={(event) => setText(event.target.value)} /></Field>
          <Button type="submit" variant="primary" disabled={save.isPending || text.trim().length === 0}>Hinzufügen</Button>
        </form>
      ) : null}
      {save.isError ? <p role="alert" className="text-sm text-danger">{errorText(save.error)}</p> : null}
    </section>
  )
}

export function DataModelPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const client = useQueryClient()
  const model = useQuery({ queryKey: ['data-model', project.id], queryFn: () => api<DataEntity[]>(`/api/v1/projects/${project.id}/data-model`) })
  const components = useQuery({ queryKey: ['components', project.id], queryFn: () => api<Component[]>(`/api/v1/projects/${project.id}/components`) })
  const screens = useQuery({ queryKey: ['screens', project.id], queryFn: () => api<Screen[]>(`/api/v1/projects/${project.id}/screens`) })
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fieldName, setFieldName] = useState('')
  const [fieldType, setFieldType] = useState('Text')
  const [required, setRequired] = useState(true)
  const [notes, setNotes] = useState('')
  const [artifactId, setArtifactId] = useState('')
  const [role, setRole] = useState<'Speichert' | 'Zeigt'>('Speichert')
  const entities = model.data ?? []
  const current = entities.find((item) => item.id === selected) ?? entities[0]
  useEffect(() => {
    if (!selected && model.data?.[0]) setSelected(model.data[0].id)
  }, [model.data, selected])
  const refresh = (saved?: DataEntity | null) => {
    void client.invalidateQueries({ queryKey: ['data-model', project.id] })
    if (saved?.id) setSelected(saved.id)
  }
  const create = useMutation({
    mutationFn: () => api<DataEntity>(`/api/v1/projects/${project.id}/data-model`, { method: 'POST', body: { name, description } }),
    onSuccess: (saved) => { setName(''); setDescription(''); setCreating(false); refresh(saved) },
  })
  const update = useMutation({
    mutationFn: (body: { name: string; description: string }) => api<DataEntity>(`/api/v1/projects/${project.id}/data-model/${current?.id}`, { method: 'PATCH', body }),
    onSuccess: () => refresh(),
  })
  const remove = useMutation({
    mutationFn: () => api(`/api/v1/projects/${project.id}/data-model/${current?.id}`, { method: 'DELETE' }),
    onSuccess: () => { setSelected(null); refresh() },
  })
  const addField = useMutation({
    mutationFn: () => api<DataEntity>(`/api/v1/projects/${project.id}/data-model/${current?.id}/fields`, { method: 'POST', body: { name: fieldName, fieldType, required, notes } }),
    onSuccess: () => { setFieldName(''); setNotes(''); refresh() },
  })
  const removeField = useMutation({
    mutationFn: (fieldId: string) => api(`/api/v1/projects/${project.id}/data-model/${current?.id}/fields/${fieldId}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
  })
  const addUse = useMutation({
    mutationFn: () => api<DataEntity>(`/api/v1/projects/${project.id}/data-model/${current?.id}/uses`, { method: 'POST', body: { artifactId, role } }),
    onSuccess: () => refresh(),
  })
  const removeUse = useMutation({
    mutationFn: (useId: string) => api(`/api/v1/projects/${project.id}/data-model/${current?.id}/uses/${useId}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
  })
  const error = create.error ?? update.error ?? remove.error ?? addField.error ?? addUse.error ?? removeField.error ?? removeUse.error
  if (model.isLoading) return <Loading />
  if (model.isError) return <div className="p-6"><ErrorState error={model.error} onRetry={() => void model.refetch()} /></div>
  return (
    <div className={shell()}>
      <PageHeader title="Datenmodell" description="Fachliche Objekte mit Feldern, verknüpft mit der Komponente oder dem Screen, der sie speichert oder zeigt." action={canWrite ? <Button type="button" variant="primary" onClick={() => setCreating((value) => !value)}>Objekt anlegen</Button> : undefined} />
      {creating ? (
        <form className="grid gap-3 rounded-xl border border-line bg-card p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Name"><Input value={name} aria-label="Objektname" onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Beschreibung"><Input value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          <Button type="submit" variant="primary" disabled={create.isPending || name.trim().length === 0}>Speichern</Button>
        </form>
      ) : null}
      {entities.length === 0 ? <EmptyState title="Noch keine fachlichen Objekte" body="Lege zum Beispiel Bestellung, Kunde oder Sendung an und hänge die Felder daran." /> : (
        <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <ul className="grid gap-1">
            {entities.map((item) => (
              <li key={item.id}>
                <button className={`w-full rounded-lg border px-3 py-2 text-left ${item.id === current?.id ? 'border-accent bg-card text-accent' : 'border-line bg-card hover:border-accent/40'}`} type="button" onClick={() => setSelected(item.id)}>
                  <span className="block font-medium">{item.name}</span>
                  <span className="block text-xs text-muted">{item.fields.length === 1 ? '1 Feld' : `${item.fields.length} Felder`} · {item.uses.length === 1 ? '1 Verwendung' : `${item.uses.length} Verwendungen`}</span>
                </button>
              </li>
            ))}
          </ul>
          {current ? (
            <section className="grid gap-4 rounded-xl border border-line bg-card p-4">
              {canWrite ? (
                <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); update.mutate({ name: current.name, description: current.description }) }}>
                  <Field label="Name"><Input value={current.name} aria-label="Name des Objekts" onChange={(event) => client.setQueryData<DataEntity[]>(['data-model', project.id], entities.map((item) => item.id === current.id ? { ...item, name: event.target.value } : item))} /></Field>
                  <Field label="Beschreibung"><Input value={current.description} onChange={(event) => client.setQueryData<DataEntity[]>(['data-model', project.id], entities.map((item) => item.id === current.id ? { ...item, description: event.target.value } : item))} /></Field>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={update.isPending}>Namen speichern</Button>
                    <Button type="button" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>Objekt löschen</Button>
                  </div>
                </form>
              ) : (
                <div>
                  <h2 className="text-xl font-semibold">{current.name}</h2>
                  {current.description ? <p className="text-sm text-muted">{current.description}</p> : null}
                </div>
              )}
              <div>
                <h3 className="font-medium">Felder</h3>
                {current.fields.length === 0 ? <p className="mt-1 text-sm text-muted">Noch keine Felder.</p> : (
                  <ul className="mt-2 divide-y divide-line">
                    {current.fields.map((field) => (
                      <li key={field.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{field.name} <span className="font-normal text-muted">{field.fieldType}{field.required ? ' · Pflicht' : ''}</span></p>
                          {field.notes ? <p className="truncate text-sm text-muted">{field.notes}</p> : null}
                        </div>
                        {canWrite ? <Button type="button" variant="ghost" onClick={() => removeField.mutate(field.id)}>Feld entfernen</Button> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {canWrite ? (
                  <form className="mt-3 grid gap-3 md:grid-cols-[1fr_10rem_auto]" onSubmit={(event) => { event.preventDefault(); addField.mutate() }}>
                    <Field label="Feld"><Input value={fieldName} aria-label="Feldname" onChange={(event) => setFieldName(event.target.value)} /></Field>
                    <Field label="Typ"><Select aria-label="Feldtyp" value={fieldType} onChange={(event) => setFieldType(event.target.value)}>{fieldTypes.map((item) => <option key={item}>{item}</option>)}</Select></Field>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />Pflicht</label>
                    <Field label="Notiz"><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
                    <Button className="self-end" type="submit" variant="primary" disabled={addField.isPending || fieldName.trim().length === 0}>Feld hinzufügen</Button>
                  </form>
                ) : null}
              </div>
              <div>
                <h3 className="font-medium">Verwendet von</h3>
                {current.uses.length === 0 ? <p className="mt-1 text-sm text-muted">Noch keine Komponente oder kein Screen.</p> : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {current.uses.map((use) => (
                      <li key={use.id} className="flex items-center gap-2 rounded-lg border border-line bg-background px-3 py-1.5 text-sm">
                        <Link to={use.artifactType === 'Screen' ? `/projekte/${project.id}/ui/${use.artifactId}` : `/projekte/${project.id}/system/komponenten/${use.artifactId}`}>{use.artifactTitle}</Link>
                        <span className="text-muted">{use.role === 'Speichert' ? 'speichert' : 'zeigt'}</span>
                        {canWrite ? <button className="text-muted hover:text-danger" type="button" aria-label={`Verwendung entfernen: ${use.artifactTitle}`} onClick={() => removeUse.mutate(use.id)}>×</button> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {canWrite ? (
                  <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); addUse.mutate() }}>
                    <Field label="Komponente oder Screen">
                      <Select aria-label="Verwendung" value={artifactId} onChange={(event) => setArtifactId(event.target.value)}>
                        <option value="">Auswählen</option>
                        {(components.data ?? []).map((item) => <option key={item.id} value={item.id}>Komponente · {item.name}</option>)}
                        {(screens.data ?? []).map((item) => <option key={item.id} value={item.id}>Screen · {item.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Rolle"><Select aria-label="Rolle der Verwendung" value={role} onChange={(event) => setRole(event.target.value as 'Speichert' | 'Zeigt')}><option value="Speichert">speichert</option><option value="Zeigt">zeigt</option></Select></Field>
                    <Button type="submit" disabled={addUse.isPending || artifactId === ''}>Verknüpfen</Button>
                  </form>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-danger">{errorText(error)}</p> : null}
    </div>
  )
}

export function ContractsPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const client = useQueryClient()
  const contracts = useQuery({ queryKey: ['contracts', project.id], queryFn: () => api<ServiceContract[]>(`/api/v1/projects/${project.id}/contracts`) })
  const components = useQuery({ queryKey: ['components', project.id], queryFn: () => api<Component[]>(`/api/v1/projects/${project.id}/components`) })
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', providerId: '', consumerId: '', operation: '', input: '', output: '', errors: '' })
  const refresh = () => void client.invalidateQueries({ queryKey: ['contracts', project.id] })
  const create = useMutation({
    mutationFn: () => api<ServiceContract>(`/api/v1/projects/${project.id}/contracts`, { method: 'POST', body: { ...draft, consumerId: draft.consumerId || null } }),
    onSuccess: () => { setDraft({ name: '', providerId: '', consumerId: '', operation: '', input: '', output: '', errors: '' }); setCreating(false); refresh() },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/projects/${project.id}/contracts/${id}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
  })
  if (contracts.isLoading) return <Loading />
  if (contracts.isError) return <div className="p-6"><ErrorState error={contracts.error} onRetry={() => void contracts.refetch()} /></div>
  const rows = contracts.data ?? []
  return (
    <div className={shell()}>
      <PageHeader title="Schnittstellen" description="Ein konkreter Aufruf: wer ihn anbietet, wer ihn nutzt, was hineingeht, was herauskommt und welche Fehler es gibt." action={canWrite ? <Button type="button" variant="primary" onClick={() => setCreating((value) => !value)}>Schnittstelle anlegen</Button> : undefined} />
      {creating ? (
        <form className="grid gap-3 rounded-xl border border-line bg-card p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Name"><Input aria-label="Name der Schnittstelle" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="Aufrufname"><Input aria-label="Aufrufname" value={draft.operation} placeholder="Bestellung freigeben" onChange={(event) => setDraft({ ...draft, operation: event.target.value })} /></Field>
          <Field label="Anbieter"><Select aria-label="Anbieter" value={draft.providerId} onChange={(event) => setDraft({ ...draft, providerId: event.target.value })}><option value="">Auswählen</option>{(components.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Aufrufer"><Select aria-label="Aufrufer" value={draft.consumerId} onChange={(event) => setDraft({ ...draft, consumerId: event.target.value })}><option value="">Kein Aufrufer</option>{(components.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Eingabe"><Textarea value={draft.input} onChange={(event) => setDraft({ ...draft, input: event.target.value })} /></Field>
          <Field label="Ausgabe"><Textarea value={draft.output} onChange={(event) => setDraft({ ...draft, output: event.target.value })} /></Field>
          <Field label="Fehler"><Textarea value={draft.errors} onChange={(event) => setDraft({ ...draft, errors: event.target.value })} /></Field>
          {create.isError ? <p role="alert" className="text-sm text-danger md:col-span-2">{errorText(create.error)}</p> : null}
          <Button type="submit" variant="primary" disabled={create.isPending || draft.name.trim().length === 0 || draft.operation.trim().length === 0 || draft.providerId === ''}>Speichern</Button>
        </form>
      ) : null}
      {rows.length === 0 ? <EmptyState title="Noch keine Schnittstellen" body="Lege den Aufruf zwischen zwei Komponenten fest, inklusive Eingabe, Ausgabe und Fehlern." /> : (
        <div className="grid gap-3">
          {rows.map((item) => (
            <article key={item.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{item.name}</h2>
                  <p className="text-sm text-muted">{item.consumerName ?? 'Aufrufer offen'} ruft {item.operation} bei {item.providerName} auf.</p>
                </div>
                {canWrite ? <Button type="button" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>Schnittstelle entfernen</Button> : null}
              </div>
              <dl className="mt-3 grid gap-3 md:grid-cols-3">
                <div><dt className="text-xs text-muted">Eingabe</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{item.input || '—'}</dd></div>
                <div><dt className="text-xs text-muted">Ausgabe</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{item.output || '—'}</dd></div>
                <div><dt className="text-xs text-muted">Fehler</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{item.errors || '—'}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
      {remove.isError ? <p role="alert" className="text-sm text-danger">{errorText(remove.error)}</p> : null}
    </div>
  )
}

export function DeliveryPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const client = useQueryClient()
  const plan = useQuery({ queryKey: ['delivery', project.id], queryFn: () => api<DeliveryPlan>(`/api/v1/projects/${project.id}/delivery`) })
  const order = useMutation({
    mutationFn: (ids: string[]) => api<DeliveryPlan>(`/api/v1/projects/${project.id}/delivery`, { method: 'PUT', body: { ids } }),
    onSuccess: (saved) => client.setQueryData(['delivery', project.id], saved),
  })
  if (plan.isLoading) return <Loading />
  if (plan.isError) return <div className="p-6"><ErrorState error={plan.error} onRetry={() => void plan.refetch()} /></div>
  const slices = plan.data?.slices ?? []
  const unassigned = plan.data?.unassigned ?? []
  function move(index: number, direction: -1 | 1) {
    const next = slices.slice()
    const target = index + direction
    if (target < 0 || target >= next.length) return
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    order.mutate(next.map((slice) => slice.id))
  }
  return (
    <div className={shell()}>
      <PageHeader title="Lieferung" description="Die Reihenfolge der Änderungspakete und welche Anforderungen in welcher Scheibe liegen." />
      {slices.length === 0 ? <EmptyState title="Noch keine Änderungspakete" body="Pakete legst du unter Änderungen an. Hier bestimmst du danach die Reihenfolge der Lieferung." /> : (
        <ol className="grid gap-3">
          {slices.map((slice, index) => (
            <li key={slice.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{index + 1}</span>
                  <div>
                    <Link className="font-semibold hover:text-accent" to={`/projekte/${project.id}/aenderungen/${slice.id}`}>{slice.title}</Link>
                    <p className="text-sm text-muted">{packageLabel(slice.status)} · {slice.requirements.length} Anforderungen</p>
                  </div>
                </div>
                {canWrite ? (
                  <div className="flex gap-2">
                    <Button type="button" disabled={index === 0 || order.isPending} onClick={() => move(index, -1)}>Nach oben</Button>
                    <Button type="button" disabled={index === slices.length - 1 || order.isPending} onClick={() => move(index, 1)}>Nach unten</Button>
                  </div>
                ) : null}
              </div>
              {slice.requirements.length === 0 ? <p className="mt-3 text-sm text-muted">Keine Anforderungen in diesem Paket.</p> : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {slice.requirements.map((item) => <li key={item.id}><Link className="rounded-md bg-background px-2 py-1 text-sm hover:text-accent" to={`/projekte/${project.id}/anforderungen/${item.id}`}>{item.key} {item.title}</Link></li>)}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      <section className="rounded-xl border border-dashed border-line bg-card p-4">
        <h2 className="font-semibold">Noch keiner Scheibe zugeordnet</h2>
        {unassigned.length === 0 ? <p className="mt-1 text-sm text-muted">Jede Anforderung liegt in mindestens einem Paket.</p> : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {unassigned.map((item) => <li key={item.id}><Link className="rounded-md bg-background px-2 py-1 text-sm hover:text-accent" to={`/projekte/${project.id}/anforderungen/${item.id}`}>{item.key} {item.title}</Link></li>)}
          </ul>
        )}
      </section>
      {order.isError ? <p role="alert" className="text-sm text-danger">{errorText(order.error)}</p> : null}
    </div>
  )
}

export function OpenPointsPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const client = useQueryClient()
  const points = useQuery({ queryKey: ['open-points', project.id], queryFn: () => api<OpenPoint[]>(`/api/v1/projects/${project.id}/open-points`) })
  const requirements = useQuery({ queryKey: ['requirements', project.id, 'plan'], queryFn: () => api<{ items: Requirement[] }>(`/api/v1/projects/${project.id}/requirements?pageSize=100`) })
  const components = useQuery({ queryKey: ['components', project.id], queryFn: () => api<Component[]>(`/api/v1/projects/${project.id}/components`) })
  const [kind, setKind] = useState<OpenPointKind>('Frage')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [artifactId, setArtifactId] = useState('')
  const [filter, setFilter] = useState<'Offen' | 'Alle'>('Offen')
  const refresh = () => void client.invalidateQueries({ queryKey: ['open-points', project.id] })
  const create = useMutation({
    mutationFn: () => api<OpenPoint>(`/api/v1/projects/${project.id}/open-points`, { method: 'POST', body: { kind, title, detail, artifactId: artifactId || null } }),
    onSuccess: () => { setTitle(''); setDetail(''); setArtifactId(''); refresh() },
  })
  const update = useMutation({
    mutationFn: (point: OpenPoint) => api(`/api/v1/projects/${project.id}/open-points/${point.id}`, { method: 'PATCH', body: { kind: point.kind, title: point.title, detail: point.detail, status: point.status === 'Offen' ? 'Geklaert' : 'Offen', artifactId: point.artifactId } }),
    onSuccess: () => refresh(),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/projects/${project.id}/open-points/${id}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
  })
  if (points.isLoading) return <Loading />
  if (points.isError) return <div className="p-6"><ErrorState error={points.error} onRetry={() => void points.refetch()} /></div>
  const rows = (points.data ?? []).filter((item) => filter === 'Alle' || item.status === 'Offen')
  return (
    <div className={shell()}>
      <PageHeader title="Offene Punkte" description="Annahmen, Risiken und Fragen, die die Planung noch blockieren." action={<Button type="button" variant={filter === 'Offen' ? 'primary' : 'secondary'} onClick={() => setFilter((value) => value === 'Offen' ? 'Alle' : 'Offen')}>{filter === 'Offen' ? 'Alle zeigen' : 'Nur offene'}</Button>} />
      {canWrite ? (
        <form className="grid gap-3 rounded-xl border border-line bg-card p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <Field label="Art"><Select aria-label="Art des Punkts" value={kind} onChange={(event) => setKind(event.target.value as OpenPointKind)}>{pointKinds.map((item) => <option key={item} value={item}>{pointLabel(item)}</option>)}</Select></Field>
          <Field label="Titel"><Input aria-label="Titel des Punkts" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
          <Field label="Beschreibung"><Textarea value={detail} onChange={(event) => setDetail(event.target.value)} /></Field>
          <Field label="Bezug">
            <Select aria-label="Bezug" value={artifactId} onChange={(event) => setArtifactId(event.target.value)}>
              <option value="">Ohne Bezug</option>
              {(requirements.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.key} {item.title}</option>)}
              {(components.data ?? []).map((item) => <option key={item.id} value={item.id}>Komponente · {item.name}</option>)}
            </Select>
          </Field>
          {create.isError ? <p role="alert" className="text-sm text-danger md:col-span-2">{errorText(create.error)}</p> : null}
          <Button type="submit" variant="primary" disabled={create.isPending || title.trim().length === 0}>Punkt festhalten</Button>
        </form>
      ) : null}
      {rows.length === 0 ? <EmptyState title={filter === 'Offen' ? 'Keine offenen Punkte' : 'Noch keine offenen Punkte'} body="Halte hier fest, was noch angenommen, riskant oder ungeklärt ist." /> : (
        <ul className="grid gap-3">
          {rows.map((item) => (
            <li key={item.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{pointLabel(item.kind)}</Badge>
                    <Badge>{item.status === 'Geklaert' ? 'Geklärt' : 'Offen'}</Badge>
                  </div>
                  <h2 className="mt-2 text-lg font-semibold">{item.title}</h2>
                  {item.detail ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{item.detail}</p> : null}
                  {item.artifactTitle ? <p className="mt-2 text-sm">Bezug: {item.artifactTitle}</p> : null}
                </div>
                {canWrite ? (
                  <div className="flex gap-2">
                    <Button type="button" disabled={update.isPending} onClick={() => update.mutate(item)}>{item.status === 'Offen' ? 'Als geklärt markieren' : 'Wieder öffnen'}</Button>
                    <Button type="button" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>Punkt entfernen</Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {update.isError || remove.isError ? <p role="alert" className="text-sm text-danger">{errorText(update.error ?? remove.error)}</p> : null}
    </div>
  )
}
