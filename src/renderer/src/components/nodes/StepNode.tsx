import type { NodeProps } from '@xyflow/react'
import type { PLCNodeData } from '../../types'
import { useDiagramStore } from '../../store/diagramStore'
import { getStepStateVisual } from '../../utils/stepStateVisual'
import { BaseNode } from './BaseNode'
import type { StateTag } from './BaseNode'

export function StepNode({ data, selected }: NodeProps<{ data: PLCNodeData }>) {
  const d = data as PLCNodeData
  const flowStates = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.flowStates ?? [])

  const stateTag: StateTag | undefined = d.packMLState
    ? (() => {
        const v = getStepStateVisual(d.packMLState, flowStates)
        return {
          label: v.label,
          category: v.category,
          bgColor: v.bgColor,
          textColor: v.textColor,
          borderColor: v.borderColor
        }
      })()
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
