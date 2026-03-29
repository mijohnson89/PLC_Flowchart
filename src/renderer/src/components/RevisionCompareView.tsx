import { useCallback, useEffect, useMemo, useState } from 'react'
import { Columns2 } from 'lucide-react'
import { useDiagramStore, selectRevisions } from '../store/diagramStore'
import type { DiagramTab } from '../types'
import { StepMatrixView, type StepMatrixDiagramOverride } from './StepMatrixView'
import { SequencerFlowchartView, type SequencerFlowchartDiagramOverride } from './SequencerFlowchartView'

const CURRENT = '__current__'

type CompareViewKind = 'stepMatrix' | 'causeEffect' | 'flowOverview'

function diagramFromSource(tab: DiagramTab, source: string): StepMatrixDiagramOverride & SequencerFlowchartDiagramOverride {
  if (source === CURRENT) {
    return {
      flowNodes: tab.flowNodes,
      flowEdges: tab.flowEdges,
      phases: tab.phases ?? [],
      flowStates: tab.flowStates ?? [],
      sequencerViewPositions: tab.sequencerViewPositions
    }
  }
  const rev = tab.revisions.find((r) => r.id === source)
  if (!rev) {
    return {
      flowNodes: [],
      flowEdges: [],
      phases: tab.phases ?? [],
      flowStates: tab.flowStates ?? [],
      sequencerViewPositions: undefined
    }
  }
  const s = rev.snapshot
  return {
    flowNodes: s.flowNodes,
    flowEdges: s.flowEdges,
    phases: s.phases ?? tab.phases ?? [],
    flowStates: s.flowStates ?? tab.flowStates ?? [],
    sequencerViewPositions: s.sequencerViewPositions
  }
}

export interface RevisionCompareViewProps {
  onClose: () => void
}

export function RevisionCompareView({ onClose }: RevisionCompareViewProps) {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const activeTab = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const revisions = useDiagramStore(selectRevisions)

  const sortedNewestFirst = useMemo(
    () => [...revisions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [revisions]
  )

  const [leftSource, setLeftSource] = useState(CURRENT)
  const [rightSource, setRightSource] = useState(CURRENT)
  const [viewKind, setViewKind] = useState<CompareViewKind>('stepMatrix')
  const [rightPanePct, setRightPanePct] = useState(50)

  useEffect(() => {
    setLeftSource(CURRENT)
    const tab = useDiagramStore.getState().tabs.find((t) => t.id === activeTabId)
    const revs = tab?.revisions ?? []
    const sorted = [...revs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setRightSource(sorted[0]?.id ?? CURRENT)
  }, [activeTabId])

  const leftDiagram = useMemo(
    () => (activeTab ? diagramFromSource(activeTab, leftSource) : null),
    [activeTab, leftSource]
  )
  const rightDiagram = useMemo(
    () => (activeTab ? diagramFromSource(activeTab, rightSource) : null),
    [activeTab, rightSource]
  )

  const revisionOptions = sortedNewestFirst

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
      setRightPanePct((prev) => Math.min(65, Math.max(35, prev - deltaPct)))
    }
    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
  }, [])

  if (!activeTab || activeTab.type !== 'flowchart') {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-500 text-sm p-6">
        Open a flowchart tab to compare revisions.
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white">
      <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50/90 px-2 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5 text-indigo-700">
          <Columns2 size={14} className="flex-shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wide">Compare revisions</span>
        </div>

        <div className="flex flex-wrap rounded-lg border border-gray-200 overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setViewKind('stepMatrix')}
            className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
              viewKind === 'stepMatrix' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Step matrix
          </button>
          <button
            type="button"
            onClick={() => setViewKind('causeEffect')}
            className={`px-2.5 py-1 text-[10px] font-semibold transition-colors border-l border-gray-200 ${
              viewKind === 'causeEffect' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Cause & effect
          </button>
          <button
            type="button"
            onClick={() => setViewKind('flowOverview')}
            className={`px-2.5 py-1 text-[10px] font-semibold transition-colors border-l border-gray-200 ${
              viewKind === 'flowOverview' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Flow overview
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] text-gray-700">
          <span className="text-gray-500">Left</span>
          <select
            className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white max-w-[10rem]"
            value={leftSource}
            onChange={(e) => setLeftSource(e.target.value)}
          >
            <option value={CURRENT}>Current</option>
            {revisionOptions.map((r) => (
              <option key={r.id} value={r.id}>
                Rev {r.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-gray-700">
          <span className="text-gray-500">Right</span>
          <select
            className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white max-w-[10rem]"
            value={rightSource}
            onChange={(e) => setRightSource(e.target.value)}
          >
            <option value={CURRENT}>Current</option>
            {revisionOptions.map((r) => (
              <option key={r.id} value={r.id}>
                Rev {r.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[10px] font-semibold px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
        >
          Close compare
        </button>
      </div>

      {revisionOptions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm px-6 text-center gap-2">
          <p>No stamped revisions on this tab yet.</p>
          <p className="text-xs text-gray-400">Use Revisions → Stamp, then open compare again.</p>
        </div>
      ) : leftDiagram && rightDiagram ? (
        <div className="flex flex-row flex-1 overflow-hidden min-h-0">
          <div
            className="flex flex-col min-w-0 min-h-0 overflow-hidden border-r border-gray-200"
            style={{ flexBasis: `${100 - rightPanePct}%`, flexGrow: 0, flexShrink: 0 }}
          >
            <div className="flex-shrink-0 px-2 py-1 bg-slate-100/80 border-b border-gray-200 text-[10px] font-semibold text-slate-600">
              {leftSource === CURRENT ? 'Current' : `Rev ${revisionOptions.find((r) => r.id === leftSource)?.name ?? '—'}`}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {viewKind === 'flowOverview' ? (
                <SequencerFlowchartView
                  key={`f-l-${leftSource}-${viewKind}`}
                  readOnly
                  diagramOverride={leftDiagram}
                  fitViewKey={`compare-l-${leftSource}`}
                />
              ) : (
                <StepMatrixView
                  key={`m-l-${leftSource}-${viewKind}`}
                  readOnly
                  variant={viewKind === 'causeEffect' ? 'causeEffectOnly' : 'stepsOnly'}
                  diagramOverride={leftDiagram}
                />
              )}
            </div>
          </div>
          <div
            className="w-1.5 flex-shrink-0 cursor-col-resize bg-gray-200 hover:bg-indigo-400 active:bg-indigo-500 transition-colors relative z-10"
            onPointerDown={handleSplitDrag}
            title="Drag to resize"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
          <div
            className="flex flex-col min-w-0 min-h-0 overflow-hidden"
            style={{ flexBasis: `${rightPanePct}%`, flexGrow: 0, flexShrink: 0 }}
          >
            <div className="flex-shrink-0 px-2 py-1 bg-slate-100/80 border-b border-gray-200 text-[10px] font-semibold text-slate-600">
              {rightSource === CURRENT ? 'Current' : `Rev ${revisionOptions.find((r) => r.id === rightSource)?.name ?? '—'}`}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {viewKind === 'flowOverview' ? (
                <SequencerFlowchartView
                  key={`f-r-${rightSource}-${viewKind}`}
                  readOnly
                  diagramOverride={rightDiagram}
                  fitViewKey={`compare-r-${rightSource}`}
                />
              ) : (
                <StepMatrixView
                  key={`m-r-${rightSource}-${viewKind}`}
                  readOnly
                  variant={viewKind === 'causeEffect' ? 'causeEffectOnly' : 'stepsOnly'}
                  diagramOverride={rightDiagram}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
