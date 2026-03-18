import type { NodeProps } from '@xyflow/react'
import type { PLCNodeData } from '../../types'
import { BaseNode } from './BaseNode'

const ACTOR_COLORS: Record<string, string> = {
  plc: '#2563EB',
  hmi: '#0891B2',
  device: '#D97706',
  operator: '#059669',
  system: '#7C3AED'
}

export function ActorNode({ data, selected }: NodeProps<{ data: PLCNodeData }>) {
  const d = data as PLCNodeData
  const type = d.actorType ?? 'system'
  return (
    <BaseNode
      color={d.color ?? ACTOR_COLORS[type] ?? '#6B7280'}
      typeLabel={`Actor · ${type}`}
      selected={selected}
      label={d.label || 'Actor'}
      sublabel={d.description}
      leftHandles
    />
  )
}
