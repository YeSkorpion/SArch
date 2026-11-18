import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../../lib/api'
import { artifactHref, searchHitMeta, searchTypeLabel } from '../../lib/labels'
import type { SearchHit } from '../../lib/types'

const order = ['requirement', 'process', 'node', 'screen', 'component', 'system', 'document', 'decision']

export function CommandPalette({ projectId, projectName, open, onOpenChange, returnFocus }: { projectId: string; projectName: string; open: boolean; onOpenChange: (open: boolean) => void; returnFocus: RefObject<HTMLElement | null> }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const results = useQuery({
    queryKey: ['search', projectId, term.trim()],
    queryFn: () => api<SearchHit[]>(`/api/v1/projects/${projectId}/search?q=${encodeURIComponent(term.trim())}`),
    enabled: open && term.trim().length > 0,
  })
  const groups = useMemo(() => {
    const buckets = new Map<string, SearchHit[]>()
    for (const hit of results.data ?? []) {
      buckets.set(hit.type, [...(buckets.get(hit.type) ?? []), hit])
    }
    return [...buckets.entries()].sort((left, right) => order.indexOf(left[0]) - order.indexOf(right[0]))
  }, [results.data])
  const hits = useMemo(() => groups.flatMap(([, items]) => items), [groups])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        onOpenChange(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpenChange, returnFocus])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => input.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  function close() {
    const node = returnFocus.current
    returnFocus.current = null
    onOpenChange(false)
    setTerm('')
    window.setTimeout(() => {
      if (node?.isConnected) node.focus()
    }, 0)
  }

  function choose(hit: SearchHit) {
    close()
    void navigate(artifactHref(projectId, hit.type, hit.id, hit.diagramId))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button className="studio-overlay absolute inset-0 bg-black/40" type="button" aria-label="Schnellsuche schließen" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Schnellsuche"
        className="studio-overlay absolute left-1/2 top-[12vh] grid w-[min(36rem,calc(100%-1.5rem))] -translate-x-1/2 gap-3 rounded-xl border border-line bg-card p-3 shadow-overlay"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((index) => Math.min(hits.length - 1, index + 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((index) => Math.max(0, index - 1))
          }
          if (event.key === 'Enter' && hits[active]) {
            event.preventDefault()
            choose(hits[active])
          }
        }}
      >
        <p className="px-1 text-xs text-muted">{projectName}</p>
        <input
          ref={input}
          className="h-10 w-full rounded-md border border-line bg-background px-3 text-sm"
          value={term}
          placeholder="Artefakt suchen"
          aria-label="Schnellsuche"
          aria-activedescendant={hits[active] ? `treffer-${hits[active].type}-${hits[active].id}` : undefined}
          onChange={(event) => { setTerm(event.target.value); setActive(0) }}
        />
        <div className="max-h-80 overflow-auto" role="listbox" aria-label="Suchtreffer">
          {term.trim().length === 0 ? <p className="px-2 py-3 text-sm text-muted">Titel, Schlüssel oder Bereich eingeben.</p> : null}
          {results.isLoading ? <p className="px-2 py-3 text-sm text-muted">Wird gesucht …</p> : null}
          {term.trim() && results.data?.length === 0 ? <p className="px-2 py-3 text-sm text-muted">Keine Treffer in diesem Projekt.</p> : null}
          {groups.map(([type, items]) => (
            <section key={type} className="mb-2">
              <h2 className="px-2 py-1 text-xs font-medium text-muted">{searchTypeLabel(type)}</h2>
              <ul>
                {items.map((hit) => {
                  const index = hits.indexOf(hit)
                  return (
                    <li key={`${hit.type}-${hit.id}`}>
                      <button
                        id={`treffer-${hit.type}-${hit.id}`}
                        className={`w-full rounded-md px-2 py-2 text-left text-sm ${index === active ? 'bg-accent/12' : 'hover:bg-background'}`}
                        type="button"
                        role="option"
                        aria-selected={index === active}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(hit)}
                      >
                        <span className="block truncate font-medium">{hit.title}</span>
                        <span className="block truncate text-muted">{searchHitMeta(hit.type, hit.subtitle)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
