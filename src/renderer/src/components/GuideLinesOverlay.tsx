import { useStore } from '@xyflow/react'

/**
 * Renders alignment guide lines and semi-transparent highlights when
 * a node is being dragged and its center-X or center-Y aligns with another node.
 * Must be rendered as a direct child of <ReactFlow> to access the store.
 */

const SNAP_PX = 8   // alignment tolerance in screen pixels
const GUIDE_COLOR = '#3b82f6'
const HIGHLIGHT_COLOR = '#3b82f6'

interface GuideLinesOverlayProps {
  pendingSourceId?: string | null
}

export function GuideLinesOverlay({ pendingSourceId }: GuideLinesOverlayProps) {
  const transform = useStore((s) => s.transform)
  const nodes = useStore((s) => s.nodes)

  const [tx, ty, zoom] = transform
  const threshold = SNAP_PX / zoom

  const dragging = nodes.filter((n) => n.dragging)
  const others = nodes.filter((n) => !n.dragging)

  // ── Compute alignment guides ─────────────────────────────────────────────
  const verticalGuideXs = new Set<number>()    // canvas-space X for vertical lines
  const horizontalGuideYs = new Set<number>()  // canvas-space Y for horizontal lines
  const highlightedIds = new Set<string>()

  for (const dn of dragging) {
    const dw = dn.measured?.width ?? 120
    const dh = dn.measured?.height ?? 60
    const dCX = dn.position.x + dw / 2
    const dCY = dn.position.y + dh / 2
    const dL = dn.position.x
    const dR = dn.position.x + dw
    const dT = dn.position.y
    const dB = dn.position.y + dh

    for (const n of others) {
      const w = n.measured?.width ?? 120
      const h = n.measured?.height ?? 60
      const cx = n.position.x + w / 2
      const cy = n.position.y + h / 2
      const l = n.position.x
      const r = n.position.x + w
      const t = n.position.y
      const b = n.position.y + h

      // vertical guides (same x position)
      if (Math.abs(dCX - cx) < threshold) { verticalGuideXs.add(cx); highlightedIds.add(n.id) }
      if (Math.abs(dL - l) < threshold)   { verticalGuideXs.add(l);  highlightedIds.add(n.id) }
      if (Math.abs(dR - r) < threshold)   { verticalGuideXs.add(r);  highlightedIds.add(n.id) }

      // horizontal guides (same y position)
      if (Math.abs(dCY - cy) < threshold) { horizontalGuideYs.add(cy); highlightedIds.add(n.id) }
      if (Math.abs(dT - t) < threshold)   { horizontalGuideYs.add(t);  highlightedIds.add(n.id) }
      if (Math.abs(dB - b) < threshold)   { horizontalGuideYs.add(b);  highlightedIds.add(n.id) }
    }
  }

  const hasGuides = verticalGuideXs.size > 0 || horizontalGuideYs.size > 0
  const hasPending = !!pendingSourceId
  if (!hasGuides && !hasPending) return null

  // ── Compute guide line extent ────────────────────────────────────────────
  const xs = nodes.map((n) => n.position.x)
  const ys = nodes.map((n) => n.position.y)
  const minX = (xs.length ? Math.min(...xs) : 0) - 200
  const maxX = (xs.length ? Math.max(...xs) : 800) + 400
  const minY = (ys.length ? Math.min(...ys) : 0) - 200
  const maxY = (ys.length ? Math.max(...ys) : 600) + 400

  const pendingNode = pendingSourceId ? nodes.find((n) => n.id === pendingSourceId) : null

  return (
    <svg
      style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
        overflow: 'visible'
      }}
    >
      <g transform={`translate(${tx},${ty}) scale(${zoom})`}>

        {/* ── Highlighted aligned nodes ─────────────────────────────────── */}
        {[...highlightedIds].map((id) => {
          const n = nodes.find((nd) => nd.id === id)
          if (!n) return null
          const w = n.measured?.width ?? 120
          const h = n.measured?.height ?? 60
          return (
            <rect
              key={`hl-${id}`}
              x={n.position.x - 5}
              y={n.position.y - 5}
              width={w + 10}
              height={h + 10}
              rx={10}
              fill={HIGHLIGHT_COLOR}
              fillOpacity={0.12}
              stroke={HIGHLIGHT_COLOR}
              strokeWidth={1.5 / zoom}
              strokeDasharray={`${5 / zoom},${3 / zoom}`}
            />
          )
        })}

        {/* ── Vertical guide lines ──────────────────────────────────────── */}
        {[...verticalGuideXs].map((x, i) => (
          <line
            key={`vg-${i}`}
            x1={x} y1={minY} x2={x} y2={maxY}
            stroke={GUIDE_COLOR}
            strokeWidth={1 / zoom}
            opacity={0.55}
            strokeDasharray={`${7 / zoom},${4 / zoom}`}
          />
        ))}

        {/* ── Horizontal guide lines ────────────────────────────────────── */}
        {[...horizontalGuideYs].map((y, i) => (
          <line
            key={`hg-${i}`}
            x1={minX} y1={y} x2={maxX} y2={y}
            stroke={GUIDE_COLOR}
            strokeWidth={1 / zoom}
            opacity={0.55}
            strokeDasharray={`${7 / zoom},${4 / zoom}`}
          />
        ))}

        {/* ── Pending connect-source ring ───────────────────────────────── */}
        {pendingNode && (() => {
          const w = pendingNode.measured?.width ?? 120
          const h = pendingNode.measured?.height ?? 60
          return (
            <>
              <rect
                x={pendingNode.position.x - 8}
                y={pendingNode.position.y - 8}
                width={w + 16}
                height={h + 16}
                rx={12}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2.5 / zoom}
                opacity={0.9}
              />
              <rect
                x={pendingNode.position.x - 8}
                y={pendingNode.position.y - 8}
                width={w + 16}
                height={h + 16}
                rx={12}
                fill="#f59e0b"
                fillOpacity={0.08}
              />
            </>
          )
        })()}

      </g>
    </svg>
  )
}
