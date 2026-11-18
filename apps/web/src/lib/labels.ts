import type { ComponentKind, DocumentStatus, LinkRelation, ProjectRole, RequirementPriority, RequirementStatus, ScreenStatus } from './types'

export function roleLabel(role: ProjectRole) {
  if (role === 'Owner') return 'Eigentümer'
  if (role === 'Editor') return 'Bearbeiter'
  return 'Betrachter'
}

export function requirementStatusLabel(status: RequirementStatus) {
  if (status === 'InBearbeitung') return 'In Bearbeitung'
  if (status === 'Zurueckgestellt') return 'Zurückgestellt'
  return status
}

export function priorityLabel(priority: RequirementPriority) {
  return priority
}

export function screenStatusLabel(status: ScreenStatus) {
  return status
}

export function documentStatusLabel(status: DocumentStatus) {
  if (status === 'Abgeloest') return 'Abgelöst'
  return status
}

export function componentKindLabel(kind: ComponentKind) {
  if (kind === 'Api') return 'API'
  if (kind === 'Database') return 'Datenbank'
  if (kind === 'External') return 'Externes System'
  if (kind === 'Queue') return 'Queue'
  if (kind === 'Client') return 'Client'
  return 'Service'
}

export function nodeTypeLabel(nodeType: string) {
  if (nodeType === 'start') return 'Start'
  if (nodeType === 'action') return 'Aktion'
  if (nodeType === 'decision') return 'Entscheidung'
  if (nodeType === 'event') return 'Ereignis'
  if (nodeType === 'end') return 'Ende'
  if (nodeType === 'placement') return 'Komponente'
  return nodeType
}

export function relationLabel(relation: LinkRelation, direction: 'outgoing' | 'incoming') {
  if (relation === 'Satisfies') return direction === 'outgoing' ? 'Erfüllt' : 'Wird erfüllt durch'
  if (relation === 'Uses') return direction === 'outgoing' ? 'Verwendet' : 'Wird verwendet von'
  if (relation === 'Triggers') return direction === 'outgoing' ? 'Löst aus' : 'Wird ausgelöst von'
  return direction === 'outgoing' ? 'Beschreibt' : 'Wird beschrieben in'
}

export function searchTypeLabel(type: string) {
  if (type === 'requirement') return 'Anforderung'
  if (type === 'process') return 'Prozessdiagramm'
  if (type === 'system') return 'Systemdiagramm'
  if (type === 'node') return 'Prozessschritt'
  if (type === 'screen') return 'Screen'
  if (type === 'component') return 'Komponente'
  if (type === 'decision') return 'Architekturentscheidung'
  if (type === 'document') return 'Seite'
  if (type === 'diagram') return 'Diagramm'
  if (type === 'edge') return 'Kante'
  if (type === 'link') return 'Verknüpfung'
  if (type === 'Requirement') return 'Anforderung'
  if (type === 'Diagram') return 'Diagramm'
  if (type === 'DiagramNode') return 'Prozessschritt'
  if (type === 'Screen') return 'Screen'
  if (type === 'Component') return 'Komponente'
  if (type === 'Document') return 'Dokument'
  return type
}

export function searchHitMeta(type: string, subtitle?: string | null) {
  const label = searchTypeLabel(type)
  if (!subtitle || subtitle === label || label.startsWith(subtitle)) return label
  return `${label} · ${subtitle}`
}

export function saveStateLabel(state: 'saved' | 'saving' | 'error' | 'conflict' | 'idle') {
  if (state === 'saving') return 'Wird gespeichert'
  if (state === 'saved') return 'Gespeichert'
  if (state === 'error') return 'Speichern fehlgeschlagen'
  if (state === 'conflict') return 'Konflikt mit dem Serverstand'
  return 'Keine offenen Änderungen'
}

export function artifactHref(projectId: string, type: string, id: string, diagramId?: string | null) {
  if (type === 'requirement' || type === 'Requirement') return `/projekte/${projectId}/anforderungen/${id}`
  if (type === 'process' || type === 'system' || type === 'Diagram') return `/projekte/${projectId}/diagramme/${id}`
  if (type === 'node' || type === 'DiagramNode') return `/projekte/${projectId}/diagramme/${diagramId}?node=${id}`
  if (type === 'screen' || type === 'Screen') return `/projekte/${projectId}/ui/${id}`
  if (type === 'component' || type === 'Component') return `/projekte/${projectId}/system/komponenten/${id}`
  if (type === 'document' || type === 'decision' || type === 'Document') return `/projekte/${projectId}/dokumente/${id}`
  return `/projekte/${projectId}`
}

export function createsCycle(documentId: string, newParentId: string | null, parentById: Record<string, string | null>) {
  let current = newParentId
  const seen = new Set<string>()
  while (current) {
    if (current === documentId || seen.has(current)) return true
    seen.add(current)
    if (!(current in parentById)) return false
    current = parentById[current] ?? null
  }
  return false
}
