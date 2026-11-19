export type CheckNode = { id: string; nodeType: string; title: string }
export type CheckEdge = { id: string; sourceId: string; targetId: string; condition?: string | null }
export type CheckIssue = { code: string; message: string; nodeId: string | null; edgeId: string | null }

function trim(value: string) {
  const text = value.trim()
  return text.length <= 80 ? text : text.slice(0, 80)
}

export function analyzeProcess(nodes: CheckNode[], edges: CheckEdge[]): CheckIssue[] {
  const issues: CheckIssue[] = []
  const starts = nodes.filter((node) => node.nodeType === 'start')
  if (starts.length === 0) {
    issues.push({ code: 'missing_start', message: 'Es fehlt ein Startknoten.', nodeId: null, edgeId: null })
  }
  if (nodes.every((node) => node.nodeType !== 'end')) {
    issues.push({ code: 'missing_end', message: 'Es fehlt ein Endknoten.', nodeId: null, edgeId: null })
  }

  if (starts.length > 0) {
    const outgoing = new Map<string, string[]>()
    for (const edge of edges) {
      const list = outgoing.get(edge.sourceId) ?? []
      list.push(edge.targetId)
      outgoing.set(edge.sourceId, list)
    }
    const seen = new Set(starts.map((node) => node.id))
    const queue = [...seen]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const target of outgoing.get(current) ?? []) {
        if (!seen.has(target)) {
          seen.add(target)
          queue.push(target)
        }
      }
    }
    for (const node of nodes) {
      if (node.nodeType === 'note' || node.nodeType === 'source' || seen.has(node.id)) continue
      issues.push({
        code: 'unreachable',
        message: `„${trim(node.title)}“ ist vom Start aus nicht erreichbar.`,
        nodeId: node.id,
        edgeId: null,
      })
    }
  }

  for (const decision of nodes.filter((node) => node.nodeType === 'decision')) {
    const exits = edges.filter((edge) => edge.sourceId === decision.id)
    if (exits.length < 2) {
      issues.push({
        code: 'decision_exits',
        message: `„${trim(decision.title)}“ braucht mindestens zwei Ausgänge.`,
        nodeId: decision.id,
        edgeId: null,
      })
    }
    for (const edge of exits) {
      if (!edge.condition?.trim()) {
        issues.push({
          code: 'unlabeled_exit',
          message: `Ein Ausgang von „${trim(decision.title)}“ hat keine Bedingung.`,
          nodeId: decision.id,
          edgeId: edge.id,
        })
      }
    }
  }

  return issues
}
