import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check,
  Network, AlignJustify, Link2, Unlink,
  ClipboardList, CheckSquare, Square,
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, Strikethrough, StickyNote, Minus
} from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type { Task, SubTask } from '../types'

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ task }: { task: Task }) {
  const total = task.subTasks.length * 3
  if (total === 0) return <span className="text-[10px] text-gray-400 italic">No subtasks</span>

  const done = task.subTasks.reduce(
    (acc, st) => acc + (st.designed ? 1 : 0) + (st.programmed ? 1 : 0) + (st.tested ? 1 : 0),
    0
  )
  const pct = Math.round((done / total) * 100)

  const barColor =
    pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-blue-400'

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden min-w-[60px]">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-semibold tabular-nums flex-shrink-0 ${pct === 100 ? 'text-emerald-600' : 'text-gray-500'}`}>
        {pct}%
      </span>
    </div>
  )
}

// ── Inline text input ────────────────────────────────────────────────────────

function InlineEdit({ value, onCommit, onCancel, placeholder }: {
  value: string
  onCommit: (v: string) => void
  onCancel: () => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.select() }, [])

  return (
    <input
      ref={ref}
      autoFocus
      className="text-sm bg-white border border-indigo-400 rounded px-2 py-1 outline-none w-full"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { const t = draft.trim(); if (t) onCommit(t); else onCancel() }
        if (e.key === 'Escape') onCancel()
        e.stopPropagation()
      }}
      onBlur={() => { const t = draft.trim(); if (t && t !== value) onCommit(t); else onCancel() }}
    />
  )
}

// ── Tab link selector ────────────────────────────────────────────────────────

function TabLinkSelector({ type, currentId, onSelect }: {
  type: 'flowchart' | 'sequence'
  currentId: string | null
  onSelect: (id: string | null) => void
}) {
  const allTabs = useDiagramStore((s) => s.tabs)
  const setActiveTab = useDiagramStore((s) => s.setActiveTab)
  const tabs = allTabs.filter((t) => t.type === type)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const linked = tabs.find((t) => t.id === currentId)
  const icon = type === 'flowchart' ? <Network size={11} /> : <AlignJustify size={11} />
  const label = type === 'flowchart' ? 'Flowchart' : 'Sequence'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border transition-colors ${
          linked
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
            : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
        }`}
        title={linked ? `Linked: ${linked.name}` : `Link ${label}`}
      >
        {icon}
        <span className="truncate max-w-[100px]">{linked ? linked.name : label}</span>
        {linked ? <Link2 size={9} /> : <Unlink size={9} className="opacity-50" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[180px] py-1 max-h-48 overflow-y-auto">
          {linked && (
            <>
              <button
                onClick={() => { setActiveTab(linked.id); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-indigo-600 hover:bg-indigo-50"
              >
                {icon} Go to {linked.name}
              </button>
              <button
                onClick={() => { onSelect(null); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-50"
              >
                <Unlink size={10} /> Unlink
              </button>
              <div className="h-px bg-gray-100 my-1" />
            </>
          )}
          {tabs.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-gray-400 italic">No {label.toLowerCase()}s</div>
          )}
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { onSelect(t.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-50 ${
                t.id === currentId ? 'text-indigo-600 font-semibold' : 'text-gray-700'
              }`}
            >
              {icon} {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Subtask row ──────────────────────────────────────────────────────────────

function SubTaskRow({ sub, taskId }: { sub: SubTask; taskId: string }) {
  const { updateSubTask, removeSubTask } = useDiagramStore()
  const [editing, setEditing] = useState(false)

  const allDone = sub.designed && sub.programmed && sub.tested

  const checkbox = (field: 'designed' | 'programmed' | 'tested', label: string, color: string) => {
    const checked = sub[field]
    return (
      <button
        onClick={() => updateSubTask(taskId, sub.id, { [field]: !checked })}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
          checked ? `${color} ring-1 ring-inset` : 'text-gray-400 hover:text-gray-600'
        }`}
        title={`${label}: ${checked ? 'Done' : 'Pending'}`}
      >
        {checked ? <CheckSquare size={11} /> : <Square size={11} />}
        {label}
      </button>
    )
  }

  return (
    <div className={`group flex items-center gap-2 px-3 py-1.5 ml-6 border-l-2 transition-colors ${
      allDone ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 hover:bg-gray-50'
    }`}>
      <div className="flex-1 min-w-0">
        {editing ? (
          <InlineEdit
            value={sub.name}
            onCommit={(v) => { updateSubTask(taskId, sub.id, { name: v }); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span
            onDoubleClick={() => setEditing(true)}
            className={`text-xs cursor-default ${allDone ? 'line-through text-gray-400' : 'text-gray-700'}`}
            title="Double-click to rename"
          >
            {sub.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {checkbox('designed', 'Des', 'bg-sky-100 text-sky-700 ring-sky-300')}
        {checkbox('programmed', 'Prog', 'bg-violet-100 text-violet-700 ring-violet-300')}
        {checkbox('tested', 'Test', 'bg-emerald-100 text-emerald-700 ring-emerald-300')}
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={() => setEditing(true)} className="p-0.5 text-gray-400 hover:text-gray-600 rounded" title="Rename">
          <Pencil size={10} />
        </button>
        <button onClick={() => removeSubTask(taskId, sub.id)} className="p-0.5 text-gray-400 hover:text-red-500 rounded" title="Delete">
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  )
}

// ── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: Task }) {
  const { updateTask, removeTask, addSubTask } = useDiagramStore()
  const [expanded, setExpanded] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [addingSub, setAddingSub] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const addRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingSub) addRef.current?.focus()
  }, [addingSub])

  const submitSub = () => {
    const name = newSubName.trim()
    if (name) {
      addSubTask(task.id, name)
      setNewSubName('')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50/60">
        <button onClick={() => setExpanded((v) => !v)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        <div className="flex-1 min-w-0">
          {editingName ? (
            <InlineEdit
              value={task.name}
              onCommit={(v) => { updateTask(task.id, { name: v }); setEditingName(false) }}
              onCancel={() => setEditingName(false)}
            />
          ) : (
            <h3
              onDoubleClick={() => setEditingName(true)}
              className="text-sm font-semibold text-gray-800 truncate cursor-default"
              title="Double-click to rename"
            >
              {task.name}
            </h3>
          )}
        </div>

        <div className="flex-shrink-0 w-32">
          <ProgressBar task={task} />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setEditingName(true)} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Rename task">
            <Pencil size={12} />
          </button>
          <button onClick={() => removeTask(task.id)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Delete task">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Linked diagrams */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/30">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mr-1">Linked</span>
            <TabLinkSelector
              type="flowchart"
              currentId={task.flowchartTabId}
              onSelect={(id) => updateTask(task.id, { flowchartTabId: id })}
            />
            <TabLinkSelector
              type="sequence"
              currentId={task.sequenceTabId}
              onSelect={(id) => updateTask(task.id, { sequenceTabId: id })}
            />
          </div>

          {/* Subtasks list */}
          <div className="py-1">
            {task.subTasks.length === 0 && !addingSub && (
              <div className="px-3 py-3 text-center">
                <p className="text-[11px] text-gray-400 mb-2">No subtasks yet</p>
                <button
                  onClick={() => setAddingSub(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <Plus size={11} /> Add subtask
                </button>
              </div>
            )}

            {task.subTasks.map((sub) => (
              <SubTaskRow key={sub.id} sub={sub} taskId={task.id} />
            ))}

            {/* Add subtask input */}
            {addingSub ? (
              <div className="flex items-center gap-2 px-3 py-1.5 ml-6 border-l-2 border-indigo-300">
                <input
                  ref={addRef}
                  className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="Subtask name…"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { submitSub(); addRef.current?.focus() }
                    if (e.key === 'Escape') { setAddingSub(false); setNewSubName('') }
                  }}
                />
                <button onClick={submitSub} className="p-1 text-indigo-500 hover:text-indigo-700 rounded" title="Add">
                  <Check size={13} />
                </button>
              </div>
            ) : task.subTasks.length > 0 && (
              <button
                onClick={() => setAddingSub(true)}
                className="flex items-center gap-1 px-3 py-1.5 ml-6 text-[11px] text-gray-400 hover:text-indigo-600 transition-colors"
              >
                <Plus size={11} /> Add subtask
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Header stats ─────────────────────────────────────────────────────────────

function Stats({ tasks }: { tasks: Task[] }) {
  const totalSubs = tasks.reduce((a, t) => a + t.subTasks.length, 0)
  const totalChecks = totalSubs * 3
  const doneChecks = tasks.reduce(
    (a, t) => a + t.subTasks.reduce(
      (b, st) => b + (st.designed ? 1 : 0) + (st.programmed ? 1 : 0) + (st.tested ? 1 : 0), 0
    ), 0
  )
  const overallPct = totalChecks > 0 ? Math.round((doneChecks / totalChecks) * 100) : 0

  const completedTasks = tasks.filter((t) => {
    if (t.subTasks.length === 0) return false
    return t.subTasks.every((st) => st.designed && st.programmed && st.tested)
  }).length

  return (
    <div className="flex items-center gap-4 px-1 text-[11px] text-gray-500">
      <span><strong className="text-gray-700">{tasks.length}</strong> tasks</span>
      <span><strong className="text-gray-700">{totalSubs}</strong> subtasks</span>
      <span><strong className="text-emerald-600">{completedTasks}</strong> complete</span>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="font-semibold text-gray-700">{overallPct}%</span>
        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overallPct === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Rich text notes ──────────────────────────────────────────────────────────

function ToolbarBtn({ active, onClick, title, children }: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`p-1 rounded transition-colors ${
        active
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function RichTextNotes() {
  const taskNotes = useDiagramStore((s) => s.taskNotes)
  const setTaskNotes = useDiagramStore((s) => s.setTaskNotes)
  const editorRef = useRef<HTMLDivElement>(null)
  const isInternalChange = useRef(false)

  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== taskNotes) {
        editorRef.current.innerHTML = taskNotes
      }
    }
    isInternalChange.current = false
  }, [taskNotes])

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }, [])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true
      setTaskNotes(editorRef.current.innerHTML)
    }
  }, [setTaskNotes])

  const isActive = (command: string) => document.queryCommandState(command)

  const [, forceUpdate] = useState(0)
  const trackSelection = useCallback(() => forceUpdate((n) => n + 1), [])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
        <ToolbarBtn active={isActive('bold')} onClick={() => exec('bold')} title="Bold (Ctrl+B)">
          <Bold size={13} />
        </ToolbarBtn>
        <ToolbarBtn active={isActive('italic')} onClick={() => exec('italic')} title="Italic (Ctrl+I)">
          <Italic size={13} />
        </ToolbarBtn>
        <ToolbarBtn active={isActive('underline')} onClick={() => exec('underline')} title="Underline (Ctrl+U)">
          <UnderlineIcon size={13} />
        </ToolbarBtn>
        <ToolbarBtn active={isActive('strikeThrough')} onClick={() => exec('strikeThrough')} title="Strikethrough">
          <Strikethrough size={13} />
        </ToolbarBtn>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        <ToolbarBtn onClick={() => exec('formatBlock', '<h1>')} title="Heading 1">
          <Heading1 size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => exec('formatBlock', '<h2>')} title="Heading 2">
          <Heading2 size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => exec('formatBlock', '<p>')} title="Normal text">
          <span className="text-[10px] font-bold leading-none">P</span>
        </ToolbarBtn>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        <ToolbarBtn active={isActive('insertUnorderedList')} onClick={() => exec('insertUnorderedList')} title="Bullet list">
          <List size={13} />
        </ToolbarBtn>
        <ToolbarBtn active={isActive('insertOrderedList')} onClick={() => exec('insertOrderedList')} title="Numbered list">
          <ListOrdered size={13} />
        </ToolbarBtn>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        <ToolbarBtn onClick={() => exec('insertHorizontalRule')} title="Horizontal rule">
          <Minus size={13} />
        </ToolbarBtn>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onSelect={trackSelection}
        onKeyUp={trackSelection}
        onMouseUp={trackSelection}
        className="flex-1 overflow-y-auto px-4 py-3 text-sm text-gray-700 focus:outline-none prose prose-sm max-w-none
          [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-2 [&_h1]:mt-3
          [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-800 [&_h2]:mb-1.5 [&_h2]:mt-2
          [&_p]:mb-1.5 [&_p]:leading-relaxed
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2
          [&_li]:mb-0.5
          [&_hr]:my-3 [&_hr]:border-gray-200"
        data-placeholder="Write your notes here…"
        style={{ minHeight: 80 }}
      />
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function TasksPanel() {
  const tasks = useDiagramStore((s) => s.tasks)
  const addTask = useDiagramStore((s) => s.addTask)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const addRef = useRef<HTMLInputElement>(null)
  const [notesPct, setNotesPct] = useState(35)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (adding) addRef.current?.focus()
  }, [adding])

  const submitTask = () => {
    const name = newName.trim()
    if (name) {
      addTask(name)
      setNewName('')
    }
  }

  const handleDividerDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    let lastY = e.clientY
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => {
      if (!containerRef.current) return
      const totalH = containerRef.current.getBoundingClientRect().height
      if (totalH < 1) return
      const deltaPct = ((ev.clientY - lastY) / totalH) * 100
      lastY = ev.clientY
      setNotesPct((prev) => Math.min(70, Math.max(15, prev - deltaPct)))
    }
    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
  }, [])

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <ClipboardList size={18} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-800">Tasks</h1>
          <Stats tasks={tasks} />
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
        >
          <Plus size={13} /> New Task
        </button>
      </div>

      {/* Task list */}
      <div className="overflow-y-auto px-5 py-4 space-y-3" style={{ flexBasis: `${100 - notesPct}%`, flexGrow: 0, flexShrink: 0 }}>
        {adding && (
          <div className="bg-white rounded-xl border-2 border-indigo-300 shadow-sm p-3 flex items-center gap-2">
            <input
              ref={addRef}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Task name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { submitTask(); setAdding(false) }
                if (e.key === 'Escape') { setAdding(false); setNewName('') }
              }}
            />
            <button
              onClick={() => { submitTask(); setAdding(false) }}
              disabled={!newName.trim()}
              className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => { setAdding(false); setNewName('') }}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {tasks.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 bg-gray-100 rounded-2xl mb-4">
              <ClipboardList size={32} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500 mb-1">No tasks yet</p>
            <p className="text-xs text-gray-400 mb-4">Create tasks to track your design, programming and testing progress</p>
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
            >
              <Plus size={13} /> Create first task
            </button>
          </div>
        )}

        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>

      {/* Resize divider */}
      <div
        className="h-1.5 cursor-row-resize flex-shrink-0 bg-gray-200 hover:bg-indigo-400 active:bg-indigo-500 transition-colors relative group"
        onPointerDown={handleDividerDrag}
      >
        <div className="absolute inset-x-0 -top-1 -bottom-1" />
      </div>

      {/* Notes panel */}
      <div className="flex flex-col min-h-0 bg-white border-t border-gray-200" style={{ flexBasis: `${notesPct}%`, flexGrow: 0, flexShrink: 0 }}>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-100 flex-shrink-0">
          <StickyNote size={12} className="text-amber-600" />
          <span className="text-xs font-semibold text-amber-800">Notes</span>
        </div>
        <RichTextNotes />
      </div>
    </div>
  )
}
