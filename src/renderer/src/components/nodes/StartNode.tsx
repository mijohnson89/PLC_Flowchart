import type { NodeProps } from '@xyflow/react'
import type { PLCNodeData } from '../../types'
import { BaseNode } from './BaseNode'

export function StartNode({ data, selected }: NodeProps<{ data: PLCNodeData }>) {
  const d = data as PLCNodeData
  return (
    <BaseNode
      color={d.color ?? '#059669'}
      typeLabel="Start"
      selected={selected}
      label={d.label || 'Start'}
      sublabel={d.description}
      noTarget
      linkedTabId={d.linkedTabId}
      linkedNodeId={d.linkedNodeId}
    />
  )
}
