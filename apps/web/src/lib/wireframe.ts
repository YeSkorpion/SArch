export const wireframeTypes = ['text', 'button', 'input', 'image', 'card', 'container'] as const
export type WireframeType = (typeof wireframeTypes)[number]
export type WireElement = {
  id: string
  type: WireframeType
  x: number
  y: number
  width: number
  height: number
  text: string
  targetScreenId: string | null
}
export type Wireframe = {
  version: 1
  desktop: { elements: WireElement[] }
  mobile: { elements: WireElement[] }
}

export function emptyWireframe(): Wireframe {
  return { version: 1, desktop: { elements: [] }, mobile: { elements: [] } }
}

export function parseWireframe(json: string): Wireframe {
  const parsed = JSON.parse(json) as Wireframe
  return {
    version: 1,
    desktop: { elements: (parsed.desktop?.elements ?? []).map(normalize) },
    mobile: { elements: (parsed.mobile?.elements ?? []).map(normalize) },
  }
}

function normalize(element: WireElement): WireElement {
  return {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    text: element.text ?? '',
    targetScreenId: element.type === 'button' ? element.targetScreenId : null,
  }
}

export function serializeWireframe(model: Wireframe) {
  const write = (element: WireElement) => ({
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    text: element.text,
    targetScreenId: element.type === 'button' ? element.targetScreenId : null,
  })
  return JSON.stringify({
    version: 1,
    desktop: { elements: model.desktop.elements.map(write) },
    mobile: { elements: model.mobile.elements.map(write) },
  })
}

export function elementLabel(type: WireframeType) {
  if (type === 'text') return 'Text'
  if (type === 'button') return 'Button'
  if (type === 'input') return 'Eingabefeld'
  if (type === 'image') return 'Bildplatzhalter'
  if (type === 'card') return 'Karte'
  return 'Container'
}
