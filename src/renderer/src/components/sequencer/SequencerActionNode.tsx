import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { PackMLBadge } from '../MatrixView'

const DEFAULT_ACCENT = '#0ea5e9'

function hexToRgba(hex: string, alpha: number): string {
  const t = hex.trim()
  const m6 = /^#?([0-9a-f]{6})$/i.exec(t)
  if (m6) {
    const n = parseInt(m6[1], 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
  }
  const m3 = /^#?([0-9a-f]{3})$/i.exec(t)
  if (m3) {
    const [a, b, c] = m3[1].split('').map((ch) => ch + ch)
    const n = parseInt(`${a}${b}${c}`, 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
  }
  return `rgba(14, 165, 233, ${alpha})`
}

export function SequencerActionNode({
  data
}: NodeProps<{
  label: string
  stepNumber?: number
  /** Step description (body text). */
  description?: string
  subtitle?: string
  packMLState?: string
  phaseColors?: string[]
  overviewHeight?: number
}>) {
  const num = data.stepNumber
  const name = (data.label ?? '').trim() || 'Step'
  const desc = ((data.description ?? data.subtitle) ?? '').trim()
  const h = data.overviewHeight ?? 96
  const colors = Array.isArray(data.phaseColors) ? data.phaseColors.filter(Boolean) : []
  const accent = colors[0] ?? DEFAULT_ACCENT
  const bg = hexToRgba(accent, 0.11)
  const headerBg = hexToRgba(accent, 0.18)
  const border = accent

  const headerTitle =
    num !== undefined ? (name ? `S${num} - ${name}` : `S${num}`) : name

  return (
    <div
      className="w-[192px] rounded-lg shadow-md overflow-hidden shrink-0 box-border flex flex-col border-2"
      style={{
        height: h,
        backgroundColor: bg,
        borderColor: border
      }}
    >
      {colors.length > 1 && (
        <div
          className="h-1 w-full shrink-0"
          style={{
            background: `linear-gradient(90deg, ${colors.map((c) => c).join(',')})`
          }}
        />
      )}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-2 !h-2 !border-0"
        style={{ backgroundColor: accent }}
      />
      <div
        className="px-2 py-1.5 shrink-0 border-b border-solid"
        style={{
          backgroundColor: headerBg,
          borderBottomColor: hexToRgba(accent, 0.45)
        }}
      >
        {num !== undefined ? (
          <div
            className="text-[10px] font-semibold leading-snug line-clamp-2 text-left"
            style={{ color: '#0f172a' }}
            title={headerTitle}
          >
            <span className="font-mono font-bold" style={{ color: accent }}>
              S{num}
            </span>
            <span className="text-slate-900"> - {name}</span>
          </div>
        ) : (
          <span className="text-[10px] font-semibold text-slate-900">{name}</span>
        )}
      </div>
      <div className="flex-1 min-h-0 px-2 py-1.5 flex flex-col gap-1.5 items-center justify-start overflow-hidden">
        {desc ? (
          <p className="w-full text-[9px] text-slate-700 leading-snug whitespace-pre-wrap line-clamp-[5] text-left">
            {desc}
          </p>
        ) : null}
        {data.packMLState ? (
          <div className="w-full flex justify-center">
            <PackMLBadge state={data.packMLState} />
          </div>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !border-0"
        style={{ backgroundColor: accent }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-2 !h-2 !border-0"
        style={{ backgroundColor: accent }}
      />
    </div>
  )
}
