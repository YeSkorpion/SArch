export type ProjectRole = 'Owner' | 'Editor' | 'Viewer'
export type RequirementStatus = 'Offen' | 'InBearbeitung' | 'Erledigt' | 'Zurueckgestellt'
export type RequirementPriority = 'Niedrig' | 'Mittel' | 'Hoch' | 'Kritisch'
export type DiagramKind = 'Process' | 'System'
export type EdgeKind = 'Sequence' | 'Dependency' | 'DataFlow'
export type ComponentKind = 'Client' | 'Api' | 'Service' | 'Database' | 'Queue' | 'External'
export type ScreenStatus = 'Entwurf' | 'Review' | 'Abgestimmt'
export type DocumentKind = 'Page' | 'Decision'
export type DocumentStatus = 'Entwurf' | 'Vorgeschlagen' | 'Akzeptiert' | 'Abgeloest'
export type LinkRelation = 'Satisfies' | 'Uses' | 'Triggers' | 'Documents'
export type ArtifactType = 'Requirement' | 'Diagram' | 'DiagramNode' | 'Screen' | 'Component' | 'Document'
export type SearchType = 'requirement' | 'process' | 'system' | 'node' | 'screen' | 'component' | 'decision' | 'document'

export type User = { id: string; email: string; displayName: string; token: string }
export type Project = {
  id: string
  name: string
  description: string
  isArchived: boolean
  version: number
  role: ProjectRole
  updatedAt: string
}
export type Member = { userId: string; email: string; displayName: string; role: ProjectRole; createdAt: string }
export type Page<T> = { items: T[]; page: number; pageSize: number; totalCount: number }
export type Requirement = {
  id: string
  key: string
  title: string
  description: string
  status: RequirementStatus
  priority: RequirementPriority
  tags: string[]
  version: number
  createdAt: string
  updatedAt: string
  areaId: string | null
}
export type DiagramSummary = {
  id: string
  kind: DiagramKind
  name: string
  description: string
  version: number
  updatedAt: string
  areaId: string | null
  areaName: string | null
}
export type DiagramNode = {
  id: string
  nodeType: string
  title: string
  x: number
  y: number
  componentId: string | null
  componentName: string | null
  componentKind: string | null
  technology: string | null
  description: string | null
  eventName: string | null
  color: string | null
  comment: string | null
  version: number
}
export type DiagramEdge = {
  id: string
  kind: EdgeKind
  sourceId: string
  targetId: string
  label: string | null
  condition: string | null
  protocol: string | null
  color: string | null
}
export type DiagramIssue = { code: string; message: string; nodeId: string | null; edgeId: string | null }
export type Diagram = DiagramSummary & { nodes: DiagramNode[]; edges: DiagramEdge[]; issues: DiagramIssue[] }
export type Component = {
  id: string
  name: string
  description: string
  kind: ComponentKind
  technology: string | null
  version: number
  placementCount: number
  detailCount: number
  updatedAt: string
}
export type SchemaColumn = { id: string; name: string; dataType: string; required: boolean; isKey: boolean; role: string; notes: string; position: number }
export type SchemaSectionKind = 'Table' | 'Endpoint' | 'Operation' | 'Message' | 'View' | 'Integration'
export type SchemaSection = { id: string; kind: SchemaSectionKind; title: string; subtitle: string; description: string; position: number; columns: SchemaColumn[] }
export type Screen = {
  id: string
  name: string
  route: string
  purpose: string
  status: ScreenStatus
  notes: string
  wireframeJson: string
  version: number
  updatedAt: string
}
export type DocumentListItem = {
  id: string
  parentId: string | null
  title: string
  kind: DocumentKind
  status: DocumentStatus
  sortOrder: number
  version: number
  updatedAt: string
}
export type EmbeddedArtifact = { id: string; title: string; type: string; deleted: boolean }
export type Document = DocumentListItem & { contentJson: string; embeds: EmbeddedArtifact[] }
export type Revision = {
  id: string
  number: number
  title: string
  status: DocumentStatus
  contentJson: string
  authorId: string
  authorName: string
  createdAt: string
  embeds: EmbeddedArtifact[]
}
export type Link = {
  id: string
  relation: LinkRelation
  direction: 'outgoing' | 'incoming'
  artifactId: string
  artifactType: string
  title: string
  nodeType: string | null
  diagramId: string | null
  rationale: string | null
}
export type ImpactRef = { id: string; kind: string; title: string }
export type Impact = {
  canDelete: boolean
  blockReason: string | null
  links: ImpactRef[]
  edges: ImpactRef[]
  placements: ImpactRef[]
  childPages: ImpactRef[]
  navigations: ImpactRef[]
  nodes?: ImpactRef[]
}
export type SearchHit = { id: string; type: SearchType; title: string; subtitle: string; diagramId: string | null }
export type RecentItem = SearchHit & { updatedAt: string }
export type Overview = {
  openCount: number
  openRequirements: Requirement[]
  recent: RecentItem[]
  missingProcessCount: number
  missingProcess: Requirement[]
  missingScreenCount: number
  missingScreen: Requirement[]
  missingComponentCount: number
  missingComponent: Requirement[]
  sharedComponents: SharedComponent[]
  requirementCount: number
  processCount: number
  systemCount: number
  screenCount: number
  documentCount: number
  componentCount: number
}
export type AffectedFlow = {
  diagramId: string
  diagramName: string
  areaId: string | null
  areaName: string | null
  nodeId: string
  nodeTitle: string
  rationale: string | null
}
export type SharedComponent = { componentId: string; name: string; flows: AffectedFlow[] }
export type Area = { id: string; name: string; description: string; sortOrder: number; diagramCount: number; parentId: string | null }
export type PresencePerson = { userId: string; name: string; label: string; artifactId: string | null }
export type Together = { revision: number; people: PresencePerson[] }
export type SavedView = {
  id: string
  name: string
  scope: string
  areaId: string | null
  areaName: string | null
  unassigned: boolean
  query: string
}
export type PackageStatus = 'Entwurf' | 'InPruefung' | 'Freigegeben'
export type CommentStatus = 'Offen' | 'Erledigt'
export type UsageAlternate = { linkId: string; relation: string; relationLabel: string }
export type UsageHit = {
  artifactId: string
  type: string
  title: string
  areaId: string | null
  areaName: string | null
  diagramId: string | null
  relation: string
  relationLabel: string
  direction: 'outgoing' | 'incoming'
  linkId: string
  alternates: UsageAlternate[]
  cycle: boolean
  expandable: boolean
}
export type Usage = {
  artifactId: string
  uses: UsageHit[]
  usedBy: UsageHit[]
  usesTotal: number
  usedByTotal: number
  usesHasMore: boolean
  usedByHasMore: boolean
}
export type PackageSummary = {
  id: string
  title: string
  goal: string
  areaId: string | null
  areaName: string | null
  ownerId: string
  ownerName: string
  reviewerId: string | null
  reviewerName: string | null
  status: PackageStatus
  version: number
  reviewStale: boolean
  updatedAt: string
}
export type PackageItem = {
  id: string
  artifactId: string
  artifactType: string
  artifactTitle: string
  diagramId: string | null
  note: string
  missing: boolean
}
export type PackageComment = {
  id: string
  artifactId: string | null
  targetType: string
  targetTitle: string
  diagramId: string | null
  authorName: string
  text: string
  status: CommentStatus
  createdAt: string
  missing: boolean
  assigneeId: string | null
  assigneeName: string | null
}
export type PackageDecision = {
  id: string
  snapshotId: string
  action: string
  reason: string
  actorName: string
  createdAt: string
}
export type PackageDetail = PackageSummary & {
  reviewSnapshotId: string | null
  approvedSnapshotId: string | null
  items: PackageItem[]
  comments: PackageComment[]
  decisions: PackageDecision[]
}
export type ArtifactReviewComment = {
  id: string
  packageId: string
  packageTitle: string
  text: string
  authorName: string
  createdAt: string
}
export type SnapshotSummary = {
  id: string
  name: string
  scope: string
  packageId: string | null
  createdByName: string
  createdAt: string
}
export type SnapshotArtifact = {
  id: string
  type: string
  title: string
  status?: string | null
  content?: string | null
  diagramId?: string | null
  diagramName?: string | null
  areaName?: string | null
}
export type SnapshotDetail = SnapshotSummary & {
  document: { version: number; scope: string; artifacts: SnapshotArtifact[]; links: { id: string; relation: string; rationale?: string | null }[] }
  liveIds: string[]
}
export type SnapshotChange = { change: 'added' | 'changed' | 'removed' | 'position'; type: string; id: string; title: string; fields: string[] }
export type CoverageState = 'Zugeordnet' | 'Fehlt' | 'NichtErforderlich'
export type CoverageRef = { id: string; title: string; diagramId: string | null; path: string | null }
export type CoverageWaiver = { reason: string; authorName: string; createdAt: string; superseded: boolean }
export type CoverageCell = { state: CoverageState; direct: CoverageRef[]; indirect: CoverageRef[]; waiver: CoverageWaiver | null }
export type CoverageItem = {
  id: string
  key: string
  title: string
  status: RequirementStatus
  areaId: string | null
  process: CoverageCell
  screen: CoverageCell
  component: CoverageCell
  decision: CoverageCell
}
export type CoverageResult = {
  total: number
  page: number
  pageSize: number
  processMissing: number
  screenMissing: number
  componentMissing: number
  decisionMissing: number
  items: CoverageItem[]
}
export type SourceKind = 'Code' | 'Ticket' | 'Spezifikation' | 'Sonstige'
export type SourceState = 'Ungeprueft' | 'Geprueft' | 'ErneutPruefen'
export type ArtifactSource = {
  id: string
  kind: SourceKind
  title: string
  target: string
  destination: string
  state: SourceState
  checkedByName: string | null
  checkedAt: string | null
  checkedReference: string | null
}
export type FlowChoice = { nodeId: string; title: string; screenId: string; screenName: string }
export type FlowScreen = { id: string; name: string; wireframeJson: string }
export type FlowPreview = { ready: boolean; entryNodeId: string | null; entryScreenId: string | null; entryStepTitle: string | null; choices: FlowChoice[]; screens: FlowScreen[] }
export type CatalogColumn = { id: string; name: string; isPrimaryKey: boolean; foreignTableId: string | null; foreignTableName: string | null; notes: string; position: number }
export type CatalogTable = {
  id: string
  name: string
  purpose: string
  sourceName: string
  areaId: string | null
  areaName: string | null
  documentId: string | null
  documentTitle: string | null
  columns: CatalogColumn[]
}
export type WorkRow = { id: string; title: string; status: string; nextStep: string; href: string; updatedAt: string }
export type WorkList = { review: WorkRow[]; comments: WorkRow[]; packages: WorkRow[] }
export type Criterion = { id: string; text: string; done: boolean; position: number }
export type OpenPointKind = 'Frage' | 'Annahme' | 'Risiko'
export type OpenPointStatus = 'Offen' | 'Geklaert'
export type OpenPoint = {
  id: string
  kind: OpenPointKind
  title: string
  detail: string
  status: OpenPointStatus
  artifactId: string | null
  artifactTitle: string | null
  updatedAt: string
}
export type DataField = { id: string; name: string; fieldType: string; required: boolean; notes: string; position: number }
export type DataUse = { id: string; artifactId: string; artifactType: string; artifactTitle: string; role: 'Speichert' | 'Zeigt' }
export type DataEntity = { id: string; name: string; description: string; fields: DataField[]; uses: DataUse[] }
export type ServiceContract = {
  id: string
  name: string
  providerId: string
  providerName: string
  consumerId: string | null
  consumerName: string | null
  operation: string
  input: string
  output: string
  errors: string
}
export type DeliveryRequirement = { id: string; key: string; title: string; status: RequirementStatus }
export type DeliverySlice = { id: string; title: string; status: PackageStatus; sortOrder: number; requirements: DeliveryRequirement[] }
export type DeliveryPlan = { slices: DeliverySlice[]; unassigned: DeliveryRequirement[] }
export type TransferPreview = {
  valid: boolean
  errors: string[]
  summary: { areas: number; requirements: number; diagrams: number; nodes: number; screens: number; components: number; documents: number; revisions: number; links: number; packages: number; snapshots: number }
}
