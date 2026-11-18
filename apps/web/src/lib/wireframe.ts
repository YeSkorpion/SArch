export const wireframeTypes = ['heading', 'text', 'button', 'link', 'input', 'textarea', 'select', 'search', 'checkbox', 'switch', 'image', 'avatar', 'badge', 'divider', 'card', 'container', 'nav', 'tabs', 'table', 'list'] as const
export type WireframeType = (typeof wireframeTypes)[number]

export const wireframeGroups: { title: string; types: WireframeType[] }[] = [
  { title: 'Inhalt', types: ['heading', 'text', 'image', 'badge', 'divider'] },
  { title: 'Eingabe', types: ['input', 'textarea', 'select', 'search', 'checkbox', 'switch'] },
  { title: 'Aktion', types: ['button', 'link'] },
  { title: 'Aufbau', types: ['nav', 'tabs', 'card', 'container', 'table', 'list', 'avatar'] },
]
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
    targetScreenId: element.type === 'button' || element.type === 'link' ? element.targetScreenId : null,
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
    targetScreenId: element.type === 'button' || element.type === 'link' ? element.targetScreenId : null,
  })
  return JSON.stringify({
    version: 1,
    desktop: { elements: model.desktop.elements.map(write) },
    mobile: { elements: model.mobile.elements.map(write) },
  })
}

const labels: Record<WireframeType, string> = {
  heading: 'Überschrift',
  text: 'Text',
  button: 'Button',
  link: 'Link',
  input: 'Eingabefeld',
  textarea: 'Textbereich',
  select: 'Auswahl',
  search: 'Suche',
  checkbox: 'Kontrollkästchen',
  switch: 'Schalter',
  image: 'Bildplatzhalter',
  avatar: 'Avatar',
  badge: 'Status',
  divider: 'Trennlinie',
  card: 'Karte',
  container: 'Container',
  nav: 'Kopfzeile',
  tabs: 'Reiter',
  table: 'Tabelle',
  list: 'Liste',
}

export function elementLabel(type: WireframeType) {
  return labels[type]
}

export function elementDefaults(type: WireframeType) {
  const size: Record<WireframeType, { width: number; height: number; text: string }> = {
    heading: { width: 320, height: 40, text: 'Überschrift' },
    text: { width: 320, height: 56, text: 'Beschreibungstext' },
    button: { width: 148, height: 40, text: 'Weiter' },
    link: { width: 140, height: 28, text: 'Mehr erfahren' },
    input: { width: 260, height: 40, text: 'Eingabe' },
    textarea: { width: 320, height: 96, text: 'Mehrzeiliger Text' },
    select: { width: 240, height: 40, text: 'Bitte wählen' },
    search: { width: 260, height: 40, text: 'Suchen' },
    checkbox: { width: 200, height: 28, text: 'Option aktiv' },
    switch: { width: 180, height: 28, text: 'Aktiviert' },
    image: { width: 220, height: 132, text: 'Bild' },
    avatar: { width: 48, height: 48, text: 'AB' },
    badge: { width: 88, height: 28, text: 'Neu' },
    divider: { width: 360, height: 16, text: '' },
    card: { width: 320, height: 168, text: 'Karte' },
    container: { width: 420, height: 220, text: 'Bereich' },
    nav: { width: 912, height: 56, text: 'Anwendung' },
    tabs: { width: 360, height: 40, text: 'Übersicht|Details|Verlauf' },
    table: { width: 520, height: 148, text: 'Name|Status|Datum' },
    list: { width: 280, height: 112, text: 'Erster Punkt\nZweiter Punkt\nDritter Punkt' },
  }
  return size[type]
}
