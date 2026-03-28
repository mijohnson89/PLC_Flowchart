import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

export function SequencerStartNode({ data }: NodeProps<{ label: string }>) {
  return (
    <div
      className="relative w-[96px] h-[46px] px-2 py-2 rounded-full bg-emerald-100 border-2 border-emerald-500 text-emerald-900 text-xs font-bold shadow-sm text-center shrink-0 box-border flex items-center justify-center"
    >
      {data.label || 'Start'}
      <Handle type="source" position={Position.Right} id="right" className="!bg-emerald-600 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-emerald-600 !w-2 !h-2" />
    </div>
  )
}
