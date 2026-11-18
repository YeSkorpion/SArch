import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button, Field, Input, Select, Textarea } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import type { ComponentKind, SchemaColumn, SchemaSection, SchemaSectionKind } from '../../lib/types'

type Profile = {
  sectionKind: SchemaSectionKind
  heading: string
  intro: string
  empty: string
  add: string
  remove: string
  title: string
  subtitle: string | null
  subtitleOptions: string[] | null
  description: string
  members: string
  memberAdd: string
  memberRemove: string
  showRequired: boolean
  showKey: boolean
  roles: string[]
  typeLabel: string
  typeOptions: string[] | null
  noun: [string, string]
}

const profiles: Record<ComponentKind, Profile> = {
  Database: {
    sectionKind: 'Table',
    heading: 'Schema',
    intro: 'Tabellen und Spalten dieser Datenbank.',
    empty: 'Noch keine Tabellen.',
    add: 'Tabelle anlegen',
    remove: 'Tabelle entfernen',
    title: 'Tabellenname',
    subtitle: null,
    subtitleOptions: null,
    description: 'Beschreibung',
    members: 'Spalten',
    memberAdd: 'Spalte hinzufügen',
    memberRemove: 'Spalte entfernen',
    showRequired: true,
    showKey: true,
    roles: [],
    typeLabel: 'Typ',
    typeOptions: null,
    noun: ['Tabelle', 'Tabellen'],
  },
  Api: {
    sectionKind: 'Endpoint',
    heading: 'Endpunkte',
    intro: 'Pfade, Methoden und Parameter dieser API.',
    empty: 'Noch keine Endpunkte.',
    add: 'Endpunkt anlegen',
    remove: 'Endpunkt entfernen',
    title: 'Pfad',
    subtitle: 'Methode',
    subtitleOptions: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    description: 'Beschreibung',
    members: 'Parameter',
    memberAdd: 'Parameter hinzufügen',
    memberRemove: 'Parameter entfernen',
    showRequired: true,
    showKey: false,
    roles: ['Pfad', 'Query', 'Header', 'Body'],
    typeLabel: 'Typ',
    typeOptions: null,
    noun: ['Endpunkt', 'Endpunkte'],
  },
  Service: {
    sectionKind: 'Operation',
    heading: 'Operationen',
    intro: 'Aufrufe dieses Service mit Eingabe und Ausgabe.',
    empty: 'Noch keine Operationen.',
    add: 'Operation anlegen',
    remove: 'Operation entfernen',
    title: 'Name',
    subtitle: null,
    subtitleOptions: null,
    description: 'Beschreibung',
    members: 'Parameter',
    memberAdd: 'Parameter hinzufügen',
    memberRemove: 'Parameter entfernen',
    showRequired: true,
    showKey: false,
    roles: ['Eingabe', 'Ausgabe'],
    typeLabel: 'Typ',
    typeOptions: null,
    noun: ['Operation', 'Operationen'],
  },
  Queue: {
    sectionKind: 'Message',
    heading: 'Nachrichten',
    intro: 'Nachrichten auf dieser Queue und ihre Felder.',
    empty: 'Noch keine Nachrichten.',
    add: 'Nachricht anlegen',
    remove: 'Nachricht entfernen',
    title: 'Name',
    subtitle: null,
    subtitleOptions: null,
    description: 'Beschreibung',
    members: 'Felder',
    memberAdd: 'Feld hinzufügen',
    memberRemove: 'Feld entfernen',
    showRequired: true,
    showKey: false,
    roles: [],
    typeLabel: 'Typ',
    typeOptions: null,
    noun: ['Nachricht', 'Nachrichten'],
  },
  Client: {
    sectionKind: 'View',
    heading: 'Ansichten',
    intro: 'Oberflächen dieses Clients und was darauf zu sehen ist.',
    empty: 'Noch keine Ansichten.',
    add: 'Ansicht anlegen',
    remove: 'Ansicht entfernen',
    title: 'Name',
    subtitle: 'Route',
    subtitleOptions: null,
    description: 'Zweck',
    members: 'Inhalte',
    memberAdd: 'Inhalt hinzufügen',
    memberRemove: 'Inhalt entfernen',
    showRequired: false,
    showKey: false,
    roles: [],
    typeLabel: 'Art',
    typeOptions: ['Text', 'Eingabe', 'Aktion', 'Liste', 'Bild'],
    noun: ['Ansicht', 'Ansichten'],
  },
  External: {
    sectionKind: 'Integration',
    heading: 'Anbindungen',
    intro: 'Schnittstellen des externen Systems und die Daten, die sie austauschen.',
    empty: 'Noch keine Anbindungen.',
    add: 'Anbindung anlegen',
    remove: 'Anbindung entfernen',
    title: 'Name',
    subtitle: 'Protokoll',
    subtitleOptions: null,
    description: 'Beschreibung',
    members: 'Daten',
    memberAdd: 'Datenfeld hinzufügen',
    memberRemove: 'Datenfeld entfernen',
    showRequired: true,
    showKey: false,
    roles: ['Eingabe', 'Ausgabe'],
    typeLabel: 'Typ',
    typeOptions: null,
    noun: ['Anbindung', 'Anbindungen'],
  },
}

export function schemaCountLabel(kind: ComponentKind, count: number) {
  const noun = profiles[kind].noun
  return `${count} ${count === 1 ? noun[0] : noun[1]}`
}

const otherLabel: Record<SchemaSectionKind, string> = {
  Table: 'Tabelle',
  Endpoint: 'Endpunkt',
  Operation: 'Operation',
  Message: 'Nachricht',
  View: 'Ansicht',
  Integration: 'Anbindung',
}

export function ComponentSchema({ projectId, componentId, kind, canWrite }: { projectId: string; componentId: string; kind: ComponentKind; canWrite: boolean }) {
  const profile = profiles[kind]
  const client = useQueryClient()
  const sections = useQuery({
    queryKey: ['component-sections', projectId, componentId],
    queryFn: () => api<SchemaSection[]>(`/api/v1/projects/${projectId}/components/${componentId}/sections`),
  })
  const refresh = (saved: SchemaSection[]) => {
    client.setQueryData(['component-sections', projectId, componentId], saved)
    void client.invalidateQueries({ queryKey: ['components', projectId] })
    void client.invalidateQueries({ queryKey: ['component', projectId, componentId] })
  }
  const create = useMutation({
    mutationFn: (body: { kind: SchemaSectionKind; title: string; subtitle: string; description: string }) =>
      api<SchemaSection[]>(`/api/v1/projects/${projectId}/components/${componentId}/sections`, { method: 'POST', body }),
    onSuccess: refresh,
  })
  const update = useMutation({
    mutationFn: (section: SchemaSection) => api<SchemaSection[]>(`/api/v1/projects/${projectId}/components/${componentId}/sections/${section.id}`, {
      method: 'PATCH',
      body: { kind: section.kind, title: section.title, subtitle: section.subtitle, description: section.description },
    }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (sectionId: string) => api<SchemaSection[]>(`/api/v1/projects/${projectId}/components/${componentId}/sections/${sectionId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  })
  const saveColumn = useMutation({
    mutationFn: (input: { sectionId: string; column?: SchemaColumn; body: ColumnBody }) => api<SchemaSection[]>(columnPath(projectId, componentId, input.sectionId, input.column?.id), {
      method: input.column ? 'PATCH' : 'POST',
      body: input.body,
    }),
    onSuccess: refresh,
  })
  const removeColumn = useMutation({
    mutationFn: (input: { sectionId: string; columnId: string }) => api<SchemaSection[]>(columnPath(projectId, componentId, input.sectionId, input.columnId), { method: 'DELETE' }),
    onSuccess: refresh,
  })
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState(profile.subtitleOptions?.[0] ?? '')
  const [description, setDescription] = useState('')
  const rows = sections.data ?? []
  const own = rows.filter((item) => item.kind === profile.sectionKind)
  const other = rows.filter((item) => item.kind !== profile.sectionKind)
  const error = create.error ?? update.error ?? remove.error ?? saveColumn.error ?? removeColumn.error
  useEffect(() => { setSubtitle(profile.subtitleOptions?.[0] ?? '') }, [profile])

  return (
    <section className="grid gap-4 rounded-xl border border-line bg-card p-4 md:p-5 xl:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{profile.heading}</h2>
          <p className="text-sm text-muted">{profile.intro}</p>
        </div>
        {canWrite ? <Button type="button" variant="primary" onClick={() => setOpen((value) => !value)}>{profile.add}</Button> : null}
      </div>
      {sections.isLoading ? <p className="text-sm text-muted">Wird geladen …</p> : null}
      {sections.isError ? <p role="alert" className="text-sm text-danger">{errorText(sections.error)}</p> : null}
      {open ? (
        <form className="grid gap-3 border-t border-line pt-4 md:grid-cols-2" onSubmit={(event) => {
          event.preventDefault()
          create.mutate({ kind: profile.sectionKind, title, subtitle: profile.subtitle ? subtitle : '', description }, { onSuccess: () => { setTitle(''); setDescription(''); setOpen(false) } })
        }}>
          {profile.subtitleOptions ? (
            <Field label={profile.subtitle ?? 'Zusatz'}><Select aria-label={profile.subtitle ?? 'Zusatz'} value={subtitle} onChange={(event) => setSubtitle(event.target.value)}>{profile.subtitleOptions.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          ) : null}
          <Field label={profile.title}><Input aria-label={`${profile.heading} ${profile.title}`} value={title} placeholder={kind === 'Api' ? '/bestellungen/{id}' : kind === 'Database' ? 'orders' : ''} onChange={(event) => setTitle(event.target.value)} /></Field>
          {profile.subtitle && !profile.subtitleOptions ? <Field label={profile.subtitle}><Input aria-label={`${profile.heading} ${profile.subtitle}`} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></Field> : null}
          <Field label={profile.description}><Textarea className="min-h-16" aria-label={`${profile.heading} ${profile.description}`} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          <Button className="self-end" type="submit" variant="primary" disabled={create.isPending || title.trim().length === 0}>Hinzufügen</Button>
        </form>
      ) : null}
      {own.length === 0 && !sections.isLoading ? <p className="text-sm text-muted">{profile.empty}</p> : null}
      <div className="grid gap-3">
        {own.map((section) => (
          <article key={section.id} className="rounded-lg border border-line bg-background p-3">
            <SectionHead section={section} profile={profile} canWrite={canWrite} pending={update.isPending || remove.isPending} onSave={(next) => update.mutate(next)} onRemove={() => remove.mutate(section.id)} />
            <h3 className="mt-3 text-xs font-medium text-muted">{profile.members}</h3>
            {section.columns.length === 0 ? <p className="mt-1 text-sm text-muted">Noch keine {profile.members}.</p> : (
              <ul className="mt-2 divide-y divide-line">
                {section.columns.map((column) => (
                  <ColumnRow key={column.id} column={column} section={section} profile={profile} canWrite={canWrite} pending={saveColumn.isPending || removeColumn.isPending} onSave={(body) => saveColumn.mutate({ sectionId: section.id, column, body })} onRemove={() => removeColumn.mutate({ sectionId: section.id, columnId: column.id })} />
                ))}
              </ul>
            )}
            {canWrite ? <ColumnForm section={section} profile={profile} pending={saveColumn.isPending} onAdd={(body) => saveColumn.mutate({ sectionId: section.id, body })} /> : null}
          </article>
        ))}
      </div>
      {other.length > 0 ? (
        <div className="grid gap-2 border-t border-line pt-3">
          <h3 className="text-sm font-medium">Details einer anderen Art</h3>
          <ul className="grid gap-1">
            {other.map((section) => (
              <li key={section.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{otherLabel[section.kind]} · {section.subtitle ? `${section.subtitle} ` : ''}{section.title}</span>
                {canWrite ? <Button type="button" variant="ghost" onClick={() => remove.mutate(section.id)}>Eintrag entfernen</Button> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-danger">{errorText(error)}</p> : null}
    </section>
  )
}

function SectionHead({ section, profile, canWrite, pending, onSave, onRemove }: { section: SchemaSection; profile: Profile; canWrite: boolean; pending: boolean; onSave: (section: SchemaSection) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState(section)
  useEffect(() => setDraft(section), [section])
  function commit() {
    if (draft.title.trim() && (draft.title !== section.title || draft.subtitle !== section.subtitle || draft.description !== section.description)) onSave(draft)
  }
  if (!canWrite) {
    return (
      <div>
        <h3 className="font-semibold">{section.subtitle ? `${section.subtitle} ${section.title}` : section.title}</h3>
        {section.description ? <p className="text-sm text-muted">{section.description}</p> : null}
      </div>
    )
  }
  return (
    <div className="grid gap-2" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit() }}>
      <div className="flex flex-wrap items-center gap-2">
        {profile.subtitleOptions ? <Select className="studio-inline" aria-label={`${profile.subtitle} für ${section.title}`} value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}>{profile.subtitleOptions.map((item) => <option key={item}>{item}</option>)}</Select> : null}
        <Input className="min-w-40 flex-1" aria-label={`${profile.title} ${section.title}`} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        {profile.subtitle && !profile.subtitleOptions ? <Input className="min-w-32 flex-1" aria-label={`${profile.subtitle} ${section.title}`} value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} /> : null}
        <Button type="button" variant="ghost" disabled={pending} onClick={onRemove}>{profile.remove}</Button>
      </div>
      <Textarea className="min-h-16" aria-label={`${profile.description} ${section.title}`} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
    </div>
  )
}

type ColumnBody = { name: string; dataType: string; required: boolean; isKey: boolean; role: string; notes: string }

function ColumnRow({ column, section, profile, canWrite, pending, onSave, onRemove }: { column: SchemaColumn; section: SchemaSection; profile: Profile; canWrite: boolean; pending: boolean; onSave: (body: ColumnBody) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState(column)
  useEffect(() => setDraft(column), [column])
  const scope = section.subtitle ? `${section.subtitle} ${section.title}` : section.title
  function commit() {
    if (draft.name.trim() && (draft.name !== column.name || draft.dataType !== column.dataType || draft.required !== column.required || draft.isKey !== column.isKey || draft.role !== column.role || draft.notes !== column.notes)) {
      onSave({ name: draft.name, dataType: draft.dataType, required: draft.required, isKey: draft.isKey, role: draft.role, notes: draft.notes })
    }
  }
  if (!canWrite) {
    return <li className="py-2 text-sm">{column.name} <span className="text-muted">{[column.role, column.dataType, column.required ? 'Pflicht' : '', column.isKey ? 'Schlüssel' : ''].filter(Boolean).join(' · ')}</span></li>
  }
  return (
    <li className="grid gap-2 py-2 md:grid-cols-[1fr_8rem_8rem_auto_auto_1fr_auto] md:items-center" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit() }}>
      <Input aria-label={`${profile.members} ${scope}`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      {profile.typeOptions ? <Select aria-label={`${profile.typeLabel} ${scope} ${column.name}`} value={draft.dataType} onChange={(event) => setDraft({ ...draft, dataType: event.target.value })}>{profile.typeOptions.map((item) => <option key={item}>{item}</option>)}</Select> : <Input aria-label={`${profile.typeLabel} ${scope} ${column.name}`} placeholder="uuid, text, timestamptz" value={draft.dataType} onChange={(event) => setDraft({ ...draft, dataType: event.target.value })} />}
      {profile.roles.length > 0 ? <Select aria-label={`Rolle ${scope} ${column.name}`} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}>{profile.roles.map((item) => <option key={item}>{item}</option>)}</Select> : <span className="hidden md:block" />}
      {profile.showRequired ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.required} onChange={(event) => setDraft({ ...draft, required: event.target.checked })} />Pflicht</label> : <span className="hidden md:block" />}
      {profile.showKey ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isKey} onChange={(event) => setDraft({ ...draft, isKey: event.target.checked })} />Schlüssel</label> : <span className="hidden md:block" />}
      <Input aria-label={`Notiz ${scope} ${column.name}`} value={draft.notes} placeholder="Notiz" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      <Button type="button" variant="ghost" disabled={pending} onClick={onRemove}>{profile.memberRemove}</Button>
    </li>
  )
}

function ColumnForm({ section, profile, pending, onAdd }: { section: SchemaSection; profile: Profile; pending: boolean; onAdd: (body: ColumnBody) => void }) {
  const [name, setName] = useState('')
  const [dataType, setDataType] = useState(profile.typeOptions?.[0] ?? '')
  const [required, setRequired] = useState(profile.showRequired)
  const [isKey, setIsKey] = useState(false)
  const [role, setRole] = useState(profile.roles[0] ?? '')
  const [notes, setNotes] = useState('')
  const scope = section.subtitle ? `${section.subtitle} ${section.title}` : section.title
  return (
    <form className="mt-3 grid gap-2 border-t border-line pt-3 md:grid-cols-[1fr_8rem_8rem_auto_auto_1fr_auto] md:items-end" onSubmit={(event) => {
      event.preventDefault()
      onAdd({ name, dataType, required, isKey, role: profile.roles.length ? role : '', notes })
      setName('')
      setNotes('')
      setIsKey(false)
    }}>
      <Field label={profile.members}><Input aria-label={`Neu ${profile.members} ${scope}`} value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label={profile.typeLabel}>{profile.typeOptions ? <Select aria-label={`Neu ${profile.typeLabel} ${scope}`} value={dataType} onChange={(event) => setDataType(event.target.value)}>{profile.typeOptions.map((item) => <option key={item}>{item}</option>)}</Select> : <Input aria-label={`Neu ${profile.typeLabel} ${scope}`} placeholder="text" value={dataType} onChange={(event) => setDataType(event.target.value)} />}</Field>
      {profile.roles.length > 0 ? <Field label="Rolle"><Select aria-label={`Neu Rolle ${scope}`} value={role} onChange={(event) => setRole(event.target.value)}>{profile.roles.map((item) => <option key={item}>{item}</option>)}</Select></Field> : <span className="hidden md:block" />}
      {profile.showRequired ? <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />Pflicht</label> : <span className="hidden md:block" />}
      {profile.showKey ? <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={isKey} onChange={(event) => setIsKey(event.target.checked)} />Schlüssel</label> : <span className="hidden md:block" />}
      <Field label="Notiz"><Input aria-label={`Neu Notiz ${scope}`} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      <Button type="submit" disabled={pending || name.trim().length === 0}>{profile.memberAdd}</Button>
    </form>
  )
}

function columnPath(projectId: string, componentId: string, sectionId: string, columnId?: string) {
  const base = `/api/v1/projects/${projectId}/components/${componentId}/sections/${sectionId}/columns`
  return columnId ? `${base}/${columnId}` : base
}
