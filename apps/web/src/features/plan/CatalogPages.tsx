import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { Button, Field, Input, Select } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import type { Area, CatalogTable, DocumentListItem } from '../../lib/types'
import type { ProjectOutlet } from '../shell/Shell'

function blank(value: string) {
  return value.trim() ? value : 'Noch nicht erfasst'
}

export function CatalogPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tables = useQuery({
    queryKey: ['catalog', project.id, q],
    queryFn: () => api<CatalogTable[]>(`/api/v1/projects/${project.id}/catalog${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  })
  const areas = useQuery({ queryKey: ['areas', project.id], queryFn: () => api<Area[]>(`/api/v1/projects/${project.id}/areas`) })
  const documents = useQuery({ queryKey: ['documents', project.id], queryFn: () => api<DocumentListItem[]>(`/api/v1/projects/${project.id}/documents`) })
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [areaId, setAreaId] = useState('')
  const [documentId, setDocumentId] = useState('')
  const client = useQueryClient()
  const create = useMutation({
    mutationFn: () => api<CatalogTable>(`/api/v1/projects/${project.id}/catalog`, { method: 'POST', body: { name, purpose, sourceName, areaId: areaId || null, documentId: documentId || null } }),
    onSuccess: () => { setName(''); setPurpose(''); void client.invalidateQueries({ queryKey: ['catalog', project.id] }) },
  })
  const groups = new Map<string, CatalogTable[]>()
  for (const table of tables.data ?? []) {
    const key = table.areaName || table.sourceName || 'Ohne Gruppe'
    groups.set(key, [...(groups.get(key) ?? []), table])
  }
  return (
    <div className="grid w-full gap-4 px-4 py-6 md:px-6">
      <header>
        <h1 className="text-2xl font-semibold">Datenmodell</h1>
        <p className="text-sm text-muted">Tabellen aus den in SArch gepflegten Angaben. Eine Dokumentationsseite kann verknüpft werden, bevor Spalten erfasst sind.</p>
      </header>
      <Input aria-label="Tabellen suchen" placeholder="Tabelle, Beschreibung oder Spalte" value={q} onChange={(event) => {
        const next = new URLSearchParams(params)
        if (event.target.value) next.set('q', event.target.value)
        else next.delete('q')
        setParams(next)
      }} />
      {tables.isLoading ? <Loading /> : null}
      {tables.isError ? <ErrorState error={tables.error} onRetry={() => void tables.refetch()} /> : null}
      {tables.data?.length === 0 ? <EmptyState title={q ? 'Keine Treffer' : 'Noch keine Tabelle'} body={q ? 'Keine Tabelle oder Spalte enthält diesen Begriff.' : 'Verknüpfe eine vorhandene Tabellenseite oder lege einen Katalogeintrag an.'} /> : null}
      {[...groups.entries()].map(([group, items]) => (
        <section key={group}>
          <h2 className="text-sm font-semibold text-muted">{group}</h2>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-card">
            {items.map((table) => (
              <li key={table.id}>
                <Link className="block px-3 py-2 hover:bg-background" to={`/projekte/${project.id}/dokumente/katalog/${table.id}`}>
                  <span className="font-medium">{table.name}</span>
                  <span className="block truncate text-sm text-muted">{table.purpose || 'Noch nicht erfasst'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {canWrite ? (
        <form className="grid gap-3 rounded-xl border border-line bg-card p-4" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <h2 className="font-semibold">Tabelle verknüpfen</h2>
          <Field label="Tabellenname"><Input aria-label="Tabellenname" value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Zweck"><Input aria-label="Zweck" value={purpose} onChange={(event) => setPurpose(event.target.value)} /></Field>
          <Field label="Datenquelle"><Input aria-label="Datenquelle" value={sourceName} onChange={(event) => setSourceName(event.target.value)} /></Field>
          <Field label="Fachbereich">
            <Select aria-label="Fachbereich der Tabelle" value={areaId} onChange={(event) => setAreaId(event.target.value)}>
              <option value="">Ohne Bereich</option>
              {areas.data?.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </Select>
          </Field>
          <Field label="Dokumentationsseite">
            <Select aria-label="Dokumentationsseite" value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
              <option value="">Noch keine Seite</option>
              {documents.data?.filter((item) => item.kind === 'Page').map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </Select>
          </Field>
          <Button type="submit" variant="primary" disabled={create.isPending || name.trim().length === 0}>Im Katalog aufnehmen</Button>
          {create.isError ? <p role="alert" className="text-sm text-danger">{errorText(create.error)}</p> : null}
        </form>
      ) : null}
    </div>
  )
}

export function CatalogDetailPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const { tableId = '' } = useParams()
  const tables = useQuery({ queryKey: ['catalog', project.id, ''], queryFn: () => api<CatalogTable[]>(`/api/v1/projects/${project.id}/catalog`) })
  const client = useQueryClient()
  const [name, setName] = useState('')
  const [key, setKey] = useState(false)
  const [foreignId, setForeignId] = useState('')
  const table = tables.data?.find((item) => item.id === tableId)
  const add = useMutation({
    mutationFn: () => api(`/api/v1/projects/${project.id}/catalog/${tableId}/columns`, { method: 'POST', body: { name, isPrimaryKey: key, foreignTableId: foreignId || null, notes: '' } }),
    onSuccess: () => { setName(''); setKey(false); setForeignId(''); void client.invalidateQueries({ queryKey: ['catalog', project.id] }) },
  })
  if (tables.isLoading) return <Loading />
  if (tables.isError) return <div className="p-6"><ErrorState error={tables.error} onRetry={() => void tables.refetch()} /></div>
  if (!table) return <div className="p-6"><EmptyState title="Tabelle nicht gefunden" body="Der Katalogeintrag gehört nicht zu diesem Projekt." /></div>
  const keys = table.columns.filter((item) => item.isPrimaryKey)
  const foreign = table.columns.filter((item) => item.foreignTableId)
  return (
    <div className="grid w-full gap-4 px-4 py-6 md:px-6">
      <Link className="text-sm text-muted underline-offset-2 hover:underline" to={`/projekte/${project.id}/dokumente/katalog`}>Alle Tabellen</Link>
      <header>
        <h1 className="text-2xl font-semibold">{table.name}</h1>
        <p className="text-sm text-muted">{table.areaName || table.sourceName || 'Ohne Gruppe'}</p>
      </header>
      <dl className="grid gap-2 text-sm">
        <div><dt className="text-muted">Zweck</dt><dd>{blank(table.purpose)}</dd></div>
        <div><dt className="text-muted">Dokumentationsseite</dt><dd>{table.documentId ? <Link className="hover:text-accent" to={`/projekte/${project.id}/dokumente/${table.documentId}`}>{table.documentTitle}</Link> : 'Noch nicht erfasst'}</dd></div>
        <div><dt className="text-muted">Primärschlüssel</dt><dd>{keys.length > 0 ? keys.map((item) => item.name).join(', ') : 'Noch nicht erfasst'}</dd></div>
        <div><dt className="text-muted">Fremdschlüssel</dt><dd>{foreign.length > 0 ? foreign.map((item) => item.foreignTableId ? <Link key={item.id} className="mr-2 hover:text-accent" to={`/projekte/${project.id}/dokumente/katalog/${item.foreignTableId}`}>{item.name} → {item.foreignTableName}</Link> : null) : 'Noch nicht erfasst'}</dd></div>
      </dl>
      <section>
        <h2 className="font-semibold">Spalten</h2>
        {table.columns.length === 0 ? <p className="mt-1 text-sm text-muted">Noch nicht erfasst</p> : (
          <ul className="mt-2 divide-y divide-line">
            {table.columns.map((column) => (
              <li key={column.id} className="py-2 text-sm">
                <span className="font-medium">{column.name}</span>
                <span className="text-muted">{column.isPrimaryKey ? ' · Primärschlüssel' : ''}{column.foreignTableName ? ` · Fremdschlüssel auf ${column.foreignTableName}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {canWrite ? (
        <form className="grid gap-2 rounded-xl border border-line bg-card p-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); add.mutate() }}>
          <Field label="Spalte"><Input aria-label="Spaltenname" value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Fremdschlüssel">
            <Select aria-label="Referenzierte Tabelle" value={foreignId} onChange={(event) => setForeignId(event.target.value)}>
              <option value="">Keine Beziehung</option>
              {tables.data?.filter((item) => item.id !== table.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={key} onChange={(event) => setKey(event.target.checked)} /> Primärschlüssel</label>
          <Button type="submit" disabled={add.isPending || name.trim().length === 0}>Spalte speichern</Button>
          {add.isError ? <p role="alert" className="text-sm text-danger sm:col-span-2">{errorText(add.error)}</p> : null}
        </form>
      ) : null}
    </div>
  )
}
