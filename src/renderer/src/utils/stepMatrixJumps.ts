import type { PLCNode, PLCNodeData, PLCEdgeData } from '../types'

/** Same column set as the Step Matrix pane (steps-only view). */
export const STEP_MATRIX_FROZEN = [
  { w: 56, label: '#' },
  { w: 140, label: 'Name' },
  { w: 180, label: 'Description' },
  { w: 128, label: 'State' },
  { w: 168, label: 'Phases' },
  { w: 200, label: 'Jumps To' },
  { w: 200, label: 'Jumps From' },
] as const

export type JumpRef =
  | { kind: 'edge'; id: string; targetId: string; reason: string; description: string }
  | { kind: 'link'; id: string; targetId: string; reason: string; description: string }

export function nodeLabel(nodes: Map<string, PLCNode>, id: string): string {
  const n = nodes.get(id)
  if (!n) return id
  if (n.type === 'end') return 'End'
  if (n.type === 'start') return 'Start'
  const d = n.data as PLCNodeData
  if (n.type === 'step' && d.stepNumber !== undefined) return `S${d.stepNumber} ${d.label || ''}`.trim()
  return d.label || n.type
}

/** Compact display for jump target (step number + name). */
export function stepTargetBrief(nodes: Map<string, PLCNode>, targetId: string): { num: string; name: string } {
  const n = nodes.get(targetId)
  if (!n) return { num: '—', name: targetId }
  const d = n.data as PLCNodeData
  if (n.type === 'step') {
    const num = d.stepNumber !== undefined ? `S${d.stepNumber}` : '—'
    const name = (d.label ?? '').trim() || '—'
    return { num, name }
  }
  if (n.type === 'end') return { num: '', name: 'End' }
  if (n.type === 'start') return { num: '', name: 'Start' }
  return { num: '', name: (d.label || n.type).trim() || targetId }
}

export function collectJumpsTo(
  nodeId: string,
  data: PLCNodeData,
  flowEdges: { id: string; source: string; target: string; label?: string; data?: PLCEdgeData }[],
  nodes: Map<string, PLCNode>
): JumpRef[] {
  const out: JumpRef[] = []
  for (const e of flowEdges) {
    if (e.source !== nodeId) continue
    const tgt = nodes.get(e.target)
    if (!tgt || tgt.type === 'output' || tgt.type === 'process') continue
    const ed = e.data as PLCEdgeData | undefined
    const reason = ed?.condition ?? e.label ?? ''
    const description = ed?.description ?? ''
    out.push({ kind: 'edge', id: e.id, targetId: e.target, reason, description })
  }
  for (const sl of data.stepLinks ?? []) {
    if (!nodes.has(sl.targetNodeId)) continue
    out.push({
      kind: 'link',
      id: sl.id,
      targetId: sl.targetNodeId,
      reason: sl.reason ?? '',
      description: sl.description ?? '',
    })
  }
  const seenTgt = new Set<string>()
  return out.filter((j) => {
    if (seenTgt.has(j.targetId)) return false
    seenTgt.add(j.targetId)
    return true
  })
}

export function collectJumpsFrom(
  nodeId: string,
  flowEdges: { id: string; source: string; target: string; label?: string; data?: PLCEdgeData }[],
  allStepNodes: PLCNode[]
): JumpRef[] {
  const out: JumpRef[] = []
  for (const e of flowEdges) {
    if (e.target !== nodeId) continue
    const src = allStepNodes.find((n) => n.id === e.source)
    if (!src || src.type !== 'step') continue
    const d = e.data as PLCEdgeData | undefined
    out.push({
      kind: 'edge',
      id: e.id,
      targetId: e.source,
      reason: d?.condition ?? e.label ?? '',
      description: d?.description ?? '',
    })
  }
  for (const n of allStepNodes) {
    if (n.id === nodeId) continue
    const d = n.data as PLCNodeData
    for (const sl of d.stepLinks ?? []) {
      if (sl.targetNodeId === nodeId) {
        out.push({
          kind: 'link',
          id: `${n.id}::${sl.id}`,
          targetId: n.id,
          reason: sl.reason ?? '',
          description: sl.description ?? '',
        })
      }
    }
  }
  return out
}
