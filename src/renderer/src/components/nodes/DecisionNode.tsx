import { useEffect } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Handle, Position, useStore, useUpdateNodeInternals } from '@xyflow/react'
import type { PLCNodeData } from '../../types'
import { BaseNode } from './BaseNode'

export function DecisionNode({ id, data, selected }: NodeProps<{ data: PLCNodeData }>) {
  const d = data as PLCNodeData
  const updateNodeInternals = useUpdateNodeInternals()

  // Reactively determine which side the NO handle sits on:
  // — if the node wired to the "no" output is to the LEFT  → handle on the left
  // — if it is to the RIGHT (or nothing connected yet)     → handle on the right
  const noPosition = useStore((s) => {
    const noEdge = s.edges.find((e) => e.source === id && e.sourceHandle === 'no')
    if (!noEdge) return Position.Right
    const targetNode = s.nodes.find((n) => n.id === noEdge.target)
    const selfNode   = s.nodes.find((n) => n.id === id)
    if (!targetNode || !selfNode) return Position.Right
    return targetNode.position.x < selfNode.position.x ? Position.Left : Position.Right
  })

  const noIsLeft = noPosition === Position.Left

  // When the handle side changes, tell React Flow to re-measure
  // the handle registry so the connected edge redraws from the new position.
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, noPosition, updateNodeInternals])

  return (
    <div className="relative">
      <BaseNode
        color={d.color ?? '#CA8A04'}
        typeLabel="Decision"
        selected={selected}
        label={d.label || 'Decision'}
        sublabel={d.condition}
        noSource
        noTarget
      />

      {/* In handle */}
      <Handle type="target" position={Position.Top} />

      {/* YES — always bottom */}
      <Handle type="source" position={Position.Bottom} id="yes">
        <span
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-bold pointer-events-none"
          style={{ color: '#059669' }}
        >
          YES
        </span>
      </Handle>

      {/* NO — left or right depending on connected node position */}
      <Handle type="source" position={noPosition} id="no">
        <span
          className={`absolute top-1/2 -translate-y-1/2 text-[9px] font-bold pointer-events-none ${
            noIsLeft ? '-left-6' : '-right-6'
          }`}
          style={{ color: '#DC2626' }}
        >
          NO
        </span>
      </Handle>
    </div>
  )
}
