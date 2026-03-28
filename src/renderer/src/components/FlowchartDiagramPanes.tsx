import { useCallback, useState, type ReactNode } from 'react'
import type { DiagramPaneContent } from '../types'
import { StepMatrixView } from './StepMatrixView'
import { SequencerFlowchartView } from './SequencerFlowchartView'
import { ConditionsPanel } from './ConditionsPanel'
import { loadDiagramPanePrefs, saveDiagramPanePrefs } from '../utils/diagramPanePrefs'

const PANE_OPTIONS: { value: DiagramPaneContent; label: string }[] = [
  { value: 'stepMatrix', label: 'Step matrix' },
  { value: 'flowOverview', label: 'Flow overview' },
  { value: 'causeEffect', label: 'Cause & effect' },
  { value: 'conditions', label: 'Conditions' }
]

export interface FlowchartDiagramPanesProps {
  readOnly: boolean
}

export function FlowchartDiagramPanes({ readOnly }: FlowchartDiagramPanesProps) {
  const initial = loadDiagramPanePrefs()
  const [leftPane, setLeftPane] = useState<DiagramPaneContent>(initial.left)
  const [rightPane, setRightPane] = useState<DiagramPaneContent>(initial.right)
  const [rightPanePct, setRightPanePct] = useState(34)

  const persist = useCallback((l: DiagramPaneContent, r: DiagramPaneContent) => {
    saveDiagramPanePrefs(l, r)
  }, [])

  const changeLeft = useCallback(
    (next: DiagramPaneContent) => {
      if (next === rightPane) {
        setRightPane(leftPane)
        setLeftPane(next)
        persist(next, leftPane)
      } else {
        setLeftPane(next)
        persist(next, rightPane)
      }
    },
    [leftPane, rightPane, persist]
  )

  const changeRight = useCallback(
    (next: DiagramPaneContent) => {
      if (next === leftPane) {
        setLeftPane(rightPane)
        setRightPane(next)
        persist(rightPane, next)
      } else {
        setRightPane(next)
        persist(leftPane, next)
      }
    },
    [leftPane, rightPane, persist]
  )

  const handleSplitDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    let lastX = e.clientX
    const target = e.currentTarget
    const container = target.parentElement
    target.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => {
      if (!container) return
      const totalW = container.getBoundingClientRect().width
      if (totalW < 1) return
      const deltaPct = ((ev.clientX - lastX) / totalW) * 100
      lastX = ev.clientX
      setRightPanePct((prev) => Math.min(52, Math.max(22, prev - deltaPct)))
    }
    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
  }, [])

  function renderPane(which: 'left' | 'right', pane: DiagramPaneContent) {
    const wrap = (node: ReactNode, key: string) => (
      <div
        key={key}
        className={`min-w-0 min-h-0 overflow-hidden flex flex-col flex-1 ${which === 'left' ? 'border-r border-gray-200' : ''}`}
      >
        {node}
      </div>
    )

    switch (pane) {
      case 'stepMatrix':
        return wrap(<StepMatrixView readOnly={readOnly} variant="stepsOnly" />, 'stepMatrix')
      case 'causeEffect':
        return wrap(<StepMatrixView readOnly={readOnly} variant="causeEffectOnly" />, 'causeEffect')
      case 'flowOverview':
        return wrap(<SequencerFlowchartView readOnly={readOnly} />, 'flowOverview')
      case 'conditions':
        return wrap(<ConditionsPanel />, 'conditions')
      default:
        return null
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex-shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50/90">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Diagram panes</span>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-700">
          <span className="text-gray-500">Left</span>
          <select
            className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white max-w-[11rem]"
            value={leftPane}
            onChange={(e) => changeLeft(e.target.value as DiagramPaneContent)}
          >
            {PANE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-700">
          <span className="text-gray-500">Right</span>
          <select
            className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white max-w-[11rem]"
            value={rightPane}
            onChange={(e) => changeRight(e.target.value as DiagramPaneContent)}
          >
            {PANE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-row flex-1 overflow-hidden min-h-0">
        <div
          className="flex flex-col min-w-0 min-h-0 overflow-hidden"
          style={{ flexBasis: `${100 - rightPanePct}%`, flexGrow: 0, flexShrink: 0 }}
        >
          {renderPane('left', leftPane)}
        </div>
        <div
          className="w-1.5 flex-shrink-0 cursor-col-resize bg-gray-200 hover:bg-indigo-400 active:bg-indigo-500 transition-colors relative z-10"
          onPointerDown={handleSplitDrag}
          title="Drag to resize panes"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>
        <div
          className="min-w-[200px] min-h-0 overflow-hidden flex flex-col"
          style={{ flexBasis: `${rightPanePct}%`, flexGrow: 0, flexShrink: 0 }}
        >
          {renderPane('right', rightPane)}
        </div>
      </div>
    </div>
  )
}
