import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Input, Select } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { artifactHref, relationLabel, searchTypeLabel } from '../../lib/labels'
import type { Link as ArtifactLink, LinkRelation, SearchHit } from '../../lib/types'

type Mode = 'requirement' | 'step' | 'screen' | 'component' | 'document'

export function LinkPanel({
  projectId,
  artifactId,
  mode,
  nodeType,
  canWrite,
}: {
  projectId: string
  artifactId: string
  mode: Mode
  nodeType?: string
  canWrite: boolean
}) {
  const client = useQueryClient()
  const links = useQuery({
    queryKey: ['links', projectId, artifactId],
    queryFn: () => api<ArtifactLink[]>(`/api/v1/projects/${projectId}/artifacts/${artifactId}/links`),
  })
  const relations = allowedRelations(mode, nodeType)
  const [relation, setRelation] = useState<LinkRelation>(relations[0] ?? 'Satisfies')
  const [term, setTerm] = useState('')
  const [rationale, setRationale] = useState('')
  const [message, setMessage] = useState('')
  const search = useQuery({
    queryKey: ['link-search', projectId, term],
    queryFn: () => api<SearchHit[]>(`/api/v1/projects/${projectId}/search?q=${encodeURIComponent(term)}`),
    enabled: term.trim().length > 1 && relations.length > 0,
  })

  const create = useMutation({
    mutationFn: (hit: SearchHit) =>
      api(`/api/v1/projects/${projectId}/links`, {
        method: 'POST',
        body: { sourceId: artifactId, targetId: hit.id, relation, rationale: rationale.trim() || null },
      }),
    onSuccess: async () => {
      setMessage('Verknüpfung gespeichert.')
      setTerm('')
      setRationale('')
      await client.invalidateQueries({ queryKey: ['links', projectId, artifactId] })
    },
    onError: (error) => setMessage(errorText(error)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/projects/${projectId}/links/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['links', projectId, artifactId] })
    },
    onError: (error) => setMessage(errorText(error)),
  })

  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold">Verknüpfungen</h3>
      {links.isLoading ? <p className="text-sm text-muted">Wird geladen …</p> : null}
      {links.isError ? <p className="text-sm text-danger">{errorText(links.error)}</p> : null}
      <ul className="grid gap-2">
        {(links.data ?? []).map((link) => (
          <li key={link.id} className="rounded-lg border border-line bg-background px-3 py-2 text-sm">
            <div className="text-xs text-muted">{relationLabel(link.relation, link.direction)}</div>
            <Link className="font-medium underline-offset-2 hover:underline" to={artifactHref(projectId, link.artifactType, link.artifactId, link.diagramId)}>
              {link.title}
            </Link>
            <div className="text-xs text-muted">{searchTypeLabel(link.artifactType)}</div>
            {link.rationale ? <p className="mt-1 text-muted">{link.rationale}</p> : null}
            {canWrite && link.relation !== 'Documents' ? (
              <Button className="mt-2" size="sm" type="button" variant="ghost" onClick={() => remove.mutate(link.id)}>
                Verknüpfung entfernen
              </Button>
            ) : null}
            {link.relation === 'Documents' ? <p className="mt-1 text-xs text-muted">Dokumentlinks werden im Seitentext geändert.</p> : null}
          </li>
        ))}
        {links.data?.length === 0 ? <li className="text-sm text-muted">Noch keine Verknüpfungen.</li> : null}
      </ul>
      {canWrite && relations.length > 0 ? (
        <div className="grid gap-2">
          <Select value={relation} onChange={(event) => setRelation(event.target.value as LinkRelation)} aria-label="Beziehungsart">
            {relations.map((item) => (
              <option key={item} value={item}>
                {relationLabel(item, 'outgoing')}
              </option>
            ))}
          </Select>
          <Input value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Begründung" aria-label="Begründung" />
          <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Ziel suchen" aria-label="Ziel suchen" />
          <ul className="grid gap-1">
            {(search.data ?? []).filter((hit) => accepts(relation, hit)).map((hit) => (
              <li key={hit.id}>
                <button className="w-full rounded px-2 py-1 text-left text-sm hover:bg-background" type="button" onClick={() => create.mutate(hit)}>
                  {searchTypeLabel(hit.type)}: {hit.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {mode === 'document' ? <p className="text-sm text-muted">Interne Artefaktlinks fügst du im Text ein. Sie erscheinen danach hier.</p> : null}
      {message ? <p className="text-sm">{message}</p> : null}
    </section>
  )
}

function allowedRelations(mode: Mode, nodeType?: string): LinkRelation[] {
  if (mode === 'screen' || mode === 'component') return ['Satisfies']
  if (mode === 'step' && (nodeType === 'action' || nodeType === 'decision' || nodeType === 'event')) {
    return nodeType === 'action' ? ['Satisfies', 'Uses', 'Triggers'] : ['Satisfies', 'Uses']
  }
  return []
}

function accepts(relation: LinkRelation, hit: SearchHit) {
  if (relation === 'Satisfies') return hit.type === 'requirement'
  if (relation === 'Uses') return hit.type === 'screen' || hit.type === 'component'
  if (relation === 'Triggers') return hit.type === 'node'
  return false
}
