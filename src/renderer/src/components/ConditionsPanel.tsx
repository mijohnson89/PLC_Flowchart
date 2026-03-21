import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check, X,
  AlertTriangle, OctagonX, PauseCircle, ShieldAlert, BellRing, Link2, Search
} from 'lucide-react'
import { useDiagramStore, selectActiveTab } from '../store/diagramStore'
import type { FlowCondition, ConditionAction, ConditionCause } from '../types'
import { uid } from '../utils/uid'
import { ALARMS_TAB_ID } from '../types'

const ACTIONS: { value: ConditionAction; label: string; icon: typeof PauseCircle; bg: string; text: string; border: string }[] = [
  { value: 'pause', label: 'Pause',  icon: PauseCircle,   bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  { value: 'stop',  label: 'Stop',   icon: AlertTriangle, bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
  { value: 'abort', label: 'Abort',  icon: OctagonX,      bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200' },
]

const ACTION_MAP = Object.fromEntries(ACTIONS.map((a) => [a.value, a])) as Record<ConditionAction, (typeof ACTIONS)[0]>

function InlineEdit({ value, onCommit, onCancel, placeholder, autoFocus }: {
  value: string; onCommit: (v: string) => void; onCancel: () => void; placeholder?: string; autoFocus?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus !== false) ref.current?.select() }, [])
  return (
    <input
      ref={ref}
      autoFocus={autoFocus !== false}
      className="text-xs bg-white border border-indigo-400 rounded px-2 py-1 outline-none w-full focus:ring-1 focus:ring-indigo-300"
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

interface AlarmOption {
  ref: string
  label: string
  group: 'standalone' | 'instance'
  subLabel?: string
}

function useAlarmOptions(): AlarmOption[] {
  const alarms = useDiagramStore((s) => s.alarms)
  const interfaces = useDiagramStore((s) => s.userInterfaces)
  const instances = useDiagramStore((s) => s.interfaceInstances)

  return useMemo(() => {
    const opts: AlarmOption[] = []
    for (const a of alarms) {
      opts.push({ ref: `alarm:${a.id}`, label: a.description, group: 'standalone' })
    }
    for (const iface of interfaces) {
      for (const field of iface.fields) {
        if (!field.isAlarm) continue
        const msg = field.alarmMessage || field.name
        const ifaceInstances = instances.filter((inst) => inst.interfaceId === iface.id)
        for (const inst of ifaceInstances) {
          opts.push({
            ref: `inst:${inst.id}:${field.id}`,
            label: `${inst.name} ${msg}`,
            subLabel: `${iface.name} · ${field.name}`,
            group: 'instance'
          })
        }
      }
    }
    return opts
  }, [alarms, interfaces, instances])
}

function resolveAlarmLabel(ref: string | undefined, alarmOptions: AlarmOption[]): string | null {
  if (!ref) return null
  const opt = alarmOptions.find((o) => o.ref === ref)
  return opt?.label ?? null
}

function useDropdownPosition(open: boolean, triggerRef: React.RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<{ top: boolean; left: boolean }>({ top: false, left: false })

  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceRight = window.innerWidth - rect.left
    setPos({
      top: spaceBelow < 420,
      left: spaceRight < 380
    })
  }, [open, triggerRef])

  return pos
}

function AlarmLinkSelector({ currentRef, onLink, compact }: {
  currentRef?: string
  onLink: (ref: string | undefined) => void
  compact?: boolean
}) {
  const { setActiveTab } = useDiagramStore()
  const options = useAlarmOptions()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropPos = useDropdownPosition(open, triggerRef)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) { setSearch(''); requestAnimationFrame(() => searchRef.current?.focus()) }
  }, [open])

  const query = search.toLowerCase().trim()
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query) || (o.subLabel && o.subLabel.toLowerCase().includes(query)))
    : options

  const label = resolveAlarmLabel(currentRef, options)
  const standaloneOpts = filtered.filter((o) => o.group === 'standalone')
  const instanceOpts = filtered.filter((o) => o.group === 'instance')
  const noResults = query && filtered.length === 0

  if (options.length === 0 && !currentRef) {
    return null
  }

  const iconSize = compact ? 8 : 9
  const linkIconSize = compact ? 7 : 8

  const dropdownClass = [
    'absolute bg-white border border-gray-200 rounded-lg shadow-xl z-50 w-[360px] max-h-[400px] flex flex-col',
    dropPos.top ? 'bottom-full mb-1' : 'top-full mt-1',
    dropPos.left ? 'right-0' : 'left-0'
  ].join(' ')

  return (
    <div ref={wrapperRef} className="relative">
      {currentRef && label ? (
        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-1 rounded font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors truncate ${
            compact ? 'px-1 py-px text-[9px] max-w-[140px]' : 'px-1.5 py-0.5 text-[10px] max-w-[180px]'
          }`}
          title={`Linked alarm: ${label}`}
        >
          <BellRing size={iconSize} className="flex-shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ) : options.length > 0 ? (
        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-0.5 text-gray-300 hover:text-amber-500 rounded transition-colors ${compact ? 'p-px' : 'p-0.5'}`}
          title="Link alarm"
        >
          <BellRing size={compact ? 8 : 10} />
          <Link2 size={linkIconSize} />
        </button>
      ) : null}

      {open && (
        <div className={dropdownClass}>
          {/* Search bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 flex-shrink-0">
            <Search size={12} className="text-gray-400 flex-shrink-0" />
            <input
              ref={searchRef}
              className="flex-1 text-xs outline-none bg-transparent placeholder-gray-400"
              placeholder="Search alarms…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setOpen(false); e.stopPropagation() }
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-300 hover:text-gray-500">
                <X size={10} />
              </button>
            )}
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto py-1">
            {currentRef && !query && (
              <button
                onClick={() => { onLink(undefined); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
              >
                — Remove link —
              </button>
            )}

            {standaloneOpts.length > 0 && (
              <>
                <div className="px-3 py-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider border-t border-gray-100 mt-1 pt-1">
                  Once-off Alarms
                </div>
                {standaloneOpts.map((opt) => (
                  <button
                    key={opt.ref}
                    onClick={() => { onLink(opt.ref); setOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-amber-50 transition-colors flex items-center gap-1.5 ${
                      currentRef === opt.ref ? 'bg-amber-50 text-amber-800 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <BellRing size={9} className="text-amber-400 flex-shrink-0" />
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </>
            )}

            {instanceOpts.length > 0 && (
              <>
                <div className="px-3 py-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider border-t border-gray-100 mt-1 pt-1">
                  Instance Alarms
                </div>
                {instanceOpts.map((opt) => (
                  <button
                    key={opt.ref}
                    onClick={() => { onLink(opt.ref); setOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-violet-50 transition-colors flex items-center gap-1.5 ${
                      currentRef === opt.ref ? 'bg-violet-50 text-violet-800 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <BellRing size={9} className="text-violet-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="truncate block">{opt.label}</span>
                      {opt.subLabel && <span className="text-[9px] text-gray-400 truncate block">{opt.subLabel}</span>}
                    </div>
                  </button>
                ))}
              </>
            )}

            {noResults && (
              <div className="px-3 py-3 text-[11px] text-gray-400 italic text-center">
                No alarms matching "{search}"
              </div>
            )}

            {options.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-gray-400 italic text-center">
                No alarms defined.{' '}
                <button onClick={() => { setActiveTab(ALARMS_TAB_ID); setOpen(false) }} className="text-amber-600 hover:underline">
                  Go to Alarms
                </button>
              </div>
            )}
          </div>

          {/* Footer count */}
          {filtered.length > 0 && (
            <div className="px-3 py-1.5 border-t border-gray-100 text-[9px] text-gray-400 flex-shrink-0">
              {query ? `${filtered.length} of ${options.length} alarms` : `${options.length} alarms`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CauseRow({ cause, conditionId }: { cause: ConditionCause; conditionId: string }) {
  const { updateConditionCause, removeConditionCause } = useDiagramStore()
  const [editing, setEditing] = useState(false)

  return (
    <div className="group flex items-center gap-2 pl-10 pr-3 py-1 hover:bg-gray-50/60 transition-colors">
      <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
      {editing ? (
        <div className="flex-1 min-w-0">
          <InlineEdit
            value={cause.description}
            onCommit={(v) => { updateConditionCause(conditionId, cause.id, { description: v }); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <span
          className="flex-1 text-[11px] text-gray-600 truncate cursor-default"
          onDoubleClick={() => setEditing(true)}
          title="Double-click to edit"
        >
          {cause.description}
        </span>
      )}
      <AlarmLinkSelector
        currentRef={cause.linkedAlarmRef}
        onLink={(ref) => updateConditionCause(conditionId, cause.id, { linkedAlarmRef: ref })}
        compact
      />
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={() => setEditing(true)} className="p-0.5 text-gray-400 hover:text-gray-600 rounded"><Pencil size={9} /></button>
        <button onClick={() => removeConditionCause(conditionId, cause.id)} className="p-0.5 text-gray-400 hover:text-red-500 rounded"><Trash2 size={9} /></button>
      </div>
    </div>
  )
}

function ConditionRow({ condition }: { condition: FlowCondition }) {
  const { updateCondition, removeCondition, addConditionCause } = useDiagramStore()
  const [expanded, setExpanded] = useState(true)
  const [editingDesc, setEditingDesc] = useState(false)
  const [addingCause, setAddingCause] = useState(false)
  const [newCause, setNewCause] = useState('')
  const [newCauseAlarmRef, setNewCauseAlarmRef] = useState<string | undefined>(undefined)
  const addRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (addingCause) addRef.current?.focus() }, [addingCause])

  const submitCause = () => {
    const desc = newCause.trim()
    if (desc) {
      addConditionCause(condition.id, { id: uid('cause'), description: desc, linkedAlarmRef: newCauseAlarmRef })
      setNewCause('')
      setNewCauseAlarmRef(undefined)
    }
  }

  const cancelAddCause = () => {
    setAddingCause(false)
    setNewCause('')
    setNewCauseAlarmRef(undefined)
  }

  const a = ACTION_MAP[condition.action]

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      {/* Condition header row */}
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50/40 transition-colors group">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-0.5 text-gray-300 hover:text-gray-500 rounded flex-shrink-0"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <div className="flex-1 min-w-0">
          {editingDesc ? (
            <InlineEdit
              value={condition.description}
              onCommit={(v) => { updateCondition(condition.id, { description: v }); setEditingDesc(false) }}
              onCancel={() => setEditingDesc(false)}
              placeholder="Condition description"
            />
          ) : (
            <span
              className="text-xs font-medium text-gray-800 cursor-default truncate block"
              onDoubleClick={() => setEditingDesc(true)}
              title="Double-click to edit"
            >
              {condition.description}
            </span>
          )}
        </div>

        <AlarmLinkSelector
          currentRef={condition.linkedAlarmRef}
          onLink={(ref) => updateCondition(condition.id, { linkedAlarmRef: ref })}
        />

        <select
          value={condition.action}
          onChange={(e) => updateCondition(condition.id, { action: e.target.value as ConditionAction })}
          className={`text-[10px] font-bold rounded px-2 py-1 border outline-none cursor-pointer ${a.bg} ${a.text} ${a.border}`}
        >
          {ACTIONS.map((act) => (
            <option key={act.value} value={act.value}>{act.label}</option>
          ))}
        </select>

        <span className="text-[9px] text-gray-400 tabular-nums flex-shrink-0 w-8 text-center">
          {condition.causes.length}
        </span>

        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => { setAddingCause(true); setExpanded(true) }}
            className="p-0.5 text-gray-400 hover:text-indigo-600 rounded"
            title="Add cause"
          >
            <Plus size={11} />
          </button>
          <button onClick={() => setEditingDesc(true)} className="p-0.5 text-gray-400 hover:text-gray-600 rounded" title="Edit">
            <Pencil size={10} />
          </button>
          <button onClick={() => removeCondition(condition.id)} className="p-0.5 text-gray-400 hover:text-red-500 rounded" title="Delete">
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Causes */}
      {expanded && (
        <>
          {condition.causes.map((cause) => (
            <CauseRow key={cause.id} cause={cause} conditionId={condition.id} />
          ))}

          {addingCause ? (
            <div className="flex items-center gap-2 pl-10 pr-3 py-1.5">
              <input
                ref={addRef}
                className="flex-1 text-[11px] border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                placeholder="Describe the cause…"
                value={newCause}
                onChange={(e) => setNewCause(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { submitCause(); addRef.current?.focus() }
                  if (e.key === 'Escape') cancelAddCause()
                }}
              />
              <AlarmLinkSelector
                currentRef={newCauseAlarmRef}
                onLink={setNewCauseAlarmRef}
                compact
              />
              <button onClick={submitCause} className="p-0.5 text-indigo-500 hover:text-indigo-700 rounded"><Check size={12} /></button>
              <button onClick={cancelAddCause} className="p-0.5 text-gray-400 hover:text-gray-600 rounded"><X size={12} /></button>
            </div>
          ) : (
            <button
              onClick={() => setAddingCause(true)}
              className="flex items-center gap-1 pl-10 pr-3 py-1 text-[10px] text-gray-400 hover:text-indigo-600 transition-colors"
            >
              <Plus size={9} /> Add cause
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function ConditionsPanel() {
  const tab = useDiagramStore(selectActiveTab)
  const { addCondition } = useDiagramStore()
  const conditions = tab?.conditions ?? []

  const [adding, setAdding] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [newAction, setNewAction] = useState<ConditionAction>('stop')
  const [newAlarmRef, setNewAlarmRef] = useState<string | undefined>(undefined)
  const addRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (adding) addRef.current?.focus() }, [adding])

  const submit = () => {
    const desc = newDesc.trim()
    if (desc) {
      addCondition({ id: uid('cond'), description: desc, action: newAction, causes: [], linkedAlarmRef: newAlarmRef })
      setNewDesc('')
      setNewAction('stop')
      setNewAlarmRef(undefined)
      setAdding(false)
    }
  }

  const cancelAdd = () => {
    setAdding(false)
    setNewDesc('')
    setNewAlarmRef(undefined)
  }

  const pauseCount = conditions.filter((c) => c.action === 'pause').length
  const stopCount  = conditions.filter((c) => c.action === 'stop').length
  const abortCount = conditions.filter((c) => c.action === 'abort').length

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border-b border-red-100 flex-shrink-0">
        <ShieldAlert size={12} className="text-red-500" />
        <span className="text-xs font-semibold text-red-800">Conditions</span>
        {conditions.length > 0 && (
          <div className="flex items-center gap-1 ml-1">
            {pauseCount > 0 && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-px rounded">{pauseCount} Pause</span>}
            {stopCount > 0 && <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-px rounded">{stopCount} Stop</span>}
            {abortCount > 0 && <span className="text-[9px] font-bold bg-rose-100 text-rose-700 px-1.5 py-px rounded">{abortCount} Abort</span>}
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-red-600 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
        >
          <Plus size={10} /> Add
        </button>
      </div>

      {/* Column headers */}
      {conditions.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
          <span className="w-5" />
          <span className="flex-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Description</span>
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Alarm</span>
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider w-16 text-center">Action</span>
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider w-8 text-center">Causes</span>
          <span className="w-16" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {adding && (
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50/60 border-b border-indigo-100">
            <input
              ref={addRef}
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              placeholder="Condition description…"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') cancelAdd()
              }}
            />
            <AlarmLinkSelector
              currentRef={newAlarmRef}
              onLink={setNewAlarmRef}
            />
            <select
              value={newAction}
              onChange={(e) => setNewAction(e.target.value as ConditionAction)}
              className="text-[10px] font-bold rounded px-2 py-1.5 border border-gray-300 outline-none bg-white"
            >
              {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <button
              onClick={submit}
              disabled={!newDesc.trim()}
              className="px-2.5 py-1.5 text-[10px] font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
            <button
              onClick={cancelAdd}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {conditions.length === 0 && !adding && (
          <div className="flex items-center justify-center py-6 text-center">
            <div>
              <ShieldAlert size={20} className="mx-auto mb-2 text-gray-300" />
              <p className="text-[11px] text-gray-400">No conditions defined</p>
              <button
                onClick={() => setAdding(true)}
                className="mt-2 text-[10px] text-indigo-500 hover:text-indigo-700 font-medium"
              >
                <Plus size={10} className="inline -mt-0.5 mr-0.5" />Add first condition
              </button>
            </div>
          </div>
        )}

        {conditions.map((cond) => (
          <ConditionRow key={cond.id} condition={cond} />
        ))}
      </div>
    </div>
  )
}
