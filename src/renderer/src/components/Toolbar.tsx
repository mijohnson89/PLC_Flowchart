import { useEffect, useRef, useState } from 'react'
import { FileText, FolderOpen, Save, Undo2, Redo2, Network, Pencil, History, BookOpen, Sheet } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import { PrintReportModal } from './PrintReportModal'
import { exportToExcel } from '../utils/exportToExcel'

interface ToolbarProps {
  showRevisions: boolean
  onToggleRevisions: () => void
}

export function Toolbar({ showRevisions, onToggleRevisions }: ToolbarProps) {
  const {
    projectName, isDirty,
    setProjectName,
    undo, redo
  } = useDiagramStore()

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(projectName)
  const [showPrintReport, setShowPrintReport] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setNameValue(projectName) }, [projectName])

  useEffect(() => {
    const removers = [
      window.api.onMenu('menu-new', handleNew),
      window.api.onMenu('menu-open', handleOpen),
      window.api.onMenu('menu-save', handleSave),
      window.api.onMenu('menu-save-as', handleSaveAs),
      window.api.onMenu('menu-print-report', () => setShowPrintReport(true)),
      window.api.onMenu('menu-export-excel', handleExportExcel),
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
      await window.api.saveFile(s.toProject(), s.projectName)
      useDiagramStore.setState({ isDirty: false })
    } else {
      await handleSaveAs()
    }
  }

  async function handleSaveAs() {
    const s = useDiagramStore.getState()
    const result = await window.api.saveFile(s.toProject(), `${s.projectName}.plcd`)
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

  function commitName() {
    if (nameValue.trim()) setProjectName(nameValue.trim())
    setEditingName(false)
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

      {/* Project name (right side) */}
      <div className="ml-auto flex items-center gap-1.5">
        {editingName ? (
          <input
            ref={nameRef}
            autoFocus
            className="text-sm font-semibold text-gray-800 border-b-2 border-blue-500 bg-transparent focus:outline-none px-1"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false) }}
          />
        ) : (
          <button
            className="flex items-center gap-1 text-sm font-semibold text-gray-800 hover:text-blue-600 transition-colors"
            onClick={() => setEditingName(true)}
            title="Click to rename project"
          >
            {projectName}
            {isDirty && <span className="text-orange-400">●</span>}
            <Pencil size={11} className="text-gray-400" />
          </button>
        )}
      </div>
    </header>

    {showPrintReport && <PrintReportModal onClose={() => setShowPrintReport(false)} />}
  </>
  )
}
