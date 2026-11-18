import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { EmptyState, ErrorState, Loading } from '../../components/states'
import { Button, Select } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { parseWireframe } from '../../lib/wireframe'
import type { FlowPreview } from '../../lib/types'
import { WireFace } from '../screens/ScreenPages'
import type { ProjectOutlet } from '../shell/Shell'

export function FlowPreviewPage() {
  const { project, canWrite } = useOutletContext<ProjectOutlet>()
  const { diagramId = '' } = useParams()
  const client = useQueryClient()
  const flow = useQuery({
    queryKey: ['flow', project.id, diagramId],
    queryFn: () => api<FlowPreview>(`/api/v1/projects/${project.id}/diagrams/${diagramId}/flow`),
  })
  const [screenId, setScreenId] = useState<string | null>(null)
  const [frame, setFrame] = useState<'desktop' | 'mobile'>('desktop')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [choice, setChoice] = useState('')
  const save = useMutation({
    mutationFn: () => {
      const [nodeId, selectedScreen] = choice.split('|')
      return api(`/api/v1/projects/${project.id}/diagrams/${diagramId}/flow`, { method: 'PUT', body: { nodeId, screenId: selectedScreen } })
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ['flow', project.id, diagramId] }),
  })
  if (flow.isLoading) return <Loading />
  if (flow.isError) return <div className="p-6"><ErrorState error={flow.error} onRetry={() => void flow.refetch()} /></div>
  const data = flow.data!
  const currentId = screenId ?? data.entryScreenId
  const screen = data.screens.find((item) => item.id === currentId)
  const steps = data.choices.filter((item) => item.screenId === currentId)
  const elements = screen ? parseWireframe(screen.wireframeJson)[frame].elements : []
  function openTarget(target: string | null, label: string) {
    if (!target || !data.screens.some((item) => item.id === target)) {
      setNotice(`„${label || 'Dieser Übergang'}“ hat kein Ziel.`)
      return
    }
    setNotice('')
    setScreenId(target)
  }
  return (
    <div className="grid w-full gap-4 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link className="text-sm text-muted underline-offset-2 hover:underline" to={`/projekte/${project.id}/diagramme/${diagramId}`}>Zurück zum Prozess</Link>
          <h1 className="mt-1 text-2xl font-semibold">Ablauf ansehen</h1>
          <p className="text-sm text-muted">Die Vorschau ändert weder den Prozess noch die Wireframes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => { setScreenId(data.entryScreenId); setNotice('') }}>Neu starten</Button>
          <Button type="button" onClick={() => { void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true)) }}>{copied ? 'Link kopiert' : 'Link kopieren'}</Button>
        </div>
      </header>
      {!data.ready ? <EmptyState title="Noch keine Wireframes" body="Ordne einem Prozessschritt einen Screen zu. Danach kann der Ablauf durchgeklickt werden." /> : null}
      {data.ready && !data.entryScreenId ? (
        <p className="text-sm">Der Einstieg ist noch nicht festgelegt.</p>
      ) : null}
      {canWrite && data.choices.length > 0 ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
          <Select aria-label="Einstieg" value={choice || (data.entryNodeId ? `${data.entryNodeId}|${data.entryScreenId}` : '')} onChange={(event) => setChoice(event.target.value)}>
            <option value="">Einstieg wählen</option>
            {data.choices.map((item) => <option key={`${item.nodeId}-${item.screenId}`} value={`${item.nodeId}|${item.screenId}`}>{item.title} · {item.screenName}</option>)}
          </Select>
          <Button type="submit" disabled={save.isPending || !(choice || data.entryNodeId)}>Einstieg speichern</Button>
        </form>
      ) : null}
      {screen ? (
        <>
          <p className="text-sm">Aktueller Prozessschritt: {steps.length > 0 ? steps.map((item) => item.title).join(', ') : 'Kein Prozessschritt für diesen Screen in diesem Ablauf.'}</p>
          <p className="text-sm font-medium">{screen.name}</p>
          <div className="flex gap-2">
            <Button size="sm" type="button" aria-pressed={frame === 'desktop'} variant={frame === 'desktop' ? 'primary' : 'secondary'} onClick={() => setFrame('desktop')}>Desktop</Button>
            <Button size="sm" type="button" aria-pressed={frame === 'mobile'} variant={frame === 'mobile' ? 'primary' : 'secondary'} onClick={() => setFrame('mobile')}>Mobil</Button>
          </div>
          <div className="relative overflow-auto rounded-xl border border-line bg-card" style={{ width: frame === 'desktop' ? 960 : 390, maxWidth: '100%', height: frame === 'desktop' ? 640 : 780 }}>
            {elements.map((element) => {
              const navigates = element.type === 'button' || element.type === 'link'
              return (
                <div key={element.id} className="absolute" style={{ left: element.x, top: element.y, width: element.width, height: element.height }}>
                  {navigates ? (
                    <button className="h-full w-full" type="button" onClick={() => openTarget(element.targetScreenId, element.text)}>{element.text || 'Weiter'}</button>
                  ) : <WireFace element={element} />}
                </div>
              )
            })}
          </div>
        </>
      ) : null}
      {notice ? <p role="status" className="text-sm">{notice}</p> : null}
      {save.isError ? <p role="alert" className="text-sm text-danger">{errorText(save.error)}</p> : null}
    </div>
  )
}
