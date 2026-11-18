import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router'
import { Button } from '../../components/ui'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { api } from '../../lib/api'
import { searchTypeLabel } from '../../lib/labels'
import type { Overview, Requirement } from '../../lib/types'
import type { ProjectOutlet } from '../shell/Shell'

export function OverviewPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const overview = useQuery({
    queryKey: ['overview', project.id],
    queryFn: () => api<Overview>(`/api/v1/projects/${project.id}/overview`),
  })
  if (overview.isLoading) return <Loading />
  if (overview.isError) return <div className="p-6"><ErrorState error={overview.error} onRetry={() => void overview.refetch()} /></div>
  const data = overview.data!
  const empty = data.recent.length === 0 && data.openCount === 0 && data.sharedComponents.length === 0 && data.missingProcessCount === 0 && data.missingScreenCount === 0 && data.missingComponentCount === 0
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-8 md:px-8">
      <header className="max-w-3xl">
        <p className="text-sm text-muted">Projektübersicht</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{project.name}</h1>
        {project.description ? <p className="mt-2 text-sm text-muted">{project.description}</p> : null}
      </header>
      {empty ? (
        <EmptyState
          title="Das Projekt ist noch leer"
          body="Beginne mit der ersten Anforderung. Prozesse, Screens und Komponenten lassen sich danach daran aufhängen."
          action={canWrite ? <Button asChild variant="primary"><Link to={`/projekte/${project.id}/anforderungen?neu=1`}>Anforderung erstellen</Link></Button> : undefined}
        />
      ) : (
        <>
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.8fr)]">
            <section>
              <h2 className="text-lg font-semibold">Weiterarbeiten</h2>
              <ul className="mt-3 divide-y divide-line">
                {data.recent.map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    <Link className="grid gap-0.5 py-2.5 hover:text-accent" to={recentHref(project.id, item)}>
                      <span className="text-xs text-muted">{searchTypeLabel(item.type)}</span>
                      <span className="font-medium break-words">{item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl bg-card p-4">
              <h2 className="font-semibold">{data.openCount} offene Anforderungen</h2>
              <ul className="mt-2 grid gap-1">
                {data.openRequirements.slice(0, 4).map((item) => (
                  <RequirementLine key={item.id} projectId={project.id} item={item} />
                ))}
              </ul>
              <Link className="mt-3 inline-block text-sm text-accent underline-offset-2 hover:underline" to={`/projekte/${project.id}/anforderungen?status=Offen`}>Offene Anforderungen öffnen</Link>
            </section>
          </div>
          <section>
            <h2 className="text-lg font-semibold">Fehlende Zuordnungen</h2>
            <ul className="mt-3 divide-y divide-line rounded-xl bg-card">
              <GapRow href={`/projekte/${project.id}/anforderungen?missing=process`} count={data.missingProcessCount} label="ohne Prozessschritt" />
              <GapRow href={`/projekte/${project.id}/anforderungen?missing=screen`} count={data.missingScreenCount} label="ohne Screen" />
              <GapRow href={`/projekte/${project.id}/anforderungen?missing=component`} count={data.missingComponentCount} label="ohne Komponente" />
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Gemeinsam genutzte Komponenten</h2>
            {data.sharedComponents.length === 0 ? <p className="mt-2 text-sm text-muted">Keine Komponente wird von mehreren Prozessabläufen verwendet.</p> : (
              <ul className="mt-3 grid gap-4">
                {data.sharedComponents.map((component) => (
                  <li key={component.componentId}>
                    <Link className="font-medium underline-offset-2 hover:underline" to={`/projekte/${project.id}/system/komponenten/${component.componentId}`}>{component.name}</Link>
                    <ul className="mt-1 grid gap-1">
                      {component.flows.map((flow) => (
                        <li key={flow.nodeId}>
                          <Link className="text-sm underline-offset-2 hover:underline" to={`/projekte/${project.id}/diagramme/${flow.diagramId}?node=${flow.nodeId}`}>
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

function GapRow({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <li>
      <h3 className="text-base font-medium">
        <Link className="flex items-baseline justify-between gap-3 px-4 py-3 hover:text-accent" to={href}>
          <span>{count} {label}</span>
          <span className="text-sm font-normal text-accent">Liste öffnen</span>
        </Link>
      </h3>
    </li>
  )
}

function RequirementLine({ projectId, item }: { projectId: string; item: Requirement }) {
  return (
    <li>
      <Link className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 py-1 text-sm" to={`/projekte/${projectId}/anforderungen/${item.id}`}>
        <span className="font-mono text-xs text-muted">{item.key}</span>
        <span className="break-words">{item.title}</span>
      </Link>
    </li>
  )
}

function recentHref(projectId: string, item: Overview['recent'][number]) {
  if (item.type === 'node' && item.diagramId) return `/projekte/${projectId}/diagramme/${item.diagramId}?node=${item.id}`
  if (item.type === 'process' || item.type === 'system') return `/projekte/${projectId}/diagramme/${item.id}`
  if (item.type === 'screen') return `/projekte/${projectId}/ui/${item.id}`
  if (item.type === 'component') return `/projekte/${projectId}/system/komponenten/${item.id}`
  if (item.type === 'document' || item.type === 'decision') return `/projekte/${projectId}/dokumente/${item.id}`
  return `/projekte/${projectId}/anforderungen/${item.id}`
}
