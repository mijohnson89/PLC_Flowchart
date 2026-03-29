import { useState, useEffect, useRef, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronRight, Cpu, Database,
  Tag, Settings2, X, Check, Pencil,
  BookMarked, Upload, Download, CheckCircle2, BellRing, Cable
} from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type {
  UserInterface, InterfaceInstance, InterfaceField,
  InterfaceType, AOIFieldUsage, IOType
} from '../types'
import { useLocationOptions, LocationBreadcrumb } from './LocationsPanel'
import { parseL5KInterfaces, parseL5KSequences, parseL5KTasks, l5kSequenceToFlowchart, parseL5KControllerName, parseL5KProgramTags, parseL5KIOModules } from '../utils/l5kImport'

// ── Helpers ───────────────────────────────────────────────────────────────────

import { uid } from '../utils/uid'

const DATA_TYPES = [
  'BOOL', 'SINT', 'INT', 'DINT', 'LINT',
  'USINT', 'UINT', 'UDINT', 'ULINT',
  'REAL', 'LREAL',
  'STRING[82]', 'STRING[40]', 'STRING[20]',
  'TIMER', 'COUNTER', 'CONTROL',
  'DWORD', 'WORD', 'BYTE',
]

const AOI_USAGES: AOIFieldUsage[] = ['Input', 'Output', 'InOut', 'Local']

const USAGE_COLOR: Record<AOIFieldUsage, string> = {
  Input:  'bg-blue-100 text-blue-700',
  Output: 'bg-green-100 text-green-700',
  InOut:  'bg-purple-100 text-purple-700',
  Local:  'bg-gray-100 text-gray-600',
}

/** Which IO types are compatible with a given field usage */
function ioTypeMatchesUsage(ioType: IOType, usage: AOIFieldUsage | undefined): boolean {
  if (!ioType) return true
  if (usage === 'InOut') return true
  const isInputIO = ioType === 'DI' || ioType === 'AI' || ioType === 'RTD' || ioType === 'TC'
  const isOutputIO = ioType === 'DO' || ioType === 'AO'
  if (isInputIO) return usage === 'Input'
  if (isOutputIO) return usage === 'Output'
  return true
}

// ── Field row ─────────────────────────────────────────────────────────────────

function defaultIncludeInMatrix(field: InterfaceField, isAOI: boolean): boolean {
  if (isAOI) return field.usage === 'Input' || field.usage === 'InOut'
  return true
}

function FieldRow({
  field,
  isAOI,
  onUpdate,
  onRemove
}: {
  field: InterfaceField
  isAOI: boolean
  onUpdate: (patch: Partial<InterfaceField>) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(field)

  const effectiveInclude = field.includeInMatrix ?? defaultIncludeInMatrix(field, isAOI)

  function save() {
    onUpdate(draft)
    setEditing(false)
  }

  if (editing) {
    const draftInclude = draft.includeInMatrix ?? defaultIncludeInMatrix(draft, isAOI)
    return (
      <div className="flex flex-wrap items-start gap-2 p-2 bg-indigo-50 rounded-lg border border-indigo-200">
        <input
          autoFocus
          className="flex-1 min-w-[100px] text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="Field name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <select
          className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
          value={draft.dataType}
          onChange={(e) => setDraft((d) => ({ ...d, dataType: e.target.value }))}
        >
          {DATA_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {isAOI && (
          <select
            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
            value={draft.usage ?? 'Local'}
            onChange={(e) => setDraft((d) => ({ ...d, usage: e.target.value as AOIFieldUsage }))}
          >
            {AOI_USAGES.map((u) => <option key={u}>{u}</option>)}
          </select>
        )}
        <input
          className="flex-1 min-w-[120px] text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="Description (optional)"
          value={draft.description ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        />
        <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer select-none" title="Include in Cause & Effect matrix">
          <input
            type="checkbox"
            className="accent-indigo-600 w-3.5 h-3.5"
            checked={draftInclude}
            onChange={(e) => setDraft((d) => ({ ...d, includeInMatrix: e.target.checked }))}
          />
          C&amp;E
        </label>
        <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer select-none" title="Mark as alarm field">
          <input
            type="checkbox"
            className="accent-amber-600 w-3.5 h-3.5"
            checked={draft.isAlarm ?? false}
            onChange={(e) => setDraft((d) => ({ ...d, isAlarm: e.target.checked, alarmMessage: e.target.checked ? d.alarmMessage : undefined }))}
          />
          <BellRing size={10} className="text-amber-500" />
          Alarm
        </label>
        {draft.isAlarm && (
          <input
            className="flex-1 min-w-[120px] text-xs border border-amber-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-amber-50/50"
            placeholder="Alarm message (e.g. Thermal Overload)"
            value={draft.alarmMessage ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, alarmMessage: e.target.value }))}
          />
        )}
        <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer select-none" title="Physical IO field">
          <input
            type="checkbox"
            className="accent-emerald-600 w-3.5 h-3.5"
            checked={draft.isIO ?? false}
            onChange={(e) => setDraft((d) => ({ ...d, isIO: e.target.checked }))}
          />
          <Cable size={10} className="text-emerald-500" />
          IO
        </label>
        <div className="flex gap-1">
          <button onClick={save} className="p-1 text-indigo-600 hover:text-indigo-800 rounded" title="Save">
            <Check size={14} />
          </button>
          <button onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Cancel">
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-50 text-xs">
      <input
        type="checkbox"
        className="accent-indigo-600 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
        checked={effectiveInclude}
        onChange={(e) => onUpdate({ includeInMatrix: e.target.checked })}
        title="Include in Cause & Effect matrix"
      />
      <input
        type="checkbox"
        className="accent-amber-600 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
        checked={field.isAlarm ?? false}
        onChange={(e) => onUpdate({ isAlarm: e.target.checked })}
        title="Alarm field"
      />
      <input
        type="checkbox"
        className="accent-emerald-600 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
        checked={field.isIO ?? false}
        onChange={(e) => onUpdate({ isIO: e.target.checked })}
        title="Physical IO"
      />
      <span className="font-mono font-semibold text-gray-800 w-32 truncate" title={field.name}>{field.name}</span>
      <span className="font-mono text-indigo-600 w-28 truncate">{field.dataType}</span>
      {isAOI && field.usage && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${USAGE_COLOR[field.usage]}`}>
          {field.usage}
        </span>
      )}
      {field.isAlarm && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-700 truncate max-w-[200px]" title={field.alarmMessage || 'No alarm message'}>
          <BellRing size={8} />
          {field.alarmMessage || <span className="italic text-amber-400">No message</span>}
        </span>
      )}
      {field.isIO && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-700">
          <Cable size={8} />
          IO
        </span>
      )}
      {field.description && (
        <span className="text-gray-400 flex-1 truncate">{field.description}</span>
      )}
      <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => { setDraft(field); setEditing(true) }}
          className="p-0.5 text-gray-400 hover:text-indigo-600 rounded"
          title="Edit field"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={onRemove}
          className="p-0.5 text-gray-400 hover:text-red-500 rounded"
          title="Remove field"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

// ── Add-field row ─────────────────────────────────────────────────────────────

function AddFieldRow({ isAOI, onAdd }: { isAOI: boolean; onAdd: (f: InterfaceField) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [dataType, setDataType] = useState('BOOL')
  const [usage, setUsage] = useState<AOIFieldUsage>('Local')
  const [description, setDescription] = useState('')

  function submit() {
    if (!name.trim()) return
    onAdd({
      id: uid('field'),
      name: name.trim(),
      dataType,
      usage: isAOI ? usage : undefined,
      description: description.trim() || undefined
    })
    setName('')
    setDescription('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
      >
        <Plus size={12} /> Add field
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-start gap-2 p-2 bg-indigo-50 rounded-lg border border-dashed border-indigo-300">
      <input
        autoFocus
        className="flex-1 min-w-[100px] text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        placeholder="Field name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
      />
      <select
        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
        value={dataType}
        onChange={(e) => setDataType(e.target.value)}
      >
        {DATA_TYPES.map((t) => <option key={t}>{t}</option>)}
      </select>
      {isAOI && (
        <select
          className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
          value={usage}
          onChange={(e) => setUsage(e.target.value as AOIFieldUsage)}
        >
          {AOI_USAGES.map((u) => <option key={u}>{u}</option>)}
        </select>
      )}
      <input
        className="flex-1 min-w-[120px] text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex gap-1">
        <button onClick={submit} disabled={!name.trim()} className="p-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-40 rounded" title="Add">
          <Check size={14} />
        </button>
        <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Cancel">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Error boundary for individual cards ───────────────────────────────────────

class CardErrorBoundary extends Component<
  { name: string; children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null }
  static getDerivedStateFromError(err: Error) { return { error: err.message } }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[InterfaceCard crash]', this.props.name, err, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-50 rounded-xl border border-red-300 px-4 py-3 text-xs text-red-700">
          <strong>{this.props.name}</strong> — render error: {this.state.error}
        </div>
      )
    }
    return this.props.children
  }
}

// ── Interface card ────────────────────────────────────────────────────────────

function InterfaceCard({ iface, onSaveToLibrary }: { iface: UserInterface; onSaveToLibrary: (iface: UserInterface) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(iface.name)
  const [draftDesc, setDraftDesc] = useState(iface.description ?? '')
  const [savedFlash, setSavedFlash] = useState(false)

  const { updateUserInterface, removeUserInterface, addFieldToInterface, updateFieldInInterface, removeFieldFromInterface } = useDiagramStore()

  function handleSaveToLib() {
    onSaveToLibrary(iface)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  function saveHeader() {
    updateUserInterface(iface.id, { name: draftName.trim() || iface.name, description: draftDesc.trim() || undefined })
    setEditing(false)
  }

  const isAOI = iface.type === 'AOI'

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 min-h-[48px]">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider flex-shrink-0 ${
          isAOI ? 'bg-orange-100 text-orange-700' : 'bg-cyan-100 text-cyan-700'
        }`}>
          {iface.type}
        </span>

        {editing ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              autoFocus
              className="flex-1 min-w-0 text-sm border-b border-indigo-400 bg-transparent focus:outline-none font-semibold"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveHeader(); if (e.key === 'Escape') setEditing(false) }}
            />
            <input
              className="flex-1 min-w-0 text-xs border-b border-gray-300 bg-transparent focus:outline-none text-gray-500"
              placeholder="Description (optional)"
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveHeader(); if (e.key === 'Escape') setEditing(false) }}
            />
            <button onClick={saveHeader} className="p-0.5 text-indigo-600 hover:text-indigo-800 rounded flex-shrink-0">
              <Check size={13} />
            </button>
            <button onClick={() => setEditing(false)} className="p-0.5 text-gray-400 hover:text-gray-600 rounded flex-shrink-0">
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-baseline gap-2 flex-1 min-w-0">
            <span className="font-semibold text-sm text-gray-800 truncate">{iface.name}</span>
            {iface.description && (
              <span className="text-xs text-gray-400 truncate">{iface.description}</span>
            )}
          </div>
        )}

        <span className="text-[10px] text-gray-400 flex-shrink-0">{iface.fields.length} field{iface.fields.length !== 1 ? 's' : ''}</span>

        {!editing && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={handleSaveToLib}
              className={`p-1 rounded transition-colors ${savedFlash ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500'}`}
              title="Save to Global Library"
            >
              <BookMarked size={12} />
            </button>
            <button
              onClick={() => { setDraftName(iface.name); setDraftDesc(iface.description ?? ''); setEditing(true) }}
              className="p-1 text-gray-400 hover:text-indigo-600 rounded"
              title="Edit"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => removeUserInterface(iface.id)}
              className="p-1 text-gray-400 hover:text-red-500 rounded"
              title="Delete interface"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Expanded: fields */}
      {expanded && (
        <div className="px-4 py-2 flex flex-col gap-0.5">
          {iface.fields.length > 0 && (
            <div className="flex items-center gap-3 px-2 pb-0.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
              <span className="w-3.5 text-center" title="Include in Cause & Effect matrix">C&amp;E</span>
              <span className="w-3.5 text-center" title="Alarm field"><BellRing size={8} /></span>
              <span className="w-3.5 text-center" title="Physical IO"><Cable size={8} /></span>
              <span>Field</span>
            </div>
          )}
          {iface.fields.length === 0 && (
            <p className="text-xs text-gray-400 italic py-1">No fields defined yet.</p>
          )}
          {iface.fields.map((f) => (
            <FieldRow
              key={f.id}
              field={f}
              isAOI={isAOI}
              onUpdate={(patch) => updateFieldInInterface(iface.id, f.id, patch)}
              onRemove={() => removeFieldFromInterface(iface.id, f.id)}
            />
          ))}
          <div className="pt-1">
            <AddFieldRow
              isAOI={isAOI}
              onAdd={(f) => addFieldToInterface(iface.id, f)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── New interface dialog ───────────────────────────────────────────────────────

function NewInterfaceDialog({ onConfirm, onCancel }: {
  onConfirm: (name: string, type: InterfaceType, description: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<InterfaceType>('AOI')
  const [description, setDescription] = useState('')

  function submit() {
    if (!name.trim()) return
    onConfirm(name.trim(), type, description.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-96 p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-bold text-gray-800 mb-4">New User Interface</h2>

        <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Type</label>
        <div className="flex gap-2 mb-4">
          {(['AOI', 'UDT'] as InterfaceType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                type === t
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
              }`}
            >
              {t === 'AOI' ? <Cpu size={13} /> : <Database size={13} />}
              {t === 'AOI' ? 'Add-On Instruction' : 'User Defined Type'}
            </button>
          ))}
        </div>

        <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Name *</label>
        <input
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3"
          placeholder={type === 'AOI' ? 'e.g. FB_Motor' : 'e.g. ST_MotorData'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        />

        <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Description</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-5"
          placeholder="Brief description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        />

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Instance card ─────────────────────────────────────────────────────────────

function InstanceCard({ instance, ifaces }: { instance: InterfaceInstance; ifaces: UserInterface[] }) {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [draftName, setDraftName]       = useState(instance.name)
  const [draftTag, setDraftTag]         = useState(instance.tagName)
  const [draftDesc, setDraftDesc]       = useState(instance.description ?? '')
  const [draftIfaceId, setDraftIfaceId] = useState(instance.interfaceId)
  const [draftLocId, setDraftLocId]     = useState(instance.locationId ?? '')

  const { updateInterfaceInstance, removeInterfaceInstance, ioEntries, ioSlots, ioRacks } = useDiagramStore()
  const locationOptions = useLocationOptions()
  const linkedIface = ifaces.find((i) => i.id === instance.interfaceId)
  const ioFields = linkedIface?.fields.filter((f) => f.isIO) ?? []
  const ioMappings = instance.ioMappings ?? {}

  function ioChannelLabel(entryId: string): string {
    const entry = ioEntries.find((e) => e.id === entryId)
    if (!entry) return '???'
    const slot = ioSlots.find((s) => s.id === entry.slotId)
    const rack = slot ? ioRacks.find((r) => r.id === slot.rackId) : null
    return [rack?.name, slot?.name, `Ch ${entry.channel}`, entry.drawingTag, entry.ioType].filter(Boolean).join(' · ')
  }

  function setIOMapping(fieldId: string, entryId: string | null) {
    const next = { ...ioMappings }
    if (entryId) next[fieldId] = entryId
    else delete next[fieldId]
    updateInterfaceInstance(instance.id, { ioMappings: Object.keys(next).length > 0 ? next : undefined })
  }

  function save() {
    updateInterfaceInstance(instance.id, {
      name: draftName.trim() || instance.name,
      tagName: draftTag.trim() || instance.tagName,
      description: draftDesc.trim() || undefined,
      interfaceId: draftIfaceId,
      locationId: draftLocId || undefined
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Instance Name *</label>
            <input autoFocus className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              value={draftName} onChange={(e) => setDraftName(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Tag Name *</label>
            <input className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 font-mono"
              value={draftTag} onChange={(e) => setDraftTag(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Interface *</label>
            <select className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              value={draftIfaceId} onChange={(e) => setDraftIfaceId(e.target.value)}>
              {ifaces.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.type})</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Location</label>
            <select className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              value={draftLocId} onChange={(e) => setDraftLocId(e.target.value)}>
              <option value="">— No location —</option>
              {locationOptions.map((o) => <option key={o.locationId} value={o.locationId}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Description</label>
          <input className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Optional" value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={!draftName.trim() || !draftTag.trim()}
            className="px-3 py-1.5 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40">Save</button>
        </div>
      </div>
    )
  }

  const mappedCount = Object.keys(ioMappings).length
  const totalIOFields = ioFields.length

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="group flex items-center gap-4 px-4 py-3">
        {totalIOFields > 0 ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 transition-colors"
            title={expanded ? 'Collapse IO mappings' : 'Expand IO mappings'}
          >
            {expanded ? <ChevronDown size={14} className="text-emerald-600" /> : <ChevronRight size={14} className="text-emerald-600" />}
          </button>
        ) : (
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Tag size={15} className="text-indigo-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm text-gray-800 truncate">{instance.name}</span>
            <span className="font-mono text-xs text-indigo-600 truncate">{instance.tagName}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {instance.description && (
              <p className="text-xs text-gray-400 truncate">{instance.description}</p>
            )}
            <LocationBreadcrumb locationId={instance.locationId} />
          </div>
        </div>
        {linkedIface ? (
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
            linkedIface.type === 'AOI' ? 'bg-orange-100 text-orange-700' : 'bg-cyan-100 text-cyan-700'
          }`}>{linkedIface.name}</span>
        ) : (
          <span className="px-2 py-0.5 rounded text-[10px] bg-red-100 text-red-600 flex-shrink-0">Unlinked</span>
        )}
        {totalIOFields > 0 && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
            mappedCount === totalIOFields
              ? 'bg-emerald-100 text-emerald-700'
              : mappedCount > 0
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-500'
          }`}>
            <Cable size={8} className="inline -mt-px mr-0.5" />
            {mappedCount}/{totalIOFields}
          </span>
        )}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => {
              setDraftName(instance.name); setDraftTag(instance.tagName)
              setDraftDesc(instance.description ?? ''); setDraftIfaceId(instance.interfaceId)
              setDraftLocId(instance.locationId ?? ''); setEditing(true)
            }}
            className="p-1 text-gray-400 hover:text-indigo-600 rounded" title="Edit"
          ><Pencil size={12} /></button>
          <button onClick={() => removeInterfaceInstance(instance.id)}
            className="p-1 text-gray-400 hover:text-red-500 rounded" title="Delete instance"
          ><Trash2 size={12} /></button>
        </div>
      </div>

      {/* IO channel mapping rows */}
      {expanded && totalIOFields > 0 && (
        <div className="border-t border-gray-100 px-4 py-2 flex flex-col gap-1">
          <div className="flex items-center gap-2 px-1 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
            <Cable size={9} className="text-emerald-500" />
            <span>IO Channel Assignments</span>
          </div>
          {ioFields.map((field) => {
            const entryId = ioMappings[field.id]
            return (
              <div key={field.id} className="flex items-center gap-3 px-1 py-1 rounded hover:bg-gray-50">
                <span className="font-mono text-xs font-semibold text-gray-700 w-36 truncate" title={field.name}>{field.name}</span>
                {field.usage && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${USAGE_COLOR[field.usage]}`}>
                    {field.usage}
                  </span>
                )}
                <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">{field.dataType}</span>
                <select
                  className={`flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 bg-white min-w-0 ${
                    entryId
                      ? 'border-emerald-300 focus:ring-emerald-400 text-emerald-800'
                      : 'border-gray-200 focus:ring-indigo-300 text-gray-500'
                  }`}
                  value={entryId ?? ''}
                  onChange={(e) => setIOMapping(field.id, e.target.value || null)}
                >
                  <option value="">— No channel —</option>
                  {ioEntries
                    .filter((entry) => ioTypeMatchesUsage(entry.ioType, field.usage))
                    .map((entry) => {
                      const slot = ioSlots.find((s) => s.id === entry.slotId)
                      const rack = slot ? ioRacks.find((r) => r.id === slot.rackId) : null
                      const prefix = [rack?.name, slot?.name].filter(Boolean).join(' / ')
                      const label = [prefix, `Ch ${entry.channel}`, entry.drawingTag, entry.ioType].filter(Boolean).join(' · ')
                      return <option key={entry.id} value={entry.id}>{label}</option>
                    })}
                </select>
                {entryId && (
                  <button
                    onClick={() => setIOMapping(field.id, null)}
                    className="p-0.5 text-gray-300 hover:text-red-500 rounded flex-shrink-0"
                    title="Clear assignment"
                  ><X size={11} /></button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── New instance dialog ────────────────────────────────────────────────────────

function NewInstanceDialog({ ifaces, onConfirm, onCancel }: {
  ifaces: UserInterface[]
  onConfirm: (name: string, tagName: string, interfaceId: string, locationId: string, description: string) => void
  onCancel: () => void
}) {
  const [name, setName]             = useState('')
  const [tagName, setTagName]       = useState('')
  const [interfaceId, setInterfaceId] = useState(ifaces[0]?.id ?? '')
  const [locationId, setLocationId] = useState('')
  const [description, setDescription] = useState('')

  const locationOptions = useLocationOptions()

  function submit() {
    if (!name.trim() || !tagName.trim() || !interfaceId) return
    onConfirm(name.trim(), tagName.trim(), interfaceId, locationId, description.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-[420px] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-bold text-gray-800 mb-4">New Instance</h2>

        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Interface *</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              value={interfaceId} onChange={(e) => setInterfaceId(e.target.value)}>
              {ifaces.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.type})</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Location</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— No location —</option>
              {locationOptions.map((o) => <option key={o.locationId} value={o.locationId}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Instance Name *</label>
        <input autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3"
          placeholder="e.g. Conveyor Feed Motor"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }} />

        <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Tag Name *</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3"
          placeholder="e.g. P101_ConveyorMotor"
          value={tagName} onChange={(e) => setTagName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }} />

        <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Description</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-5"
          placeholder="Brief description (optional)"
          value={description} onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }} />

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={!name.trim() || !tagName.trim() || !interfaceId}
            className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">Create</button>
        </div>
      </div>
    </div>
  )
}

// ── Global Library Drawer ─────────────────────────────────────────────────────

function GlobalLibraryDrawer({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<UserInterface[]>([])
  const [loading, setLoading] = useState(true)
  const { userInterfaces, addUserInterface } = useDiagramStore()

  useEffect(() => {
    window.api.loadLibrary().then((loaded) => { setItems(loaded); setLoading(false) })
  }, [])

  function persist(updated: UserInterface[]) {
    setItems(updated)
    window.api.saveLibrary(updated)
  }

  function addToProject(item: UserInterface) {
    if (userInterfaces.some((u) => u.name === item.name)) return
    addUserInterface({ ...item, id: uid('iface'), createdAt: new Date().toISOString() })
  }

  return (
    <div className="absolute inset-y-0 right-0 w-72 bg-white border-l border-gray-200 shadow-2xl z-20 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookMarked size={15} className="text-indigo-600" />
          <span className="text-sm font-bold text-gray-800">Global Library</span>
          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">{items.length}</span>
        </div>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
          <X size={16} />
        </button>
      </div>
      <p className="text-[10px] text-gray-400 px-4 py-2 bg-indigo-50/40 border-b border-gray-100 flex-shrink-0">
        Persisted on this machine across all projects. Click ★ on any interface to save it here.
      </p>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-10">Loading…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-10 text-gray-400">
            <BookMarked size={28} className="mb-2 opacity-25" />
            <p className="text-xs font-medium">Library is empty</p>
            <p className="text-[10px] mt-1">Click ★ on an interface to save it here.</p>
          </div>
        ) : (
          items.map((item) => {
            const inProject = userInterfaces.some((u) => u.name === item.name)
            return (
              <div key={item.id} className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                    item.type === 'AOI' ? 'bg-orange-100 text-orange-700' : 'bg-cyan-100 text-cyan-700'
                  }`}>{item.type}</span>
                  <span className="text-sm font-semibold text-gray-800 truncate flex-1">{item.name}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{item.fields.length}f</span>
                </div>
                {item.description && (
                  <p className="text-[10px] text-gray-400 mb-2 truncate">{item.description}</p>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => addToProject(item)}
                    disabled={inProject}
                    className={`flex-1 text-[10px] py-1 rounded border font-medium transition-all ${
                      inProject
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                    }`}
                    title={inProject ? 'Already in this project' : 'Add to current project'}
                  >
                    {inProject ? '✓ In Project' : '+ Add to Project'}
                  </button>
                  <button
                    onClick={() => persist(items.filter((i) => i.id !== item.id))}
                    className="p-1 text-gray-400 hover:text-red-500 rounded border border-gray-200 transition-colors"
                    title="Remove from global library"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── L5K Import Selection Dialog ───────────────────────────────────────────────

function L5KImportDialog({
  fileName,
  ifaces,
  existingNames,
  onConfirm,
  onCancel
}: {
  fileName: string
  ifaces: UserInterface[]
  existingNames: Set<string>
  onConfirm: (selected: UserInterface[]) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ifaces.map((i) => i.name)))
  const [search, setSearch] = useState('')

  const aois = ifaces.filter((i) => i.type === 'AOI')
  const udts = ifaces.filter((i) => i.type === 'UDT')

  const filtered = ifaces.filter((i) => {
    const q = search.toLowerCase()
    return i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q)
  })

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function selectAll() { setSelected(new Set(ifaces.map((i) => i.name))) }
  function selectNone() { setSelected(new Set()) }

  const selectedCount = ifaces.filter((i) => selected.has(i.name)).length
  const duplicateCount = ifaces.filter((i) => selected.has(i.name) && existingNames.has(i.name)).length
  const newCount = selectedCount - duplicateCount

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-bold text-gray-800">Import L5K Interfaces</h2>
          <p className="text-xs text-gray-400 mt-1 font-mono truncate">{fileName}</p>
          <p className="text-xs text-gray-500 mt-2">
            Found{' '}
            <span className="font-semibold text-orange-600">{aois.length} AOI{aois.length !== 1 ? 's' : ''}</span>
            {' and '}
            <span className="font-semibold text-cyan-600">{udts.length} UDT{udts.length !== 1 ? 's' : ''}</span>
            {' — select which to import.'}
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 flex-shrink-0">
          <input
            autoFocus
            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            placeholder="Search interfaces..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={selectAll}
            className="px-2 py-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            Select all
          </button>
          <button
            onClick={selectNone}
            className="px-2 py-1 text-[10px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            None
          </button>
        </div>

        {/* Interface list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-1 min-h-0">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 italic text-center py-6">No interfaces match your search.</p>
          )}
          {filtered.map((iface) => {
            const isSelected = selected.has(iface.name)
            const isDuplicate = existingNames.has(iface.name)
            return (
              <button
                key={iface.name}
                onClick={() => toggle(iface.name)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'bg-indigo-50 border-indigo-200'
                    : 'bg-white border-gray-100 opacity-50'
                }`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'
                }`}>
                  {isSelected && <Check size={10} className="text-white" />}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                  iface.type === 'AOI' ? 'bg-orange-100 text-orange-700' : 'bg-cyan-100 text-cyan-700'
                }`}>
                  {iface.type}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-800">{iface.name}</span>
                  {iface.description && (
                    <span className="text-xs text-gray-400 ml-2 truncate">{iface.description}</span>
                  )}
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">
                  {iface.fields.length} field{iface.fields.length !== 1 ? 's' : ''}
                </span>
                {isDuplicate && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                    exists
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3 flex-shrink-0">
          {duplicateCount > 0 && (
            <span className="text-[10px] text-amber-600">
              {duplicateCount} already in project (will skip)
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(ifaces.filter((i) => selected.has(i.name)))}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {newCount > 0
              ? `Import ${newCount} interface${newCount !== 1 ? 's' : ''}`
              : selectedCount === 0
                ? 'Continue without interfaces'
                : 'Continue (all duplicates)'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Library sub-panel ─────────────────────────────────────────────────────────

function LibraryPanel() {
  const { userInterfaces, interfaceInstances, addUserInterface, addUserInterfacesBulk, addInterfaceInstance, addTab } = useDiagramStore()

  const [showNewIface, setShowNewIface] = useState(false)
  const [showNewInstance, setShowNewInstance] = useState(false)
  const [ifaceSearch, setIfaceSearch] = useState('')
  const [instanceSearch, setInstanceSearch] = useState('')
  const [showGlobalLib, setShowGlobalLib] = useState(false)
  const [importToast, setImportToast] = useState<string | null>(null)
  const [l5kPending, setL5kPending] = useState<{ fileName: string; text: string; ifaces: UserInterface[] } | null>(null)
  const handleL5KTextRef = useRef<(fileName: string, text: string) => Promise<void>>(async () => {})

  function showToast(msg: string) {
    setImportToast(msg)
    setTimeout(() => setImportToast(null), 3500)
  }

  function sanitizeField(raw: unknown): InterfaceField | null {
    if (!raw || typeof raw !== 'object') return null
    const src = raw as Partial<InterfaceField>
    const name = String(src.name ?? '').trim()
    const dataType = String(src.dataType ?? '').trim()
    if (!name || !dataType) return null

    const usage = src.usage
    const safeUsage: AOIFieldUsage | undefined =
      usage === 'Input' || usage === 'Output' || usage === 'InOut' || usage === 'Local'
        ? usage
        : undefined

    return {
      id: uid('field'),
      name,
      dataType,
      usage: safeUsage,
      description: src.description ? String(src.description) : undefined,
      includeInMatrix: typeof src.includeInMatrix === 'boolean' ? src.includeInMatrix : undefined,
      isAlarm: typeof src.isAlarm === 'boolean' ? src.isAlarm : undefined,
      alarmMessage: src.alarmMessage ? String(src.alarmMessage) : undefined,
      isIO: typeof src.isIO === 'boolean' ? src.isIO : undefined
    }
  }

  function sanitizeInterface(raw: unknown): UserInterface | null {
    if (!raw || typeof raw !== 'object') return null
    const src = raw as Partial<UserInterface>
    const name = String(src.name ?? '').trim()
    const type = src.type === 'AOI' || src.type === 'UDT' ? src.type : null
    if (!name || !type) return null

    const rawFields = Array.isArray(src.fields) ? src.fields : []
    const fields = rawFields
      .map((f) => sanitizeField(f))
      .filter((f): f is InterfaceField => f !== null)

    return {
      id: uid('iface'),
      name,
      type,
      description: src.description ? String(src.description) : undefined,
      fields,
      createdAt: new Date().toISOString()
    }
  }

  async function handleExport() {
    if (userInterfaces.length === 0) return
    await window.api.exportInterfaces(userInterfaces, 'interfaces.plci')
  }

  function importParsedInterfaces(imported: UserInterface[]): string | null {
    if (!Array.isArray(imported) || imported.length === 0) return null

    const existingNames = new Set(userInterfaces.map((u) => u.name))
    const toAdd: UserInterface[] = []
    for (const raw of imported) {
      const iface = sanitizeInterface(raw)
      if (!iface) continue
      if (existingNames.has(iface.name)) continue
      toAdd.push(iface)
      existingNames.add(iface.name)
    }

    if (toAdd.length > 0) addUserInterfacesBulk(toAdd)
    const added = toAdd.length
    const skipped = imported.length - added
    return skipped > 0
      ? `imported ${added} interface${added !== 1 ? 's' : ''} · skipped ${skipped} duplicate${skipped !== 1 ? 's' : ''}`
      : `imported ${added} interface${added !== 1 ? 's' : ''}`
  }

  async function handleImport() {
    try {
      const imported = await window.api.importInterfaces()
      if (!imported || !Array.isArray(imported)) return
      const msg = importParsedInterfaces(imported)
      if (msg) showToast(msg)
      else showToast('No valid interfaces found')
    } catch {
      showToast('Import failed — check the file format')
    }
  }

  function finishL5KImport(fileName: string, text: string, selectedIfaces: UserInterface[]) {
    try {
      const taskMap = parseL5KTasks(text)
      const sequences = parseL5KSequences(text, taskMap)

      const ifaceMsg = importParsedInterfaces(selectedIfaces)

      // ── Auto-create Plant / Area / Location / Instances ──────────────
      const controllerName = parseL5KControllerName(text)
      const plcName = controllerName || fileName.replace(/\.l5k$/i, '') || 'Unknown PLC'
      const programTags = parseL5KProgramTags(text)

      const snap = useDiagramStore.getState()
      const ifaceByName = new Map<string, string>()
      for (const ui of snap.userInterfaces) ifaceByName.set(ui.name, ui.id)

      const matchingTags = programTags.filter(t => ifaceByName.has(t.dataType))
      let instCount = 0

      if (taskMap.size > 0 || matchingTags.length > 0) {
        let plantId = snap.plants.find(p => p.name === plcName)?.id
        if (!plantId) {
          plantId = uid('plant')
          snap.addPlant({ id: plantId, name: plcName })
        }

        const taskAreaMap = new Map<string, string>()
        for (const taskName of new Set(taskMap.values())) {
          let areaId = snap.areas.find(a => a.plantId === plantId && a.name === taskName)?.id
          if (!areaId) {
            areaId = uid('area')
            snap.addArea({ id: areaId, name: taskName, plantId })
          }
          taskAreaMap.set(taskName, areaId)
        }

        const progLocMap = new Map<string, string>()
        for (const [progName, taskName] of taskMap) {
          if (progLocMap.has(progName)) continue
          const areaId = taskAreaMap.get(taskName)!
          let locId = snap.locations.find(l => l.areaId === areaId && l.name === progName)?.id
          if (!locId) {
            locId = uid('loc')
            snap.addLocation({ id: locId, name: progName, areaId })
          }
          progLocMap.set(progName, locId)
        }

        const ctrlScopeTags = matchingTags.filter(t => t.programName === null)
        const unassignedProgs = [...new Set(
          matchingTags
            .filter(t => t.programName !== null && !progLocMap.has(t.programName!))
            .map(t => t.programName!)
        )]

        if (ctrlScopeTags.length > 0 || unassignedProgs.length > 0) {
          let fallbackAreaId = snap.areas.find(a => a.plantId === plantId && a.name === 'Controller Scope')?.id
          if (!fallbackAreaId) {
            fallbackAreaId = uid('area')
            snap.addArea({ id: fallbackAreaId, name: 'Controller Scope', plantId })
          }

          if (ctrlScopeTags.length > 0) {
            let locId = snap.locations.find(l => l.areaId === fallbackAreaId && l.name === 'Controller Tags')?.id
            if (!locId) {
              locId = uid('loc')
              snap.addLocation({ id: locId, name: 'Controller Tags', areaId: fallbackAreaId })
            }
            progLocMap.set('__ctrl__', locId)
          }

          for (const pn of unassignedProgs) {
            let locId = snap.locations.find(l => l.areaId === fallbackAreaId && l.name === pn)?.id
            if (!locId) {
              locId = uid('loc')
              snap.addLocation({ id: locId, name: pn, areaId: fallbackAreaId })
            }
            progLocMap.set(pn, locId)
          }
        }

        const existingTags = new Set(snap.interfaceInstances.map(inst => inst.tagName))
        for (const tag of matchingTags) {
          if (existingTags.has(tag.tagName)) continue
          const interfaceId = ifaceByName.get(tag.dataType)!
          const locationId = tag.programName
            ? progLocMap.get(tag.programName)
            : progLocMap.get('__ctrl__')

          snap.addInterfaceInstance({
            id: uid('inst'),
            name: tag.tagName,
            tagName: tag.tagName,
            interfaceId,
            locationId,
            description: tag.description,
            createdAt: new Date().toISOString()
          })
          existingTags.add(tag.tagName)
          instCount++
        }
      }

      // Create TreeFolder entries for tasks and programs
      const state = useDiagramStore.getState()
      const taskFolderIds = new Map<string, string>()
      const progFolderIds = new Map<string, string>()

      for (const seq of sequences) {
        const taskName = seq.taskName || ''
        const progName = seq.rawProgramName || ''

        if (taskName && !taskFolderIds.has(taskName)) {
          const id = state.addFolder(taskName, null)
          taskFolderIds.set(taskName, id)
        }

        if (progName) {
          const compositeKey = `${taskName}::${progName}`
          if (!progFolderIds.has(compositeKey)) {
            const parentId = taskName ? taskFolderIds.get(taskName)! : null
            const id = state.addFolder(progName, parentId)
            progFolderIds.set(compositeKey, id)
          }
        }
      }

      let seqCount = 0
      for (const seq of sequences) {
        const { nodes, edges } = l5kSequenceToFlowchart(seq)
        const taskName = seq.taskName || ''
        const progName = seq.rawProgramName || ''
        const compositeKey = `${taskName}::${progName}`
        const folderId = progFolderIds.get(compositeKey)
          ?? taskFolderIds.get(taskName)
          ?? null
        addTab(seq.programName, 'flowchart', {
          nodes, edges,
          group: seq.taskName, subGroup: seq.rawProgramName,
          folderId,
          activate: false
        })
        seqCount++
      }

      // ── IO Module auto-import ───────────────────────────────────────
      const ioResult = parseL5KIOModules(text)
      let ioCount = 0
      if (ioResult.racks.length > 0) {
        const ioSnap = useDiagramStore.getState()
        const existingRackNames = new Set(ioSnap.ioRacks.map((r) => r.name.toLowerCase()))

        // Create racks (skip existing by name)
        for (const rack of ioResult.racks) {
          if (existingRackNames.has(rack.name.toLowerCase())) continue
          ioSnap.addIORack(rack.name)
        }

        const freshSnap = useDiagramStore.getState()
        const rackNameToId = new Map(freshSnap.ioRacks.map((r) => [r.name.toLowerCase(), r.id]))
        const importedRackIdMap = new Map(ioResult.racks.map((r) => [r.id, r.name.toLowerCase()]))

        // Create slots, mapping imported rackId → real rackId
        const slotIdMap = new Map<string, string>()
        for (const slot of ioResult.slots) {
          const rackName = importedRackIdMap.get(slot.rackId)
          if (!rackName) continue
          const realRackId = rackNameToId.get(rackName)
          if (!realRackId) continue
          const realSlotId = freshSnap.addIOSlot(realRackId, slot.name, slot.catalogNumber)
          slotIdMap.set(slot.id, realSlotId)
        }

        // Create entries, mapping imported slotId → real slotId
        for (const entry of ioResult.entries) {
          const realSlotId = slotIdMap.get(entry.slotId)
          if (!realSlotId) continue
          freshSnap.addIOEntry({ ...entry, id: uid('io'), slotId: realSlotId })
          ioCount++
        }
      }

      const parts: string[] = []
      if (ifaceMsg) parts.push(ifaceMsg)
      if (seqCount > 0) parts.push(`${seqCount} sequence${seqCount !== 1 ? 's' : ''} as flowchart${seqCount !== 1 ? 's' : ''}`)
      if (instCount > 0) parts.push(`${instCount} instance${instCount !== 1 ? 's' : ''}`)
      if (ioCount > 0) parts.push(`${ioResult.racks.length} rack${ioResult.racks.length !== 1 ? 's' : ''} · ${ioResult.slots.length} slot${ioResult.slots.length !== 1 ? 's' : ''} · ${ioCount} IO channel${ioCount !== 1 ? 's' : ''}`)
      if (parts.length > 0) showToast(`L5K: ${parts.join(' · ')}`)
      else if (selectedIfaces.length === 0 && sequences.length === 0) showToast('L5K: no AOI/UDT, sequences or IO modules found')
    } catch {
      showToast('L5K import failed — could not parse file')
    }
  }

  async function handleL5KText(fileName: string, text: string) {
    try {
      const ifaces = parseL5KInterfaces(text)
      if (ifaces.length > 0) {
        setL5kPending({ fileName, text, ifaces })
      } else {
        finishL5KImport(fileName, text, [])
      }
    } catch {
      showToast('L5K import failed — could not parse file')
    }
  }

  handleL5KTextRef.current = handleL5KText

  useEffect(() => {
    const fn = (e: Event) => {
      const d = (e as CustomEvent<{ fileName: string; text: string }>).detail
      void handleL5KTextRef.current(d.fileName, d.text)
    }
    window.addEventListener('plc-import-l5k', fn)
    return () => window.removeEventListener('plc-import-l5k', fn)
  }, [])

  async function handleSaveToLibrary(iface: UserInterface) {
    const existing = await window.api.loadLibrary()
    const updated = existing.some((e) => e.name === iface.name)
      ? existing.map((e) => e.name === iface.name ? { ...iface } : e)
      : [...existing, { ...iface }]
    await window.api.saveLibrary(updated)
    showToast(`"${iface.name}" saved to global library`)
  }

  const filteredIfaces = userInterfaces.filter((i) => {
    const q = ifaceSearch.toLowerCase()
    const name = String(i.name ?? '').toLowerCase()
    const desc = String(i.description ?? '').toLowerCase()
    return name.includes(q) || desc.includes(q)
  })

  const filteredInstances = interfaceInstances.filter((i) => {
    const linked = userInterfaces.find((ui) => ui.id === i.interfaceId)
    return (
      i.name.toLowerCase().includes(instanceSearch.toLowerCase()) ||
      i.tagName.toLowerCase().includes(instanceSearch.toLowerCase()) ||
      linked?.name.toLowerCase().includes(instanceSearch.toLowerCase())
    )
  })

  return (
    <div className="flex flex-1 overflow-hidden bg-gray-50 relative">

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {importToast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-lg pointer-events-none">
          <CheckCircle2 size={13} className="text-emerald-400" />
          {importToast}
        </div>
      )}

      {/* ── User Interfaces ───────────────────────────────────────────────── */}
      <div className="flex flex-col w-1/2 border-r border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <Settings2 size={15} className="text-indigo-500 flex-shrink-0" />
          <h2 className="text-sm font-bold text-gray-800">User Interfaces</h2>
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold">
            {userInterfaces.length}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={handleImport}
              title="Import interfaces from a .plci file"
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors bg-white"
            >
              <Upload size={11} /> Import
            </button>
            <button
              onClick={handleExport}
              disabled={userInterfaces.length === 0}
              title="Export all interfaces to a .plci file"
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={11} /> Export
            </button>
            <button
              onClick={() => setShowGlobalLib((v) => !v)}
              title="Browse Global Library"
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded border transition-colors ${
                showGlobalLib
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 bg-white'
              }`}
            >
              <BookMarked size={11} /> Library
            </button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <button
              onClick={() => setShowNewIface(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
            >
              <Plus size={13} /> New
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
          <input
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            placeholder="Search AOIs / UDTs..."
            value={ifaceSearch}
            onChange={(e) => setIfaceSearch(e.target.value)}
          />
          <p className="mt-2 text-[10px] text-gray-400">
            Import a Studio 5000 <span className="font-mono">.L5K</span> export via <span className="font-medium text-gray-500">File → Import L5K…</span>
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {filteredIfaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 text-gray-400">
              <Cpu size={32} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No interfaces yet</p>
              <p className="text-xs mt-1">Create an AOI or UDT to define a reusable interface structure.</p>
            </div>
          ) : (
            filteredIfaces.map((iface) => (
              <CardErrorBoundary key={iface.id} name={iface.name ?? '?'}>
                <InterfaceCard iface={iface} onSaveToLibrary={handleSaveToLibrary} />
              </CardErrorBoundary>
            ))
          )}
        </div>
      </div>

      {/* ── Instances ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col w-1/2 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <Tag size={15} className="text-indigo-500" />
            <h2 className="text-sm font-bold text-gray-800">Instances</h2>
            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold">
              {interfaceInstances.length}
            </span>
          </div>
          <button
            onClick={() => setShowNewInstance(true)}
            disabled={userInterfaces.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={userInterfaces.length === 0 ? 'Create a User Interface first' : 'New instance'}
          >
            <Plus size={13} /> New
          </button>
        </div>
        <div className="px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
          <input
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            placeholder="Search by name, tag, or interface..."
            value={instanceSearch}
            onChange={(e) => setInstanceSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {userInterfaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 text-gray-400">
              <Tag size={32} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No interfaces defined</p>
              <p className="text-xs mt-1">Define a User Interface on the left before adding instances.</p>
            </div>
          ) : filteredInstances.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 text-gray-400">
              <Tag size={32} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No instances yet</p>
              <p className="text-xs mt-1">Add Motors, Valves, or any tag that uses one of your interfaces.</p>
            </div>
          ) : (
            filteredInstances.map((inst) => (
              <InstanceCard key={inst.id} instance={inst} ifaces={userInterfaces} />
            ))
          )}
        </div>
      </div>

      {/* Global Library Drawer (overlays the panel) */}
      {showGlobalLib && <GlobalLibraryDrawer onClose={() => setShowGlobalLib(false)} />}

      {/* Dialogs */}
      {showNewIface && (
        <NewInterfaceDialog
          onConfirm={(name, type, description) => {
            addUserInterface({
              id: uid('iface'),
              name,
              type,
              description: description || undefined,
              fields: [],
              createdAt: new Date().toISOString()
            })
            setShowNewIface(false)
          }}
          onCancel={() => setShowNewIface(false)}
        />
      )}
      {showNewInstance && (
        <NewInstanceDialog
          ifaces={userInterfaces}
          onConfirm={(name, tagName, interfaceId, locationId, description) => {
            addInterfaceInstance({
              id: uid('inst'),
              name,
              tagName,
              interfaceId,
              locationId: locationId || undefined,
              description: description || undefined,
              createdAt: new Date().toISOString()
            })
            setShowNewInstance(false)
          }}
          onCancel={() => setShowNewInstance(false)}
        />
      )}
      {l5kPending && (
        <L5KImportDialog
          fileName={l5kPending.fileName}
          ifaces={l5kPending.ifaces}
          existingNames={new Set(userInterfaces.map((u) => u.name))}
          onConfirm={(selected) => {
            finishL5KImport(l5kPending.fileName, l5kPending.text, selected)
            setL5kPending(null)
          }}
          onCancel={() => setL5kPending(null)}
        />
      )}
    </div>
  )
}

// ── Main InterfacesPanel ───────────────────────────────────────────────────────

export function InterfacesPanel() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <LibraryPanel />
    </div>
  )
}
