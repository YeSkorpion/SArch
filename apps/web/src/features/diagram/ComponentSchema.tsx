import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Field, Input, Select, Textarea } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { cn } from '../../lib/cn'
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
  member: [string, string]
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
    member: ['Spalte', 'Spalten'],
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
    member: ['Parameter', 'Parameter'],
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
    member: ['Parameter', 'Parameter'],
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
    member: ['Feld', 'Felder'],
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
    member: ['Inhalt', 'Inhalte'],
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
    member: ['Datenfeld', 'Datenfelder'],
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
  const [query, setQuery] = useState('')
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const rows = sections.data ?? []
  const own = rows.filter((item) => item.kind === profile.sectionKind)
  const other = rows.filter((item) => item.kind !== profile.sectionKind)
  const term = query.trim().toLowerCase()
  const shown = own.flatMap((section) => {
    const hit = sectionMatch(section, term)
    return hit ? [{ section, columns: hit }] : []
  })
  const columnCount = own.reduce((sum, section) => sum + section.columns.length, 0)
  const everyOpen = own.length > 0 && own.every((section) => folded[section.id] === false)
  const error = create.error ?? update.error ?? remove.error ?? saveColumn.error ?? removeColumn.error
  useEffect(() => { setSubtitle(profile.subtitleOptions?.[0] ?? '') }, [profile])

  return (
    <section className="grid gap-4 rounded-xl border border-line bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{profile.heading}</h2>
          <p className="text-sm text-muted">{profile.intro}{own.length > 0 ? ` ${schemaCountLabel(kind, own.length)}, ${memberCount(profile, columnCount)}.` : ''}</p>
        </div>
        {canWrite ? <Button type="button" variant="primary" onClick={() => setOpen((value) => !value)}>{profile.add}</Button> : null}
      </div>
      {sections.isLoading ? <p className="text-sm text-muted">Wird geladen …</p> : null}
      {sections.isError ? <p role="alert" className="text-sm text-danger">{errorText(sections.error)}</p> : null}
      {open ? (
        <form className="grid gap-3 border-t border-line pt-4 md:grid-cols-2" onSubmit={(event) => {
          event.preventDefault()
          create.mutate({ kind: profile.sectionKind, title, subtitle: profile.subtitle ? subtitle : '', description }, { onSuccess: (saved) => {
            const created = saved.find((item) => item.kind === profile.sectionKind && !own.some((current) => current.id === item.id))
            setTitle('')
            setDescription('')
            setOpen(false)
            if (created) {
              setFolded((current) => ({ ...current, [created.id]: false }))
              setEditing(created.id)
            }
          } })
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
      {own.length > 1 || columnCount > 8 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="min-w-48 flex-1" aria-label={`${profile.heading} durchsuchen`} placeholder="Name, Spalte oder Notiz" value={query} onChange={(event) => setQuery(event.target.value)} />
          {own.length > 1 && !term ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setFolded(Object.fromEntries(own.map((section) => [section.id, everyOpen])))}>{everyOpen ? 'Alle einklappen' : 'Alle aufklappen'}</Button>
          ) : null}
        </div>
      ) : null}
      {own.length > 0 && shown.length === 0 ? <p className="text-sm text-muted">Keine Treffer.</p> : null}
      <div className="grid gap-3">
        {shown.map(({ section, columns }) => {
          const closed = term ? false : folded[section.id] !== false
          const preview = section.columns.slice(0, 6)
          return (
            <article key={section.id} className="overflow-hidden rounded-lg border border-line bg-background">
              <div className={cn('flex items-start gap-3 px-3 py-3', !closed && 'border-b border-line')}>
                <button className="flex min-w-0 flex-1 items-start gap-2 text-left" type="button" aria-expanded={!closed} onClick={() => {
                  setFolded((current) => ({ ...current, [section.id]: !closed }))
                  if (!closed) setEditing((current) => current === section.id ? null : current)
                }}>
                  <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-muted transition-transform', closed && '-rotate-90')} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {section.subtitle ? <span className="rounded-md bg-accent/12 px-1.5 py-0.5 text-xs font-medium text-accent">{section.subtitle}</span> : null}
                      <span className="font-semibold">{section.title}</span>
                    </span>
                    {section.description ? <span className="mt-0.5 line-clamp-1 block text-sm text-muted">{section.description}</span> : null}
                    {closed && preview.length > 0 ? (
                      <span className="mt-2 flex flex-wrap gap-1">
                        {preview.map((column) => (
                          <span key={column.id} className={cn('rounded-md border border-line bg-card px-1.5 py-0.5 text-xs text-muted', column.isKey && 'border-accent/40 text-foreground')} title={[column.dataType, column.role, column.required ? 'Pflicht' : '', column.isKey ? 'Schlüssel' : ''].filter(Boolean).join(' · ')}>{column.name}</span>
                        ))}
                        {section.columns.length > preview.length ? <span className="self-center text-xs text-muted">+{section.columns.length - preview.length}</span> : null}
                      </span>
                    ) : null}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2 pt-0.5">
                  {canWrite && !closed ? (
                    <Button type="button" variant="ghost" size="sm" aria-pressed={editing === section.id} onClick={() => setEditing((current) => current === section.id ? null : section.id)}>{editing === section.id ? 'Fertig' : 'Bearbeiten'}</Button>
                  ) : null}
                  <span className="text-xs tabular-nums text-muted">{memberCount(profile, section.columns.length)}</span>
                </div>
              </div>
              {closed ? null : (
                <div>
                  {editing === section.id ? <SectionHead section={section} profile={profile} pending={update.isPending || remove.isPending} onSave={(next) => update.mutate(next)} onRemove={() => remove.mutate(section.id)} /> : null}
                  {columns.length === 0 ? <p className="px-3 py-3 text-sm text-muted">{term ? 'Keine Treffer in diesem Eintrag.' : `Noch keine ${profile.member[1]}.`}</p> : (
                    <div>
                      <MemberHead profile={profile} />
                      <ul className="divide-y divide-line">
                        {columns.map((column) => (
                          <ColumnRow key={column.id} column={column} section={section} profile={profile} canWrite={canWrite} pending={saveColumn.isPending || removeColumn.isPending} onSave={(body) => saveColumn.mutate({ sectionId: section.id, column, body })} onRemove={() => removeColumn.mutate({ sectionId: section.id, columnId: column.id })} />
                        ))}
                      </ul>
                    </div>
                  )}
                  {canWrite ? <ColumnForm section={section} profile={profile} pending={saveColumn.isPending} onAdd={(body) => saveColumn.mutate({ sectionId: section.id, body })} /> : null}
                </div>
              )}
            </article>
          )
        })}
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

function SectionHead({ section, profile, pending, onSave, onRemove }: { section: SchemaSection; profile: Profile; pending: boolean; onSave: (section: SchemaSection) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState(section)
  useEffect(() => setDraft(section), [section])
  function commit() {
    if (draft.title.trim() && (draft.title !== section.title || draft.subtitle !== section.subtitle || draft.description !== section.description)) onSave(draft)
  }
  return (
    <div className="grid gap-3 border-b border-line bg-card/60 px-3 py-3 md:grid-cols-2" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit() }}>
      {profile.subtitleOptions ? (
        <Field label={profile.subtitle ?? 'Zusatz'}><Select aria-label={`${profile.subtitle} für ${section.title}`} value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}>{profile.subtitleOptions.map((item) => <option key={item}>{item}</option>)}</Select></Field>
      ) : null}
      <Field label={profile.title}><Input aria-label={`${profile.title} ${section.title}`} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
      {profile.subtitle && !profile.subtitleOptions ? <Field label={profile.subtitle}><Input aria-label={`${profile.subtitle} ${section.title}`} value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} /></Field> : null}
      <div className="md:col-span-2">
        <Field label={profile.description}><Textarea className="min-h-16" aria-label={`${profile.description} ${section.title}`} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
      </div>
      <div className="md:col-span-2">
        <Button type="button" variant="ghost" disabled={pending} onClick={onRemove}>{profile.remove}</Button>
      </div>
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
    return (
      <li className={cn('grid items-start gap-2 px-3 py-2.5 text-sm', trackClass(profile))}>
        <div className="min-w-0">
          <p className={cn('font-medium', profile.sectionKind === 'Table' && 'font-mono text-[13px]')}>{column.name}</p>
          {column.notes ? <p className="mt-0.5 text-muted">{column.notes}</p> : null}
        </div>
        <p className="font-mono text-[13px] text-muted">{column.dataType}</p>
        {profile.roles.length > 0 ? <p>{column.role}</p> : null}
        {profile.showRequired ? <p className="text-muted">{column.required ? 'Pflicht' : ''}</p> : null}
        {profile.showKey ? <p className="text-muted">{column.isKey ? 'Schlüssel' : ''}</p> : null}
      </li>
    )
  }
  return (
    <li className="px-3 py-2" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit() }}>
      <div className={cn('grid items-start gap-2', trackClass(profile))}>
        <div className="grid min-w-0 gap-1">
          <Input className={cn(cell, profile.sectionKind === 'Table' && 'font-mono text-[13px]')} aria-label={`${profile.member[1]} ${scope}`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <Input className={cn(cell, 'text-muted', draft.notes ? '' : 'border-transparent bg-transparent hover:border-line focus:border-line focus:bg-card')} aria-label={`Notiz ${scope} ${column.name}`} value={draft.notes} placeholder="Notiz" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </div>
        {profile.typeOptions ? <Select className={cell} aria-label={`${profile.typeLabel} ${scope} ${column.name}`} value={draft.dataType} onChange={(event) => setDraft({ ...draft, dataType: event.target.value })}>{profile.typeOptions.map((item) => <option key={item}>{item}</option>)}</Select> : <Input className={cn(cell, 'font-mono text-[13px]')} aria-label={`${profile.typeLabel} ${scope} ${column.name}`} placeholder="TEXT" value={draft.dataType} onChange={(event) => setDraft({ ...draft, dataType: event.target.value })} />}
        {profile.roles.length > 0 ? <Select className={cell} aria-label={`Rolle ${scope} ${column.name}`} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}>{profile.roles.map((item) => <option key={item}>{item}</option>)}</Select> : null}
        {profile.showRequired ? <Flag label="Pflicht" checked={draft.required} onChange={(required) => setDraft({ ...draft, required })} /> : null}
        {profile.showKey ? <Flag label="Schlüssel" checked={draft.isKey} onChange={(isKey) => setDraft({ ...draft, isKey })} /> : null}
        <Button className="size-8 justify-self-end px-0" type="button" variant="ghost" size="sm" aria-label={profile.memberRemove} title={profile.memberRemove} disabled={pending} onClick={onRemove}><Trash2 className="size-4" aria-hidden="true" /></Button>
      </div>
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
    <form className="grid gap-2 border-t border-dashed border-line px-3 py-3" onSubmit={(event) => {
      event.preventDefault()
      onAdd({ name, dataType, required, isKey, role: profile.roles.length ? role : '', notes })
      setName('')
      setNotes('')
      setIsKey(false)
    }}>
      <div className={cn('grid items-start gap-2', trackClass(profile))}>
        <div className="grid min-w-0 gap-1">
          <Input className={cell} aria-label={`Neu ${profile.member[1]} ${scope}`} placeholder={profile.member[0]} value={name} onChange={(event) => setName(event.target.value)} />
          <Input className={cn(cell, 'text-muted')} aria-label={`Neu Notiz ${scope}`} placeholder="Notiz" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        {profile.typeOptions ? <Select className={cell} aria-label={`Neu ${profile.typeLabel} ${scope}`} value={dataType} onChange={(event) => setDataType(event.target.value)}>{profile.typeOptions.map((item) => <option key={item}>{item}</option>)}</Select> : <Input className={cn(cell, 'font-mono text-[13px]')} aria-label={`Neu ${profile.typeLabel} ${scope}`} placeholder={profile.typeLabel} value={dataType} onChange={(event) => setDataType(event.target.value)} />}
        {profile.roles.length > 0 ? <Select className={cell} aria-label={`Neu Rolle ${scope}`} value={role} onChange={(event) => setRole(event.target.value)}>{profile.roles.map((item) => <option key={item}>{item}</option>)}</Select> : null}
        {profile.showRequired ? <Flag label="Pflicht" checked={required} onChange={setRequired} /> : null}
        {profile.showKey ? <Flag label="Schlüssel" checked={isKey} onChange={setIsKey} /> : null}
        <span />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || name.trim().length === 0}>{profile.memberAdd}</Button>
      </div>
    </form>
  )
}

function MemberHead({ profile }: { profile: Profile }) {
  return (
    <div className={cn('hidden items-center gap-2 px-3 pt-2 text-xs font-medium text-muted md:grid', trackClass(profile))}>
      <span>Name</span>
      <span>{profile.typeLabel}</span>
      {profile.roles.length > 0 ? <span>Rolle</span> : null}
      {profile.showRequired ? <span>Pflicht</span> : null}
      {profile.showKey ? <span>Schlüssel</span> : null}
      <span />
    </div>
  )
}

function Flag({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-8 items-center justify-center gap-1.5 text-sm md:justify-start" title={label}>
      <input className="size-4 accent-accent" type="checkbox" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="md:sr-only">{label}</span>
    </label>
  )
}

const cell = 'h-8'

function trackClass(profile: Profile) {
  if (profile.roles.length > 0 && profile.showRequired) return 'md:grid-cols-[minmax(0,1.5fr)_7rem_7.5rem_4.25rem_2rem]'
  if (profile.showKey && profile.showRequired) return 'md:grid-cols-[minmax(0,1.5fr)_7rem_4.25rem_5.25rem_2rem]'
  if (profile.showRequired) return 'md:grid-cols-[minmax(0,1.5fr)_7rem_4.25rem_2rem]'
  return 'md:grid-cols-[minmax(0,1.5fr)_8rem_2rem]'
}

function memberCount(profile: Profile, count: number) {
  return `${count} ${count === 1 ? profile.member[0] : profile.member[1]}`
}

function sectionMatch(section: SchemaSection, term: string) {
  if (!term) return section.columns
  const head = `${section.title} ${section.subtitle} ${section.description}`.toLowerCase().includes(term)
  if (head) return section.columns
  const columns = section.columns.filter((column) => `${column.name} ${column.dataType} ${column.role} ${column.notes}`.toLowerCase().includes(term))
  return columns.length > 0 ? columns : null
}

function columnPath(projectId: string, componentId: string, sectionId: string, columnId?: string) {
  const base = `/api/v1/projects/${projectId}/components/${componentId}/sections/${sectionId}/columns`
  return columnId ? `${base}/${columnId}` : base
}
