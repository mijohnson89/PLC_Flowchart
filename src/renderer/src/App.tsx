import { useCallback, useRef, useState } from 'react'
import { useDiagramStore, selectIsViewingRevision } from './store/diagramStore'
import { Toolbar } from './components/Toolbar'
import { TabBar } from './components/TabBar'
import { Sidebar } from './components/Sidebar'
import { PropertiesPanel } from './components/PropertiesPanel'
import { FlowchartCanvas } from './components/FlowchartCanvas'
import type { CanvasExportRef } from './components/FlowchartCanvas'
import { SequenceCanvas } from './components/SequenceCanvas'
import { RevisionPanel } from './components/RevisionPanel'
import { InterfacesPanel } from './components/InterfacesPanel'
import { MatrixView } from './components/MatrixView'
import { INTERFACES_TAB_ID } from './types'
import { Grid3x3, PanelRightClose, PanelRightOpen } from 'lucide-react'

// ── Resizable divider ──────────────────────────────────────────────────────────

function ResizeDivider({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    let lastX = e.clientX
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      onDrag(ev.clientX - lastX)
      lastX = ev.clientX
    }

    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
  }, [onDrag])

  return (
    <div
      className="w-1.5 cursor-col-resize flex-shrink-0 bg-gray-200 hover:bg-indigo-400 active:bg-indigo-500 transition-colors relative group"
      onPointerDown={handlePointerDown}
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  )
}

export default function App() {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const activeTab = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const isViewingRevision = useDiagramStore(selectIsViewingRevision)
  const exportRef = useRef<CanvasExportRef | null>(null)
  const [showRevisions, setShowRevisions] = useState(false)
  const [showMatrix, setShowMatrix] = useState(false)
  const [matrixWidthPct, setMatrixWidthPct] = useState(45)
  const containerRef = useRef<HTMLDivElement>(null)

  const isInterfacesTab = activeTabId === INTERFACES_TAB_ID
  const isFlowchart = !isInterfacesTab && activeTab?.type === 'flowchart'
  const readOnly = isViewingRevision

  const handleDividerDrag = useCallback((deltaX: number) => {
    if (!containerRef.current) return
    const totalW = containerRef.current.getBoundingClientRect().width
    if (totalW < 1) return
    const deltaPct = (deltaX / totalW) * 100
    setMatrixWidthPct((prev) => Math.min(75, Math.max(20, prev - deltaPct)))
  }, [])

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      <Toolbar
        exportRef={exportRef}
        showRevisions={showRevisions}
        onToggleRevisions={() => setShowRevisions((v) => !v)}
      />
      <TabBar />

      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {!isInterfacesTab && <Sidebar />}

        <main className="flex-1 overflow-hidden relative flex">
          {isInterfacesTab ? (
            <InterfacesPanel />
          ) : activeTab?.type === 'sequence' ? (
            <SequenceCanvas key={activeTab.id} readOnly={readOnly} />
          ) : (
            <>
              {/* Flowchart canvas */}
              <div className="flex-1 overflow-hidden relative" style={showMatrix ? { flexBasis: `${100 - matrixWidthPct}%`, flexGrow: 0, flexShrink: 0 } : undefined}>
                <FlowchartCanvas key={activeTab?.id} exportRef={exportRef} readOnly={readOnly} />

                {/* Matrix toggle button — bottom-left, next to existing panel buttons */}
                <button
                  onClick={() => setShowMatrix((v) => !v)}
                  title={showMatrix ? 'Hide Cause & Effect matrix' : 'Show Cause & Effect matrix'}
                  className={`absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow text-xs font-medium transition-all border ${
                    showMatrix
                      ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  <Grid3x3 size={13} />
                  {showMatrix ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
                  C&amp;E
                </button>
              </div>

              {/* Resizable matrix panel */}
              {showMatrix && (
                <>
                  <ResizeDivider onDrag={handleDividerDrag} />
                  <div
                    className="overflow-hidden border-l border-gray-200 bg-white flex flex-col"
                    style={{ flexBasis: `${matrixWidthPct}%`, flexGrow: 0, flexShrink: 0 }}
                  >
                    {/* Panel header */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
                      <Grid3x3 size={12} className="text-indigo-500" />
                      <span className="text-xs font-semibold text-indigo-700">Cause &amp; Effect — {activeTab?.name}</span>
                    </div>
                    <MatrixView tabId={activeTab?.id} />
                  </div>
                </>
              )}
            </>
          )}
        </main>

        {!isInterfacesTab && isFlowchart && !showRevisions && <PropertiesPanel />}
        {!isInterfacesTab && showRevisions && <RevisionPanel />}
      </div>
    </div>
  )
}
