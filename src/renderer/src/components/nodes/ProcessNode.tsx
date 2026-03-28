import type { NodeProps } from '@xyflow/react'
import type { PLCNodeData } from '../../types'
import { BaseNode } from './BaseNode'

export function ProcessNode({ data, selected }: NodeProps<{ data: PLCNodeData }>) {
  const d = data as PLCNodeData
  return (
    <BaseNode
      color={d.color ?? '#0891B2'}
      typeLabel="Process"
      selected={selected}
      label={d.routineName || d.label || 'Process'}
      sublabel={d.description}
      linkedTabId={d.linkedTabId}
      linkedNodeId={d.linkedNodeId}
      stepLinks={d.stepLinks}
    />
  )
}
