import type { NodeProps } from '@xyflow/react'
import type { PLCNodeData } from '../../types'
import { BaseNode } from './BaseNode'

const OUTPUT_LABELS: Record<string, string> = {
  coil: 'Coil  ( )',
  move: 'MOV',
  compare: 'CMP',
  timer: 'TON',
  counter: 'CTU'
}

export function OutputNode({ data, selected }: NodeProps<{ data: PLCNodeData }>) {
  const d = data as PLCNodeData
  const typeStr = d.outputType ? OUTPUT_LABELS[d.outputType] ?? d.outputType.toUpperCase() : 'Output'
  const sub = [d.tagName, d.description].filter(Boolean).join(' · ')
  return (
    <BaseNode
      color={d.color ?? '#7C3AED'}
      typeLabel={`Output · ${typeStr}`}
      selected={selected}
      label={d.label || d.tagName || 'Output'}
      sublabel={sub || undefined}
    />
  )
}
