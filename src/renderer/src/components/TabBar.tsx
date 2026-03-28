import { useState, useRef, useEffect } from 'react'
import { Plus, X, Network, AlignJustify, Pencil, Check, Layers, ClipboardList, TableProperties, Building2, BellRing, FileText } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type { DiagramMode, DiagramTab } from '../types'
import { INTERFACES_TAB_ID, LOCATIONS_TAB_ID, TASKS_TAB_ID, IO_TABLE_TAB_ID, ALARMS_TAB_ID, NOTES_TAB_ID } from '../types'

const TYPE_ICON: Record<DiagramMode, React.ReactNode> = {
  flowchart: <Network size={12} />,
  sequence: <AlignJustify size={12} />
}
const TYPE_LABEL: Record<DiagramMode, string> = {
  flowchart: 'Flowchart',
  sequence: 'Sequence'
}

// ── New-tab dialog ────────────────────────────────────────────────────────────
function NewTabDialog({ onConfirm, onCancel }: {
  onConfirm: (name: string, type: DiagramMode) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<DiagramMode>('flowchart')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed, type)
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-80 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold text-gray-800 mb-4">New Diagram</h2>

        <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">
          Name
        </label>
        <input
          ref={inputRef}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
          placeholder="e.g. Motor Start Sequence"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        />

        <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-2">
          Type
        </label>
        <div className="flex gap-2 mb-5">
          {(['flowchart', 'sequence'] as DiagramMode[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                type === t
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {TYPE_ICON[t]}
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TabBar ────────────────────────────────────────────────────────────────────
export function TabBar() {
  const { tabs, activeTabId, openTabIds, addTab, closeTab, renameTab, setActiveTab } = useDiagramStore()
  const [showNewTab, setShowNewTab] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const isInterfacesActive = activeTabId === INTERFACES_TAB_ID
  const isLocationsActive = activeTabId === LOCATIONS_TAB_ID
  const isTasksActive = activeTabId === TASKS_TAB_ID
  const isIOTableActive = activeTabId === IO_TABLE_TAB_ID
  const isAlarmsActive = activeTabId === ALARMS_TAB_ID
  const isNotesActive = activeTabId === NOTES_TAB_ID
  const openTabs = openTabIds
    .map((id) => tabs.find((t) => t.id === id))
    .filter((t): t is DiagramTab => t !== undefined)

  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

  function startRename(id: string, currentName: string, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(id)
    setEditValue(currentName)
  }

  function commitRename() {
    if (editingId && editValue.trim()) {
      renameTab(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  function handleClose(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    closeTab(id)
  }

  return (
    <>
      <div data-print-hide className="flex items-end bg-gray-100 border-b border-gray-200 px-2 pt-1 overflow-x-auto flex-shrink-0 min-h-[36px]">

        {/* Static Interfaces tab — always first, never closeable */}
        <div
          onClick={() => setActiveTab(INTERFACES_TAB_ID)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-t-lg
            text-xs whitespace-nowrap cursor-pointer select-none transition-colors
            border border-b-0
            ${isInterfacesActive
              ? 'bg-white text-indigo-700 font-semibold border-gray-200 shadow-sm z-10'
              : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200 hover:text-indigo-600'}
          `}
          title="Project interfaces — AOIs, UDTs and their instances"
        >
          <span className={isInterfacesActive ? 'text-indigo-500' : 'text-gray-400'}>
            <Layers size={12} />
          </span>
          <span>Interfaces</span>
        </div>

        {/* Static Locations tab */}
        <div
          onClick={() => setActiveTab(LOCATIONS_TAB_ID)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-t-lg
            text-xs whitespace-nowrap cursor-pointer select-none transition-colors
            border border-b-0
            ${isLocationsActive
              ? 'bg-white text-indigo-700 font-semibold border-gray-200 shadow-sm z-10'
              : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200 hover:text-indigo-600'}
          `}
          title="Plant hierarchy — plants, areas and locations"
        >
          <span className={isLocationsActive ? 'text-indigo-500' : 'text-gray-400'}>
            <Building2 size={12} />
          </span>
          <span>Locations</span>
        </div>

        {/* Static Tasks tab */}
        <div
          onClick={() => setActiveTab(TASKS_TAB_ID)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-t-lg
            text-xs whitespace-nowrap cursor-pointer select-none transition-colors
            border border-b-0
            ${isTasksActive
              ? 'bg-white text-indigo-700 font-semibold border-gray-200 shadow-sm z-10'
              : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200 hover:text-indigo-600'}
          `}
          title="Task tracking — design, program and test progress"
        >
          <span className={isTasksActive ? 'text-indigo-500' : 'text-gray-400'}>
            <ClipboardList size={12} />
          </span>
          <span>Tasks</span>
        </div>

        {/* Static IO Table tab */}
        <div
          onClick={() => setActiveTab(IO_TABLE_TAB_ID)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-t-lg
            text-xs whitespace-nowrap cursor-pointer select-none transition-colors
            border border-b-0
            ${isIOTableActive
              ? 'bg-white text-indigo-700 font-semibold border-gray-200 shadow-sm z-10'
              : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200 hover:text-indigo-600'}
          `}
          title="IO Table — rack, slot, channel mappings"
        >
          <span className={isIOTableActive ? 'text-indigo-500' : 'text-gray-400'}>
            <TableProperties size={12} />
          </span>
          <span>IO Table</span>
        </div>

        {/* Static Alarms tab */}
        <div
          onClick={() => setActiveTab(ALARMS_TAB_ID)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-t-lg
            text-xs whitespace-nowrap cursor-pointer select-none transition-colors
            border border-b-0
            ${isAlarmsActive
              ? 'bg-white text-indigo-700 font-semibold border-gray-200 shadow-sm z-10'
              : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200 hover:text-indigo-600'}
          `}
          title="Alarms — once-off and per-instance alarms"
        >
          <span className={isAlarmsActive ? 'text-indigo-500' : 'text-gray-400'}>
            <BellRing size={12} />
          </span>
          <span>Alarms</span>
        </div>

        {/* Static Notes tab */}
        <div
          onClick={() => setActiveTab(NOTES_TAB_ID)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-t-lg
            text-xs whitespace-nowrap cursor-pointer select-none transition-colors
            border border-b-0
            ${isNotesActive
              ? 'bg-white text-indigo-700 font-semibold border-gray-200 shadow-sm z-10'
              : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200 hover:text-indigo-600'}
          `}
          title="Notes — documents, links and reference files"
        >
          <span className={isNotesActive ? 'text-indigo-500' : 'text-gray-400'}>
            <FileText size={12} />
          </span>
          <span>Notes</span>
        </div>

        {/* Divider between static tabs and diagram tabs */}
        <div className="w-px h-4 bg-gray-300 self-center mr-1 flex-shrink-0" />

        {openTabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const isEditing = editingId === tab.id

          return (
            <div
              key={tab.id}
              onClick={() => !isEditing && setActiveTab(tab.id)}
              className={`
                group relative flex items-center gap-1.5 px-3 py-1.5 mr-0.5 rounded-t-lg
                text-xs whitespace-nowrap cursor-pointer select-none transition-colors
                border border-b-0 min-w-0 max-w-[180px]
                ${isActive
                  ? 'bg-white text-gray-800 font-semibold border-gray-200 shadow-sm z-10'
                  : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200 hover:text-gray-700'}
              `}
            >
              {/* Type icon */}
              <span className={isActive ? 'text-blue-500' : 'text-gray-400'}>
                {TYPE_ICON[tab.type]}
              </span>

              {/* Name — inline edit on double-click */}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  className="w-24 text-xs bg-transparent border-b border-blue-400 focus:outline-none py-0"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                    e.stopPropagation()
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="truncate max-w-[100px]"
                  onDoubleClick={(e) => startRename(tab.id, tab.name, e)}
                  title={`${tab.name} (double-click to rename)`}
                >
                  {tab.name}
                </span>
              )}

              {/* Rename / close buttons — visible on hover or active */}
              <div className={`flex items-center gap-0.5 ml-0.5 ${isActive || isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                {isEditing ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); commitRename() }}
                    className="p-0.5 text-blue-500 hover:text-blue-700 rounded"
                  >
                    <Check size={10} />
                  </button>
                ) : (
                  <button
                    onClick={(e) => startRename(tab.id, tab.name, e)}
                    className="p-0.5 text-gray-400 hover:text-gray-700 rounded"
                    title="Rename"
                  >
                    <Pencil size={10} />
                  </button>
                )}
                <button
                  onClick={(e) => handleClose(tab.id, e)}
                  className="p-0.5 text-gray-400 hover:text-red-500 rounded"
                  title="Close tab"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          )
        })}

        {/* Add tab button */}
        <button
          onClick={() => setShowNewTab(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 mb-px text-gray-400 hover:text-blue-600 hover:bg-white rounded-t-lg border border-transparent hover:border-gray-200 text-xs transition-all"
          title="New diagram tab"
        >
          <Plus size={13} />
        </button>
      </div>

      {showNewTab && (
        <NewTabDialog
          onConfirm={(name, type) => { addTab(name, type); setShowNewTab(false) }}
          onCancel={() => setShowNewTab(false)}
        />
      )}
    </>
  )
}
