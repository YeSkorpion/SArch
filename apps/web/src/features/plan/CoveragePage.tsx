import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { Badge, Button, Field, Input, PageHeader, Select } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { requirementStatusLabel } from '../../lib/labels'
import type { Area, CoverageCell, CoverageRef, CoverageResult, CoverageState, RequirementStatus } from '../../lib/types'
import type { ProjectOutlet } from '../shell/Shell'

const statuses: RequirementStatus[] = ['Offen', 'InBearbeitung', 'Erledigt', 'Zurueckgestellt']
const gaps = [
  ['process', 'Prozess fehlt'],
  ['screen', 'Screen fehlt'],
  ['component', 'Komponente fehlt'],
  ['decision', 'Entscheidung fehlt'],
] as const

const columns = [
  ['process', 'Prozess'],
  ['screen', 'Screen'],
  ['component', 'Komponente'],
  ['decision', 'Entscheidung'],
] as const

function mark(state: CoverageState) {
  if (state === 'Zugeordnet') return { symbol: '✓', label: 'Zugeordnet' }
  if (state === 'NichtErforderlich') return { symbol: '○', label: 'Nicht erforderlich' }
  return { symbol: '–', label: 'Fehlt' }
}

export function CoveragePage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const [params, setParams] = useSearchParams()
  const bereich = params.get('bereich') ?? ''
  const status = params.get('status') ?? ''
  const fehlt = params.get('fehlt') ?? ''
  const seite = Math.max(1, Number(params.get('seite') ?? '1') || 1)
  const areas = useQuery({ queryKey: ['areas', project.id], queryFn: () => api<Area[]>(`/api/v1/projects/${project.id}/areas`) })
  const query = new URLSearchParams()
  if (bereich) query.set('bereich', bereich)
  if (status) query.set('status', status)
  if (fehlt) query.set('fehlt', fehlt)
  query.set('page', String(seite))
  const coverage = useQuery({
    queryKey: ['coverage', project.id, bereich, status, fehlt, seite],
    queryFn: () => api<CoverageResult>(`/api/v1/projects/${project.id}/coverage?${query}`),
  })
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'seite') next.delete('seite')
    setParams(next)
  }
  if (coverage.isLoading) return <Loading />
  if (coverage.isError) return <div className="p-6"><ErrorState error={coverage.error} onRetry={() => void coverage.refetch()} /></div>
  const data = coverage.data!
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize))
  const returnTo = new URLSearchParams()
  returnTo.set('von', 'abdeckung')
  if (bereich) returnTo.set('bereich', bereich)
  if (status) returnTo.set('status', status)
  if (fehlt) returnTo.set('fehlt', fehlt)
  if (seite > 1) returnTo.set('seite', String(seite))
  return (
    <div className="grid w-full gap-4 px-4 py-6 md:px-6">
      <PageHeader
        title="Planungsabdeckung"
        description="Jede Anforderung mit Prozess, Screen, Komponente und Entscheidung. Eine vorhandene Zuordnung gilt vor einer Ausnahme."
      />
      <div className="flex flex-wrap items-end gap-2">
        <Select className="studio-inline" aria-label="Fachbereich" value={bereich} onChange={(event) => setFilter('bereich', event.target.value)}>
          <option value="">Alle Fachbereiche</option>
          {areas.data?.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
        </Select>
        <Select className="studio-inline" aria-label="Anforderungsstatus" value={status} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">Alle Status</option>
          {statuses.map((item) => <option key={item} value={item}>{requirementStatusLabel(item)}</option>)}
        </Select>
        <Select className="studio-inline" aria-label="Fehlende Zuordnung" value={fehlt} onChange={(event) => setFilter('fehlt', event.target.value)}>
          <option value="">Alle Zuordnungen</option>
          {gaps.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>
      <p className="text-sm text-muted">
        Im gefilterten Bestand fehlen {data.processMissing} Prozesse, {data.screenMissing} Screens, {data.componentMissing} Komponenten und {data.decisionMissing} Entscheidungen.
      </p>
      {data.total === 0 ? (
        <EmptyState title={fehlt ? 'Keine Treffer für diese Filter' : 'Keine Anforderungen'} body={fehlt ? 'Für diese Filter fehlt keine Zuordnung.' : 'Für diesen Bereich und Status gibt es keine Anforderungen.'} />
      ) : (
        <div className="grid gap-3">
          {data.items.map((row) => (
            <article key={row.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link className="font-medium hover:text-accent" to={`/projekte/${project.id}/anforderungen/${row.id}?${returnTo}`}>{row.key} {row.title}</Link>
                <Badge>{requirementStatusLabel(row.status)}</Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                {columns.map(([key, title]) => (
                  <CoverageSlot
                    key={key}
                    projectId={project.id}
                    requirementId={row.id}
                    kind={key}
                    title={title}
                    cell={row[key]}
                    canWrite={canWrite}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <Button type="button" disabled={seite <= 1} onClick={() => setFilter('seite', String(seite - 1))}>Zurück</Button>
          <span className="text-sm text-muted">Seite {seite} von {pages}</span>
          <Button type="button" disabled={seite >= pages} onClick={() => setFilter('seite', String(seite + 1))}>Weiter</Button>
        </div>
      ) : null}
    </div>
  )
}

function CoverageSlot({ projectId, requirementId, kind, title, cell, canWrite }: { projectId: string; requirementId: string; kind: string; title: string; cell: CoverageCell; canWrite: boolean }) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState(cell.waiver?.reason ?? '')
  const save = useMutation({
    mutationFn: () => api(`/api/v1/projects/${projectId}/requirements/${requirementId}/coverage/${kind}`, { method: 'PUT', body: { reason } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['coverage', projectId] }),
  })
  const remove = useMutation({
    mutationFn: () => api(`/api/v1/projects/${projectId}/requirements/${requirementId}/coverage/${kind}`, { method: 'DELETE' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['coverage', projectId] }),
  })
  const shown = mark(cell.state)
  const count = cell.direct.length
  return (
    <div>
      <h2 className="text-xs font-medium text-muted">{title}</h2>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <span aria-hidden="true">{shown.symbol}</span>
        <span>{shown.label}</span>
        {count > 1 ? (
          <button className="underline-offset-2 hover:underline" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{count}</button>
        ) : null}
      </p>
      {count === 1 ? <AssignmentList projectId={projectId} kind={kind} items={cell.direct} /> : null}
      {count > 1 && open ? <AssignmentList projectId={projectId} kind={kind} items={cell.direct} /> : null}
      {cell.indirect.length > 0 ? (
        <ul className="mt-1 grid gap-1">
          {cell.indirect.map((item) => (
            <li key={item.id} className="text-xs text-muted">
              <Assignment projectId={projectId} kind={kind} item={item} />
              {item.path ? <span className="block">{item.path}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {cell.waiver?.superseded ? <p className="mt-1 text-xs text-muted">Eine Zuordnung ist vorhanden und gilt vor dieser Ausnahme.</p> : null}
      {cell.waiver && !cell.waiver.superseded ? <p className="mt-1 text-xs text-muted">{cell.waiver.reason} · {cell.waiver.authorName}</p> : null}
      {canWrite && cell.waiver ? <Button className="mt-2" size="sm" type="button" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>Ausnahme zurücknehmen</Button> : null}
      {canWrite && !cell.waiver && !editing ? <button className="mt-2 text-xs text-muted underline-offset-2 hover:underline" type="button" onClick={() => setEditing(true)}>Nicht erforderlich</button> : null}
      {canWrite && !cell.waiver && editing ? (
        <form className="mt-2 grid gap-1" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
          <Field label="Begründung"><Input aria-label={`Begründung ${title}`} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
          <Button size="sm" type="submit" disabled={save.isPending || reason.trim().length === 0}>Nicht erforderlich</Button>
        </form>
      ) : null}
      {save.isError || remove.isError ? <p role="alert" className="text-xs text-danger">{errorText(save.error ?? remove.error)}</p> : null}
    </div>
  )
}

function AssignmentList({ projectId, kind, items }: { projectId: string; kind: string; items: CoverageRef[] }) {
  return (
    <ul className="mt-1 grid gap-1">
      {items.map((item) => <li key={item.id}><Assignment projectId={projectId} kind={kind} item={item} /></li>)}
    </ul>
  )
}

function Assignment({ projectId, kind, item }: { projectId: string; kind: string; item: CoverageRef }) {
  const href = kind === 'process' && item.diagramId
    ? `/projekte/${projectId}/diagramme/${item.diagramId}?node=${item.id}`
    : kind === 'screen'
      ? `/projekte/${projectId}/ui/${item.id}`
      : kind === 'component'
        ? `/projekte/${projectId}/system/komponenten/${item.id}`
        : `/projekte/${projectId}/dokumente/${item.id}`
  return <Link className="text-sm hover:text-accent" to={href}>{item.title}</Link>
}
