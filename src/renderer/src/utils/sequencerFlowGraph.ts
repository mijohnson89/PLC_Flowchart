import type { FlowPhase, PLCNode, PLCNodeData, PLCEdge, PLCEdgeData } from '../types'

/** Synthetic backward-jump stub nodes in the overview (`seqjump:sourceId:jumpId`). */
export const SEQUENCER_JUMP_STUB_PREFIX = 'seqjump:'

function nodeMapFrom(nodes: PLCNode[]): Map<string, PLCNode> {
  return new Map(nodes.map((n) => [n.id, n]))
}

function isEnd(n: PLCNode | undefined): boolean {
  return n?.type === 'end'
}

/** Outgoing jumps from start or step to another step (or start), excluding end / output / process. One row per target (deduped). */
function collectOutgoingJumps(
  nodeId: string,
  data: PLCNodeData,
  flowEdges: PLCEdge[],
  nodes: Map<string, PLCNode>
): { kind: 'edge' | 'link'; id: string; targetId: string; reason: string }[] {
  const out: { kind: 'edge' | 'link'; id: string; targetId: string; reason: string }[] = []
  for (const e of flowEdges) {
    if (e.source !== nodeId) continue
    const tgt = nodes.get(e.target)
    if (!tgt || tgt.type === 'output' || tgt.type === 'process' || tgt.type === 'end') continue
    if (tgt.type !== 'step' && tgt.type !== 'start') continue
    const ed = e.data as PLCEdgeData | undefined
    const reason = ed?.condition ?? (typeof e.label === 'string' ? e.label : '') ?? ''
    out.push({ kind: 'edge', id: e.id, targetId: e.target, reason })
  }
  for (const sl of data.stepLinks ?? []) {
    const tgt = nodes.get(sl.targetNodeId)
    if (!tgt || tgt.type === 'end' || tgt.type === 'output' || tgt.type === 'process') continue
    if (tgt.type !== 'step' && tgt.type !== 'start') continue
    out.push({
      kind: 'link',
      id: sl.id,
      targetId: sl.targetNodeId,
      reason: sl.reason ?? ''
    })
  }
  const seenTgt = new Set<string>()
  return out.filter((j) => {
    if (seenTgt.has(j.targetId)) return false
    seenTgt.add(j.targetId)
    return true
  })
}

/** Must match Flow overview `snapGrid` in SequencerFlowchartView. */
export const SEQUENCER_OVERVIEW_SNAP_GRID = 16

function snapOverviewCoord(v: number): number {
  return Math.round(v / SEQUENCER_OVERVIEW_SNAP_GRID) * SEQUENCER_OVERVIEW_SNAP_GRID
}

function snapOverviewPoint(p: { x: number; y: number }): { x: number; y: number } {
  return { x: snapOverviewCoord(p.x), y: snapOverviewCoord(p.y) }
}

/** Left column X / top Y — multiples of `SEQUENCER_OVERVIEW_SNAP_GRID` so the stack starts on-grid. */
const STACK_X = 128
const TOP_Y = 16
/** Spine step column width — chosen so `STACK_X + (W_STEP - W_START) / 2` is on-grid with `W_START`. */
const W_STEP = 192
const W_START = 96
const H_START = 46
const H_STEP_COMPACT = 96
/** Flow overview step node: header + description lines + state row (see SequencerActionNode). */
const H_SEQ_HEADER = 40
const H_SEQ_DESC_LINE = 12
const H_SEQ_DESC_MAX_LINES = 5
const H_SEQ_PACKML = 26
const H_SEQ_BODY_PAD = 8
const H_SEQ_BODY_PAD_EMPTY = 4
const VERTICAL_GAP = 40
/** Gap between spine and jump stubs — longer segment so condition labels on the edge stay readable. */
const JUMP_GAP_X = 88
/** Vertical spacing between stacked jump stubs from the same source. */
const JUMP_STACK_GAP = 16
const JUMP_STUB_W = 128
const JUMP_STUB_H = 56

/** Start node X so its horizontal center matches the step column (`STACK_X + W_STEP/2`). */
function startNodeLeftX(): number {
  return STACK_X + (W_STEP - W_START) / 2
}

function stepBlockHeight(step: PLCNode): number {
  const d = step.data as PLCNodeData
  const desc = (d.description ?? '').trim()
  const lines = desc
    ? Math.min(
        H_SEQ_DESC_MAX_LINES,
        Math.max(1, desc.split(/\r?\n/).length, Math.ceil(desc.length / 46))
      )
    : 0
  const descH = lines * H_SEQ_DESC_LINE
  const packH = d.packMLState ? H_SEQ_PACKML : 0
  const core = descH + packH
  const pad = core > 0 ? H_SEQ_BODY_PAD : H_SEQ_BODY_PAD_EMPTY
  /** Minimum height so header + handles never clip. */
  return Math.max(56, H_SEQ_HEADER + core + pad)
}

function phaseColorsForStep(phaseIds: string[] | undefined, phases: FlowPhase[]): string[] {
  if (!phaseIds?.length || !phases.length) return []
  const out: string[] = []
  for (const id of phaseIds) {
    const p = phases.find((x) => x.id === id)
    const c = p?.color?.trim()
    if (c) out.push(c)
  }
  return out
}

function sortedSteps(flowNodes: PLCNode[]): PLCNode[] {
  return flowNodes
    .filter((n) => n.type === 'step')
    .sort((a, b) => (a.data.stepNumber ?? 0) - (b.data.stepNumber ?? 0))
}

function stepNumberOf(nodesMap: Map<string, PLCNode>, id: string): number | undefined {
  const n = nodesMap.get(id)
  if (!n || n.type !== 'step') return undefined
  return (n.data as PLCNodeData).stepNumber
}

/** Dotted edge when a step jumps to a lower step number. */
function isBackwardStepJump(
  nodesMap: Map<string, PLCNode>,
  sourceId: string,
  targetId: string
): boolean {
  const ns = stepNumberOf(nodesMap, sourceId)
  const nt = stepNumberOf(nodesMap, targetId)
  if (ns === undefined || nt === undefined) return false
  return ns > nt
}

function defaultVerticalStackPositions(flowNodes: PLCNode[]): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>()
  const steps = sortedSteps(flowNodes)
  const start = flowNodes.find((n) => n.type === 'start')
  let y = TOP_Y
  if (start) {
    m.set(start.id, snapOverviewPoint({ x: startNodeLeftX(), y }))
    y += H_START + VERTICAL_GAP
  }
  for (const s of steps) {
    m.set(s.id, snapOverviewPoint({ x: STACK_X, y }))
    y += stepBlockHeight(s) + VERTICAL_GAP
  }
  return m
}

function boundsForOverviewNode(
  n: { id: string; type: string },
  flowNodes: PLCNode[]
): { w: number; h: number } {
  if (n.type === 'sequencerJump') return { w: JUMP_STUB_W, h: JUMP_STUB_H }
  if (n.type === 'sequencerStart') return { w: W_START, h: H_START }
  const fn = flowNodes.find((f) => f.id === n.id)
  if (fn?.type === 'step') return { w: W_STEP, h: stepBlockHeight(fn) }
  return { w: W_STEP, h: H_STEP_COMPACT }
}

function jumpStubPosition(
  layout: Map<string, { x: number; y: number }>,
  src: PLCNode,
  stackIndex: number
): { x: number; y: number } {
  const p = layout.get(src.id) ?? { x: STACK_X, y: TOP_Y }
  const srcW = src.type === 'start' ? W_START : W_STEP
  const srcH = src.type === 'start' ? H_START : stepBlockHeight(src)
  // Exact X — do not grid-snap, or the stub shifts sideways vs. the source node's right edge.
  const x = p.x + srcW + JUMP_GAP_X
  // Vertically center stub on the source (right-handle Y === left-handle Y for straight edges).
  const y =
    p.y +
    (srcH - JUMP_STUB_H) / 2 +
    stackIndex * (JUMP_STUB_H + JUMP_STACK_GAP)
  return { x, y }
}

export type SequencerBuiltEdge = {
  id: string
  source: string
  target: string
  /** `straight`: horizontal stub from spine right handle to jump (avoids step-edge bends). */
  type?: 'step' | 'straight'
  /** Higher S# → lower S# (unused when using jump stub; kept for forward extra edges). */
  dotted?: boolean
  /** Matrix jump condition: preset name (Start, Stop, …) or user-written text. */
  label?: string
  sourceHandle?: string
  targetHandle?: string
}

const MAX_EDGE_LABEL_LEN = 72

function formatEdgeLabel(raw: string | undefined): string | undefined {
  const t = raw?.trim()
  if (!t) return undefined
  return t.length > MAX_EDGE_LABEL_LEN ? `${t.slice(0, MAX_EDGE_LABEL_LEN - 1)}…` : t
}

/** Condition / reason for jump from `src` to `tgtId` (step link or flow edge). */
function jumpReasonForPair(
  src: PLCNode,
  tgtId: string,
  flowEdges: PLCEdge[],
  nodesMap: Map<string, PLCNode>
): string | undefined {
  const d = src.data as PLCNodeData
  const jumps = collectOutgoingJumps(src.id, d, flowEdges, nodesMap)
  const j = jumps.find((x) => x.targetId === tgtId)
  return formatEdgeLabel(j?.reason)
}

/**
 * Overview: start on top, then steps in S# order below (same x). Orthogonal `step` edges.
 * Extra forward jumps: direct edges. Backward step→step jumps: line out the right → small Jump stub (target S#).
 */
export function buildSequencerFlowGraph(
  flowNodes: PLCNode[],
  flowEdges: PLCEdge[],
  phases: FlowPhase[] = []
): {
  nodes: {
    id: string
    type: 'sequencerStart' | 'sequencerAction' | 'sequencerJump'
    position: { x: number; y: number }
    data: Record<string, unknown>
  }[]
  edges: SequencerBuiltEdge[]
} {
  const nodesMap = nodeMapFrom(flowNodes)
  const startNode = flowNodes.find((n) => n.type === 'start')
  const steps = sortedSteps(flowNodes)
  const layout = defaultVerticalStackPositions(flowNodes)

  const rfNodes: {
    id: string
    type: 'sequencerStart' | 'sequencerAction' | 'sequencerJump'
    position: { x: number; y: number }
    data: Record<string, unknown>
  }[] = []

  if (startNode) {
    const p = snapOverviewPoint(layout.get(startNode.id) ?? { x: startNodeLeftX(), y: TOP_Y })
    rfNodes.push({
      id: startNode.id,
      type: 'sequencerStart',
      position: { ...p },
      data: { label: (startNode.data as PLCNodeData).label || 'Start' }
    })
  }

  for (const s of steps) {
    const d = s.data as PLCNodeData
    const p = snapOverviewPoint(
      layout.get(s.id) ?? { x: STACK_X, y: TOP_Y + H_START + VERTICAL_GAP }
    )
    rfNodes.push({
      id: s.id,
      type: 'sequencerAction',
      position: { ...p },
      data: {
        label: d.label || 'Step',
        stepNumber: d.stepNumber,
        description: d.description,
        packMLState: d.packMLState,
        phaseColors: phaseColorsForStep(d.phaseIds, phases),
        overviewHeight: stepBlockHeight(s)
      }
    })
  }

  const rfEdges: SequencerBuiltEdge[] = []
  const spineKeys = new Set<string>()

  if (startNode && steps.length > 0) {
    const t0 = steps[0].id
    rfEdges.push({
      id: 'seq-spine-start-first',
      source: startNode.id,
      target: t0,
      type: 'step',
      dotted: false,
      label: jumpReasonForPair(startNode, t0, flowEdges, nodesMap),
      sourceHandle: 'bottom',
      targetHandle: 'top'
    })
    spineKeys.add(`${startNode.id}|${t0}`)
  }

  for (let i = 0; i < steps.length - 1; i++) {
    const a = steps[i].id
    const b = steps[i + 1].id
    rfEdges.push({
      id: `seq-spine-${a}-${b}`,
      source: a,
      target: b,
      type: 'step',
      dotted: false,
      label: jumpReasonForPair(steps[i], b, flowEdges, nodesMap),
      sourceHandle: 'bottom',
      targetHandle: 'top'
    })
    spineKeys.add(`${a}|${b}`)
  }

  const backwardStubCount = new Map<string, number>()
  const sources: PLCNode[] = [...(startNode ? [startNode] : []), ...steps]
  for (const src of sources) {
    const srcData = src.data as PLCNodeData
    const jumps = collectOutgoingJumps(src.id, srcData, flowEdges, nodesMap)
    for (const j of jumps) {
      const key = `${src.id}|${j.targetId}`
      if (spineKeys.has(key)) continue
      const tgt = nodesMap.get(j.targetId)
      if (!tgt || isEnd(tgt)) continue
      if (tgt.type !== 'step' && tgt.type !== 'start') continue

      if (isBackwardStepJump(nodesMap, src.id, j.targetId)) {
        const stackIdx = backwardStubCount.get(src.id) ?? 0
        backwardStubCount.set(src.id, stackIdx + 1)
        const jumpId = `${SEQUENCER_JUMP_STUB_PREFIX}${src.id}:${j.id}`
        const td = tgt.data as PLCNodeData
        const targetStepNumber = tgt.type === 'step' ? td.stepNumber : undefined
        let targetDescription: string
        if (tgt.type === 'start') {
          const sl = (startNode?.data as PLCNodeData | undefined)?.label
          targetDescription = (sl && String(sl).trim()) || 'Start'
        } else {
          const desc = td.description && String(td.description).trim()
          const lbl = (td.label && String(td.label).trim()) || ''
          targetDescription = desc || lbl || (targetStepNumber !== undefined ? `S${targetStepNumber}` : '—')
        }
        rfNodes.push({
          id: jumpId,
          type: 'sequencerJump',
          position: jumpStubPosition(layout, src, stackIdx),
          data: {
            targetId: j.targetId,
            targetStepNumber,
            targetDescription
          }
        })
        rfEdges.push({
          id: `seq-jump-stub-${src.id}-${j.targetId}-${j.id}`,
          source: src.id,
          target: jumpId,
          type: 'straight',
          label: formatEdgeLabel(j.reason),
          sourceHandle: 'right',
          targetHandle: 'left'
        })
        continue
      }

      rfEdges.push({
        id: `seq-jump-${src.id}-${j.targetId}-${j.id}`,
        source: src.id,
        target: j.targetId,
        type: 'step',
        dotted: false,
        label: formatEdgeLabel(j.reason),
        sourceHandle: 'bottom',
        targetHandle: 'top'
      })
    }
  }

  return { nodes: rfNodes, edges: rfEdges }
}

type BuiltSeqNode = ReturnType<typeof buildSequencerFlowGraph>['nodes'][number]

function overviewNodeSize(node: BuiltSeqNode, flowNodes: PLCNode[]): { w: number; h: number } {
  return boundsForOverviewNode(node, flowNodes)
}

/** True if any two start/step boxes intersect (saved layout or bad data). */
function sequencerStartStepBoxesOverlap(placed: BuiltSeqNode[], flowNodes: PLCNode[]): boolean {
  const layoutNodes = placed.filter(
    (n) =>
      n.type === 'sequencerStart' ||
      n.type === 'sequencerAction' ||
      n.type === 'sequencerJump'
  )
  if (layoutNodes.length < 2) return false
  const boxes = layoutNodes.map((n) => {
    const { w, h } = overviewNodeSize(n, flowNodes)
    const { x, y } = n.position
    return { id: n.id, left: x, top: y, right: x + w, bottom: y + h }
  })
  const pad = 4
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const separated =
        a.right - pad <= b.left + pad ||
        a.left + pad >= b.right - pad ||
        a.bottom - pad <= b.top + pad ||
        a.top + pad >= b.bottom - pad
      if (!separated) return true
    }
  }
  return false
}

export type ApplySequencerPositionsResult = {
  nodes: BuiltSeqNode[]
  shouldClearSavedOverviewLayout: boolean
}

/**
 * Merge only `sequencerViewPositions` into the built graph.
 * Do not use main-canvas `flowNodes[].position` for the overview.
 */
export function applySequencerPositions(
  nodes: BuiltSeqNode[],
  flowNodes: PLCNode[],
  sequencerViewPositions?: Record<string, { x: number; y: number }>
): ApplySequencerPositionsResult {
  const defaults = nodes.map((n) => ({ ...n, position: { ...n.position } }))

  const posMap = new Map<string, { x: number; y: number }>()
  if (sequencerViewPositions) {
    for (const [k, v] of Object.entries(sequencerViewPositions)) {
      posMap.set(k, v)
    }
  }

  const hadSavedKeys = posMap.size > 0

  const merged = defaults.map((n) => {
    // Jump stubs are always laid out from spine geometry — never use saved coords (they go stale when steps move).
    if (n.type === 'sequencerJump') return n
    const p = posMap.get(n.id)
    if (!p) return n
    return { ...n, position: snapOverviewPoint(p) }
  })

  if (!sequencerStartStepBoxesOverlap(merged, flowNodes)) {
    return { nodes: merged, shouldClearSavedOverviewLayout: false }
  }

  if (hadSavedKeys) {
    return { nodes: defaults, shouldClearSavedOverviewLayout: true }
  }

  return { nodes: defaults, shouldClearSavedOverviewLayout: false }
}
