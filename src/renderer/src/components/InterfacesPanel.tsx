import { useState } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronRight, Cpu, Database,
  Tag, Settings2, X, Check, Pencil, Grid3x3, Library, Building2
} from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type {
  UserInterface, InterfaceInstance, InterfaceField,
  InterfaceType, AOIFieldUsage
} from '../types'
import { MatrixView } from './MatrixView'
import { LocationsPanel, useLocationOptions, LocationBreadcrumb } from './LocationsPanel'

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 1
function uid(prefix = 'iface') { return `${prefix}_${Date.now()}_${_id++}` }

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

// ── Field row ─────────────────────────────────────────────────────────────────

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

  function save() {
    onUpdate(draft)
    setEditing(false)
  }

  if (editing) {
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
        <input
          className="w-24 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="Default"
          value={draft.defaultValue ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, defaultValue: e.target.value }))}
        />
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
      <span className="font-mono font-semibold text-gray-800 w-32 truncate" title={field.name}>{field.name}</span>
      <span className="font-mono text-indigo-600 w-28 truncate">{field.dataType}</span>
      {isAOI && field.usage && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${USAGE_COLOR[field.usage]}`}>
          {field.usage}
        </span>
      )}
      {field.description && (
        <span className="text-gray-400 flex-1 truncate">{field.description}</span>
      )}
      {field.defaultValue && (
        <span className="font-mono text-gray-500 text-[10px]">= {field.defaultValue}</span>
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
  const [defaultValue, setDefaultValue] = useState('')

  function submit() {
    if (!name.trim()) return
    onAdd({
      id: uid('field'),
      name: name.trim(),
      dataType,
      usage: isAOI ? usage : undefined,
      description: description.trim() || undefined,
      defaultValue: defaultValue.trim() || undefined
    })
    setName('')
    setDescription('')
    setDefaultValue('')
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
      <input
        className="w-24 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        placeholder="Default"
        value={defaultValue}
        onChange={(e) => setDefaultValue(e.target.value)}
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

// ── Interface card ────────────────────────────────────────────────────────────

function InterfaceCard({ iface }: { iface: UserInterface }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(iface.name)
  const [draftDesc, setDraftDesc] = useState(iface.description ?? '')

  const { updateUserInterface, removeUserInterface, addFieldToInterface, updateFieldInInterface, removeFieldFromInterface } = useDiagramStore()

  function saveHeader() {
    updateUserInterface(iface.id, { name: draftName.trim() || iface.name, description: draftDesc.trim() || undefined })
    setEditing(false)
  }

  const isAOI = iface.type === 'AOI'

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
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
  const [draftName, setDraftName]       = useState(instance.name)
  const [draftTag, setDraftTag]         = useState(instance.tagName)
  const [draftDesc, setDraftDesc]       = useState(instance.description ?? '')
  const [draftIfaceId, setDraftIfaceId] = useState(instance.interfaceId)
  const [draftLocId, setDraftLocId]     = useState(instance.locationId ?? '')

  const { updateInterfaceInstance, removeInterfaceInstance } = useDiagramStore()
  const locationOptions = useLocationOptions()
  const linkedIface = ifaces.find((i) => i.id === instance.interfaceId)

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

  return (
    <div className="group bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
        <Tag size={15} className="text-indigo-500" />
      </div>
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

// ── Library sub-panel ─────────────────────────────────────────────────────────

function LibraryPanel() {
  const { userInterfaces, interfaceInstances, addUserInterface, addInterfaceInstance } = useDiagramStore()

  const [showNewIface, setShowNewIface] = useState(false)
  const [showNewInstance, setShowNewInstance] = useState(false)
  const [ifaceSearch, setIfaceSearch] = useState('')
  const [instanceSearch, setInstanceSearch] = useState('')

  const filteredIfaces = userInterfaces.filter((i) =>
    i.name.toLowerCase().includes(ifaceSearch.toLowerCase()) ||
    i.description?.toLowerCase().includes(ifaceSearch.toLowerCase())
  )

  const filteredInstances = interfaceInstances.filter((i) => {
    const linked = userInterfaces.find((ui) => ui.id === i.interfaceId)
    return (
      i.name.toLowerCase().includes(instanceSearch.toLowerCase()) ||
      i.tagName.toLowerCase().includes(instanceSearch.toLowerCase()) ||
      linked?.name.toLowerCase().includes(instanceSearch.toLowerCase())
    )
  })

  return (
    <div className="flex flex-1 overflow-hidden bg-gray-50">

      {/* ── User Interfaces ───────────────────────────────────────────────── */}
      <div className="flex flex-col w-1/2 border-r border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="text-indigo-500" />
            <h2 className="text-sm font-bold text-gray-800">User Interfaces</h2>
            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold">
              {userInterfaces.length}
            </span>
          </div>
          <button
            onClick={() => setShowNewIface(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
          >
            <Plus size={13} /> New
          </button>
        </div>
        <div className="px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
          <input
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            placeholder="Search AOIs / UDTs..."
            value={ifaceSearch}
            onChange={(e) => setIfaceSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {filteredIfaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 text-gray-400">
              <Cpu size={32} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No interfaces yet</p>
              <p className="text-xs mt-1">Create an AOI or UDT to define a reusable interface structure.</p>
            </div>
          ) : (
            filteredIfaces.map((iface) => <InterfaceCard key={iface.id} iface={iface} />)
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
    </div>
  )
}

// ── Main InterfacesPanel ───────────────────────────────────────────────────────

type InterfacesSubTab = 'library' | 'locations' | 'matrix'

export function InterfacesPanel() {
  const [subTab, setSubTab] = useState<InterfacesSubTab>('library')
  const { userInterfaces, interfaceInstances, matrixData, plants, areas, locations } = useDiagramStore()

  const instanceCount   = interfaceInstances.length
  const matrixCellCount = Object.values(matrixData).reduce((sum, step) =>
    sum + Object.values(step).reduce((s2, inst) => s2 + Object.keys(inst).length, 0), 0
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* ── Sub-tab bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => setSubTab('library')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            subTab === 'library'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-500 hover:bg-gray-100 hover:text-indigo-600'
          }`}
        >
          <Library size={13} />
          Library
          <span className={`px-1.5 py-px rounded-full text-[10px] font-bold ${
            subTab === 'library' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
          }`}>
            {userInterfaces.length}
          </span>
          {instanceCount > 0 && (
            <span className={`px-1.5 py-px rounded-full text-[10px] font-bold ${
              subTab === 'library' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {instanceCount} inst
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('locations')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            subTab === 'locations'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-500 hover:bg-gray-100 hover:text-indigo-600'
          }`}
        >
          <Building2 size={13} />
          Locations
          {plants.length > 0 && (
            <span className={`px-1.5 py-px rounded-full text-[10px] font-bold ${
              subTab === 'locations' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {plants.length}P · {areas.length}A · {locations.length}L
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('matrix')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            subTab === 'matrix'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-500 hover:bg-gray-100 hover:text-indigo-600'
          }`}
        >
          <Grid3x3 size={13} />
          Cause &amp; Effect Matrix
          {matrixCellCount > 0 && (
            <span className={`px-1.5 py-px rounded-full text-[10px] font-bold ${
              subTab === 'matrix' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {matrixCellCount}
            </span>
          )}
        </button>

        {subTab === 'matrix' && (
          <p className="ml-auto text-[10px] text-gray-400 hidden sm:block">
            Rows = Steps from flowchart tabs · Columns = Instances grouped by interface · Click cells to assign actions
          </p>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {subTab === 'library'   && <LibraryPanel />}
      {subTab === 'locations' && <LocationsPanel />}
      {subTab === 'matrix'    && <MatrixView />}
    </div>
  )
}
