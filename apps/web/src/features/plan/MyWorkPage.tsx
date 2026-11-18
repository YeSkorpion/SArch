import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { api } from '../../lib/api'
import type { WorkList, WorkRow } from '../../lib/types'
import type { ProjectOutlet } from '../shell/Shell'

export function MyWorkPage() {
  const { project } = useOutletContext<ProjectOutlet>()
  const work = useQuery({ queryKey: ['work', project.id], queryFn: () => api<WorkList>(`/api/v1/projects/${project.id}/work`) })
  if (work.isLoading) return <Loading />
  if (work.isError) return <div className="p-6"><ErrorState error={work.error} onRetry={() => void work.refetch()} /></div>
  const data = work.data!
  const empty = data.review.length + data.comments.length + data.packages.length === 0
  return (
    <div className="grid w-full gap-4 px-4 py-6 md:px-6">
      <header>
        <h1 className="text-2xl font-semibold">Meine Arbeit</h1>
        <p className="text-sm text-muted">Prüfaufgaben stehen zuerst. Es erscheinen nur Inhalte, auf die du gerade Zugriff hast.</p>
      </header>
      {empty ? <EmptyState title="Nichts offen" body="Keine Prüfung, kein Kommentar und kein eigenes Änderungspaket wartet auf dich." /> : null}
      <WorkSection title="Von mir zu prüfen" rows={data.review} empty="Keine Prüfung ist dir zugewiesen." />
      <WorkSection title="Kommentare mit Handlungsbedarf" rows={data.comments} empty="Kein offener Kommentar ist dir zugeordnet." />
      <WorkSection title="Meine Änderungspakete" rows={data.packages} empty="Du hast kein offenes Änderungspaket." />
    </div>
  )
}

function WorkSection({ title, rows, empty }: { title: string; rows: WorkRow[]; empty: string }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted">{empty}</p> : (
        <ul className="mt-2 divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id}>
              <Link className="grid gap-0.5 py-2 hover:text-accent" to={row.href}>
                <span className="font-medium">{row.title}</span>
                <span className="text-xs text-muted">{row.status} · {row.nextStep}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
