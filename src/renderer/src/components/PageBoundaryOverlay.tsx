import { useStore } from '@xyflow/react'
import { useDiagramStore } from '../store/diagramStore'
import { pageDimensions } from '../types'

/**
 * Renders the printable page boundary in canvas-space, following the same
 * pattern as GuideLinesOverlay: an absolutely-positioned SVG whose inner
 * <g> is transformed by the React Flow viewport (pan + zoom).
 *
 * Visual layers (bottom → top):
 *  1. Outside shading  — subtle gray tint beyond the page edges (SVG mask)
 *  2. Page white fill  — distinguishes the printable area from the canvas
 *  3. Corner marks     — small L-shapes at each corner
 *  4. Dashed border    — indigo outline
 *  5. Size label       — "A4 · Portrait" above top-left corner
 */

const BORDER_COLOR   = '#6366f1'  // indigo-500
const OUTSIDE_COLOR  = '#64748b'  // slate-500
const CORNER_LEN     = 16         // canvas units for corner tick length
const CORNER_WEIGHT  = 2          // corner mark stroke width (at zoom=1)

export function PageBoundaryOverlay() {
  const transform = useStore((s) => s.transform)
  const [tx, ty, zoom] = transform

  const pageSize        = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.pageSize ?? null)
  const pageOrientation = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.pageOrientation ?? 'portrait')

  if (!pageSize) return null

  const { w, h } = pageDimensions(pageSize, pageOrientation)

  // Page sits at canvas origin (0, 0) with a small inset margin
  const ox = 0
  const oy = 0

  // Outer bounds large enough to cover any viewport position
  const HUGE = 50_000
  const maskId = `page-outside-mask-${pageSize}-${pageOrientation}`

  const strokeW = Math.max(0.5, 1.5 / zoom)
  const dashLen = 8 / zoom
  const gapLen  = 4 / zoom
  const cornerW = CORNER_WEIGHT / zoom
  const cornerL = CORNER_LEN / zoom
  const labelSz = Math.max(9, 11 / zoom)

  const label = `${pageSize}  ·  ${pageOrientation === 'portrait' ? 'Portrait' : 'Landscape'}`

  return (
    <svg
      data-export-skip="true"
      style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 1,          // below nodes (z≈2+) but above the dot background
        overflow: 'visible'
      }}
    >
      <defs>
        {/* Mask that lets through everything EXCEPT the page rectangle */}
        <mask id={maskId}>
          <rect x={-HUGE} y={-HUGE} width={HUGE * 2} height={HUGE * 2} fill="white" />
          <rect x={ox} y={oy} width={w} height={h} fill="black" />
        </mask>
      </defs>

      <g transform={`translate(${tx},${ty}) scale(${zoom})`}>

        {/* ── 1. Outside shading ──────────────────────────────────────────── */}
        <rect
          x={-HUGE} y={-HUGE}
          width={HUGE * 2} height={HUGE * 2}
          fill={OUTSIDE_COLOR}
          fillOpacity={0.07}
          mask={`url(#${maskId})`}
        />

        {/* ── 2. Page white fill (subtle — lets dot grid show through) ──── */}
        <rect
          x={ox} y={oy}
          width={w} height={h}
          fill="white"
          fillOpacity={0.55}
        />

        {/* ── 3. Drop shadow effect (soft bottom/right edge) ─────────────── */}
        <rect
          x={ox + 3 / zoom} y={oy + 3 / zoom}
          width={w} height={h}
          fill="#1e293b"
          fillOpacity={0.06}
          rx={1 / zoom}
        />

        {/* ── 4. Dashed page border ──────────────────────────────────────── */}
        <rect
          x={ox} y={oy}
          width={w} height={h}
          fill="none"
          stroke={BORDER_COLOR}
          strokeWidth={strokeW}
          strokeDasharray={`${dashLen},${gapLen}`}
          strokeOpacity={0.7}
        />

        {/* ── 5. Solid corner marks (L-shapes at all 4 corners) ─────────── */}
        {[
          // [startX, startY, hDir, vDir]
          [ox,     oy,      1,  1 ],  // top-left
          [ox + w, oy,     -1,  1 ],  // top-right
          [ox,     oy + h,  1, -1 ],  // bottom-left
          [ox + w, oy + h, -1, -1 ],  // bottom-right
        ].map(([cx, cy, hd, vd], i) => (
          <g key={i}>
            <line
              x1={cx} y1={cy}
              x2={cx + hd * cornerL} y2={cy}
              stroke={BORDER_COLOR} strokeWidth={cornerW} strokeOpacity={0.9}
            />
            <line
              x1={cx} y1={cy}
              x2={cx} y2={cy + vd * cornerL}
              stroke={BORDER_COLOR} strokeWidth={cornerW} strokeOpacity={0.9}
            />
          </g>
        ))}

        {/* ── 6. Page size label ────────────────────────────────────────── */}
        <text
          x={ox}
          y={oy - 6 / zoom}
          fontSize={labelSz}
          fill={BORDER_COLOR}
          fillOpacity={0.8}
          fontWeight="600"
          fontFamily="ui-monospace, monospace"
          letterSpacing={0.5}
        >
          {label}
        </text>

        {/* ── 7. Page dimensions (bottom-right label) ────────────────────── */}
        <text
          x={ox + w}
          y={oy + h + 14 / zoom}
          fontSize={labelSz * 0.85}
          fill={BORDER_COLOR}
          fillOpacity={0.5}
          fontFamily="ui-monospace, monospace"
          textAnchor="end"
        >
          {w} × {h} px
        </text>

      </g>
    </svg>
  )
}
