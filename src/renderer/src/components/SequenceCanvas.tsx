import { useState, useRef, useCallback } from 'react'
import { Plus, Trash2, ArrowRight, ChevronUp, ChevronDown, Edit2, Check, X, Lock } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type { SequenceActor, SequenceMessage, MessageType } from '../types'

const ACTOR_COLORS = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2', '#DB2777']
const ACTOR_TYPES = ['plc', 'hmi', 'device', 'operator', 'system'] as const

const MSG_STYLES: Record<MessageType, { dash: string; label: string; color: string }> = {
  sync:   { dash: '0',          label: '→ Call',    color: '#1e40af' },
  async:  { dash: '6,4',        label: '⤳ Async',  color: '#059669' },
  return: { dash: '4,4',        label: '← Return',  color: '#6b7280' },
  signal: { dash: '2,2',        label: '⚡ Signal',  color: '#d97706' }
}

const LIFELINE_TOP = 80       // px below actor box top
const MSG_HEIGHT = 52         // px per message row
const ACTOR_WIDTH = 140
const ACTOR_GAP = 60
const CANVAS_PAD = 40

interface EditState { id: string; field: 'actor' | 'message'; value: string }

function actorX(index: number) {
  return CANVAS_PAD + index * (ACTOR_WIDTH + ACTOR_GAP) + ACTOR_WIDTH / 2
}

export function SequenceCanvas({ readOnly = false }: { readOnly?: boolean }) {
  const seqActors = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.seqActors ?? [])
  const seqMessages = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.seqMessages ?? [])
  const {
    addSeqActor, updateSeqActor, removeSeqActor,
    addSeqMessage, updateSeqMessage, removeSeqMessage, reorderSeqMessage
  } = useDiagramStore()

  const [edit, setEdit] = useState<EditState | null>(null)
  const [addMsgOpen, setAddMsgOpen] = useState(false)
  const [newMsg, setNewMsg] = useState<Partial<SequenceMessage>>({ type: 'sync' })
  const svgRef = useRef<SVGSVGElement>(null)

  const canvasWidth = Math.max(600, seqActors.length * (ACTOR_WIDTH + ACTOR_GAP) + CANVAS_PAD * 2)
  const canvasHeight = LIFELINE_TOP + 60 + seqMessages.length * MSG_HEIGHT + 60

  const sortedMessages = [...seqMessages].sort((a, b) => a.order - b.order)

  const handleAddActor = useCallback(() => {
    const idx = seqActors.length
    const actor: SequenceActor = {
      id: `actor_${Date.now()}`,
      name: `Actor ${idx + 1}`,
      type: ACTOR_TYPES[idx % ACTOR_TYPES.length],
      color: ACTOR_COLORS[idx % ACTOR_COLORS.length]
    }
    addSeqActor(actor)
  }, [seqActors.length, addSeqActor])

  const handleAddMessage = useCallback(() => {
    if (!newMsg.fromId || !newMsg.toId || !newMsg.label) return
    const msg: SequenceMessage = {
      id: `msg_${Date.now()}`,
      fromId: newMsg.fromId,
      toId: newMsg.toId,
      label: newMsg.label,
      type: (newMsg.type as MessageType) ?? 'sync',
      order: seqMessages.length,
      note: newMsg.note
    }
    addSeqMessage(msg)
    setNewMsg({ type: 'sync' })
    setAddMsgOpen(false)
  }, [newMsg, seqMessages.length, addSeqMessage])

  const commitEdit = useCallback(() => {
    if (!edit) return
    if (edit.field === 'actor') updateSeqActor(edit.id, { name: edit.value })
    if (edit.field === 'message') updateSeqMessage(edit.id, { label: edit.value })
    setEdit(null)
  }, [edit, updateSeqActor, updateSeqMessage])

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Toolbar row */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        {readOnly ? (
          <div className="flex items-center gap-2 text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
            <Lock size={12} /> Read-only — viewing a historical revision
          </div>
        ) : (
          <>
            <button
              onClick={handleAddActor}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
            >
              <Plus size={13} /> Add Actor
            </button>
            <button
              onClick={() => setAddMsgOpen(true)}
              disabled={seqActors.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowRight size={13} /> Add Message
            </button>
          </>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {seqActors.length} actors · {seqMessages.length} messages
        </span>
      </div>

      {/* Add message form */}
      {addMsgOpen && !readOnly && (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex-wrap flex-shrink-0">
          <select
            className="text-xs border border-gray-300 rounded px-2 py-1"
            value={newMsg.fromId ?? ''}
            onChange={(e) => setNewMsg((p) => ({ ...p, fromId: e.target.value }))}
          >
            <option value="">From actor...</option>
            {seqActors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <ArrowRight size={14} className="text-gray-400" />
          <select
            className="text-xs border border-gray-300 rounded px-2 py-1"
            value={newMsg.toId ?? ''}
            onChange={(e) => setNewMsg((p) => ({ ...p, toId: e.target.value }))}
          >
            <option value="">To actor...</option>
            {seqActors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input
            className="text-xs border border-gray-300 rounded px-2 py-1 flex-1 min-w-[120px]"
            placeholder="Message label..."
            value={newMsg.label ?? ''}
            onChange={(e) => setNewMsg((p) => ({ ...p, label: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleAddMessage()}
          />
          <select
            className="text-xs border border-gray-300 rounded px-2 py-1"
            value={newMsg.type ?? 'sync'}
            onChange={(e) => setNewMsg((p) => ({ ...p, type: e.target.value as MessageType }))}
          >
            {(Object.keys(MSG_STYLES) as MessageType[]).map((t) => (
              <option key={t} value={t}>{MSG_STYLES[t].label}</option>
            ))}
          </select>
          <button onClick={handleAddMessage} className="p-1 text-emerald-700 hover:text-emerald-900">
            <Check size={15} />
          </button>
          <button onClick={() => setAddMsgOpen(false)} className="p-1 text-gray-400 hover:text-gray-700">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Diagram canvas */}
      <div className="flex-1 overflow-auto p-4">
        {seqActors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="text-4xl mb-3">↑</div>
            <div className="text-sm">Click "Add Actor" to start building your sequence diagram</div>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={canvasWidth}
            height={canvasHeight}
            className="bg-white rounded-lg shadow-sm border border-gray-200 block mx-auto"
          >
            {/* Actor boxes and lifelines */}
            {seqActors.map((actor, i) => {
              const cx = actorX(i)
              const lifelineBottom = canvasHeight - 20
              return (
                <g key={actor.id}>
                  {/* Lifeline */}
                  <line
                    x1={cx} y1={LIFELINE_TOP}
                    x2={cx} y2={lifelineBottom}
                    stroke={actor.color} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.5}
                  />

                  {/* Actor box */}
                  <rect
                    x={cx - ACTOR_WIDTH / 2} y={8}
                    width={ACTOR_WIDTH} height={LIFELINE_TOP - 16}
                    rx={8} fill="white"
                    stroke={actor.color} strokeWidth={2}
                  />
                  <rect
                    x={cx - ACTOR_WIDTH / 2} y={8}
                    width={ACTOR_WIDTH} height={24}
                    rx={8} fill={actor.color} opacity={0.15}
                  />
                  <text
                    x={cx} y={26}
                    textAnchor="middle" fontSize={10}
                    fill={actor.color} fontWeight="700"
                    style={{ textTransform: 'uppercase', letterSpacing: 1 }}
                  >
                    {actor.type}
                  </text>
                  <text x={cx} y={52} textAnchor="middle" fontSize={13} fill="#1e293b" fontWeight="600">
                    {actor.name}
                  </text>

                  {/* Actor actions — hidden in read-only */}
                  {!readOnly && (
                    <>
                      <foreignObject x={cx + ACTOR_WIDTH / 2 - 36} y={10} width={36} height={20}>
                        <div className="flex items-center gap-0.5">
                          <button
                            className="text-gray-400 hover:text-blue-600 p-0.5"
                            onClick={() => setEdit({ id: actor.id, field: 'actor', value: actor.name })}
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            className="text-gray-400 hover:text-red-600 p-0.5"
                            onClick={() => removeSeqActor(actor.id)}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </foreignObject>

                      <foreignObject x={cx - ACTOR_WIDTH / 2 + 4} y={10} width={24} height={20}>
                        <input
                          type="color" value={actor.color}
                          className="w-5 h-4 cursor-pointer border-0 p-0 bg-transparent"
                          onChange={(e) => updateSeqActor(actor.id, { color: e.target.value })}
                        />
                      </foreignObject>
                    </>
                  )}
                </g>
              )
            })}

            {/* Messages */}
            {sortedMessages.map((msg, idx) => {
              const fromActor = seqActors.find((a) => a.id === msg.fromId)
              const toActor = seqActors.find((a) => a.id === msg.toId)
              if (!fromActor || !toActor) return null

              const fromIdx = seqActors.indexOf(fromActor)
              const toIdx = seqActors.indexOf(toActor)
              const x1 = actorX(fromIdx)
              const x2 = actorX(toIdx)
              const y = LIFELINE_TOP + 30 + idx * MSG_HEIGHT
              const style = MSG_STYLES[msg.type]
              const isSelf = msg.fromId === msg.toId
              const isLeft = x2 < x1

              return (
                <g key={msg.id}>
                  {isSelf ? (
                    <>
                      <path
                        d={`M ${x1} ${y} h 40 v 24 h -40`}
                        fill="none" stroke={style.color} strokeWidth={1.8}
                        strokeDasharray={style.dash}
                        markerEnd="url(#arrow)"
                      />
                      <text x={x1 + 46} y={y + 14} fontSize={11} fill={style.color} fontStyle="italic">
                        {msg.label}
                      </text>
                    </>
                  ) : (
                    <>
                      <line
                        x1={x1} y1={y} x2={isLeft ? x2 + 8 : x2 - 8} y2={y}
                        stroke={style.color} strokeWidth={1.8}
                        strokeDasharray={style.dash}
                        markerEnd={`url(#arrow-${msg.type})`}
                      />
                      <text
                        x={(x1 + x2) / 2} y={y - 5}
                        textAnchor="middle" fontSize={11}
                        fill={style.color} fontStyle="italic"
                      >
                        {msg.label}
                      </text>
                    </>
                  )}

                  {/* Message controls — hidden in read-only */}
                  {!readOnly && (
                    <>
                      <foreignObject x={8} y={y - 10} width={30} height={22}>
                        <div className="flex flex-col items-center">
                          <button
                            className="text-gray-300 hover:text-gray-600 leading-none"
                            onClick={() => reorderSeqMessage(msg.id, msg.order - 1)}
                            disabled={idx === 0}
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            className="text-gray-300 hover:text-gray-600 leading-none"
                            onClick={() => reorderSeqMessage(msg.id, msg.order + 1)}
                            disabled={idx === sortedMessages.length - 1}
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      </foreignObject>

                      <foreignObject x={canvasWidth - 30} y={y - 8} width={28} height={20}>
                        <button
                          className="text-gray-300 hover:text-red-500"
                          onClick={() => removeSeqMessage(msg.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </foreignObject>
                    </>
                  )}
                </g>
              )
            })}

            {/* Arrow markers */}
            <defs>
              {(Object.entries(MSG_STYLES) as [MessageType, typeof MSG_STYLES.sync][]).map(([type, s]) => (
                <marker
                  key={type}
                  id={`arrow-${type}`}
                  viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="8" markerHeight="8" orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={s.color} />
                </marker>
              ))}
            </defs>
          </svg>
        )}
      </div>

      {/* Inline edit popover */}
      {edit && !readOnly && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-lg shadow-xl p-4 w-72" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-gray-700 mb-2">
              Edit {edit.field === 'actor' ? 'Actor Name' : 'Message Label'}
            </div>
            <input
              autoFocus
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={edit.value}
              onChange={(e) => setEdit((p) => p ? { ...p, value: e.target.value } : null)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEdit(null) }}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setEdit(null)} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-800">Cancel</button>
              <button onClick={commitEdit} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
