import { useQuery } from '@tanstack/react-query'
import { GitBranch, PanelsTopLeft } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { parseWireframe } from '../lib/wireframe'
import type { Diagram, DiagramNode } from '../lib/types'

export function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || visible) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setVisible(true)
    }, { rootMargin: '160px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])
  return { ref, visible }
}

export function PreviewFrame({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-nav">
      <div className="flex h-6 items-center gap-1 border-b border-line/80 px-2">
        <span className="h-1.5 w-1.5 rounded-full bg-line" />
        <span className="h-1.5 w-1.5 rounded-full bg-line" />
        <span className="h-1.5 w-1.5 rounded-full bg-line" />
      </div>
      <div className="relative aspect-[3/2]">
        {children}
        {label ? <span className="sr-only">{label}</span> : null}
      </div>
    </div>
  )
}

export function EmptyPreview({ icon, label }: { icon: 'screen' | 'diagram'; label: string }) {
  const Icon = icon === 'screen' ? PanelsTopLeft : GitBranch
  return (
    <div className="grid h-full place-items-center gap-1 text-muted">
      <Icon size={18} aria-hidden="true" />
      <span className="text-xs">{label}</span>
    </div>
  )
}

export function WireframeThumb({ json }: { json: string }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  let elements: ReturnType<typeof parseWireframe>['desktop']['elements'] = []
  let mobile = false
  try {
    const frame = parseWireframe(json)
    if (frame.desktop.elements.length > 0) elements = frame.desktop.elements
    else if (frame.mobile.elements.length > 0) {
      elements = frame.mobile.elements
      mobile = true
    }
  } catch {
    elements = []
  }
  const width = mobile ? 390 : 960
  const height = mobile ? 780 : 640
  return (
    <div ref={ref}>
      <PreviewFrame label={elements.length === 0 ? 'Noch kein Entwurf' : 'Wireframe'}>
        {!visible ? null : elements.length === 0 ? <EmptyPreview icon="screen" label="Noch kein Entwurf" /> : (
          <div className="absolute inset-2">
            <div className="relative h-full w-full" style={{ aspectRatio: `${width} / ${height}`, maxHeight: '100%', margin: '0 auto' }}>
              {elements.map((element) => (
                <span
                  key={element.id}
                  className={elementClass(element.type)}
                  style={{
                    position: 'absolute',
                    left: `${(element.x / width) * 100}%`,
                    top: `${(element.y / height) * 100}%`,
                    width: `${Math.max((element.width / width) * 100, 4)}%`,
                    height: `${Math.max((element.height / height) * 100, 3)}%`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </PreviewFrame>
    </div>
  )
}

function elementClass(type: string) {
  if (type === 'button' || type === 'badge') return 'rounded-[2px] bg-accent/45'
  if (type === 'input' || type === 'textarea' || type === 'select' || type === 'search') return 'rounded-[2px] border border-line bg-card'
  if (type === 'image' || type === 'avatar') return 'rounded-[2px] bg-line'
  if (type === 'card' || type === 'container' || type === 'nav' || type === 'table' || type === 'list') return 'rounded-[2px] border border-line/80 bg-card/70'
  if (type === 'divider') return 'bg-line'
  return 'rounded-[1px] bg-muted/40'
}

export function DiagramThumb({ projectId, diagramId, kind }: { projectId: string; diagramId: string; kind: 'Process' | 'System' }) {
  const { ref, visible } = useInView<HTMLDivElement>()
  const diagram = useQuery({
    queryKey: ['diagram', projectId, diagramId],
    queryFn: () => api<Diagram>(`/api/v1/projects/${projectId}/diagrams/${diagramId}`),
    enabled: visible,
    staleTime: 60_000,
  })
  const nodes = diagram.data?.nodes ?? []
  const steps = nodes.filter((node) => node.nodeType === 'action' || node.nodeType === 'decision' || node.nodeType === 'event').length
  return (
    <div ref={ref}>
      <PreviewFrame label={nodes.length === 0 && diagram.data ? 'Noch kein Entwurf' : 'Diagrammvorschau'}>
        {!visible || diagram.isLoading || !diagram.data ? <div className="h-full bg-nav" /> : nodes.length === 0 ? (
          <EmptyPreview icon="diagram" label="Noch kein Entwurf" />
        ) : (
          <DiagramSvg diagram={diagram.data} kind={kind} />
        )}
      </PreviewFrame>
      {diagram.data && (diagram.data.areaName || steps > 0) ? (
        <p className="sr-only">{[diagram.data.areaName, steps > 0 ? `${steps} Schritte` : null].filter(Boolean).join(', ')}</p>
      ) : null}
    </div>
  )
}

export function diagramStepCount(nodes: DiagramNode[]) {
  return nodes.filter((node) => node.nodeType === 'action' || node.nodeType === 'decision' || node.nodeType === 'event').length
}

export function useDiagramPreview(projectId: string, diagramId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['diagram', projectId, diagramId],
    queryFn: () => api<Diagram>(`/api/v1/projects/${projectId}/diagrams/${diagramId}`),
    enabled,
    staleTime: 60_000,
  })
}

const nodeWidth = 112
const nodeHeight = 36

export function DiagramSvg({ diagram, kind }: { diagram: Diagram; kind: 'Process' | 'System' }) {
  const nodes = diagram.nodes
  const minX = Math.min(...nodes.map((node) => node.x)) - 12
  const minY = Math.min(...nodes.map((node) => node.y)) - 12
  const maxX = Math.max(...nodes.map((node) => node.x)) + nodeWidth + 12
  const maxY = Math.max(...nodes.map((node) => node.y)) + nodeHeight + 12
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return (
    <svg className="h-full w-full" viewBox={`${minX} ${minY} ${Math.max(maxX - minX, 1)} ${Math.max(maxY - minY, 1)}`} aria-hidden="true">
      {diagram.edges.map((edge) => {
        const source = byId.get(edge.sourceId)
        const target = byId.get(edge.targetId)
        if (!source || !target) return null
        return (
          <line
            key={edge.id}
            x1={source.x + nodeWidth / 2}
            y1={source.y + nodeHeight / 2}
            x2={target.x + nodeWidth / 2}
            y2={target.y + nodeHeight / 2}
            stroke={toneStroke(edge.color) ?? 'var(--muted)'}
            strokeWidth="1.5"
          />
        )
      })}
      {nodes.map((node) => (
        <NodeShape key={node.id} node={node} system={kind === 'System'} />
      ))}
    </svg>
  )
}

function NodeShape({ node, system }: { node: DiagramNode; system: boolean }) {
  const kind = (node.componentKind ?? '').toLowerCase()
  if (system && kind === 'database') {
    return <ellipse cx={node.x + nodeWidth / 2} cy={node.y + nodeHeight / 2} rx={36} ry={16} fill="var(--card)" stroke="var(--accent)" />
  }
  if (system && kind === 'external') {
    return <rect x={node.x} y={node.y + 6} width={nodeWidth} height={24} rx={4} fill="var(--card)" stroke="var(--warning)" strokeDasharray="3 2" />
  }
  if (system && kind === 'queue') {
    return <polygon points={`${node.x + 10},${node.y + 8} ${node.x + nodeWidth},${node.y + 8} ${node.x + nodeWidth - 10},${node.y + 28} ${node.x},${node.y + 28}`} fill="var(--card)" stroke="var(--accent)" />
  }
  const tint = toneStroke(node.color)
  const fill = tint ?? (node.nodeType === 'decision' ? 'var(--warning)' : node.nodeType === 'event' ? 'var(--accent)' : 'var(--card)')
  const opacity = tint ? 0.35 : node.nodeType === 'decision' || node.nodeType === 'event' ? 0.35 : 1
  return <rect x={node.x} y={node.y + 4} width={nodeWidth} height={28} rx={node.nodeType === 'start' || node.nodeType === 'end' ? 14 : 6} fill={fill} fillOpacity={opacity} stroke={tint ?? (node.nodeType === 'note' ? 'var(--warning)' : system ? 'var(--accent)' : 'var(--line)')} strokeDasharray={node.nodeType === 'note' ? '3 2' : undefined} />
}

function toneStroke(color: string | null) {
  if (color === 'accent') return 'var(--accent)'
  if (color === 'ok') return 'var(--ok)'
  if (color === 'warning') return 'var(--warning)'
  if (color === 'danger') return 'var(--danger)'
  return null
}
