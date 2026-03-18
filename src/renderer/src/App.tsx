import { useRef, useState } from 'react'
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
import { INTERFACES_TAB_ID } from './types'

export default function App() {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const activeTab = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const isViewingRevision = useDiagramStore(selectIsViewingRevision)
  const exportRef = useRef<CanvasExportRef | null>(null)
  const [showRevisions, setShowRevisions] = useState(false)

  const isInterfacesTab = activeTabId === INTERFACES_TAB_ID
  const readOnly = isViewingRevision

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      <Toolbar
        exportRef={exportRef}
        showRevisions={showRevisions}
        onToggleRevisions={() => setShowRevisions((v) => !v)}
      />
      <TabBar />

      <div className="flex flex-1 overflow-hidden">
        {!isInterfacesTab && <Sidebar />}

        <main className="flex-1 overflow-hidden relative flex">
          {isInterfacesTab ? (
            <InterfacesPanel />
          ) : activeTab?.type === 'sequence' ? (
            <SequenceCanvas key={activeTab.id} readOnly={readOnly} />
          ) : (
            <FlowchartCanvas key={activeTab?.id} exportRef={exportRef} readOnly={readOnly} />
          )}
        </main>

        {!isInterfacesTab && activeTab?.type === 'flowchart' && !showRevisions && <PropertiesPanel />}
        {!isInterfacesTab && showRevisions && <RevisionPanel />}
      </div>
    </div>
  )
}
