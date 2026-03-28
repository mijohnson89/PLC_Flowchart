import { useDiagramStore, selectFlowNodes, selectFlowEdges } from '../store/diagramStore'
import type { PLCNodeData, PLCNodeType, PackMLState, StepLink } from '../types'
import { PACKML_STATES, PACKML_WAIT_STATES, PACKML_ACTING_STATES, INTERFACES_TAB_ID } from '../types'
import { Trash2, Link2, X, Plus, ArrowRight } from 'lucide-react'

const ACTOR_TYPES = ['plc', 'hmi', 'device', 'operator', 'system'] as const
const OUTPUT_TYPES = ['coil', 'move', 'compare', 'timer', 'counter'] as const
const NODE_COLORS: Record<string, string> = {
  start: '#059669', end: '#dc2626', step: '#10b981',
  process: '#0891b2', output: '#7c3aed',
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

  const allTabs = useDiagramStore((s) => s.tabs)
  const activeTabId = useDiagramStore((s) => s.activeTabId)

  // Tabs available for cross-diagram linking (exclude Interfaces tab and current tab)
  const linkableTabs = allTabs.filter(
    (t) => t.id !== activeTabId && t.id !== INTERFACES_TAB_ID
  )

  // Nodes available in the linked tab for node-level targeting
  const linkedTab = allTabs.find((t) => t.id === (selectedNode?.data as PLCNodeData | undefined)?.linkedTabId)
  const linkedTabNodes = linkedTab?.flowNodes ?? []

  if (!selectedNode && !selectedEdge) {
    return (
      <aside className="min-h-0 bg-white border-t border-gray-200 flex flex-col flex-shrink-0 max-h-[40%] overflow-hidden">
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
      <aside className="min-h-0 bg-white border-t border-gray-200 flex flex-col flex-shrink-0 max-h-[40%] overflow-hidden">
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
    <aside className="min-h-0 bg-white border-t border-gray-200 flex flex-col overflow-hidden flex-shrink-0 max-h-[40%]">
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

        {nodeType === 'transition' && (
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

        {/* ── Step Links (node references) ────────────────────────────── */}
        <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1">
              <ArrowRight size={10} />
              Step Links
            </label>
            <button
              className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700 font-medium"
              onClick={() => {
                const existing: StepLink[] = data.stepLinks ?? []
                const id = `sl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
                patchNode({ stepLinks: [...existing, { id, targetNodeId: '', reason: '', description: '' }] })
              }}
            >
              <Plus size={10} /> Add
            </button>
          </div>

          {(data.stepLinks ?? []).length === 0 && (
            <p className="text-[10px] text-gray-400 leading-snug">
              Add references to other nodes. They appear as clickable links at the bottom of this node.
            </p>
          )}

          {(data.stepLinks ?? []).map((link: StepLink, idx: number) => {
            const targetNode = flowNodes.find((n) => n.id === link.targetNodeId)
            return (
              <div key={link.id} className="flex flex-col gap-1 p-2 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-1">
                  <select
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={link.targetNodeId}
                    onChange={(e) => {
                      const updated = [...(data.stepLinks ?? [])]
                      updated[idx] = { ...updated[idx], targetNodeId: e.target.value }
                      patchNode({ stepLinks: updated })
                    }}
                  >
                    <option value="">— Select target —</option>
                    {flowNodes
                      .filter((n) => n.id !== selectedNodeId)
                      .map((n) => {
                        const nd = n.data as PLCNodeData
                        return (
                          <option key={n.id} value={n.id}>
                            [{n.type}] {nd.label || n.id}
                          </option>
                        )
                      })}
                  </select>
                  <button
                    onClick={() => {
                      const updated = (data.stepLinks ?? []).filter((_: StepLink, i: number) => i !== idx)
                      patchNode({ stepLinks: updated })
                    }}
                    className="p-1 text-gray-400 hover:text-red-500 rounded"
                    title="Remove link"
                  >
                    <X size={12} />
                  </button>
                </div>
                <input
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Condition (e.g. Timer expired, Fault detected)"
                  value={link.reason ?? ''}
                  onChange={(e) => {
                    const updated = [...(data.stepLinks ?? [])]
                    updated[idx] = { ...updated[idx], reason: e.target.value }
                    patchNode({ stepLinks: updated })
                  }}
                />
                <input
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Description"
                  value={link.description ?? ''}
                  onChange={(e) => {
                    const updated = [...(data.stepLinks ?? [])]
                    updated[idx] = { ...updated[idx], description: e.target.value }
                    patchNode({ stepLinks: updated })
                  }}
                />
                {targetNode && (
                  <div className="flex items-center gap-1 text-[10px] text-blue-500">
                    <ArrowRight size={8} />
                    <span className="font-medium">{(targetNode.data as PLCNodeData).label || targetNode.id}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Cross-diagram Anchor ─────────────────────────────────────── */}
        <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1">
              <Link2 size={10} />
              Diagram Link
            </label>
            {data.linkedTabId && (
              <button
                className="flex items-center gap-0.5 text-[10px] text-red-400 hover:text-red-600"
                onClick={() => patchNode({ linkedTabId: undefined, linkedNodeId: undefined })}
                title="Remove link"
              >
                <X size={10} /> Remove
              </button>
            )}
          </div>

          <select
            className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={data.linkedTabId ?? ''}
            onChange={(e) => patchNode({ linkedTabId: e.target.value || undefined, linkedNodeId: undefined })}
          >
            <option value="">— No link —</option>
            {linkableTabs.map((t) => (
              <option key={t.id} value={t.id}>
                [{t.type === 'flowchart' ? 'Flow' : 'Seq'}] {t.name}
              </option>
            ))}
          </select>

          {data.linkedTabId && linkedTabNodes.length > 0 && (
            <select
              className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={data.linkedNodeId ?? ''}
              onChange={(e) => patchNode({ linkedNodeId: e.target.value || undefined })}
            >
              <option value="">— Start of diagram —</option>
              {linkedTabNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  [{n.type}] {(n.data as PLCNodeData).label || n.id}
                </option>
              ))}
            </select>
          )}

          {data.linkedTabId && (
            <p className="text-[10px] text-indigo-500 leading-snug">
              Click the <span className="font-bold">⛓</span> badge on this node to jump to{' '}
              <span className="font-semibold">{linkedTab?.name ?? '…'}</span>
              {data.linkedNodeId ? ` › ${(linkedTabNodes.find(n => n.id === data.linkedNodeId)?.data as PLCNodeData | undefined)?.label ?? data.linkedNodeId}` : ''}
            </p>
          )}
        </div>

      </div>

      {/* Node ID (debug) */}
      <div className="px-4 py-2 border-t border-gray-100">
        <div className="text-[9px] font-mono text-gray-300 truncate">ID: {selectedNode.id}</div>
      </div>
    </aside>
  )
}
