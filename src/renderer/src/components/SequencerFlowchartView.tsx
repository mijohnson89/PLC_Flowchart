import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  type Node,
  type Edge,
  type NodeChange
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  useDiagramStore,
  selectFlowNodes,
  selectFlowEdges,
  selectActiveTab,
  selectIsViewingRevision
} from '../store/diagramStore'
import {
  buildSequencerFlowGraph,
  applySequencerPositions,
  SEQUENCER_OVERVIEW_SNAP_GRID
} from '../utils/sequencerFlowGraph'
import type { FlowPhase, PLCNode, PLCEdge } from '../types'
import { SequencerStartNode } from './sequencer/SequencerStartNode'
import { SequencerActionNode } from './sequencer/SequencerActionNode'
import { SequencerJumpStubNode } from './sequencer/SequencerJumpStubNode'

const NODE_TYPES = {
  sequencerStart: SequencerStartNode,
  sequencerAction: SequencerActionNode,
  sequencerJump: SequencerJumpStubNode
}

function FitOnTabChange({ tabId, layoutTick }: { tabId: string; layoutTick: number }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.12, duration: 180 })
    })
    return () => cancelAnimationFrame(id)
  }, [tabId, layoutTick, fitView])
  return null
}

/** When set, shows this diagram instead of the store (e.g. revision compare pane). */
export interface SequencerFlowchartDiagramOverride {
  flowNodes: PLCNode[]
  flowEdges: PLCEdge[]
  phases: FlowPhase[]
  sequencerViewPositions?: Record<string, { x: number; y: number }>
}

export interface SequencerFlowchartViewProps {
  readOnly?: boolean
  diagramOverride?: SequencerFlowchartDiagramOverride
  /** For fit-view when the canvas is not tied to the active tab (e.g. compare pane + revision id). */
  fitViewKey?: string
}

export function SequencerFlowchartView({
  readOnly = false,
  diagramOverride,
  fitViewKey
}: SequencerFlowchartViewProps) {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const activeTab = useDiagramStore(selectActiveTab)
  const storeFlowNodes = useDiagramStore(selectFlowNodes)
  const storeFlowEdges = useDiagramStore(selectFlowEdges)
  const flowNodes = diagramOverride?.flowNodes ?? storeFlowNodes
  const flowEdges = diagramOverride?.flowEdges ?? storeFlowEdges
  const isRevision = useDiagramStore(selectIsViewingRevision)
  const lockedOverview = isRevision || !!diagramOverride
  const setPendingFocusNodeId = useDiagramStore((s) => s.setPendingFocusNodeId)
  const updateSequencerOverviewPosition = useDiagramStore((s) => s.updateSequencerOverviewPosition)
  const clearSequencerOverviewPositions = useDiagramStore((s) => s.clearSequencerOverviewPositions)
  const pushHistory = useDiagramStore((s) => s.pushHistory)

  const sequencerViewPositions = diagramOverride
    ? diagramOverride.sequencerViewPositions
    : isRevision
      ? undefined
      : activeTab?.sequencerViewPositions

  const [overviewLayoutTick, setOverviewLayoutTick] = useState(0)

  const phases = diagramOverride?.phases ?? activeTab?.phases ?? []

  const { rfNodes, rfEdges, shouldClearSavedOverviewLayout } = useMemo(() => {
    const { nodes: n, edges: e } = buildSequencerFlowGraph(flowNodes, flowEdges, phases)
    const { nodes: positioned, shouldClearSavedOverviewLayout: shouldClear } = applySequencerPositions(
      n,
      flowNodes,
      sequencerViewPositions
    )
    const nodes: Node[] = positioned.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      // Jump stubs are positioned from layout math only — dragging breaks handle alignment with the spine.
      draggable: !readOnly && !lockedOverview && node.type !== 'sequencerJump'
    }))
    const edges: Edge[] = e.map((edge) => {
      const hasLabel = !!(edge.label && String(edge.label).trim())
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type ?? 'step',
        ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
        ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
        ...(hasLabel
          ? {
              label: edge.label,
              labelStyle: { fill: '#334155', fontSize: 10, fontWeight: 600 } as const,
              labelShowBg: true,
              labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
              labelBgPadding: [6, 4] as [number, number],
              labelBgBorderRadius: 4
            }
          : {}),
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#64748b' },
        style: {
          stroke: '#64748b',
          strokeWidth: 2,
          ...(edge.dotted ? { strokeDasharray: '6 4' } : {})
        }
      }
    })
    return { rfNodes: nodes, rfEdges: edges, shouldClearSavedOverviewLayout: shouldClear }
  }, [flowNodes, flowEdges, phases, sequencerViewPositions, readOnly, lockedOverview])

  const empty = rfNodes.length === 0

  useEffect(() => {
    if (!shouldClearSavedOverviewLayout || lockedOverview || readOnly) return
    clearSequencerOverviewPositions()
    setOverviewLayoutTick((t) => t + 1)
  }, [shouldClearSavedOverviewLayout, lockedOverview, readOnly, clearSequencerOverviewPositions])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  useEffect(() => {
    setNodes(rfNodes)
    setEdges(rfEdges)
  }, [rfNodes, rfEdges, setNodes, setEdges])

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const safe = changes.filter((c) => c.type !== 'remove' && c.type !== 'add' && c.type !== 'replace')
      onNodesChange(safe)
    },
    [onNodesChange]
  )

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (readOnly || lockedOverview) return
      updateSequencerOverviewPosition(node.id, { ...node.position })
    },
    [readOnly, lockedOverview, updateSequencerOverviewPosition]
  )

  const onTidyLayout = useCallback(() => {
    if (readOnly || lockedOverview || empty) return
    clearSequencerOverviewPositions()
    pushHistory()
    setOverviewLayoutTick((t) => t + 1)
  }, [readOnly, lockedOverview, empty, clearSequencerOverviewPositions, pushHistory])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'sequencerJump') {
        const tid = (node.data as { targetId?: string }).targetId
        if (tid) setPendingFocusNodeId(tid)
        return
      }
      const n = flowNodes.find((x) => x.id === node.id)
      if (n && (n.type === 'step' || n.type === 'start')) {
        setPendingFocusNodeId(node.id)
      }
    },
    [flowNodes, setPendingFocusNodeId]
  )

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      <div className="flex-shrink-0 px-2 py-1.5 border-b border-gray-200 bg-white/90">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Flow overview</span>
            <p className="text-[9px] text-gray-400 mt-0.5 leading-snug">
              Steps and jumps from the table. Drag to arrange. Edit in the matrix only.
            </p>
          </div>
          <button
            type="button"
            title="Reset layout: align steps in a column with Start"
            disabled={readOnly || lockedOverview || empty}
            onClick={onTidyLayout}
            className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
          >
            Tidy layout
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        {empty ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-xs px-4 text-center">
            No start/step nodes to show. Add steps in the matrix.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={onNodeClick}
            nodesDraggable={!readOnly && !lockedOverview}
            snapToGrid={!readOnly && !lockedOverview}
            snapGrid={[SEQUENCER_OVERVIEW_SNAP_GRID, SEQUENCER_OVERVIEW_SNAP_GRID]}
            nodesConnectable={false}
            edgesReconnectable={false}
            elementsSelectable
            deleteKeyCode={null}
            panOnScroll
            zoomOnScroll={false}
            zoomActivationKeyCode="Control"
            minZoom={0.25}
            maxZoom={1.5}
            fitView
            defaultEdgeOptions={{
              type: 'step',
              style: { stroke: '#64748b', strokeWidth: 2 }
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={SEQUENCER_OVERVIEW_SNAP_GRID} size={1} color="#cbd5e1" />
            <Controls position="bottom-right" showInteractive={false} />
            <FitOnTabChange tabId={fitViewKey ?? activeTabId} layoutTick={overviewLayoutTick} />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
