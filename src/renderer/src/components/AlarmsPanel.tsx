import { useState, useRef, useEffect, useMemo } from 'react'
import { Plus, Trash2, Pencil, Bell, BellRing, Layers, X } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type { Alarm } from '../types'
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

export function AlarmsPanel() {
  const alarms = useDiagramStore((s) => s.alarms)
  const interfaces = useDiagramStore((s) => s.userInterfaces)
  const allInstances = useDiagramStore((s) => s.interfaceInstances)
  const { addAlarm, updateAlarm, removeAlarm, updateFieldInInterface } = useDiagramStore()

  const [adding, setAdding] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editMsgKey, setEditMsgKey] = useState<string | null>(null)
  const [editMsgDraft, setEditMsgDraft] = useState('')
  const addRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLInputElement>(null)
  const editMsgRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (adding) addRef.current?.focus() }, [adding])
  useEffect(() => { if (editingId) editRef.current?.select() }, [editingId])
  useEffect(() => { if (editMsgKey) editMsgRef.current?.select() }, [editMsgKey])

  const submit = () => {
    const desc = newDesc.trim()
    if (!desc) return
    addAlarm({ id: uid('alarm'), description: desc })
    setNewDesc('')
    setAdding(false)
  }

  const rows = useMemo<FlatAlarmRow[]>(() => {
    const result: FlatAlarmRow[] = []

    for (const alarm of alarms) {
      result.push({
        key: `s-${alarm.id}`,
        type: 'standalone',
        alarmMessage: alarm.description,
        standaloneAlarm: alarm
      })
    }

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
  }, [alarms, interfaces, allInstances])

  const standaloneCount = alarms.length
  const instanceCount = rows.filter((r) => r.type === 'instance').length

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
        {rows.length > 0 && (
          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
            {rows.length}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
        >
          <Plus size={11} /> Add Alarm
        </button>
      </div>

      {/* Add form */}
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

      {/* Empty state */}
      {rows.length === 0 && !adding && (
        <div className="flex items-center justify-center py-12 text-center flex-1">
          <div>
            <BellRing size={28} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-400 mb-1">No alarms defined</p>
            <p className="text-[11px] text-gray-400 mb-3">
              Add once-off alarms here, or mark fields as alarms on the Interfaces screen
            </p>
            <button onClick={() => setAdding(true)} className="text-[11px] text-amber-600 hover:text-amber-700 font-semibold">
              <Plus size={10} className="inline -mt-0.5 mr-0.5" />Add first alarm
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
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
              {/* Once-off section header */}
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
              {rows.filter((r) => r.type === 'standalone').map((row, i) => (
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

              {/* Per-instance section header */}
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
              {rows.filter((r) => r.type === 'instance').map((row, i) => {
                const msgEditKey = row.interfaceName && row.fieldName
                  ? `${interfaces.find((iface) => iface.name === row.interfaceName)?.id}::${
                      interfaces.find((iface) => iface.name === row.interfaceName)?.fields.find((f) => f.name === row.fieldName)?.id
                    }`
                  : null
                const isEditingMsg = msgEditKey && editMsgKey === msgEditKey

                return (
                  <tr key={row.key} className="border-b border-gray-100 hover:bg-violet-50/30 transition-colors group">
                    <td className="px-4 py-2 text-gray-400 tabular-nums">{standaloneCount + i + 1}</td>
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
