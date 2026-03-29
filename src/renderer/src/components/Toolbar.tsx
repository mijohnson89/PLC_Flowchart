import { useEffect, useState } from 'react'
import { FileText, FolderOpen, Save, Undo2, Redo2, Network, History, BookOpen, Sheet, Columns2 } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import { PrintReportModal } from './PrintReportModal'
import { exportToExcel } from '../utils/exportToExcel'

interface ToolbarProps {
  showRevisions: boolean
  onToggleRevisions: () => void
  revisionCompareOpen: boolean
  onToggleRevisionCompare: () => void
  canRevisionCompare: boolean
}

export function Toolbar({
  showRevisions,
  onToggleRevisions,
  revisionCompareOpen,
  onToggleRevisionCompare,
  canRevisionCompare
}: ToolbarProps) {
  const { undo, redo } = useDiagramStore()

  const [showPrintReport, setShowPrintReport] = useState(false)

  useEffect(() => {
    const removers = [
      window.api.onMenu('menu-new', handleNew),
      window.api.onMenu('menu-open', handleOpen),
      window.api.onMenu('menu-save', handleSave),
      window.api.onMenu('menu-save-as', handleSaveAs),
      window.api.onMenu('menu-print-report', () => setShowPrintReport(true)),
      window.api.onMenu('menu-export-excel', handleExportExcel),
      window.api.onMenu('menu-import-l5k', handleImportL5K),
      window.api.onMenu('menu-undo', () => useDiagramStore.getState().undo()),
      window.api.onMenu('menu-redo', () => useDiagramStore.getState().redo())
    ]
    return () => removers.forEach((r) => r())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleNew() {
    useDiagramStore.getState().newProject()
    window.location.reload()
  }

  async function handleOpen() {
    const result = await window.api.openFile()
    if (result.success && result.content && result.filePath) {
      useDiagramStore.getState().loadProject(result.content, result.filePath)
    }
  }

  async function handleSave() {
    const s = useDiagramStore.getState()
    if (s.currentFilePath) {
      const result = await window.api.saveFile(s.toProject(), s.projectName, s.currentFilePath)
      if (result.success) {
        useDiagramStore.setState({ isDirty: false })
      }
    } else {
      await handleSaveAs()
    }
  }

  async function handleSaveAs() {
    const s = useDiagramStore.getState()
    const defaultPath = s.currentFilePath ?? `${s.projectName}.plcd`
    const result = await window.api.saveFile(s.toProject(), defaultPath)
    if (result.success && result.filePath) {
      s.setCurrentFilePath(result.filePath)
      useDiagramStore.setState({ isDirty: false })
    }
  }

  async function handleExportExcel() {
    try {
      const base64 = exportToExcel()
      const name = `${useDiagramStore.getState().projectName}.xlsx`
      await window.api.exportExcel(base64, name)
    } catch (err) {
      console.error('[ExportExcel] error:', err)
    }
  }

  async function handleImportL5K() {
    const r = await window.api.importL5K()
    if (r.success && r.text != null && r.fileName) {
      window.dispatchEvent(
        new CustomEvent('plc-import-l5k', { detail: { fileName: r.fileName, text: r.text } })
      )
    }
  }

  return (
  <>
    <header className="h-12 flex items-center gap-1 px-3 bg-white border-b border-gray-200 flex-shrink-0 shadow-sm">
      {/* Branding */}
      <div className="flex items-center gap-2 mr-3 pr-3 border-r border-gray-200">
        <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
          <Network size={14} className="text-white" />
        </div>
        <span className="text-xs font-bold text-gray-700 hidden sm:block">PLC UML</span>
      </div>

      {/* File operations */}
      <button onClick={handleNew}   title="New (Ctrl+N)" className="toolbar-btn"><FileText size={15} /></button>
      <button onClick={handleOpen}  title="Open (Ctrl+O)" className="toolbar-btn"><FolderOpen size={15} /></button>
      <button onClick={handleSave}  title="Save (Ctrl+S)" className="toolbar-btn"><Save size={15} /></button>

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Undo / Redo */}
      <button onClick={undo} title="Undo (Ctrl+Z)" className="toolbar-btn"><Undo2 size={15} /></button>
      <button onClick={redo} title="Redo (Ctrl+Y)" className="toolbar-btn"><Redo2 size={15} /></button>

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Print Report */}
      <button
        onClick={() => setShowPrintReport(true)}
        title="Print Report (Ctrl+Shift+P)"
        className="toolbar-btn flex items-center gap-1.5"
      >
        <BookOpen size={15} />
        <span className="text-xs hidden sm:block">Print Report</span>
      </button>

      {/* Export to Excel */}
      <button
        onClick={handleExportExcel}
        title="Export to Excel (Ctrl+Shift+E)"
        className="toolbar-btn flex items-center gap-1.5"
      >
        <Sheet size={15} />
        <span className="text-xs hidden sm:block">Export Excel</span>
      </button>

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Revision history toggle */}
      <button
        onClick={onToggleRevisions}
        title="Revision History"
        className={`toolbar-btn flex items-center gap-1.5 ${showRevisions ? 'text-emerald-600 bg-emerald-50' : ''}`}
      >
        <History size={15} />
        <span className="text-xs hidden sm:block">Revisions</span>
      </button>

      <button
        type="button"
        onClick={onToggleRevisionCompare}
        disabled={!canRevisionCompare}
        title={
          canRevisionCompare
            ? 'Side-by-side revision compare (matrix, cause & effect, or flow overview)'
            : 'Open a flowchart tab to compare revisions'
        }
        className={`toolbar-btn flex items-center gap-1.5 ${revisionCompareOpen ? 'text-indigo-600 bg-indigo-50' : ''} disabled:opacity-40 disabled:pointer-events-none`}
      >
        <Columns2 size={15} />
        <span className="text-xs hidden sm:block">Compare</span>
      </button>
    </header>

    {showPrintReport && <PrintReportModal onClose={() => setShowPrintReport(false)} />}
  </>
  )
}
