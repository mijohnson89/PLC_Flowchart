import type { DiagramPaneContent } from '../types'

const KEY_LEFT = 'uml.diagramPane.left'
const KEY_RIGHT = 'uml.diagramPane.right'

const DEFAULT_LEFT: DiagramPaneContent = 'stepMatrix'
const DEFAULT_RIGHT: DiagramPaneContent = 'flowOverview'

const ALL: DiagramPaneContent[] = ['stepMatrix', 'flowOverview', 'causeEffect', 'conditions']

function parse(v: string | null): DiagramPaneContent | null {
  if (!v) return null
  return ALL.includes(v as DiagramPaneContent) ? (v as DiagramPaneContent) : null
}

export function loadDiagramPanePrefs(): { left: DiagramPaneContent; right: DiagramPaneContent } {
  try {
    const left = parse(localStorage.getItem(KEY_LEFT)) ?? DEFAULT_LEFT
    let right = parse(localStorage.getItem(KEY_RIGHT)) ?? DEFAULT_RIGHT
    if (left === right) {
      right = right === DEFAULT_RIGHT ? DEFAULT_LEFT : DEFAULT_RIGHT
    }
    return { left, right }
  } catch {
    return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT }
  }
}

export function saveDiagramPanePrefs(left: DiagramPaneContent, right: DiagramPaneContent) {
  try {
    localStorage.setItem(KEY_LEFT, left)
    localStorage.setItem(KEY_RIGHT, right)
  } catch {
    /* ignore */
  }
}
