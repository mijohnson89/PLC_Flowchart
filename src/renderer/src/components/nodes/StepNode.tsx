import type { NodeProps } from '@xyflow/react'
import type { PLCNodeData } from '../../types'
import { PACKML_STATES } from '../../types'
import { BaseNode } from './BaseNode'
import type { StateTag } from './BaseNode'

export function StepNode({ data, selected }: NodeProps<{ data: PLCNodeData }>) {
  const d = data as PLCNodeData

  const stateTag: StateTag | undefined = d.packMLState
    ? { ...PACKML_STATES[d.packMLState], label: PACKML_STATES[d.packMLState].label }
    : undefined

  return (
    <BaseNode
      color={d.color ?? '#10B981'}
      typeLabel="Step"
      selected={selected}
      label={d.label || 'Step'}
      sublabel={d.description}
      badge={d.stepNumber !== undefined ? `S${d.stepNumber}` : undefined}
      stateTag={stateTag}
      linkedTabId={d.linkedTabId}
      linkedNodeId={d.linkedNodeId}
      stepLinks={d.stepLinks}
    />
  )
}
