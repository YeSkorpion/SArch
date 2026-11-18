import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { Button } from '../../components/ui'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { api } from '../../lib/api'
import { searchTypeLabel } from '../../lib/labels'
import type { Area, Overview, PackageSummary } from '../../lib/types'
import type { ProjectOutlet } from '../shell/Shell'

export function OverviewPage() {
  const { project, canWrite, user } = useOutletContext<ProjectOutlet>()
  const overview = useQuery({
    queryKey: ['overview', project.id],
    queryFn: () => api<Overview>(`/api/v1/projects/${project.id}/overview`),
  })
  const areas = useQuery({ queryKey: ['areas', project.id], queryFn: () => api<Area[]>(`/api/v1/projects/${project.id}/areas`) })
  const packages = useQuery({ queryKey: ['packages', project.id], queryFn: () => api<PackageSummary[]>(`/api/v1/projects/${project.id}/packages`) })
  const [more, setMore] = useState(false)
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  if (overview.isLoading) return <Loading />
  if (overview.isError) return <div className="p-6"><ErrorState error={overview.error} onRetry={() => void overview.refetch()} /></div>
  const data = overview.data!
  const empty = data.recent.length === 0 && data.openCount === 0 && data.sharedComponents.length === 0 && data.missingProcessCount === 0 && data.missingScreenCount === 0 && data.missingComponentCount === 0 && (areas.data?.length ?? 0) === 0
  const recent = more ? data.recent : data.recent.slice(0, 5)
  const longDescription = (project.description?.length ?? 0) > 180
  const review = (packages.data ?? []).filter((item) => item.status === 'InPruefung')
  const areaCards = (areas.data ?? []).slice(0, 8)
  const stock = [
    { label: 'Anforderungen', count: data.requirementCount, href: `/projekte/${project.id}/anforderungen` },
    { label: 'Prozesse', count: data.processCount, href: `/projekte/${project.id}/prozesse` },
    { label: 'Systemarchitektur', count: data.systemCount, href: `/projekte/${project.id}/system` },
    { label: 'Screens', count: data.screenCount, href: `/projekte/${project.id}/ui` },
    { label: 'Dokumentation', count: data.documentCount, href: `/projekte/${project.id}/dokumente` },
    { label: 'Komponenten', count: data.componentCount, href: `/projekte/${project.id}/system/komponenten` },
  ]
  const create = canWrite ? <Button asChild variant="primary"><Link to={`/projekte/${project.id}/anforderungen?neu=1`}>Anforderung anlegen</Link></Button> : undefined
  return (
    <div className="grid w-full gap-4 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <p className="text-sm text-muted">Projektübersicht</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{project.name}</h1>
          {project.description ? (
            <div className="mt-1">
              <p className={descriptionOpen ? 'text-sm text-muted' : 'line-clamp-1 text-sm text-muted'}>{project.description}</p>
              {longDescription ? <button className="text-sm text-accent underline-offset-2 hover:underline" type="button" onClick={() => setDescriptionOpen((value) => !value)}>{descriptionOpen ? 'Weniger anzeigen' : 'Beschreibung vollständig anzeigen'}</button> : null}
            </div>
          ) : null}
        </div>
        {create}
      </header>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {stock.map((item) => (
          <li key={item.label}>
            <Link className="block rounded-xl border border-line bg-card px-3 py-2 hover:bg-background" to={item.href}>
              <span className="block text-xl font-semibold tabular-nums">{item.count}</span>
              <span className="block truncate text-xs text-muted">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      {empty ? (
        <EmptyState
          title="Das Projekt ist noch leer"
          body="Beginne mit der ersten Anforderung. Prozesse, Screens und Komponenten lassen sich danach daran aufhängen."
          action={create}
        />
      ) : (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-line bg-card p-4">
              <h2 className="text-lg font-semibold">Weiterarbeiten</h2>
              {data.recent.length === 0 ? <p className="mt-2 text-sm text-muted">Noch keine zuletzt bearbeiteten Artefakte.</p> : (
                <ul className="mt-2 divide-y divide-line">
                  {recent.map((item) => {
                    const type = item.subtitle || searchTypeLabel(item.type)
                    return (
                      <li key={`${item.type}-${item.id}`}>
                        <Link className="grid gap-0.5 rounded-md py-1.5 hover:text-accent" to={recentHref(project.id, item)}>
                          <span className="truncate text-xs text-muted">{type} · {new Date(item.updatedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                          <span className="truncate font-medium">{item.title}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
              {data.recent.length > 5 ? <button className="mt-3 text-sm text-accent underline-offset-2 hover:underline" type="button" onClick={() => setMore((value) => !value)}>{more ? 'Weniger anzeigen' : `Weitere Einträge (${data.recent.length - 5})`}</button> : null}
            </section>
            <div className="grid gap-4">
              <section className="rounded-xl border border-line bg-card p-4">
                <h2 className="font-semibold">Offene Punkte</h2>
                {data.openRequirements.length > 0 ? (
                  <ul className="mt-2 divide-y divide-line">
                    {data.openRequirements.slice(0, 4).map((item) => (
                      <li key={item.id}>
                        <Link className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-2 py-1.5 text-sm hover:text-accent" to={`/projekte/${project.id}/anforderungen/${item.id}`}>
                          <span className="font-mono text-xs text-muted">{item.key}</span>
                          <span className="truncate">{item.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className="mt-1 divide-y divide-line">
                  <Metric href={`/projekte/${project.id}/anforderungen?status=Offen`} count={data.openCount} label="offene Anforderungen" />
                  <Metric href={`/projekte/${project.id}/anforderungen?missing=process`} count={data.missingProcessCount} label="ohne Prozessschritt" />
                  <Metric href={`/projekte/${project.id}/anforderungen?missing=screen`} count={data.missingScreenCount} label="ohne Screen" />
                  <Metric href={`/projekte/${project.id}/anforderungen?missing=component`} count={data.missingComponentCount} label="ohne Komponente" />
                </ul>
              </section>
              {review.length > 0 ? (
                <section className="rounded-xl border border-line bg-card p-4">
                  <h2 className="font-semibold">Änderungen in Prüfung</h2>
                  <ul className="mt-2 divide-y divide-line">
                    {review.slice(0, 4).map((item) => (
                      <li key={item.id}>
                        <Link className="grid gap-0.5 py-2 hover:text-accent" to={`/projekte/${project.id}/aenderungen/${item.id}`}>
                          <span className="truncate font-medium">{item.title}</span>
                          <span className="text-xs text-muted">{item.reviewStale ? 'Prüfstand überholt' : 'In Prüfung'}{nextStep(item, project.role, user.id, canWrite) ? ` · ${nextStep(item, project.role, user.id, canWrite)}` : ''}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">Fachbereiche</h2>
              {(areas.data?.length ?? 0) > 0 ? <Link className="text-sm text-accent underline-offset-2 hover:underline" to={`/projekte/${project.id}/bereiche`}>Alle Bereiche</Link> : null}
            </div>
            {areas.isLoading ? <Loading /> : null}
            {areas.isError ? <ErrorState error={areas.error} onRetry={() => void areas.refetch()} /> : null}
            {areas.data?.length === 0 ? <p className="text-sm text-muted">Noch keine Fachbereiche.</p> : (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {areaCards.map((area) => (
                  <li key={area.id}>
                    <Link className="block rounded-xl border border-line bg-card px-3 py-2 hover:bg-background" to={`/projekte/${project.id}/bereiche/${area.id}`}>
                      <span className="block truncate font-medium">{area.name}</span>
                      <span className="block truncate text-xs text-muted">{area.diagramCount} {area.diagramCount === 1 ? 'Diagramm' : 'Diagramme'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-xl border border-line bg-card p-4">
            <h2 className="font-semibold">Gemeinsam genutzte Komponenten</h2>
            {data.sharedComponents.length === 0 ? <p className="mt-2 text-sm text-muted">Keine Komponente wird von mehreren Prozessabläufen verwendet.</p> : (
              <ul className="mt-2 grid gap-3 sm:grid-cols-2">
                {data.sharedComponents.map((component) => (
                  <li key={component.componentId}>
                    <Link className="font-medium hover:text-accent" to={`/projekte/${project.id}/system/komponenten/${component.componentId}`}>{component.name}</Link>
                    <ul className="mt-1 grid gap-1">
                      {component.flows.map((flow) => (
                        <li key={flow.nodeId}>
                          <Link className="text-sm hover:text-accent" to={`/projekte/${project.id}/diagramme/${flow.diagramId}?node=${flow.nodeId}`}>
                            {(flow.areaName ? `${flow.areaName} · ` : '') + `${flow.diagramName}: ${flow.nodeTitle}`}
                          </Link>
                          {flow.rationale ? <p className="text-sm text-muted">{flow.rationale}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Metric({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <li>
      <h3 className="text-sm font-medium">
        <Link className="flex items-baseline justify-between gap-3 py-2 hover:text-accent" to={href}>
          <span>{count} {label}</span>
          <span className="text-xs font-normal text-accent">Liste öffnen</span>
        </Link>
      </h3>
    </li>
  )
}

function nextStep(item: PackageSummary, role: string, userId: string, canWrite: boolean) {
  const canReview = role === 'Owner' || (role === 'Editor' && item.reviewerId === userId)
  if (item.reviewStale && canWrite) return 'Erneut einreichen'
  if (canReview) return 'Freigeben'
  return null
}

function recentHref(projectId: string, item: Overview['recent'][number]) {
  if (item.type === 'node' && item.diagramId) return `/projekte/${projectId}/diagramme/${item.diagramId}?node=${item.id}`
  if (item.type === 'process' || item.type === 'system') return `/projekte/${projectId}/diagramme/${item.id}`
  if (item.type === 'screen') return `/projekte/${projectId}/ui/${item.id}`
  if (item.type === 'component') return `/projekte/${projectId}/system/komponenten/${item.id}`
  if (item.type === 'document' || item.type === 'decision') return `/projekte/${projectId}/dokumente/${item.id}`
  return `/projekte/${projectId}/anforderungen/${item.id}`
}
