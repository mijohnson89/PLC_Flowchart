import { useState, useRef, useEffect, useMemo } from 'react'
import { Plus, Trash2, Pencil, Bell, BellRing, Layers, X, Gauge } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import {
  type Alarm,
  type AnalogAlarmConfig,
  type AnalogAlarmBand,
  type AnalogAlarmHystBand,
  createDefaultAnalogAlarmConfig,
} from '../types'
import { uid } from '../utils/uid'

interface FlatAlarmRow {
  key: string
  type: 'standalone' | 'instance'
  alarmMessage: string
  instanceName?: string
  instanceTagName?: string
  interfaceName?: string
  interfaceType?: string
  fieldName?: string
  standaloneAlarm?: Alarm
}

const BAND_KEYS = ['ll', 'l', 'h', 'hh'] as const
const HYST_KEYS = ['llHyst', 'lHyst', 'hHyst', 'hhHyst'] as const

const BAND_LABELS: Record<(typeof BAND_KEYS)[number], string> = {
  ll: 'LL',
  l: 'L',
  h: 'H',
  hh: 'HH',
}

const HYST_LABELS: Record<(typeof HYST_KEYS)[number], string> = {
  llHyst: 'LL-Hyst',
  lHyst: 'L-Hyst',
  hHyst: 'H-Hyst',
  hhHyst: 'HH-Hyst',
}

/** Decimal numeric text only: optional leading `-`, digits, one `.` (allows partial `-`, `.`, `-.` while typing). */
function sanitizeAnalogNumericInput(raw: string): string {
  const filtered = raw.replace(/[^\d.\-]/g, '')
  if (filtered === '' || filtered === '-') return filtered
  const neg = filtered[0] === '-'
  let rest = neg ? filtered.slice(1) : filtered
  if (rest === '') return neg ? '-' : ''
  const dot = rest.indexOf('.')
  let intPart: string
  let frac: string
  if (dot === -1) {
    intPart = rest.replace(/\D/g, '')
    frac = ''
  } else {
    intPart = rest.slice(0, dot).replace(/\D/g, '')
    frac = rest.slice(dot + 1).replace(/\D/g, '')
  }
  const joined = dot === -1 ? intPart : `${intPart}.${frac}`
  return neg ? `-${joined}` : joined
}

function AnalogAlarmEditor({
  alarm,
  onChange,
}: {
  alarm: Alarm
  onChange: (next: AnalogAlarmConfig) => void
}) {
  const analog = alarm.analog
  if (!analog || alarm.alarmType !== 'analog') return null

  const setBand = (key: (typeof BAND_KEYS)[number], patch: Partial<AnalogAlarmBand>) => {
    onChange({ ...analog, [key]: { ...analog[key], ...patch } })
  }

  const setHyst = (key: (typeof HYST_KEYS)[number], patch: Partial<AnalogAlarmHystBand>) => {
    onChange({ ...analog, [key]: { ...analog[key], ...patch } })
  }

  return (
    <div className="mt-3 pt-3 border-t border-emerald-100 space-y-4">
      <div>
        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-2">Limits</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse min-w-[520px]">
            <thead>
              <tr className="text-left text-[9px] font-bold text-gray-400 uppercase">
                <th className="pr-2 py-1 w-14"></th>
                <th className="pr-2 py-1 w-16">Enable</th>
                <th className="pr-2 py-1">Value</th>
                <th className="py-1 w-36">Reset</th>
              </tr>
            </thead>
            <tbody>
              {BAND_KEYS.map((key) => {
                const b = analog[key]
                return (
                  <tr key={key} className="border-t border-emerald-50">
                    <td className="pr-2 py-1.5 font-mono font-semibold text-emerald-900">{BAND_LABELS[key]}</td>
                    <td className="pr-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={b.enabled}
                        onChange={(e) => setBand(key, { enabled: e.target.checked })}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-400"
                      />
                    </td>
                    <td className="pr-2 py-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={sanitizeAnalogNumericInput(b.value)}
                        onChange={(e) => setBand(key, { value: sanitizeAnalogNumericInput(e.target.value) })}
                        onBlur={() => {
                          const v = sanitizeAnalogNumericInput(b.value)
                          if (v !== b.value) setBand(key, { value: v })
                        }}
                        disabled={!b.enabled}
                        className="w-full min-w-[80px] text-xs border border-gray-200 rounded px-2 py-1 font-mono tabular-nums disabled:bg-gray-50 disabled:text-gray-400"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1.5">
                      <select
                        value={b.reset}
                        onChange={(e) => setBand(key, { reset: e.target.value as AnalogAlarmBand['reset'] })}
                        disabled={!b.enabled}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        <option value="manual">Manual</option>
                        <option value="auto">Auto</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-2">Hysteresis</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse min-w-[360px]">
            <thead>
              <tr className="text-left text-[9px] font-bold text-gray-400 uppercase">
                <th className="pr-2 py-1 w-20"></th>
                <th className="pr-2 py-1 w-16">Enable</th>
                <th className="py-1">Value</th>
              </tr>
            </thead>
            <tbody>
              {HYST_KEYS.map((key) => {
                const h = analog[key]
                return (
                  <tr key={key} className="border-t border-emerald-50">
                    <td className="pr-2 py-1.5 font-mono font-semibold text-emerald-900">{HYST_LABELS[key]}</td>
                    <td className="pr-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={h.enabled}
                        onChange={(e) => setHyst(key, { enabled: e.target.checked })}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-400"
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={sanitizeAnalogNumericInput(h.value)}
                        onChange={(e) => setHyst(key, { value: sanitizeAnalogNumericInput(e.target.value) })}
                        onBlur={() => {
                          const v = sanitizeAnalogNumericInput(h.value)
                          if (v !== h.value) setHyst(key, { value: v })
                        }}
                        disabled={!h.enabled}
                        className="w-full max-w-[200px] text-xs border border-gray-200 rounded px-2 py-1 font-mono tabular-nums disabled:bg-gray-50 disabled:text-gray-400"
                        placeholder="0"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function AlarmsPanel() {
  const alarms = useDiagramStore((s) => s.alarms)
  const interfaces = useDiagramStore((s) => s.userInterfaces)
  const allInstances = useDiagramStore((s) => s.interfaceInstances)
  const { addAlarm, updateAlarm, removeAlarm, updateFieldInInterface } = useDiagramStore()

  const [adding, setAdding] = useState(false)
  const [addingAnalog, setAddingAnalog] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [newAnalogDesc, setNewAnalogDesc] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editMsgKey, setEditMsgKey] = useState<string | null>(null)
  const [editMsgDraft, setEditMsgDraft] = useState('')
  const addRef = useRef<HTMLInputElement>(null)
  const addAnalogRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLInputElement>(null)
  const editMsgRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (adding) addRef.current?.focus() }, [adding])
  useEffect(() => { if (addingAnalog) addAnalogRef.current?.focus() }, [addingAnalog])
  useEffect(() => { if (editingId) editRef.current?.select() }, [editingId])
  useEffect(() => { if (editMsgKey) editMsgRef.current?.select() }, [editMsgKey])

  const onceOffAlarms = useMemo(
    () => alarms.filter((a) => a.alarmType !== 'analog'),
    [alarms]
  )
  const analogAlarms = useMemo(
    () => alarms.filter((a) => a.alarmType === 'analog'),
    [alarms]
  )

  const submit = () => {
    const desc = newDesc.trim()
    if (!desc) return
    addAlarm({ id: uid('alarm'), description: desc })
    setNewDesc('')
    setAdding(false)
  }

  const submitAnalog = () => {
    const desc = newAnalogDesc.trim()
    if (!desc) return
    addAlarm({
      id: uid('alarm'),
      description: desc,
      alarmType: 'analog',
      analog: createDefaultAnalogAlarmConfig(),
    })
    setNewAnalogDesc('')
    setAddingAnalog(false)
  }

  const instanceRows = useMemo<FlatAlarmRow[]>(() => {
    const result: FlatAlarmRow[] = []

    for (const iface of interfaces) {
      for (const field of iface.fields) {
        if (!field.isAlarm) continue
        const msg = field.alarmMessage || field.name
        const ifaceInstances = allInstances.filter((inst) => inst.interfaceId === iface.id)

        if (ifaceInstances.length === 0) {
          result.push({
            key: `f-${iface.id}-${field.id}-none`,
            type: 'instance',
            alarmMessage: msg,
            instanceName: undefined,
            interfaceName: iface.name,
            interfaceType: iface.type,
            fieldName: field.name
          })
        } else {
          for (const inst of ifaceInstances) {
            result.push({
              key: `f-${iface.id}-${field.id}-${inst.id}`,
              type: 'instance',
              alarmMessage: msg,
              instanceName: inst.name,
              instanceTagName: inst.tagName,
              interfaceName: iface.name,
              interfaceType: iface.type,
              fieldName: field.name
            })
          }
        }
      }
    }

    return result
  }, [interfaces, allInstances])

  const onceOffRows = useMemo<FlatAlarmRow[]>(() =>
    onceOffAlarms.map((alarm) => ({
      key: `s-${alarm.id}`,
      type: 'standalone' as const,
      alarmMessage: alarm.description,
      standaloneAlarm: alarm
    })),
  [onceOffAlarms])

  const standaloneCount = onceOffAlarms.length
  const analogCount = analogAlarms.length
  const instanceCount = instanceRows.length
  const totalListed = standaloneCount + analogCount + instanceCount
  const hasAnyContent = totalListed > 0 || adding || addingAnalog

  const commitEdit = () => {
    if (!editingId) return
    const t = editDraft.trim()
    if (t) updateAlarm(editingId, { description: t })
    setEditingId(null)
  }

  const startEditMsg = (ifaceId: string, fieldId: string, currentMsg: string) => {
    const k = `${ifaceId}::${fieldId}`
    setEditMsgKey(k)
    setEditMsgDraft(currentMsg)
  }

  const commitMsgEdit = () => {
    if (!editMsgKey) return
    const [ifaceId, fieldId] = editMsgKey.split('::')
    const t = editMsgDraft.trim()
    if (t) updateFieldInInterface(ifaceId, fieldId, { alarmMessage: t })
    setEditMsgKey(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/30">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex-shrink-0">
        <BellRing size={14} className="text-amber-600" />
        <span className="text-sm font-semibold text-amber-800">Alarms</span>
        {totalListed > 0 && (
          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
            {totalListed}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => { setAdding(true); setAddingAnalog(false) }}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
        >
          <Plus size={11} /> Add Alarm
        </button>
        <button
          onClick={() => { setAddingAnalog(true); setAdding(false) }}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors"
        >
          <Gauge size={11} /> Add Analog Alarm
        </button>
      </div>

      {/* Add once-off form */}
      {adding && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50/60 border-b border-amber-100 flex-shrink-0">
          <input
            ref={addRef}
            className="flex-1 text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300"
            placeholder="Alarm description…"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') { setAdding(false); setNewDesc('') }
            }}
          />
          <button onClick={submit} disabled={!newDesc.trim()} className="px-3 py-1.5 text-[11px] font-semibold text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-40 transition-colors">
            Add
          </button>
          <button onClick={() => { setAdding(false); setNewDesc('') }} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Add analog form */}
      {addingAnalog && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50/80 border-b border-emerald-100 flex-shrink-0">
          <Gauge size={14} className="text-emerald-600 flex-shrink-0" />
          <input
            ref={addAnalogRef}
            className="flex-1 text-xs border border-emerald-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-300"
            placeholder="Name or tag (e.g. Tank level)…"
            value={newAnalogDesc}
            onChange={(e) => setNewAnalogDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAnalog()
              if (e.key === 'Escape') { setAddingAnalog(false); setNewAnalogDesc('') }
            }}
          />
          <button onClick={submitAnalog} disabled={!newAnalogDesc.trim()} className="px-3 py-1.5 text-[11px] font-semibold text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            Add
          </button>
          <button onClick={() => { setAddingAnalog(false); setNewAnalogDesc('') }} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Empty state */}
      {!hasAnyContent && (
        <div className="flex items-center justify-center py-12 text-center flex-1">
          <div>
            <BellRing size={28} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-400 mb-1">No alarms defined</p>
            <p className="text-[11px] text-gray-400 mb-3">
              Add once-off or analog alarms here, or mark fields as alarms on the Interfaces screen
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setAdding(true)} className="text-[11px] text-amber-600 hover:text-amber-700 font-semibold">
                <Plus size={10} className="inline -mt-0.5 mr-0.5" />Add alarm
              </button>
              <span className="text-gray-300">·</span>
              <button onClick={() => setAddingAnalog(true)} className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold">
                <Gauge size={10} className="inline -mt-0.5 mr-0.5" />Add analog alarm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tables & analog cards */}
      {hasAnyContent && (standaloneCount > 0 || analogCount > 0 || instanceCount > 0) && (
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2 font-bold text-[10px] text-gray-500 uppercase tracking-wider w-10">#</th>
                <th className="text-left px-3 py-2 font-bold text-[10px] text-gray-500 uppercase tracking-wider w-24">Type</th>
                <th className="text-left px-3 py-2 font-bold text-[10px] text-gray-500 uppercase tracking-wider">Alarm Message</th>
                <th className="text-left px-3 py-2 font-bold text-[10px] text-gray-500 uppercase tracking-wider w-40">Source</th>
                <th className="text-left px-3 py-2 font-bold text-[10px] text-gray-500 uppercase tracking-wider w-32">Field</th>
                <th className="w-16 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {/* Once-off section */}
              {standaloneCount > 0 && (
                <tr className="bg-gray-50/80">
                  <td colSpan={6} className="px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      <Bell size={10} className="text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Once-off Alarms</span>
                      <span className="text-[9px] font-bold bg-gray-200 text-gray-600 px-1.5 py-px rounded-full">{standaloneCount}</span>
                    </div>
                  </td>
                </tr>
              )}
              {onceOffRows.map((row, i) => (
                <tr key={row.key} className="border-b border-gray-100 hover:bg-amber-50/30 transition-colors group">
                  <td className="px-4 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      <Bell size={9} /> Once-off
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {editingId === row.standaloneAlarm?.id ? (
                      <input
                        ref={editRef}
                        autoFocus
                        className="text-xs bg-white border border-amber-400 rounded px-2 py-1 outline-none w-full focus:ring-1 focus:ring-amber-300"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        onBlur={commitEdit}
                      />
                    ) : (
                      <span className="text-gray-800 font-medium">{row.alarmMessage}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-400">—</td>
                  <td className="px-3 py-2 text-gray-400">—</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button
                        onClick={() => { setEditingId(row.standaloneAlarm!.id); setEditDraft(row.standaloneAlarm!.description) }}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Edit"
                      >
                        <Pencil size={10} />
                      </button>
                      <button onClick={() => removeAlarm(row.standaloneAlarm!.id)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Delete">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* Analog section — full-width detail rows */}
              {analogCount > 0 && (
                <tr className="bg-emerald-50/80">
                  <td colSpan={6} className="px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      <Gauge size={10} className="text-emerald-600" />
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Analog Alarms</span>
                      <span className="text-[9px] font-bold bg-emerald-200 text-emerald-800 px-1.5 py-px rounded-full">{analogCount}</span>
                    </div>
                  </td>
                </tr>
              )}
              {analogAlarms.map((alarm, ai) => {
                const idx = standaloneCount + ai + 1
                return (
                  <tr key={alarm.id} className="border-b border-emerald-100/80 bg-emerald-50/20 hover:bg-emerald-50/40 transition-colors group">
                    <td className="px-4 py-2 align-top text-gray-400 tabular-nums">{idx}</td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Gauge size={9} /> Analog
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top" colSpan={3}>
                      <div className="max-w-3xl">
                        <div className="flex items-start gap-2 flex-wrap">
                          {editingId === alarm.id ? (
                            <input
                              ref={editRef}
                              autoFocus
                              className="flex-1 min-w-[200px] text-xs bg-white border border-emerald-400 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-300"
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit()
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              onBlur={commitEdit}
                            />
                          ) : (
                            <span className="text-gray-900 font-semibold">{alarm.description}</span>
                          )}
                        </div>
                        <AnalogAlarmEditor
                          alarm={alarm}
                          onChange={(next) => updateAlarm(alarm.id, { analog: next })}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button
                          onClick={() => { setEditingId(alarm.id); setEditDraft(alarm.description) }}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Edit name"
                        >
                          <Pencil size={10} />
                        </button>
                        <button onClick={() => removeAlarm(alarm.id)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Delete">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {/* Per-instance section */}
              {instanceCount > 0 && (
                <tr className="bg-gray-50/80">
                  <td colSpan={6} className="px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      <Layers size={10} className="text-violet-400" />
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Per-instance Alarms</span>
                      <span className="text-[9px] font-bold bg-violet-100 text-violet-600 px-1.5 py-px rounded-full">{instanceCount}</span>
                      <span className="text-[9px] text-gray-400">from Interface fields</span>
                    </div>
                  </td>
                </tr>
              )}
              {instanceRows.map((row, i) => {
                const msgEditKey = row.interfaceName && row.fieldName
                  ? `${interfaces.find((iface) => iface.name === row.interfaceName)?.id}::${
                      interfaces.find((iface) => iface.name === row.interfaceName)?.fields.find((f) => f.name === row.fieldName)?.id
                    }`
                  : null
                const isEditingMsg = msgEditKey && editMsgKey === msgEditKey

                return (
                  <tr key={row.key} className="border-b border-gray-100 hover:bg-violet-50/30 transition-colors group">
                    <td className="px-4 py-2 text-gray-400 tabular-nums">{standaloneCount + analogCount + i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                        <Layers size={9} /> Instance
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {isEditingMsg ? (
                        <input
                          ref={editMsgRef}
                          autoFocus
                          className="text-xs bg-white border border-violet-400 rounded px-2 py-1 outline-none w-full focus:ring-1 focus:ring-violet-300"
                          value={editMsgDraft}
                          onChange={(e) => setEditMsgDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitMsgEdit()
                            if (e.key === 'Escape') setEditMsgKey(null)
                          }}
                          onBlur={commitMsgEdit}
                        />
                      ) : (
                        <span className="text-gray-800">
                          {row.instanceName ? (
                            <>
                              <span className="font-semibold text-violet-700">{row.instanceName}</span>
                              {' '}
                              <span className="font-medium">{row.alarmMessage}</span>
                            </>
                          ) : (
                            <span className="italic text-gray-400">{'<instance>'} {row.alarmMessage}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        row.interfaceType === 'AOI' ? 'bg-orange-50 text-orange-700' : 'bg-cyan-50 text-cyan-700'
                      }`}>
                        {row.interfaceType}
                      </span>
                      <span className="ml-1 text-gray-600">{row.interfaceName}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-gray-600">{row.fieldName}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        {msgEditKey && (
                          <button
                            onClick={() => startEditMsg(
                              msgEditKey.split('::')[0],
                              msgEditKey.split('::')[1],
                              row.alarmMessage
                            )}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded"
                            title="Edit alarm message"
                          >
                            <Pencil size={10} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
