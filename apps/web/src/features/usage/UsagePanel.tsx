import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { Select } from '../../components/ui'
import { api } from '../../lib/api'
import { artifactHref, searchTypeLabel } from '../../lib/labels'
import type { Area, ArtifactReviewComment, Usage, UsageHit } from '../../lib/types'

const types = ['', 'requirement', 'node', 'screen', 'component', 'decision', 'document', 'process', 'system']

export function UsagePanel({ projectId, artifactId, title, heading = true }: { projectId: string; artifactId: string; title: string; heading?: boolean }) {
  const areas = useQuery({ queryKey: ['areas', projectId], queryFn: () => api<Area[]>(`/api/v1/projects/${projectId}/areas`) })
  const [type, setType] = useState('')
  const [area, setArea] = useState('')
  return (
    <section className="grid gap-3 border-t border-line pt-3">
      {heading ? <h2 className="text-sm font-semibold">Auswirkungen</h2> : null}
      <div className="flex flex-wrap gap-2">
        <Select className="studio-inline" aria-label="Auswirkungen nach Typ filtern" value={type} onChange={(event) => setType(event.target.value)}>
          {types.map((item) => <option key={item || 'all'} value={item}>{item ? searchTypeLabel(item) : 'Alle Typen'}</option>)}
        </Select>
        <Select className="studio-inline" aria-label="Auswirkungen nach Bereich filtern" value={area} onChange={(event) => setArea(event.target.value)}>
          <option value="">Alle Bereiche</option>
          <option value="none">Ohne Bereich</option>
          {areas.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </div>
      <UsageLevel projectId={projectId} artifactId={artifactId} via={[]} type={type} area={area} parentTitle={title} />
      <ReviewComments projectId={projectId} artifactId={artifactId} />
    </section>
  )
}

function UsageLevel({ projectId, artifactId, via, type, area, parentTitle }: { projectId: string; artifactId: string; via: string[]; type: string; area: string; parentTitle: string }) {
  const usage = useQuery({
    queryKey: ['usage', projectId, artifactId, via.join(','), type, area],
    queryFn: () => api<Usage>(`/api/v1/projects/${projectId}/artifacts/${artifactId}/usage?via=${encodeURIComponent(via.join(','))}&type=${encodeURIComponent(type)}&area=${encodeURIComponent(area)}`),
  })
  if (usage.isLoading) return <p className="text-sm text-muted">Auswirkungen werden geladen …</p>
  if (usage.isError) return <p role="alert" className="text-sm text-danger">Die Auswirkungen konnten nicht geladen werden.</p>
  if (!usage.data) return null
  return (
    <div className="grid gap-3">
      <UsageGroup key={`${artifactId}-uses-${type}-${area}`} label="Verwendet" empty="Keine ausgehenden Verwendungen." projectId={projectId} hits={usage.data.uses} total={usage.data.usesTotal} parentTitle={parentTitle} via={[...via, artifactId]} type={type} area={area} />
      <UsageGroup key={`${artifactId}-used-${type}-${area}`} label="Verwendet von" empty="Keine eingehenden Verwendungen." projectId={projectId} hits={usage.data.usedBy} total={usage.data.usedByTotal} parentTitle={parentTitle} via={[...via, artifactId]} type={type} area={area} />
    </div>
  )
}

function UsageGroup({ label, empty, projectId, hits, total, parentTitle, via, type, area }: { label: string; empty: string; projectId: string; hits: UsageHit[]; total: number; parentTitle: string; via: string[]; type: string; area: string }) {
  const [extra, setExtra] = useState<UsageHit[]>([])
  const [loading, setLoading] = useState(false)
  const shown = [...hits, ...extra]
  return (
    <div>
      <h3 className="text-xs font-medium text-muted">{label}{total > 0 ? ` · ${total}` : ''}</h3>
      {shown.length === 0 ? <p className="mt-1 text-sm text-muted">{empty}</p> : null}
      <ul className="mt-1 grid gap-1">
        {shown.map((hit) => (
          <UsageRow key={`${hit.linkId}-${hit.artifactId}`} projectId={projectId} hit={hit} parentTitle={parentTitle} via={via} type={type} area={area} />
        ))}
      </ul>
      {shown.length < total ? (
        <button
          className="mt-1 text-sm text-accent underline-offset-2 hover:underline"
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            void api<Usage>(`/api/v1/projects/${projectId}/artifacts/${via.at(-1)}/usage?via=${encodeURIComponent(via.slice(0, -1).join(','))}&type=${encodeURIComponent(type)}&area=${encodeURIComponent(area)}&skip=${shown.length}`)
              .then((next) => setExtra((current) => [...current, ...(label === 'Verwendet' ? next.uses : next.usedBy)]))
              .finally(() => setLoading(false))
          }}
        >
          Weitere Treffer
        </button>
      ) : null}
    </div>
  )
}

function UsageRow({ projectId, hit, parentTitle, via, type, area }: { projectId: string; hit: UsageHit; parentTitle: string; via: string[]; type: string; area: string }) {
  const [open, setOpen] = useState(false)
  const direction = hit.direction === 'incoming' ? '←' : '→'
  const path = via.length > 1 ? `${parentTitle} ${direction} ${hit.relationLabel} „${hit.title}“` : null
  return (
    <li className="rounded-md px-1 py-1 text-sm">
      {path ? <p className="text-xs text-muted">{path}</p> : null}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs text-muted">{searchTypeLabel(hit.type)}</span>
        <Link className="font-medium underline-offset-2 hover:underline" to={artifactHref(projectId, hit.type, hit.artifactId, hit.diagramId)}>{hit.title}</Link>
        {hit.areaName ? <span className="text-xs text-muted">{hit.areaName}</span> : null}
        <span className="text-xs text-muted">{hit.relationLabel}</span>
        {hit.cycle ? <span className="text-xs text-warning">Zyklus</span> : null}
      </div>
      {hit.alternates.length > 0 ? (
        <p className="text-xs text-muted">Weitere Verknüpfung: {hit.alternates.map((item) => item.relationLabel).join(', ')}</p>
      ) : null}
      {hit.expandable && !hit.cycle ? (
        <button className="text-xs text-accent underline-offset-2 hover:underline" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Zweig einklappen' : 'Zweig aufklappen'}
        </button>
      ) : null}
      {open ? <div className="mt-2 border-l border-line pl-3"><UsageLevel projectId={projectId} artifactId={hit.artifactId} via={via} type={type} area={area} parentTitle={`${parentTitle} ${direction} ${hit.relationLabel} „${hit.title}“`} /></div> : null}
    </li>
  )
}

export function ReviewComments({ projectId, artifactId }: { projectId: string; artifactId: string }) {
  const comments = useQuery({
    queryKey: ['review-comments', projectId, artifactId],
    queryFn: () => api<ArtifactReviewComment[]>(`/api/v1/projects/${projectId}/artifacts/${artifactId}/review-comments`),
  })
  if (!comments.data?.length) return null
  return (
    <div>
      <h3 className="text-xs font-medium text-muted">Offene Kommentare</h3>
      <ul className="mt-1 grid gap-1">
        {comments.data.map((comment) => (
          <li key={comment.id} className="text-sm">
            <Link className="font-medium underline-offset-2 hover:underline" to={`/projekte/${projectId}/aenderungen/${comment.packageId}`}>{comment.packageTitle}</Link>
            <span className="text-muted"> · {comment.authorName}: {comment.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
