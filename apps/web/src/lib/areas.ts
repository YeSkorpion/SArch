import type { Area } from './types'

export function areaPath(area: Area, areas: Area[]) {
  const byId = new Map(areas.map((item) => [item.id, item]))
  const names = [area.name]
  let parentId = area.parentId
  const seen = new Set([area.id])
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    names.unshift(parent.name)
    parentId = parent.parentId
  }
  return names.join(' / ')
}

export function rootAreas(areas: Area[]) {
  const ids = new Set(areas.map((area) => area.id))
  return areas.filter((area) => !area.parentId || !ids.has(area.parentId)).sort(byOrder)
}

export function childAreas(areas: Area[], parentId: string) {
  return areas.filter((area) => area.parentId === parentId).sort(byOrder)
}

export function descendantIds(areas: Area[], id: string) {
  const ids = new Set<string>()
  const walk = (current: string) => {
    for (const child of areas.filter((area) => area.parentId === current)) {
      if (ids.has(child.id)) continue
      ids.add(child.id)
      walk(child.id)
    }
  }
  walk(id)
  return ids
}

function byOrder(left: Area, right: Area) {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'de')
}
