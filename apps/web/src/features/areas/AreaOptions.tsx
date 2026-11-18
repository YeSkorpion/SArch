import { areaPath } from '../../lib/areas'
import type { Area } from '../../lib/types'

export function AreaOptions({ areas }: { areas: Area[] | undefined }) {
  const list = areas ?? []
  return [...list]
    .sort((left, right) => areaPath(left, list).localeCompare(areaPath(right, list), 'de'))
    .map((area) => <option key={area.id} value={area.id}>{areaPath(area, list)}</option>)
}
