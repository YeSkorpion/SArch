import { describe, expect, it } from 'vitest'
import { analyzeProcess } from './diagramCheck'
import { createsCycle, relationLabel } from './labels'
import { parseWireframe, serializeWireframe } from './wireframe'

describe('Prozessprüfung', () => {
  it('meldet fehlende Ausgänge und unerreichbare Knoten', () => {
    const issues = analyzeProcess(
      [
        { id: 'start', nodeType: 'start', title: 'Start' },
        { id: 'choice', nodeType: 'decision', title: 'Prüfung' },
        { id: 'lost', nodeType: 'action', title: 'Vergessen' },
      ],
      [{ id: 'e1', sourceId: 'start', targetId: 'choice', condition: '' }],
    )
    expect(issues.map((issue) => issue.code)).toEqual(['missing_end', 'unreachable', 'decision_exits'])
    expect(issues.find((issue) => issue.code === 'unreachable')?.nodeId).toBe('lost')
    const labeled = analyzeProcess(
      [
        { id: 'start', nodeType: 'start', title: 'Start' },
        { id: 'choice', nodeType: 'decision', title: 'Prüfung' },
        { id: 'end', nodeType: 'end', title: 'Ende' },
      ],
      [
        { id: 'e1', sourceId: 'start', targetId: 'choice', condition: '' },
        { id: 'e2', sourceId: 'choice', targetId: 'end', condition: '' },
      ],
    )
    expect(labeled.some((issue) => issue.code === 'unlabeled_exit')).toBe(true)
  })

  it('lässt frei stehende Kommentare ohne Erreichbarkeitshinweis', () => {
    const issues = analyzeProcess(
      [
        { id: 'start', nodeType: 'start', title: 'Start' },
        { id: 'end', nodeType: 'end', title: 'Ende' },
        { id: 'note', nodeType: 'note', title: 'Hinweis' },
      ],
      [{ id: 'e1', sourceId: 'start', targetId: 'end', condition: 'weiter' }],
    )
    expect(issues.some((issue) => issue.nodeId === 'note')).toBe(false)
  })
})

describe('Verknüpfungen', () => {
  it('benennt dieselbe Beziehung an beiden Enden', () => {
    expect(relationLabel('Satisfies', 'outgoing')).toBe('Erfüllt')
    expect(relationLabel('Satisfies', 'incoming')).toBe('Wird erfüllt durch')
    expect(relationLabel('Triggers', 'incoming')).toBe('Wird ausgelöst von')
  })
})

describe('Seitenstruktur', () => {
  it('verhindert Zyklen', () => {
    const parents = { parent: null, child: 'parent' }
    expect(createsCycle('parent', 'child', parents)).toBe(true)
    expect(createsCycle('child', null, parents)).toBe(false)
  })
})

describe('Wireframe', () => {
  it('behält stabile Kennungen und Rahmen', () => {
    const json = serializeWireframe({
      version: 1,
      desktop: { elements: [{ id: '11111111-1111-1111-1111-111111111111', type: 'button', x: 1, y: 2, width: 40, height: 20, text: 'Weiter', targetScreenId: '22222222-2222-2222-2222-222222222222' }] },
      mobile: { elements: [] },
    })
    const parsed = parseWireframe(json)
    expect(parsed.desktop.elements[0]?.text).toBe('Weiter')
    expect(parsed.desktop.elements[0]?.targetScreenId).toBe('22222222-2222-2222-2222-222222222222')
    expect(parsed.mobile.elements).toEqual([])
  })
})
