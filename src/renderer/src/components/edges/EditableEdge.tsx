import { useCallback, useEffect, useRef } from 'react'
import { EdgeLabelRenderer, useReactFlow, useStore, getSmoothStepPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type { PLCEdge, PLCEdgeData } from '../../types'

function edgeConditionText(label: unknown, data: PLCEdgeData | undefined): string {
  const fromCond = data?.condition != null ? String(data.condition).trim() : ''
  if (fromCond) return fromCond
  const fromEdgeLabel = typeof label === 'string' ? label.trim() : ''
  if (fromEdgeLabel) return fromEdgeLabel
  return data?.label != null ? String(data.label).trim() : ''
}

interface WP { x: number; y: number }

/**
 * Build a strict orthogonal (H-then-V) path through a list of points.
 * Each consecutive pair A→B produces:
 *   horizontal segment:  A → (B.x, A.y)
 *   vertical segment:    (B.x, A.y) → B
 */
function buildOrthogonalPath(pts: WP[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) {
      d += ` L ${b.x} ${a.y} L ${b.x} ${b.y}`   // corner: H then V
    } else {
      d += ` L ${b.x} ${b.y}`                     // already axis-aligned
    }
  }
  return d
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditableEdge({
  id,
  label,
  sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
  data, selected, markerEnd, style
}: EdgeProps<PLCEdge>) {
  const { setEdges } = useReactFlow()
  const transform = useStore((s) => s.transform)
  const tRef = useRef(transform)
  useEffect(() => { tRef.current = transform }, [transform])

  const d = data as PLCEdgeData | undefined
  const conditionText = edgeConditionText(label, d)
  const waypoints: WP[] = d?.waypoints ?? []

  // ── Path ────────────────────────────────────────────────────────────────────

  let pathD: string
  let labelX: number
  let labelY: number

  if (waypoints.length === 0) {
    // Automatic 90-degree routing — sharp corners, no manual waypoints yet
    const [p, lx, ly] = getSmoothStepPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
      borderRadius: 0
    })
    pathD = p
    labelX = lx
    labelY = ly
  } else {
    // Manual routing through user-placed elbow waypoints
    const pts: WP[] = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }]
    pathD = buildOrthogonalPath(pts)
    // Label at path midpoint
    const mid = pts[Math.floor(pts.length / 2)]
    labelX = mid.x
    labelY = mid.y
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function toCanvas(clientX: number, clientY: number): WP {
    const [tx, ty, zoom] = tRef.current
    return { x: (clientX - tx) / zoom, y: (clientY - ty) / zoom }
  }

  function patchWaypoints(wps: WP[]) {
    setEdges((edges) =>
      edges.map((e) =>
        e.id === id ? { ...e, data: { ...(e.data ?? {}), waypoints: wps } } : e
      )
    )
  }

  // ── Drag a waypoint ────────────────────────────────────────────────────────

  const startDrag = useCallback((wpIndex: number, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    function onMove(me: MouseEvent) {
      const cp = (() => {
        const [tx, ty, zoom] = tRef.current
        return { x: (me.clientX - tx) / zoom, y: (me.clientY - ty) / zoom }
      })()
      setEdges((edges) =>
        edges.map((edge) => {
          if (edge.id !== id) return edge
          const wps: WP[] = ((edge.data as PLCEdgeData)?.waypoints ?? []).map(
            (wp, i) => (i === wpIndex ? cp : wp)
          )
          return { ...edge, data: { ...(edge.data ?? {}), waypoints: wps } }
        })
      )
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [id])

  // ── Add / remove ───────────────────────────────────────────────────────────

  function addWaypoint(segIndex: number, e: React.MouseEvent) {
    e.stopPropagation()
    const cp = toCanvas(e.clientX, e.clientY)
    const newWps = [...waypoints]
    newWps.splice(segIndex, 0, cp)
    patchWaypoints(newWps)
  }

  function removeWaypoint(wpIndex: number, e: React.MouseEvent) {
    e.stopPropagation()
    patchWaypoints(waypoints.filter((_, i) => i !== wpIndex))
  }

  // Points used for handle placement
  const allPts: WP[] = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }]

  const stroke = selected ? '#3b82f6' : '#64748b'

  return (
    <>
      {/* Wide transparent hit-area so the edge is easy to click */}
      <path d={pathD} fill="none" strokeWidth={14} stroke="transparent" style={{ cursor: 'pointer' }} />

      {/* Visible path */}
      <path
        d={pathD}
        fill="none"
        markerEnd={markerEnd}
        className="react-flow__edge-path"
        style={{
          ...style,
          stroke,
          strokeWidth: selected ? 2.5 : 2,
          transition: 'stroke 0.12s, stroke-width 0.12s'
        }}
      />

      <EdgeLabelRenderer>
        {/* Jump / transition condition (matrix + properties use data.condition) */}
        {conditionText && (
          <div
            className="nodrag nopan pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 max-w-[min(200px,40vw)] text-[11px] font-medium text-gray-800 bg-white/95 border border-slate-200 shadow-sm rounded px-1.5 py-0.5 text-center leading-snug"
            style={{ left: labelX, top: labelY }}
          >
            {conditionText}
          </div>
        )}

        {selected && (
          <>
            {/* ── Draggable elbow handles at each waypoint ── */}
            {waypoints.map((wp, i) => (
              <div
                key={`wp-${i}`}
                className="nodrag nopan absolute -translate-x-1/2 -translate-y-1/2 z-50"
                style={{ left: wp.x, top: wp.y, pointerEvents: 'all', cursor: 'move' }}
                onMouseDown={(e) => startDrag(i, e)}
                onDoubleClick={(e) => removeWaypoint(i, e)}
                title="Drag to move · Double-click to remove"
              >
                <div className="w-3.5 h-3.5 rounded-sm bg-blue-500 border-2 border-white shadow-md hover:bg-blue-600 transition-colors" />
              </div>
            ))}

            {/* ── Add-elbow buttons ─────────────────────────────────────────
                When no waypoints: one button at the label centre of the auto-route.
                When waypoints exist: buttons at midpoints between consecutive points. ── */}
            {waypoints.length === 0 ? (
              /* Single "add first elbow" button at path centre */
              <div
                className="nodrag nopan absolute -translate-x-1/2 -translate-y-1/2 z-40 cursor-pointer"
                style={{ left: labelX, top: labelY, pointerEvents: 'all' }}
                onClick={(e) => addWaypoint(0, e)}
                title="Click to add a bend point"
              >
                <AddButton />
              </div>
            ) : (
              allPts.slice(0, -1).map((p, segIdx) => {
                const q = allPts[segIdx + 1]
                const len = Math.hypot(q.x - p.x, q.y - p.y)
                if (len < 32) return null
                const mx = (p.x + q.x) / 2
                const my = (p.y + q.y) / 2
                return (
                  <div
                    key={`add-${segIdx}`}
                    className="nodrag nopan absolute -translate-x-1/2 -translate-y-1/2 z-40 cursor-pointer"
                    style={{ left: mx, top: my, pointerEvents: 'all' }}
                    onClick={(e) => addWaypoint(segIdx, e)}
                    title="Click to add a bend point"
                  >
                    <AddButton />
                  </div>
                )
              })
            )}
          </>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

function AddButton() {
  return (
    <div className="w-4 h-4 rounded-full bg-white border-2 border-blue-400 flex items-center justify-center text-blue-500 font-bold shadow hover:bg-blue-50 transition-colors" style={{ fontSize: 11, lineHeight: 1 }}>
      +
    </div>
  )
}
