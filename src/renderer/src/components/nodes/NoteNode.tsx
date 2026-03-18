import type { NodeProps } from '@xyflow/react'
import type { PLCNodeData } from '../../types'
import { BaseNode } from './BaseNode'

export function NoteNode({ data, selected }: NodeProps<{ data: PLCNodeData }>) {
  const d = data as PLCNodeData
  return (
    <BaseNode
      color={d.color ?? '#CA8A04'}
      typeLabel="Note"
      selected={selected}
      label={d.label || 'Note…'}
    />
  )
}
