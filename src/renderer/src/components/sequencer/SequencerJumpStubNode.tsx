import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

/** Small overview node for backward jumps: shows target step description (line from parent’s right). */
export function SequencerJumpStubNode({
  data
}: NodeProps<{ targetId: string; targetDescription?: string }>) {
  const text = (data.targetDescription && String(data.targetDescription).trim()) || '—'
  return (
    <div className="w-[128px] h-[56px] rounded-md bg-amber-50 border-2 border-amber-500 shadow-sm px-2 py-1.5 shrink-0 box-border flex flex-col justify-center">
      <Handle type="target" position={Position.Left} id="left" className="!bg-amber-600 !w-2 !h-2" />
      <div className="text-[10px] font-semibold text-amber-950 text-center leading-snug line-clamp-3">{text}</div>
    </div>
  )
}
