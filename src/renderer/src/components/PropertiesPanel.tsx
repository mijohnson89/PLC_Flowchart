import { useDiagramStore, selectFlowNodes, selectFlowEdges } from '../store/diagramStore'
import type { PLCNodeData, PLCNodeType, PackMLState } from '../types'
import { PACKML_STATES, PACKML_WAIT_STATES, PACKML_ACTING_STATES } from '../types'
import { Trash2 } from 'lucide-react'

const ACTOR_TYPES = ['plc', 'hmi', 'device', 'operator', 'system'] as const
const OUTPUT_TYPES = ['coil', 'move', 'compare', 'timer', 'counter'] as const
const NODE_COLORS: Record<string, string> = {
  start: '#059669', end: '#dc2626', step: '#10b981',
  decision: '#ca8a04', process: '#0891b2', output: '#7c3aed',
  actor: '#2563eb', transition: '#d97706', note: '#eab308'
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, multiline = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean
}) {
  const cls = "w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
  return multiline
    ? <textarea className={`${cls} resize-none`} rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    : <input className={cls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select
      className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function PropertiesPanel() {
  const flowNodes = useDiagramStore(selectFlowNodes)
  const flowEdges = useDiagramStore(selectFlowEdges)
  const edges = flowEdges
  const { setFlowNodes, setFlowEdges,
    selectedNodeId, selectedEdgeId, setSelectedNode, setSelectedEdge } = useDiagramStore()

  const selectedNode = flowNodes.find((n) => n.id === selectedNodeId)
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId)

  function patchNode(patch: Partial<PLCNodeData>) {
    setFlowNodes(flowNodes.map((n) =>
      n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n
    ))
  }

  function deleteNode() {
    setFlowNodes(flowNodes.filter((n) => n.id !== selectedNodeId))
    setFlowEdges(flowEdges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNode(null)
  }

  function deleteEdge() {
    setFlowEdges(flowEdges.filter((e) => e.id !== selectedEdgeId))
    setSelectedEdge(null)
  }

  function patchEdge(patch: { label?: string }) {
    setFlowEdges(flowEdges.map((e) => e.id === selectedEdgeId ? { ...e, ...patch } : e))
  }

  if (!selectedNode && !selectedEdge) {
    return (
      <aside className="w-60 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Properties</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="text-gray-400">
            <div className="text-3xl mb-2">→</div>
            <p className="text-xs">Click a node or edge to view and edit its properties</p>
          </div>
        </div>
      </aside>
    )
  }

  if (selectedEdge) {
    return (
      <aside className="w-60 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Edge</h2>
          <button onClick={deleteEdge} className="p-1 text-red-400 hover:text-red-600 rounded">
            <Trash2 size={14} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <Field label="Label">
            <Input
              value={(selectedEdge.label as string) ?? ''}
              onChange={(v) => patchEdge({ label: v })}
              placeholder="e.g. TRUE, sensor OK…"
            />
          </Field>
        </div>
      </aside>
    )
  }

  if (!selectedNode) return null
  const data = selectedNode.data as PLCNodeData
  const nodeType = selectedNode.type as PLCNodeType
  const defaultColor = NODE_COLORS[nodeType] ?? '#6b7280'

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Properties</h2>
          <div className="text-[11px] text-gray-500 capitalize mt-0.5">{nodeType} node</div>
        </div>
        <button onClick={deleteNode} className="p-1 text-red-400 hover:text-red-600 rounded" title="Delete node">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        <Field label="Label / Name">
          <Input value={data.label ?? ''} onChange={(v) => patchNode({ label: v })} placeholder="Node label…" />
        </Field>

        <Field label="Description / Notes">
          <Input value={data.description ?? ''} onChange={(v) => patchNode({ description: v })} placeholder="Optional notes…" multiline />
        </Field>

        {nodeType === 'step' && (
          <Field label="Step Number">
            <input
              type="number"
              className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={data.stepNumber ?? ''}
              placeholder="e.g. 1"
              onChange={(e) => patchNode({ stepNumber: Number(e.target.value) })}
            />
          </Field>
        )}

        {nodeType === 'step' && (
          <Field label="PackML State">
            <div className="flex flex-col gap-1.5">
              <select
                className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={data.packMLState ?? ''}
                onChange={(e) => patchNode({ packMLState: (e.target.value || undefined) as PackMLState | undefined })}
              >
                <option value="">— None —</option>
                <optgroup label="Wait States (stable)">
                  {PACKML_WAIT_STATES.map((s) => (
                    <option key={s} value={s}>{PACKML_STATES[s].label}</option>
                  ))}
                </optgroup>
                <optgroup label="Acting States (transitional)">
                  {PACKML_ACTING_STATES.map((s) => (
                    <option key={s} value={s}>{PACKML_STATES[s].label}</option>
                  ))}
                </optgroup>
              </select>

              {/* Live preview of the selected state badge */}
              {data.packMLState && (() => {
                const def = PACKML_STATES[data.packMLState]
                return (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 border border-gray-100">
                    <span
                      className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest border ${
                        def.category === 'acting' ? 'italic' : ''
                      }`}
                      style={{ backgroundColor: def.bgColor, color: def.textColor, borderColor: def.borderColor }}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${def.category === 'acting' ? 'animate-pulse' : ''}`}
                        style={{ backgroundColor: def.borderColor }}
                      />
                      {def.label}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {def.category === 'acting' ? 'Acting (transitional)' : 'Wait (stable)'}
                    </span>
                  </div>
                )
              })()}
            </div>
          </Field>
        )}

        {(nodeType === 'decision' || nodeType === 'transition') && (
          <Field label="Condition">
            <Input
              value={data.condition ?? ''}
              onChange={(v) => patchNode({ condition: v })}
              placeholder="e.g. Sensor_01 AND NOT Fault"
            />
          </Field>
        )}

        {nodeType === 'output' && (
          <>
            <Field label="Tag Name">
              <Input
                value={data.tagName ?? ''}
                onChange={(v) => patchNode({ tagName: v })}
                placeholder="e.g. Motor_01_Run"
              />
            </Field>
            <Field label="Output Type">
              <Select
                value={data.outputType ?? 'coil'}
                onChange={(v) => patchNode({ outputType: v as PLCNodeData['outputType'] })}
                options={OUTPUT_TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))}
              />
            </Field>
          </>
        )}

        {nodeType === 'actor' && (
          <Field label="Actor Type">
            <Select
              value={data.actorType ?? 'system'}
              onChange={(v) => patchNode({ actorType: v as PLCNodeData['actorType'] })}
              options={ACTOR_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
            />
          </Field>
        )}

        {nodeType === 'process' && (
          <Field label="Routine Name">
            <Input
              value={data.routineName ?? ''}
              onChange={(v) => patchNode({ routineName: v })}
              placeholder="e.g. MainSequence"
            />
          </Field>
        )}

        <Field label="Color Override">
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="w-8 h-8 cursor-pointer border border-gray-200 rounded"
              value={data.color ?? defaultColor}
              onChange={(e) => patchNode({ color: e.target.value })}
            />
            <button
              className="text-xs text-gray-400 hover:text-gray-700"
              onClick={() => patchNode({ color: undefined })}
            >
              Reset
            </button>
          </div>
        </Field>
      </div>

      {/* Node ID (debug) */}
      <div className="px-4 py-2 border-t border-gray-100">
        <div className="text-[9px] font-mono text-gray-300 truncate">ID: {selectedNode.id}</div>
      </div>
    </aside>
  )
}
