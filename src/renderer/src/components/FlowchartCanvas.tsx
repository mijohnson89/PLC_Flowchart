import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls,
  BackgroundVariant, SelectionMode, Panel,
  MarkerType,
  useReactFlow
} from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react'
import { Link2, Link2Off, Lock, LayoutList, Sparkles, Grid3x3, PanelRightClose, PanelRightOpen, ShieldAlert, PanelBottomClose, PanelBottomOpen } from 'lucide-react'
import '@xyflow/react/dist/style.css'

import { useDiagramStore, selectFlowNodes, selectFlowEdges } from '../store/diagramStore'
import type { PLCNodeData, PLCNodeType, PLCNode, PLCEdge, PLCEdgeData } from '../types'
import { AlignmentToolbar } from './AlignmentToolbar'
import { GuideLinesOverlay } from './GuideLinesOverlay'
import { PageBoundaryOverlay } from './PageBoundaryOverlay'
import { PageSizeControl } from './PageSizeControl'
import { EditableEdge } from './edges/EditableEdge'
import { StepNode } from './nodes/StepNode'
import { ProcessNode } from './nodes/ProcessNode'
import { OutputNode } from './nodes/OutputNode'
import { ActorNode } from './nodes/ActorNode'
import { TransitionNode } from './nodes/TransitionNode'
import { StartNode } from './nodes/StartNode'
import { EndNode } from './nodes/EndNode'
import { NoteNode } from './nodes/NoteNode'

// ── Edge hit-testing ──────────────────────────────────────────────────────────

type XY = { x: number; y: number }

function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 0.001) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function edgePathSegments(srcPos: XY, tgtPos: XY, waypoints: XY[]): [XY, XY][] {
  const pts: XY[] = [srcPos, ...waypoints, tgtPos]
  const segs: [XY, XY][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) {
      const corner: XY = { x: b.x, y: a.y }
      segs.push([a, corner], [corner, b])
    } else {
      segs.push([a, b])
    }
  }
  return segs
}

function findEdgeAtPoint(
  pt: XY,
  nodes: { id: string; position: XY; measured?: { width?: number; height?: number } }[],
  edges: PLCEdge[],
  threshold = 18
): PLCEdge | null {
  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source)
    const tgt = nodes.find((n) => n.id === edge.target)
    if (!src || !tgt) continue
    const sw = src.measured?.width ?? 152, sh = src.measured?.height ?? 60
    const tw = tgt.measured?.width ?? 152
    const srcHandle: XY = { x: src.position.x + sw / 2, y: src.position.y + sh }
    const tgtHandle: XY = { x: tgt.position.x + tw / 2, y: tgt.position.y }
    const waypoints = (edge.data?.waypoints ?? []) as XY[]
    const segs = edgePathSegments(srcHandle, tgtHandle, waypoints)
    const minDist = Math.min(...segs.map(([a, b]) => distToSegment(pt, a, b)))
    if (minDist < threshold) return edge
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────

const NODE_TYPES = {
  start: StartNode, end: EndNode, step: StepNode,
  process: ProcessNode, output: OutputNode,
  actor: ActorNode, transition: TransitionNode, note: NoteNode
}

const EDGE_TYPES = {
  editable: EditableEdge
}

import { uid } from '../utils/uid'


interface FlowchartCanvasProps {
  readOnly?: boolean
  showMatrix?: boolean
  onToggleMatrix?: () => void
  showConditions?: boolean
  onToggleConditions?: () => void
}

// Inner component — has access to useReactFlow (must be inside ReactFlow provider)
function CanvasInner({
  connectMode,
  pendingSourceId,
  readOnly,
  showMatrix,
  onToggleMatrix,
  showConditions,
  onToggleConditions
}: {
  connectMode: boolean
  pendingSourceId: string | null
  readOnly: boolean
  showMatrix?: boolean
  onToggleMatrix?: () => void
  showConditions?: boolean
  onToggleConditions?: () => void
}) {
  const { getNode } = useReactFlow()

  const pendingNode = pendingSourceId ? getNode(pendingSourceId) : null
  const pendingData = pendingNode?.data as PLCNodeData | undefined

  return (
    <>
      {/* Page boundary rendered below nodes (z-index:1) */}
      <PageBoundaryOverlay />

      <GuideLinesOverlay pendingSourceId={connectMode ? pendingSourceId : null} />
      <AlignmentToolbar />

      {/* Top-right controls: C&E toggle + Page size */}
      <Panel position="top-right">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {onToggleConditions && (
            <button
              onClick={onToggleConditions}
              title={showConditions ? 'Hide conditions panel' : 'Show conditions panel'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow text-xs font-medium transition-all border ${
                showConditions
                  ? 'bg-red-600 text-white border-red-700 hover:bg-red-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-red-400 hover:text-red-600'
              }`}
            >
              <ShieldAlert size={13} />
              {showConditions ? <PanelBottomClose size={13} /> : <PanelBottomOpen size={13} />}
              Conditions
            </button>
          )}
          {onToggleMatrix && (
            <button
              onClick={onToggleMatrix}
              title={showMatrix ? 'Hide Cause & Effect matrix' : 'Show Cause & Effect matrix'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow text-xs font-medium transition-all border ${
                showMatrix
                  ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'
              }`}
            >
              <Grid3x3 size={13} />
              {showMatrix ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
              C&amp;E
            </button>
          )}
          <PageSizeControl readOnly={readOnly} />
        </div>
      </Panel>

      {/* Connect mode status badge */}
      {connectMode && (
        <Panel position="top-left" className="pointer-events-none">
          <div className="bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5">
            <Link2 size={12} />
            {pendingSourceId
              ? `From "${pendingData?.label ?? '?'}" → click target node`
              : 'Click a source node…'}
            <span className="opacity-70 ml-1 font-normal">ESC to cancel</span>
          </div>
        </Panel>
      )}

      <Panel position="bottom-right" className="text-xs text-gray-400 mr-2 mb-1 pointer-events-none">
        {/* node count injected from outer component via data attr */}
      </Panel>
    </>
  )
}

export function FlowchartCanvas({ readOnly = false, showMatrix, onToggleMatrix, showConditions, onToggleConditions }: FlowchartCanvasProps) {
  const flowNodes = useDiagramStore(selectFlowNodes)
  const flowEdges = useDiagramStore(selectFlowEdges)
  const {
    onFlowNodesChange, onFlowEdgesChange, onFlowConnect,
    setFlowNodes, setFlowEdges,
    setSelectedNode, setSelectedEdge,
    setLastTouchedNodeId,
    pushHistory
  } = useDiagramStore()

  const wrapperRef = useRef<HTMLDivElement>(null)
  const rfRef = useRef<ReactFlowInstance | null>(null)

  // ── Cross-diagram navigation ──────────────────────────────────────────────
  const pendingFocusNodeId = useDiagramStore((s) => s.pendingFocusNodeId)
  const setPendingFocusNodeId = useDiagramStore((s) => s.setPendingFocusNodeId)

  useEffect(() => {
    if (!pendingFocusNodeId || !rfRef.current) return
    // Delay slightly to allow React Flow to finish laying out the new tab's nodes
    const timer = setTimeout(() => {
      if (!rfRef.current) return
      rfRef.current.fitView({ nodes: [{ id: pendingFocusNodeId }], padding: 0.6, duration: 500 })
      setSelectedNode(pendingFocusNodeId)
      setPendingFocusNodeId(null)
    }, 150)
    return () => clearTimeout(timer)
  }, [pendingFocusNodeId, setPendingFocusNodeId, setSelectedNode])

  // ── Menu-driven actions (Delete Selected, Fit to Screen, Select All) ─────
  useEffect(() => {
    const removers = [
      window.api.onMenu('menu-fit', () => {
        rfRef.current?.fitView({ padding: 0.12, duration: 300 })
      }),
      window.api.onMenu('menu-select-all', () => {
        if (readOnly || !rfRef.current) return
        const allNodes = rfRef.current.getNodes().map((n) => ({ ...n, selected: true }))
        const allEdges = rfRef.current.getEdges().map((e) => ({ ...e, selected: true }))
        rfRef.current.setNodes(allNodes)
        rfRef.current.setEdges(allEdges)
      }),
      window.api.onMenu('menu-delete', () => {
        if (readOnly || !rfRef.current) return
        const s = useDiagramStore.getState()
        const nodes = rfRef.current.getNodes()
        const edges = rfRef.current.getEdges()
        const protectedTypes = ['start', 'end']
        const survivingNodes = nodes.filter((n) => !n.selected || protectedTypes.includes(n.type ?? ''))
        const deletedIds = new Set(nodes.filter((n) => n.selected && !protectedTypes.includes(n.type ?? '')).map((n) => n.id))
        const survivingEdges = edges.filter((e) => !e.selected && !deletedIds.has(e.source) && !deletedIds.has(e.target))
        s.setFlowNodes(survivingNodes as PLCNode[])
        s.setFlowEdges(survivingEdges as PLCEdge[])
        s.pushHistory()
      })
    ]
    return () => removers.forEach((r) => r())
  }, [readOnly])

  // ── Connect tool state ────────────────────────────────────────────────────
  const [connectMode, setConnectMode] = useState(false)
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null)

  // lastTouchedNodeId now lives in the store (shared with Sidebar click-to-add)

  // ── Keyboard: ESC cancels connect mode ────────────────────────────────────
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setPendingSourceId(null)
      setConnectMode(false)
    }
  }, [])

  // ── Node click ────────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((clickedId: string) => {
    setLastTouchedNodeId(clickedId)

    if (!connectMode) {
      setSelectedNode(clickedId)
      return
    }

    if (!pendingSourceId) {
      // First click: set source
      setPendingSourceId(clickedId)
    } else if (pendingSourceId !== clickedId) {
      // Second click: create edge
      const newEdge: PLCEdge = {
        id: uid('edge'),
        source: pendingSourceId,
        target: clickedId,
        type: 'editable'
      }
      setFlowEdges([...flowEdges, newEdge])
      pushHistory()
      setPendingSourceId(null)
      // Stay in connect mode so user can chain connections
    }
  }, [connectMode, pendingSourceId, flowEdges, setFlowEdges, setSelectedNode, pushHistory])

  const onEdgeClick = useCallback((_: unknown, edge: { id: string }) => {
    setSelectedEdge(edge.id)
  }, [setSelectedEdge])

  const onPaneClick = useCallback(() => {
    if (connectMode) {
      setPendingSourceId(null) // cancel pending source on pane click
      return
    }
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [connectMode, setSelectedNode, setSelectedEdge])

  const onNodesDelete = useCallback(() => pushHistory(), [pushHistory])
  const onEdgesDelete = useCallback(() => pushHistory(), [pushHistory])

  // ── Magnetic centre-snap during drag ──────────────────────────────────────
  // Snap threshold in canvas units. The visual guide lines (GuideLinesOverlay)
  // already show at 8px; we snap a little later so the guide appears first.
  const SNAP_THRESHOLD = 12

  const onNodeDrag = useCallback((_e: MouseEvent, node: PLCNode) => {
    if (!rfRef.current) return
    const all = rfRef.current.getNodes()
    const others = all.filter((n) => !n.dragging)
    const nw = node.measured?.width ?? 120
    const nCX = node.position.x + nw / 2

    let snapX: number | null = null
    for (const other of others) {
      const ow = other.measured?.width ?? 120
      const oCX = other.position.x + ow / 2
      if (Math.abs(nCX - oCX) < SNAP_THRESHOLD) {
        snapX = oCX - nw / 2
        break
      }
    }

    if (snapX !== null && Math.abs(snapX - node.position.x) > 0.5) {
      rfRef.current.setNodes(
        all.map((n) =>
          n.id === node.id ? { ...n, position: { x: snapX!, y: node.position.y } } : n
        )
      )
    }
  }, [])

  const onNodeDragStop = useCallback((_e: MouseEvent, _node: PLCNode) => {
    if (!rfRef.current) return
    // Sync snapped positions back to the store and record undo point
    setFlowNodes(rfRef.current.getNodes() as PLCNode[])
    pushHistory()
  }, [setFlowNodes, pushHistory])

  // ── One-click tidy layout ─────────────────────────────────────────────────
  // Aligns every node's centre-X to the Start node's centre-X and evenly
  // redistributes vertical spacing, preserving existing top-to-bottom order.
  const handleTidyLayout = useCallback(() => {
    if (!rfRef.current) return
    const all = rfRef.current.getNodes() as PLCNode[]
    if (all.length === 0) return

    // Reference centre-X: use Start node, falling back to leftmost node
    const startNode = all.find((n) => n.type === 'start') ?? all[0]
    const refW = startNode.measured?.width ?? 120
    const refCX = startNode.position.x + refW / 2

    // Sort by current Y to preserve reading order, then redistribute spacing
    const sorted = [...all].sort((a, b) => a.position.y - b.position.y)
    const V_GAP = 80
    let curY = sorted[0].position.y

    const yMap = new Map<string, number>()
    for (const n of sorted) {
      yMap.set(n.id, curY)
      curY += (n.measured?.height ?? 60) + V_GAP
    }

    const updated = all.map((n) => {
      const nw = n.measured?.width ?? 120
      return { ...n, position: { x: refCX - nw / 2, y: yMap.get(n.id) ?? n.position.y } }
    }) as PLCNode[]

    rfRef.current.setNodes(updated)
    setFlowNodes(updated)
    pushHistory()
  }, [setFlowNodes, pushHistory])

  // ── Optimise layout (force-directed with fixed layers) ────────────────────
  // Layer assignment fixes Y positions (preserving top-to-bottom flow).
  // A force simulation then adjusts X positions so that:
  //   • same-layer nodes repel (no overlap)
  //   • connected nodes attract (short edges)
  //   • long edges push intermediate nodes aside (unique corridors)
  const handleOptimizeLayout = useCallback(() => {
    if (!rfRef.current) return
    const all = rfRef.current.getNodes() as PLCNode[]
    if (all.length === 0) return

    const nodeMap = new Map(all.map((n) => [n.id, n]))
    const allIds = new Set(all.map((n) => n.id))
    const idList = [...allIds]

    // ── 1. Build adjacency & detect back-edges via DFS ──────────────────
    const tmpAdj = new Map<string, { target: string; edgeId: string }[]>()
    for (const id of allIds) tmpAdj.set(id, [])
    for (const e of flowEdges) {
      if (allIds.has(e.source) && allIds.has(e.target))
        tmpAdj.get(e.source)!.push({ target: e.target, edgeId: e.id })
    }

    const dfsVisited = new Set<string>()
    const inStack = new Set<string>()
    const backEdges = new Set<string>()
    function dfs(u: string) {
      dfsVisited.add(u); inStack.add(u)
      for (const { target, edgeId } of tmpAdj.get(u) ?? []) {
        if (inStack.has(target)) { backEdges.add(edgeId); continue }
        if (!dfsVisited.has(target)) dfs(target)
      }
      inStack.delete(u)
    }
    const startNode = all.find((n) => n.type === 'start')
    if (startNode) dfs(startNode.id)
    for (const id of allIds) { if (!dfsVisited.has(id)) dfs(id) }

    const fwdParents = new Map<string, string[]>()
    for (const id of allIds) fwdParents.set(id, [])
    const fwdEdgeList: { source: string; target: string }[] = []
    for (const e of flowEdges) {
      if (backEdges.has(e.id)) continue
      if (!allIds.has(e.source) || !allIds.has(e.target)) continue
      fwdEdgeList.push({ source: e.source, target: e.target })
      fwdParents.get(e.target)!.push(e.source)
    }

    // ── 2. Layer assignment (longest-path from roots) ────────────────────
    const layer = new Map<string, number>()
    const roots = idList.filter((id) => fwdParents.get(id)!.length === 0)
    if (roots.length === 0) roots.push(all[0].id)
    if (startNode && !roots.includes(startNode.id)) roots.unshift(startNode.id)

    function assignLayer(id: string): number {
      if (layer.has(id)) return layer.get(id)!
      const pLayers = fwdParents.get(id)!.map((p) => assignLayer(p))
      const l = pLayers.length > 0 ? Math.max(...pLayers) + 1 : 0
      layer.set(id, l)
      return l
    }
    for (const r of roots) layer.set(r, 0)
    const topoQ = [...roots]; const topoSeen = new Set(roots)
    while (topoQ.length > 0) {
      const u = topoQ.shift()!; assignLayer(u)
      for (const { target, edgeId } of tmpAdj.get(u) ?? []) {
        if (!backEdges.has(edgeId) && !topoSeen.has(target) && allIds.has(target)) {
          topoSeen.add(target); topoQ.push(target)
        }
      }
    }
    for (const id of allIds) { if (!layer.has(id)) assignLayer(id) }

    const endNode = all.find((n) => n.type === 'end')
    if (endNode) {
      let deepest = 0
      for (const [id, l] of layer) { if (id !== endNode.id && l > deepest) deepest = l }
      layer.set(endNode.id, deepest + 1)
    }

    const maxLayer = Math.max(...[...layer.values()])

    // Group nodes by layer
    const layerNodes = new Map<number, string[]>()
    for (let l = 0; l <= maxLayer; l++) layerNodes.set(l, [])
    for (const [id, l] of layer) layerNodes.get(l)!.push(id)

    // ── 3. Initial X placement — spread same-layer nodes ─────────────────
    const NODE_W = 180
    const MIN_SEP = NODE_W + 60
    const x = new Map<string, number>()
    for (const [, nodes] of layerNodes) {
      nodes.forEach((id, i) => {
        x.set(id, (i - (nodes.length - 1) / 2) * MIN_SEP)
      })
    }

    // Collect forward edges annotated with layer span
    const longEdges = fwdEdgeList
      .map((e) => ({ ...e, srcL: layer.get(e.source)!, tgtL: layer.get(e.target)! }))
      .filter((e) => e.tgtL - e.srcL > 1)

    // ── 4. Force-directed simulation (X only, Y fixed by layers) ─────────
    const ITERS = 200
    const vx = new Map<string, number>()
    for (const id of allIds) vx.set(id, 0)

    for (let iter = 0; iter < ITERS; iter++) {
      const temp = 1 - iter / ITERS // annealing: cools from 1 → 0
      const fx = new Map<string, number>()
      for (const id of allIds) fx.set(id, 0)

      // Force A: same-layer repulsion — nodes push apart
      for (const [, nodes] of layerNodes) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j]
            let dx = x.get(b)! - x.get(a)!
            if (dx === 0) dx = 0.1
            const absDx = Math.abs(dx)
            if (absDx < MIN_SEP * 4) {
              const f = (MIN_SEP * MIN_SEP) / (dx + Math.sign(dx) * 0.01)
              fx.set(a, fx.get(a)! - f)
              fx.set(b, fx.get(b)! + f)
            }
          }
        }
      }

      // Force B: edge attraction — connected nodes pull toward each other
      for (const e of fwdEdgeList) {
        const dx = x.get(e.target)! - x.get(e.source)!
        const layerSpan = Math.abs((layer.get(e.target) ?? 0) - (layer.get(e.source) ?? 0))
        const strength = 0.15 / Math.max(layerSpan, 1)
        fx.set(e.source, fx.get(e.source)! + dx * strength)
        fx.set(e.target, fx.get(e.target)! - dx * strength)
      }

      // Force C: long-edge corridor — push intermediate-layer nodes away
      // from the interpolated path of edges that span multiple layers.
      for (const e of longEdges) {
        const xs = x.get(e.source)!, xt = x.get(e.target)!
        for (let l = e.srcL + 1; l < e.tgtL; l++) {
          const t = (l - e.srcL) / (e.tgtL - e.srcL)
          const edgeXAt = xs + t * (xt - xs)
          for (const nid of layerNodes.get(l)!) {
            if (nid === e.source || nid === e.target) continue
            const nx = x.get(nid)!
            const dist = nx - edgeXAt
            const absDist = Math.abs(dist)
            if (absDist < MIN_SEP * 1.5) {
              const sign = dist >= 0 ? 1 : -1
              const push = sign * MIN_SEP * 3 / (absDist + 10)
              fx.set(nid, fx.get(nid)! + push)
            }
          }
        }
      }

      // Force D: centering gravity (very weak — keeps layout compact)
      const avgX = idList.reduce((s, id) => s + x.get(id)!, 0) / idList.length
      for (const id of allIds) {
        fx.set(id, fx.get(id)! - (x.get(id)! - avgX) * 0.005)
      }

      // Integrate with velocity damping and simulated annealing
      const damping = 0.7
      const maxStep = MIN_SEP * 0.4 * temp + 2
      for (const id of allIds) {
        let v = vx.get(id)! * damping + fx.get(id)! * 0.05
        v = Math.max(-maxStep, Math.min(maxStep, v))
        vx.set(id, v)
        x.set(id, x.get(id)! + v)
      }
    }

    // ── 5. Enforce minimum separation within each layer ──────────────────
    for (const [, nodes] of layerNodes) {
      const sorted = [...nodes].sort((a, b) => x.get(a)! - x.get(b)!)
      for (let i = 1; i < sorted.length; i++) {
        const gap = x.get(sorted[i])! - x.get(sorted[i - 1])!
        if (gap < MIN_SEP) {
          x.set(sorted[i], x.get(sorted[i - 1])! + MIN_SEP)
        }
      }
    }

    // ── 6. Assign Y positions per layer ──────────────────────────────────
    const V_GAP = 120
    const START_Y = 40
    const layerY = new Map<number, number>()
    let cy = START_Y
    for (let l = 0; l <= maxLayer; l++) {
      layerY.set(l, cy)
      const nodes = layerNodes.get(l)!
      const maxH = nodes.length > 0
        ? Math.max(...nodes.map((id) => nodeMap.get(id)?.measured?.height ?? 60))
        : 60
      cy += maxH + V_GAP
    }

    // ── 7. Apply positions ───────────────────────────────────────────────
    const updated = all.map((n) => ({
      ...n,
      position: {
        x: x.get(n.id) ?? n.position.x,
        y: layerY.get(layer.get(n.id) ?? 0) ?? n.position.y
      }
    })) as PLCNode[]

    rfRef.current.setNodes(updated)
    setFlowNodes(updated)
    pushHistory()
    setTimeout(() => rfRef.current?.fitView({ padding: 0.12, duration: 300 }), 50)
  }, [flowEdges, setFlowNodes, pushHistory])

  // ── Drag-and-drop from palette ────────────────────────────────────────────
  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    const nodeType = e.dataTransfer.getData('application/plc-node-type') as PLCNodeType
    const label = e.dataTransfer.getData('application/plc-node-label')
    if (!nodeType || !rfRef.current) return

    // Convert screen coords → canvas coords (accounts for zoom and pan)
    const canvasPos = rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    // Centre the node on the cursor (typical node ≈ 152 × 60 px)
    const position = { x: canvasPos.x - 76, y: canvasPos.y - 30 }

    const newNodeId = uid('node')
    const newNode: PLCNode = { id: newNodeId, type: nodeType, position, data: { label } as PLCNodeData }

    // ── Check if dropped onto an existing edge → split it ──────────────────
    const hitEdge = findEdgeAtPoint(canvasPos, rfRef.current.getNodes(), flowEdges)

    const nextNodes = [...flowNodes, newNode]
    let nextEdges: PLCEdge[]

    if (hitEdge) {
      nextEdges = [
        ...flowEdges.filter((ed) => ed.id !== hitEdge.id),
        { id: uid('edge'), source: hitEdge.source, target: newNodeId, type: 'editable' } as PLCEdge,
        { id: uid('edge'), source: newNodeId,       target: hitEdge.target, type: 'editable' } as PLCEdge
      ]
    } else {
      nextEdges = flowEdges
    }

    setFlowNodes(nextNodes)
    setFlowEdges(nextEdges)
    setLastTouchedNodeId(newNodeId)
    setSelectedNode(newNodeId)
    pushHistory()
  }, [flowNodes, flowEdges, setFlowNodes, setFlowEdges, setLastTouchedNodeId, setSelectedNode, pushHistory])

  // Reactively style edges: backward-flow edges get routed to the right side,
  // dashed animation, and smoothstep routing. All edges get arrow markers.
  const arrow = { type: MarkerType.ArrowClosed, width: 16, height: 16 }
  const styledEdges = flowEdges.map((e) => {
    const data = e.data as PLCEdgeData | undefined
    const conditionStr =
      (data?.condition != null && String(data.condition).trim()) ||
      (typeof e.label === 'string' && e.label.trim()) ||
      (data?.label != null && String(data.label).trim()) ||
      ''
    const labelPatch = conditionStr ? { label: conditionStr } : {}

    const srcNode = flowNodes.find((n) => n.id === e.source)
    const tgtNode = flowNodes.find((n) => n.id === e.target)

    const hasCustomHandles =
      (e.sourceHandle && e.sourceHandle !== 'right-source') ||
      (e.targetHandle && e.targetHandle !== 'right-target')

    if (!srcNode || !tgtNode || hasCustomHandles) {
      return { ...e, ...labelPatch, type: e.type || 'editable', markerEnd: arrow }
    }

    const isBackward = srcNode.position.y > tgtNode.position.y + 10

    if (isBackward) {
      return {
        ...e,
        ...labelPatch,
        type: 'smoothstep' as const,
        sourceHandle: 'right-source',
        targetHandle: 'right-target',
        animated: true,
        style: { strokeDasharray: '6 3' },
        markerEnd: arrow
      }
    }

    return {
      ...e,
      ...labelPatch,
      type: 'editable' as const,
      sourceHandle: undefined,
      targetHandle: undefined,
      animated: false,
      style: undefined,
      markerEnd: arrow
    }
  })

  const toggleConnectMode = useCallback(() => {
    setConnectMode((prev) => {
      if (prev) setPendingSourceId(null)
      return !prev
    })
  }, [])

  return (
    <div
      ref={wrapperRef}
      className={`w-full h-full ${connectMode ? 'connect-mode' : ''}`}
      onDragOver={readOnly ? undefined : onDragOver}
      onDrop={readOnly ? undefined : onDrop}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* Locked revision overlay */}
      {readOnly && (
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 py-2 bg-amber-500/90 text-white text-xs font-semibold pointer-events-none select-none">
          <Lock size={12} />
          Read-only — viewing a historical revision
        </div>
      )}

      <ReactFlow
        onInit={(instance) => { rfRef.current = instance }}
        nodes={flowNodes}
        edges={styledEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={readOnly ? undefined : onFlowNodesChange}
        onEdgesChange={readOnly ? undefined : onFlowEdgesChange}
        onConnect={readOnly ? undefined : onFlowConnect}
        onNodeClick={readOnly ? undefined : (_e, node) => handleNodeClick(node.id)}
        onEdgeClick={readOnly ? undefined : onEdgeClick}
        onPaneClick={readOnly ? undefined : onPaneClick}
        onNodesDelete={readOnly ? undefined : onNodesDelete}
        onEdgesDelete={readOnly ? undefined : onEdgesDelete}
        onNodeDrag={readOnly ? undefined : onNodeDrag}
        onNodeDragStop={readOnly ? undefined : onNodeDragStop}
        // ── Interaction model ─────────────────────────────────────────────
        // Left-drag on empty canvas  → rubber-band multi-select
        // Right-drag / right-hold    → pan
        // Scroll wheel               → pan (free direction)
        // Ctrl + scroll              → zoom
        selectionOnDrag={!connectMode && !readOnly}
        selectionMode={SelectionMode.Partial}
        panOnDrag={connectMode ? false : [2]}   // right mouse button pans
        panOnScroll                              // scroll wheel pans
        panOnScrollMode="free"                  // any scroll direction pans
        zoomOnScroll={false}                    // scroll no longer zooms (use Ctrl+scroll or controls)
        zoomActivationKeyCode="Control"         // Ctrl+scroll to zoom
        deleteKeyCode={(connectMode || readOnly) ? null : 'Delete'}
        fitView
        snapToGrid={!readOnly}
        snapGrid={[16, 16]}
        edgeTypes={EDGE_TYPES}
        defaultEdgeOptions={{ type: 'editable', animated: false }}
        edgesReconnectable={!readOnly}
        nodesDraggable={!connectMode && !readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#cbd5e1" />
        <Controls />
        {/* Bottom-left tools: Connect + Tidy Layout */}
        {!readOnly && (
          <Panel position="bottom-left">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleConnectMode}
                title={connectMode ? 'Exit Connect Mode (ESC)' : 'Connect Tool — click two nodes to draw an edge'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow text-xs font-medium transition-all border ${
                  connectMode
                    ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-amber-400 hover:text-amber-600'
                }`}
              >
                {connectMode ? <Link2Off size={13} /> : <Link2 size={13} />}
                {connectMode ? 'Exit Connect' : 'Connect'}
              </button>

              <button
                onClick={handleTidyLayout}
                title="Tidy Layout — centre all nodes and even out vertical spacing"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow text-xs font-medium transition-all border bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600"
              >
                <LayoutList size={13} />
                Tidy
              </button>

              <button
                onClick={handleOptimizeLayout}
                title="Optimise Layout — spread nodes across layers to minimise line crossings"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow text-xs font-medium transition-all border bg-white text-gray-600 border-gray-200 hover:border-emerald-400 hover:text-emerald-600"
              >
                <Sparkles size={13} />
                Optimise
              </button>
            </div>
          </Panel>
        )}

        {/* Node / edge count */}
        <Panel position="bottom-right" className="text-xs text-gray-400 mr-2 mb-1 pointer-events-none">
          {flowNodes.length} nodes · {flowEdges.length} edges
        </Panel>

        <CanvasInner
          connectMode={connectMode}
          pendingSourceId={pendingSourceId}
          readOnly={readOnly}
          showMatrix={showMatrix}
          onToggleMatrix={onToggleMatrix}
          showConditions={showConditions}
          onToggleConditions={onToggleConditions}
        />
      </ReactFlow>
    </div>
  )
}
