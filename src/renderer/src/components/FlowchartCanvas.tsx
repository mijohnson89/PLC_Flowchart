import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  BackgroundVariant, SelectionMode, Panel,
  useReactFlow
} from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react'
import { toPng, toSvg } from 'html-to-image'
import { Link2, Link2Off, Lock, LayoutList } from 'lucide-react'
import '@xyflow/react/dist/style.css'

import { useDiagramStore, selectFlowNodes, selectFlowEdges } from '../store/diagramStore'
import type { PLCNodeData, PLCNodeType, PLCNode, PLCEdge } from '../types'
import { pageDimensions } from '../types'
import { AlignmentToolbar } from './AlignmentToolbar'
import { GuideLinesOverlay } from './GuideLinesOverlay'
import { PageBoundaryOverlay } from './PageBoundaryOverlay'
import { PageSizeControl } from './PageSizeControl'
import { EditableEdge } from './edges/EditableEdge'
import { StepNode } from './nodes/StepNode'
import { DecisionNode } from './nodes/DecisionNode'
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
  decision: DecisionNode, process: ProcessNode, output: OutputNode,
  actor: ActorNode, transition: TransitionNode, note: NoteNode
}

const EDGE_TYPES = {
  editable: EditableEdge
}

let idCounter = 1
function uid() { return `node_${Date.now()}_${idCounter++}` }


export interface CanvasExportRef {
  exportPng: () => Promise<void>
  exportSvg: () => Promise<void>
  exportPdf: () => Promise<void>
}

interface FlowchartCanvasProps {
  exportRef?: React.MutableRefObject<CanvasExportRef | null>
  readOnly?: boolean
}

// Inner component — has access to useReactFlow (must be inside ReactFlow provider)
function CanvasInner({
  connectMode,
  pendingSourceId,
  readOnly
}: {
  connectMode: boolean
  pendingSourceId: string | null
  readOnly: boolean
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

      {/* Page size picker — top-right corner */}
      <PageSizeControl readOnly={readOnly} />

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

export function FlowchartCanvas({ exportRef, readOnly = false }: FlowchartCanvasProps) {
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
        id: uid(),
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

    const newNodeId = uid()
    const newNode: PLCNode = { id: newNodeId, type: nodeType, position, data: { label } as PLCNodeData }

    // ── Check if dropped onto an existing edge → split it ──────────────────
    const hitEdge = findEdgeAtPoint(canvasPos, rfRef.current.getNodes(), flowEdges)

    const nextNodes = [...flowNodes, newNode]
    let nextEdges: PLCEdge[]

    if (hitEdge) {
      // Replace the hit edge with two edges through the new node
      nextEdges = [
        ...flowEdges.filter((ed) => ed.id !== hitEdge.id),
        { id: uid(), source: hitEdge.source, target: newNodeId, type: 'editable' } as PLCEdge,
        { id: uid(), source: newNodeId,       target: hitEdge.target, type: 'editable' } as PLCEdge
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

  // ── Export ────────────────────────────────────────────────────────────────
  const exportPng = useCallback(async () => {
    const el = wrapperRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!el) return
    const filePath = await window.api.exportImage('png')
    if (!filePath) return
    const dataUrl = await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2 })
    const base64 = dataUrl.split(',')[1]
    await window.api.writeFile(filePath, base64, 'base64')
  }, [])

  const exportSvg = useCallback(async () => {
    const el = wrapperRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!el) return
    const filePath = await window.api.exportImage('svg')
    if (!filePath) return
    const svgData = await toSvg(el, { backgroundColor: '#ffffff' })
    const encoded = svgData.split(',').slice(1).join(',')
    const svgContent = decodeURIComponent(encoded)
    await window.api.writeFile(filePath, svgContent)
  }, [])

  const exportPdf = useCallback(async () => {
    const rf = rfRef.current
    const rendererEl = wrapperRef.current?.querySelector('.react-flow__renderer') as HTMLElement | null
    if (!rf || !rendererEl) return

    // Resolve page settings from store (read outside React render cycle)
    const storeState = useDiagramStore.getState()
    const activeTab  = storeState.tabs.find((t) => t.id === storeState.activeTabId)
    const ps         = activeTab?.pageSize ?? null
    const po         = activeTab?.pageOrientation ?? 'portrait'

    if (!ps) {
      alert('Please set a page size first using the Page button in the canvas toolbar.')
      return
    }

    const filePath = await window.api.exportImage('pdf')
    if (!filePath) return

    const { w: pageW, h: pageH } = pageDimensions(ps, po)

    // ── 1. Save current viewport, then fit exactly to the page rect ──────────
    const savedViewport = rf.getViewport()
    rf.fitBounds({ x: 0, y: 0, width: pageW, height: pageH }, { padding: 0, duration: 0 })

    // Wait two animation frames for the DOM to settle after the viewport change
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    // ── 2. Read the actual viewport after fitBounds ───────────────────────────
    const { x: tx, y: ty, zoom } = rf.getViewport()

    // ── 3. Capture the full renderer area, excluding the page-boundary overlay ─
    const PIXEL_RATIO = 3
    const fullDataUrl = await toPng(rendererEl, {
      backgroundColor: '#ffffff',
      pixelRatio: PIXEL_RATIO,
      filter: (node) => (node as HTMLElement).dataset?.exportSkip !== 'true'
    })

    // ── 4. Restore the viewport ───────────────────────────────────────────────
    rf.setViewport(savedViewport, { duration: 0 })

    // ── 5. Crop the captured image to just the page area ─────────────────────
    // After fitBounds, canvas (0,0) is at screen (tx, ty).
    // Page occupies screen rect: (tx, ty, pageW*zoom, pageH*zoom)
    const img = new Image()
    await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = fullDataUrl })

    const cropX = Math.round(tx * PIXEL_RATIO)
    const cropY = Math.round(ty * PIXEL_RATIO)
    const cropW = Math.min(Math.round(pageW * zoom * PIXEL_RATIO), img.width  - cropX)
    const cropH = Math.min(Math.round(pageH * zoom * PIXEL_RATIO), img.height - cropY)

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width  = cropW
    cropCanvas.height = cropH
    const ctx = cropCanvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cropW, cropH)
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

    const croppedDataUrl = cropCanvas.toDataURL('image/png')

    // ── 6. Build and save PDF ─────────────────────────────────────────────────
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({
      orientation: po === 'portrait' ? 'p' : 'l',
      unit: 'mm',
      format: ps.toLowerCase() as 'a4' | 'a3' | 'a2' | 'a1' | 'a0'
    })
    const pdfW = doc.internal.pageSize.getWidth()
    const pdfH = doc.internal.pageSize.getHeight()
    doc.addImage(croppedDataUrl, 'PNG', 0, 0, pdfW, pdfH)

    const pdfDataUri = doc.output('datauristring')
    const base64     = pdfDataUri.split(',')[1]
    await window.api.writeFile(filePath, base64, 'base64')
  }, [])

  if (exportRef) exportRef.current = { exportPng, exportSvg, exportPdf }

  // Ensure all edges use the editable type (handles any edges loaded from older saves)
  const styledEdges = flowEdges.map((e) => ({ ...e, type: 'editable' }))

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
        <MiniMap
          nodeColor={(node) => {
            const colorMap: Record<string, string> = {
              start: '#059669', end: '#DC2626', step: '#10B981',
              decision: '#CA8A04', process: '#0891B2', output: '#7C3AED',
              actor: '#2563EB', transition: '#D97706', note: '#EAB308'
            }
            return colorMap[node.type ?? ''] ?? '#94a3b8'
          }}
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
        />

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
        />
      </ReactFlow>
    </div>
  )
}
