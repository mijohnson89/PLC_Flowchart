import { Component, useRef, useState } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { useDiagramStore, selectIsViewingRevision } from './store/diagramStore'
import { Toolbar } from './components/Toolbar'
import { TabBar } from './components/TabBar'
import { Sidebar } from './components/Sidebar'
import { PropertiesPanel } from './components/PropertiesPanel'
import { SequenceCanvas } from './components/SequenceCanvas'
import { RevisionPanel } from './components/RevisionPanel'
import { RevisionChangesTable } from './components/RevisionChangesTable'
import { InterfacesPanel } from './components/InterfacesPanel'
import { DiagramTreeView } from './components/DiagramTreeView'
import { TasksPanel } from './components/TasksPanel'
import { IOTablePanel } from './components/IOTablePanel'
import { INTERFACES_TAB_ID, LOCATIONS_TAB_ID, TASKS_TAB_ID, IO_TABLE_TAB_ID, ALARMS_TAB_ID, NOTES_TAB_ID } from './types'
import { LocationsPanel } from './components/LocationsPanel'
import { FlowchartDiagramPanes } from './components/FlowchartDiagramPanes'
import { AlarmsPanel } from './components/AlarmsPanel'
import { NotesPanel } from './components/NotesPanel'
import { PhasesPanel } from './components/PhasesPanel'
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

export default function App() {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const activeTab = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const isViewingRevision = useDiagramStore(selectIsViewingRevision)
  const [showRevisions, setShowRevisions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const isInterfacesTab = activeTabId === INTERFACES_TAB_ID
  const isLocationsTab = activeTabId === LOCATIONS_TAB_ID
  const isTasksTab = activeTabId === TASKS_TAB_ID
  const isIOTableTab = activeTabId === IO_TABLE_TAB_ID
  const isAlarmsTab = activeTabId === ALARMS_TAB_ID
  const isNotesTab = activeTabId === NOTES_TAB_ID
  const isSpecialTab = isInterfacesTab || isLocationsTab || isTasksTab || isIOTableTab || isAlarmsTab || isNotesTab
  const isFlowchart = !isSpecialTab && activeTab?.type === 'flowchart'
  const readOnly = isViewingRevision

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
            <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden min-h-0">
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <DiagramTreeView />
              </div>
              {isFlowchart && <PhasesPanel />}
              {!isSpecialTab && (
                <>
                  <div className="border-t border-gray-200 flex-shrink-0" />
                  {!isFlowchart && <Sidebar />}
                  {!isFlowchart && !showRevisions && <PropertiesPanel />}
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
              ) : isNotesTab ? (
                <NotesPanel />
              ) : activeTab?.type === 'sequence' ? (
                <SequenceCanvas key={activeTab.id} readOnly={readOnly} />
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <FlowchartDiagramPanes key={activeTab?.id} readOnly={readOnly} />
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
