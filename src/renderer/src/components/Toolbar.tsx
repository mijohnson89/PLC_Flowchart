import { useEffect, useRef, useState } from 'react'
import { FileText, FolderOpen, Save, Download, Undo2, Redo2, Network, ChevronDown, Pencil, History, BookOpen } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import { PrintReportModal } from './PrintReportModal'

interface ToolbarProps {
  exportRef: React.MutableRefObject<{
    exportPng: () => Promise<void>
    exportSvg: () => Promise<void>
    exportPdf?: () => Promise<void>
  } | null>
  showRevisions: boolean
  onToggleRevisions: () => void
}

export function Toolbar({ exportRef, showRevisions, onToggleRevisions }: ToolbarProps) {
  const {
    projectName, isDirty,
    setProjectName,
    undo, redo
  } = useDiagramStore()

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(projectName)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [showPrintReport, setShowPrintReport] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  function handlePrintPdf() {
    const state    = useDiagramStore.getState()
    const tab      = state.tabs.find((t) => t.id === state.activeTabId)
    const pageSize = tab?.pageSize
    const orient   = tab?.pageOrientation ?? 'portrait'

    // Inject a temporary @page rule so the OS print dialog defaults to the
    // correct paper size and orientation. Removed after the dialog closes.
    let injected: HTMLStyleElement | null = null
    if (pageSize) {
      injected = document.createElement('style')
      injected.dataset.printPageRule = 'true'
      injected.textContent = `@page { size: ${pageSize.toLowerCase()} ${orient}; margin: 0; }`
      document.head.appendChild(injected)
    }

    window.print()

    // Clean up after a short delay — print() returns before the user finishes.
    setTimeout(() => injected?.remove(), 3000)
  }

  useEffect(() => { setNameValue(projectName) }, [projectName])

  useEffect(() => {
    const removers = [
      window.api.onMenu('menu-new', handleNew),
      window.api.onMenu('menu-open', handleOpen),
      window.api.onMenu('menu-save', handleSave),
      window.api.onMenu('menu-save-as', handleSaveAs),
      window.api.onMenu('menu-export-png', () => exportRef.current?.exportPng()),
      window.api.onMenu('menu-export-svg', () => exportRef.current?.exportSvg()),
      window.api.onMenu('menu-export-pdf', () => exportRef.current?.exportPdf?.()),
      window.api.onMenu('menu-print-pdf',  handlePrintPdf),
      window.api.onMenu('menu-print-report', () => setShowPrintReport(true)),
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

      {/* Export */}
      <div className="relative">
        <button
          onClick={() => setExportMenuOpen((p) => !p)}
          className="toolbar-btn flex items-center gap-1"
          title="Export diagram"
        >
          <Download size={15} />
          <ChevronDown size={11} />
        </button>
        {exportMenuOpen && (
          <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
            <button className="w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700"
              onClick={() => { exportRef.current?.exportPng(); setExportMenuOpen(false) }}>
              Export as PNG
            </button>
            <button className="w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700"
              onClick={() => { exportRef.current?.exportSvg(); setExportMenuOpen(false) }}>
              Export as SVG
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button className="w-full text-left text-xs px-3 py-2 hover:bg-indigo-50 text-indigo-700 font-medium flex items-center justify-between"
              onClick={() => { exportRef.current?.exportPdf?.(); setExportMenuOpen(false) }}>
              <span>Export as PDF</span>
              <span className="text-[9px] text-indigo-400 font-normal">page size</span>
            </button>
            <button className="w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700 flex items-center justify-between"
              onClick={() => { handlePrintPdf(); setExportMenuOpen(false) }}>
              <span>Print to PDF…</span>
              <span className="text-[9px] text-gray-400 font-normal">Ctrl+P</span>
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button className="w-full text-left text-xs px-3 py-2 hover:bg-indigo-50 text-indigo-700 font-medium flex items-center gap-2"
              onClick={() => { setShowPrintReport(true); setExportMenuOpen(false) }}>
              <BookOpen size={13} />
              <span>Print Report…</span>
            </button>
          </div>
        )}
      </div>

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
