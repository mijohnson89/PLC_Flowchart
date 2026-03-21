import { Component, useCallback, useRef, useState } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { useDiagramStore, selectIsViewingRevision } from './store/diagramStore'
import { Toolbar } from './components/Toolbar'
import { TabBar } from './components/TabBar'
import { Sidebar } from './components/Sidebar'
import { PropertiesPanel } from './components/PropertiesPanel'
import { FlowchartCanvas } from './components/FlowchartCanvas'
import { SequenceCanvas } from './components/SequenceCanvas'
import { RevisionPanel } from './components/RevisionPanel'
import { RevisionChangesTable } from './components/RevisionChangesTable'
import { InterfacesPanel } from './components/InterfacesPanel'
import { DiagramTreeView } from './components/DiagramTreeView'
import { MatrixView } from './components/MatrixView'
import { TasksPanel } from './components/TasksPanel'
import { IOTablePanel } from './components/IOTablePanel'
import { INTERFACES_TAB_ID, LOCATIONS_TAB_ID, TASKS_TAB_ID, IO_TABLE_TAB_ID, ALARMS_TAB_ID } from './types'
import { LocationsPanel } from './components/LocationsPanel'
import { ConditionsPanel } from './components/ConditionsPanel'
import { AlarmsPanel } from './components/AlarmsPanel'
import { Grid3x3, ShieldAlert } from 'lucide-react'

// ── Error boundary ────────────────────────────────────────────────────────────

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { error: err } }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[App crash]', err, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-100 p-8">
          <div className="bg-white rounded-xl shadow-lg border border-red-200 max-w-lg w-full p-6">
            <h1 className="text-lg font-bold text-red-700 mb-2">Something went wrong</h1>
            <pre className="text-xs text-red-600 bg-red-50 rounded-lg p-3 overflow-auto max-h-48 mb-4 whitespace-pre-wrap">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

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
  const [showRevisions, setShowRevisions] = useState(false)
  const [showMatrix, setShowMatrix] = useState(false)
  const [matrixWidthPct, setMatrixWidthPct] = useState(45)
  const [showConditions, setShowConditions] = useState(false)
  const [conditionsPct, setConditionsPct] = useState(30)
  const containerRef = useRef<HTMLDivElement>(null)
  const flowContainerRef = useRef<HTMLDivElement>(null)

  const isInterfacesTab = activeTabId === INTERFACES_TAB_ID
  const isLocationsTab = activeTabId === LOCATIONS_TAB_ID
  const isTasksTab = activeTabId === TASKS_TAB_ID
  const isIOTableTab = activeTabId === IO_TABLE_TAB_ID
  const isAlarmsTab = activeTabId === ALARMS_TAB_ID
  const isSpecialTab = isInterfacesTab || isLocationsTab || isTasksTab || isIOTableTab || isAlarmsTab
  const isFlowchart = !isSpecialTab && activeTab?.type === 'flowchart'
  const readOnly = isViewingRevision

  const handleDividerDrag = useCallback((deltaX: number) => {
    if (!containerRef.current) return
    const totalW = containerRef.current.getBoundingClientRect().width
    if (totalW < 1) return
    const deltaPct = (deltaX / totalW) * 100
    setMatrixWidthPct((prev) => Math.min(75, Math.max(20, prev - deltaPct)))
  }, [])

  const handleConditionsDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    let lastY = e.clientY
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => {
      if (!flowContainerRef.current) return
      const totalH = flowContainerRef.current.getBoundingClientRect().height
      if (totalH < 1) return
      const deltaPct = ((ev.clientY - lastY) / totalH) * 100
      lastY = ev.clientY
      setConditionsPct((prev) => Math.min(60, Math.max(15, prev - deltaPct)))
    }
    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
  }, [])

  return (
    <AppErrorBoundary>
      <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
        <Toolbar
          showRevisions={showRevisions}
          onToggleRevisions={() => setShowRevisions((v) => !v)}
        />
        <TabBar />

        <div ref={containerRef} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden min-h-0">
            <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
              <DiagramTreeView />
              {!isSpecialTab && (
                <>
                  <div className="border-t border-gray-200" />
                  <Sidebar />
                  {isFlowchart && !showRevisions && <PropertiesPanel />}
                </>
              )}
            </div>

            <main className="flex-1 overflow-hidden relative flex">
              {isInterfacesTab ? (
                <InterfacesPanel />
              ) : isLocationsTab ? (
                <LocationsPanel />
              ) : isTasksTab ? (
                <TasksPanel />
              ) : isIOTableTab ? (
                <IOTablePanel />
              ) : isAlarmsTab ? (
                <AlarmsPanel />
              ) : activeTab?.type === 'sequence' ? (
                <SequenceCanvas key={activeTab.id} readOnly={readOnly} />
              ) : (
                <div ref={flowContainerRef} className="flex-1 flex flex-col overflow-hidden">
                  {/* Flowchart + optional matrix (horizontal split) */}
                  <div className="flex overflow-hidden" style={showConditions ? { flexBasis: `${100 - conditionsPct}%`, flexGrow: 0, flexShrink: 0 } : { flex: '1 1 0%' }}>
                    {/* Flowchart canvas */}
                    <div className="flex-1 overflow-hidden relative" style={showMatrix ? { flexBasis: `${100 - matrixWidthPct}%`, flexGrow: 0, flexShrink: 0 } : undefined}>
                      <FlowchartCanvas
                        key={activeTab?.id}
                        readOnly={readOnly}
                        showMatrix={showMatrix}
                        onToggleMatrix={() => setShowMatrix((v) => !v)}
                        showConditions={showConditions}
                        onToggleConditions={() => setShowConditions((v) => !v)}
                      />
                    </div>

                    {/* Resizable matrix panel */}
                    {showMatrix && (
                      <>
                        <ResizeDivider onDrag={handleDividerDrag} />
                        <div
                          className="overflow-hidden border-l border-gray-200 bg-white flex flex-col"
                          style={{ flexBasis: `${matrixWidthPct}%`, flexGrow: 0, flexShrink: 0 }}
                        >
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
                            <Grid3x3 size={12} className="text-indigo-500" />
                            <span className="text-xs font-semibold text-indigo-700">Cause &amp; Effect — {activeTab?.name}</span>
                          </div>
                          <MatrixView tabId={activeTab?.id} />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Conditions bottom panel */}
                  {showConditions && (
                    <>
                      <div
                        className="h-1.5 cursor-row-resize flex-shrink-0 bg-gray-200 hover:bg-red-400 active:bg-red-500 transition-colors relative"
                        onPointerDown={handleConditionsDrag}
                      >
                        <div className="absolute inset-x-0 -top-1 -bottom-1" />
                      </div>
                      <div
                        className="flex flex-col min-h-0 overflow-hidden border-t border-gray-200"
                        style={{ flexBasis: `${conditionsPct}%`, flexGrow: 0, flexShrink: 0 }}
                      >
                        <ConditionsPanel />
                      </div>
                    </>
                  )}
                </div>
              )}
            </main>

            {!isSpecialTab && showRevisions && <RevisionPanel />}
          </div>

          {!isSpecialTab && showRevisions && <RevisionChangesTable />}
        </div>
      </div>
    </AppErrorBoundary>
  )
}
