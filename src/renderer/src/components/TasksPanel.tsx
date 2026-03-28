import { useState, useRef, useEffect } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check,
  Network, AlignJustify, Link2, Unlink,
  ClipboardList, CheckSquare, Square,
  Zap, Server, Cpu, Tag, ExternalLink, EyeOff, Eye
} from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type { Task, SubTask, TaskAutoGenSettings } from '../types'
import { IO_TABLE_TAB_ID, INTERFACES_TAB_ID } from '../types'

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

// ── IO link selector ─────────────────────────────────────────────────────────

function IOLinkSelector({ rackId, slotId, entryId, onSelect }: {
  rackId: string | null
  slotId: string | null
  entryId: string | null
  onSelect: (patch: { ioRackId: string | null; ioSlotId: string | null; ioEntryId: string | null }) => void
}) {
  const racks = useDiagramStore((s) => s.ioRacks)
  const slots = useDiagramStore((s) => s.ioSlots)
  const entries = useDiagramStore((s) => s.ioEntries)
  const setActiveTab = useDiagramStore((s) => s.setActiveTab)
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

  const linkedRack = racks.find((r) => r.id === rackId)
  const linkedSlot = slots.find((s) => s.id === slotId)
  const linkedEntry = entries.find((e) => e.id === entryId)
  const hasLink = linkedRack || linkedSlot || linkedEntry
  const displayLabel = linkedEntry
    ? (linkedEntry.drawingTag || `Ch ${linkedEntry.channel}`)
    : linkedSlot
      ? linkedSlot.name
      : linkedRack
        ? linkedRack.name
        : 'IO'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border transition-colors ${
          hasLink
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
        }`}
        title={hasLink ? `Linked: ${displayLabel}` : 'Link to IO'}
      >
        <Server size={11} />
        <span className="truncate max-w-[100px]">{displayLabel}</span>
        {hasLink ? <Link2 size={9} /> : <Unlink size={9} className="opacity-50" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[220px] py-1 max-h-64 overflow-y-auto">
          {hasLink && (
            <>
              <button
                onClick={() => { setActiveTab(IO_TABLE_TAB_ID); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-emerald-600 hover:bg-emerald-50"
              >
                <ExternalLink size={10} /> Go to IO Table
              </button>
              <button
                onClick={() => { onSelect({ ioRackId: null, ioSlotId: null, ioEntryId: null }); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-50"
              >
                <Unlink size={10} /> Unlink
              </button>
              <div className="h-px bg-gray-100 my-1" />
            </>
          )}
          {racks.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-gray-400 italic">No IO racks defined</div>
          )}
          {racks.map((rack) => {
            const rackSlots = slots.filter((s) => s.rackId === rack.id)
            return (
              <div key={rack.id}>
                <button
                  onClick={() => { onSelect({ ioRackId: rack.id, ioSlotId: null, ioEntryId: null }); setOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-50 font-semibold ${
                    rack.id === rackId && !slotId ? 'text-emerald-600' : 'text-gray-700'
                  }`}
                >
                  <Server size={10} /> {rack.name}
                </button>
                {rackSlots.map((slot) => {
                  const slotEntries = entries.filter((e) => e.slotId === slot.id)
                  return (
                    <div key={slot.id}>
                      <button
                        onClick={() => { onSelect({ ioRackId: rack.id, ioSlotId: slot.id, ioEntryId: null }); setOpen(false) }}
                        className={`w-full flex items-center gap-2 px-5 py-1 text-[11px] hover:bg-gray-50 ${
                          slot.id === slotId && !entryId ? 'text-emerald-600 font-semibold' : 'text-gray-600'
                        }`}
                      >
                        <Cpu size={9} /> {slot.name}
                        {slot.catalogNumber && <span className="text-[9px] text-gray-400">{slot.catalogNumber}</span>}
                      </button>
                      {slotEntries.map((entry) => (
                        <button
                          key={entry.id}
                          onClick={() => { onSelect({ ioRackId: rack.id, ioSlotId: slot.id, ioEntryId: entry.id }); setOpen(false) }}
                          className={`w-full flex items-center gap-2 px-8 py-1 text-[10px] hover:bg-gray-50 ${
                            entry.id === entryId ? 'text-emerald-600 font-semibold' : 'text-gray-500'
                          }`}
                        >
                          {entry.drawingTag || `Ch ${entry.channel}`}
                          {entry.ioType && <span className="text-[9px] text-gray-400">{entry.ioType}</span>}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Instance link selector ───────────────────────────────────────────────────

function InstanceLinkSelector({ currentId, onSelect }: {
  currentId: string | null
  onSelect: (id: string | null) => void
}) {
  const instances = useDiagramStore((s) => s.interfaceInstances)
  const ifaces = useDiagramStore((s) => s.userInterfaces)
  const setActiveTab = useDiagramStore((s) => s.setActiveTab)
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

  const linked = instances.find((i) => i.id === currentId)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border transition-colors ${
          linked
            ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
            : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
        }`}
        title={linked ? `Linked: ${linked.name}` : 'Link to Instance'}
      >
        <Tag size={11} />
        <span className="truncate max-w-[100px]">{linked ? linked.name : 'Instance'}</span>
        {linked ? <Link2 size={9} /> : <Unlink size={9} className="opacity-50" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[200px] py-1 max-h-64 overflow-y-auto">
          {linked && (
            <>
              <button
                onClick={() => { setActiveTab(INTERFACES_TAB_ID); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-orange-600 hover:bg-orange-50"
              >
                <ExternalLink size={10} /> Go to Interfaces
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
          {instances.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-gray-400 italic">No instances defined</div>
          )}
          {instances.map((inst) => {
            const ui = ifaces.find((u) => u.id === inst.interfaceId)
            return (
              <button
                key={inst.id}
                onClick={() => { onSelect(inst.id); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-50 ${
                  inst.id === currentId ? 'text-orange-600 font-semibold' : 'text-gray-700'
                }`}
              >
                <Tag size={10} />
                <span className="truncate">{inst.name}</span>
                {ui && <span className="text-[9px] text-gray-400 ml-auto flex-shrink-0">{ui.name}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Subtask row ──────────────────────────────────────────────────────────────

function SubTaskLinkBadge({ sub }: { sub: SubTask }) {
  const tabs = useDiagramStore((s) => s.tabs)
  const slots = useDiagramStore((s) => s.ioSlots)
  const entries = useDiagramStore((s) => s.ioEntries)
  const instances = useDiagramStore((s) => s.interfaceInstances)
  const setActiveTab = useDiagramStore((s) => s.setActiveTab)

  if (sub.linkedTabId) {
    const tab = tabs.find((t) => t.id === sub.linkedTabId)
    if (!tab) return null
    return (
      <button
        onClick={() => setActiveTab(tab.id)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
        title={`Go to ${tab.name}`}
      >
        <Network size={9} />
        {tab.name}
      </button>
    )
  }

  if (sub.linkedSlotId) {
    const slot = slots.find((s) => s.id === sub.linkedSlotId)
    return (
      <button
        onClick={() => setActiveTab(IO_TABLE_TAB_ID)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
        title={`Go to IO Table — ${slot?.name ?? 'Slot'}`}
      >
        <Cpu size={9} />
        {slot?.name ?? 'Slot'}
      </button>
    )
  }

  if (sub.linkedEntryId) {
    const entry = entries.find((e) => e.id === sub.linkedEntryId)
    return (
      <button
        onClick={() => setActiveTab(IO_TABLE_TAB_ID)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
        title={`Go to IO Table — ${entry?.drawingTag || 'Channel'}`}
      >
        <Server size={9} />
        {entry?.drawingTag || entry?.ioType || 'Ch'}
      </button>
    )
  }

  if (sub.linkedInstanceId) {
    const inst = instances.find((i) => i.id === sub.linkedInstanceId)
    return (
      <button
        onClick={() => setActiveTab(INTERFACES_TAB_ID)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
        title={`Go to Interfaces — ${inst?.name ?? 'Instance'}`}
      >
        <Tag size={9} />
        {inst?.name ?? 'Instance'}
      </button>
    )
  }

  return null
}

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
      <div className="flex-1 min-w-0 flex items-center gap-2">
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
        <SubTaskLinkBadge sub={sub} />
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function isTaskComplete(task: Task): boolean {
  return task.subTasks.length > 0 && task.subTasks.every((st) => st.designed && st.programmed && st.tested)
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

  const complete = isTaskComplete(task)

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${complete ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-gray-200'}`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2.5 ${complete ? 'bg-emerald-50/60' : 'bg-gray-50/60'}`}>
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
              className={`text-sm font-semibold truncate cursor-default ${complete ? 'line-through text-gray-400' : 'text-gray-800'}`}
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
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/30 flex-wrap">
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
            <IOLinkSelector
              rackId={task.ioRackId}
              slotId={task.ioSlotId}
              entryId={task.ioEntryId}
              onSelect={(patch) => updateTask(task.id, patch)}
            />
            <InstanceLinkSelector
              currentId={task.instanceId}
              onSelect={(id) => updateTask(task.id, { instanceId: id })}
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

// ── Auto-gen settings popover ─────────────────────────────────────────────────

const AUTO_GEN_RULES: { key: keyof TaskAutoGenSettings; label: string; desc: string }[] = [
  { key: 'ioCardFAT',       label: 'IO Card → FAT',        desc: 'Each IO card (slot) creates an IO check under "Factory Acceptance Test"' },
  { key: 'analogSAT',       label: 'Analog → SAT',         desc: 'Each analog channel creates a scaling check under "Site Acceptance Test"' },
  { key: 'sequenceTesting',  label: 'Sequence → Testing',   desc: 'Each new flowchart creates an entry under "Sequences"' },
  { key: 'deviceTesting',    label: 'AOI Instance → Device', desc: 'Each AOI instance creates an entry under "Devices"' },
  { key: 'alarmTesting',     label: 'Alarm → Testing',      desc: 'Each alarm (once-off and per-instance) creates an entry under "Alarms"' },
]

function AutoGenSettingsPopover({ onClose }: { onClose: () => void }) {
  const autoGen = useDiagramStore((s) => s.taskAutoGen)
  const setAutoGen = useDiagramStore((s) => s.setTaskAutoGen)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-80 py-2">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
        <Zap size={13} className="text-amber-500" />
        <span className="text-xs font-bold text-gray-800">Auto-Generate Rules</span>
      </div>
      <p className="px-4 py-1.5 text-[10px] text-gray-400 leading-relaxed">
        When enabled, tasks and subtasks are created automatically as you add IO, sequences, and devices.
      </p>
      <div className="flex flex-col">
        {AUTO_GEN_RULES.map((rule) => (
          <label
            key={rule.key}
            className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={autoGen[rule.key]}
              onChange={(e) => setAutoGen({ [rule.key]: e.target.checked })}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-gray-700 block">{rule.label}</span>
              <span className="text-[10px] text-gray-400 leading-snug block mt-0.5">{rule.desc}</span>
            </div>
          </label>
        ))}
      </div>
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
  const [showAutoGen, setShowAutoGen] = useState(false)
  const [hideCompleted, setHideCompleted] = useState(false)
  const autoGen = useDiagramStore((s) => s.taskAutoGen)
  const anyAutoGenOn = autoGen.ioCardFAT || autoGen.analogSAT || autoGen.sequenceTesting || autoGen.deviceTesting || autoGen.alarmTesting

  const completedCount = tasks.filter(isTaskComplete).length
  const visibleTasks = hideCompleted ? tasks.filter((t) => !isTaskComplete(t)) : tasks

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <ClipboardList size={18} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-800">Tasks</h1>
          <Stats tasks={tasks} />
        </div>
        <div className="relative flex items-center gap-2">
          {completedCount > 0 && (
            <button
              onClick={() => setHideCompleted((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                hideCompleted
                  ? 'bg-gray-100 text-gray-600 border-gray-300'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
              title={hideCompleted ? 'Show completed tasks' : 'Hide completed tasks'}
            >
              {hideCompleted ? <Eye size={12} /> : <EyeOff size={12} />}
              {hideCompleted ? `Show ${completedCount}` : 'Hide done'}
            </button>
          )}
          <button
            onClick={() => setShowAutoGen((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              showAutoGen
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : anyAutoGenOn
                  ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
            title="Auto-generation rules"
          >
            <Zap size={12} />
            Auto
          </button>
          {showAutoGen && <AutoGenSettingsPopover onClose={() => setShowAutoGen(false)} />}
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <Plus size={13} /> New Task
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
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

        {visibleTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}

        {hideCompleted && completedCount > 0 && visibleTasks.length > 0 && (
          <p className="text-center text-[11px] text-gray-400 py-2">
            {completedCount} completed task{completedCount !== 1 ? 's' : ''} hidden
          </p>
        )}
      </div>
    </div>
  )
}
