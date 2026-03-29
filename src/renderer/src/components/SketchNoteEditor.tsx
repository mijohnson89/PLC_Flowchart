import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MousePointer2, Square, Circle, Minus, Pencil, Type, Trash2,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react'
import { createEmptySketchDocument, type SketchDocument, type SketchShape } from '../types'
import { uid } from '../utils/uid'

type SketchTool = 'select' | 'rect' | 'ellipse' | 'line' | 'pen' | 'text'

const GRID = 24
const HIT_LINE = 10
const MIN_DRAW = 4
const MIN_POLY = 2
const MARQUEE_DRAG_PX = 4
/** Visual weight for selected objects in select mode (1 = opaque). */
const SELECTED_SHAPE_OPACITY = 0.62

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  return pt.matrixTransform(ctm.inverse())
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function hitTestShape(s: SketchShape, x: number, y: number): boolean {
  switch (s.kind) {
    case 'rect':
      return x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height
    case 'ellipse': {
      const cx = s.x + s.width / 2
      const cy = s.y + s.height / 2
      const rx = Math.max(s.width / 2, 0.001)
      const ry = Math.max(s.height / 2, 0.001)
      const nx = (x - cx) / rx
      const ny = (y - cy) / ry
      return nx * nx + ny * ny <= 1
    }
    case 'line':
      return distToSeg(x, y, s.x1, s.y1, s.x2, s.y2) <= HIT_LINE
    case 'polyline': {
      const pts = s.points
      if (pts.length < 2) return false
      for (let i = 1; i < pts.length; i++) {
        if (distToSeg(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= HIT_LINE) return true
      }
      return false
    }
    case 'text': {
      const w = Math.max(8, s.text.length * s.fontSize * 0.55)
      const h = s.fontSize * 1.25
      return x >= s.x && x <= s.x + w && y >= s.y - h && y <= s.y + 4
    }
    default:
      return false
  }
}

function findTopShapeAt(shapes: SketchShape[], x: number, y: number): string | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitTestShape(shapes[i], x, y)) return shapes[i].id
  }
  return null
}

function findTopShapeInIds(shapes: SketchShape[], x: number, y: number, allow: Set<string>): string | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i]
    if (allow.has(s.id) && hitTestShape(s, x, y)) return s.id
  }
  return null
}

function shapeBBox(s: SketchShape) {
  switch (s.kind) {
    case 'rect':
    case 'ellipse':
      return {
        minX: s.x,
        minY: s.y,
        maxX: s.x + s.width,
        maxY: s.y + s.height,
        cx: s.x + s.width / 2,
        cy: s.y + s.height / 2,
      }
    case 'line':
      return {
        minX: Math.min(s.x1, s.x2),
        minY: Math.min(s.y1, s.y2),
        maxX: Math.max(s.x1, s.x2),
        maxY: Math.max(s.y1, s.y2),
        cx: (s.x1 + s.x2) / 2,
        cy: (s.y1 + s.y2) / 2,
      }
    case 'polyline': {
      const xs = s.points.map((p) => p.x)
      const ys = s.points.map((p) => p.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
    }
    case 'text': {
      const w = Math.max(8, s.text.length * s.fontSize * 0.55)
      const h = s.fontSize * 1.25
      return {
        minX: s.x,
        minY: s.y - h,
        maxX: s.x + w,
        maxY: s.y + 4,
        cx: s.x + w / 2,
        cy: s.y - h / 2 + 2,
      }
    }
    default:
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 0, cy: 0 }
  }
}

function SelectionOutline({ shape }: { shape: SketchShape }) {
  const b = shapeBBox(shape)
  const w = Math.max(b.maxX - b.minX, 2)
  const h = Math.max(b.maxY - b.minY, 2)
  const pad = 3
  return (
    <rect
      x={b.minX - pad}
      y={b.minY - pad}
      width={w + pad * 2}
      height={h + pad * 2}
      fill="rgba(99, 102, 241, 0.08)"
      stroke="#6366f1"
      strokeWidth={1.5}
      strokeDasharray="6 4"
      opacity={1}
      pointerEvents="none"
    />
  )
}

function marqueeIntersectsBBox(
  mx0: number,
  my0: number,
  mx1: number,
  my1: number,
  b: ReturnType<typeof shapeBBox>
) {
  const rx0 = Math.min(mx0, mx1)
  const rx1 = Math.max(mx0, mx1)
  const ry0 = Math.min(my0, my1)
  const ry1 = Math.max(my0, my1)
  return !(b.maxX < rx0 || b.minX > rx1 || b.maxY < ry0 || b.minY > ry1)
}

function idsInMarquee(shapes: SketchShape[], mx0: number, my0: number, mx1: number, my1: number): string[] {
  return shapes.filter((s) => marqueeIntersectsBBox(mx0, my0, mx1, my1, shapeBBox(s))).map((s) => s.id)
}

function translateShape(s: SketchShape, dx: number, dy: number): SketchShape {
  if (s.kind === 'rect' || s.kind === 'ellipse') return { ...s, x: s.x + dx, y: s.y + dy }
  if (s.kind === 'line') {
    return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy }
  }
  if (s.kind === 'text') return { ...s, x: s.x + dx, y: s.y + dy }
  if (s.kind === 'polyline') return { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
  return s
}

/** Apply resolved toolbar fill/stroke to one shape (fillVal/strokeVal are `none` or `#rrggbb`). */
function paintShape(s: SketchShape, fillVal: string, strokeVal: string, strokeW: number): SketchShape {
  const swStroke = strokeVal === 'none' ? 0 : Math.max(1, strokeW)
  const swOutline = strokeVal === 'none' ? 0 : strokeW
  switch (s.kind) {
    case 'rect':
    case 'ellipse':
      return { ...s, fill: fillVal, stroke: strokeVal, strokeWidth: swOutline }
    case 'line':
    case 'polyline':
      return { ...s, fill: 'none', stroke: strokeVal, strokeWidth: swStroke }
    case 'text':
      return {
        ...s,
        fill: fillVal === 'none' ? s.fill : fillVal,
        stroke: strokeVal,
        strokeWidth: strokeVal === 'none' ? 0 : strokeW,
      }
    default:
      return s
  }
}

type AlignMode = 'left' | 'right' | 'centerH' | 'top' | 'bottom' | 'centerV'

function alignSelectedShapes(shapes: SketchShape[], ids: string[], mode: AlignMode): SketchShape[] {
  if (ids.length < 2) return shapes
  const idSet = new Set(ids)
  const boxes = shapes
    .filter((s) => idSet.has(s.id))
    .map((s) => ({ id: s.id, b: shapeBBox(s) }))
  const unionMinX = Math.min(...boxes.map((x) => x.b.minX))
  const unionMaxX = Math.max(...boxes.map((x) => x.b.maxX))
  const unionMinY = Math.min(...boxes.map((x) => x.b.minY))
  const unionMaxY = Math.max(...boxes.map((x) => x.b.maxY))
  const midX = (unionMinX + unionMaxX) / 2
  const midY = (unionMinY + unionMaxY) / 2
  const delta = new Map<string, { dx: number; dy: number }>()
  for (const { id, b } of boxes) {
    let dx = 0
    let dy = 0
    switch (mode) {
      case 'left':
        dx = unionMinX - b.minX
        break
      case 'right':
        dx = unionMaxX - b.maxX
        break
      case 'centerH':
        dx = midX - b.cx
        break
      case 'top':
        dy = unionMinY - b.minY
        break
      case 'bottom':
        dy = unionMaxY - b.maxY
        break
      case 'centerV':
        dy = midY - b.cy
        break
    }
    delta.set(id, { dx, dy })
  }
  return shapes.map((s) => {
    const d = delta.get(s.id)
    if (!d) return s
    return translateShape(s, d.dx, d.dy)
  })
}

function distributeSelectedShapes(shapes: SketchShape[], ids: string[], axis: 'h' | 'v'): SketchShape[] {
  if (ids.length < 3) return shapes
  const ordered = ids
    .map((id) => shapes.find((s) => s.id === id))
    .filter((s): s is SketchShape => !!s)
    .map((s) => ({ s, b: shapeBBox(s) }))
  if (axis === 'h') ordered.sort((a, b) => a.b.cx - b.b.cx)
  else ordered.sort((a, b) => a.b.cy - b.b.cy)

  const first = axis === 'h' ? ordered[0].b.cx : ordered[0].b.cy
  const last = axis === 'h' ? ordered[ordered.length - 1].b.cx : ordered[ordered.length - 1].b.cy
  const span = last - first
  if (Math.abs(span) < 1e-6) return shapes

  const dxMap = new Map<string, number>()
  const dyMap = new Map<string, number>()
  ordered.forEach((it, i) => {
    const t = i / (ordered.length - 1)
    if (axis === 'h') {
      const newCx = first + span * t
      dxMap.set(it.s.id, newCx - it.b.cx)
    } else {
      const newCy = first + span * t
      dyMap.set(it.s.id, newCy - it.b.cy)
    }
  })

  return shapes.map((s) => {
    const dx = dxMap.get(s.id) ?? 0
    const dy = dyMap.get(s.id) ?? 0
    if (!dx && !dy) return s
    return translateShape(s, dx, dy)
  })
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'

function cornerHandles(s: SketchShape): { corner: Corner; x: number; y: number }[] | null {
  if (s.kind !== 'rect' && s.kind !== 'ellipse') return null
  const { x, y, width: w, height: h } = s
  return [
    { corner: 'nw', x, y },
    { corner: 'ne', x: x + w, y },
    { corner: 'sw', x, y: y + h },
    { corner: 'se', x: x + w, y: y + h },
  ]
}

function hitHandle(handles: { corner: Corner; x: number; y: number }[], x: number, y: number, r = 8): Corner | null {
  for (const h of handles) {
    if (Math.hypot(x - h.x, y - h.y) <= r) return h.corner
  }
  return null
}

function nearPoint(px: number, py: number, x: number, y: number, r: number) {
  return Math.hypot(px - x, py - y) <= r
}

type EditorDragState =
  | { type: 'translate'; id: string; mx0: number; my0: number; snapshot: SketchShape }
  | { type: 'translateMulti'; mx0: number; my0: number; snapshots: Record<string, SketchShape> }
  | { type: 'resize'; id: string; corner: Corner; start: Extract<SketchShape, { kind: 'rect' | 'ellipse' }> }
  | { type: 'lineEnd'; id: string; end: 1 | 2 }

function normalizeDoc(doc: SketchDocument | undefined): SketchDocument {
  if (!doc || doc.version !== 1 || !Array.isArray(doc.shapes)) return createEmptySketchDocument()
  return {
    version: 1,
    width: Math.max(400, doc.width || 2000),
    height: Math.max(300, doc.height || 1400),
    shapes: doc.shapes,
  }
}

function ToolbarBtn({
  active, onClick, title, children,
}: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-md transition-colors ${
        active ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

export function SketchNoteEditor({
  document: docProp,
  onChange,
}: {
  document: SketchDocument | undefined
  onChange: (doc: SketchDocument) => void
}) {
  const doc = useMemo(() => normalizeDoc(docProp), [docProp])
  const svgRef = useRef<SVGSVGElement>(null)

  const [tool, setTool] = useState<SketchTool>('select')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [marquee, setMarquee] = useState<null | { x0: number; y0: number; x1: number; y1: number; additive: boolean }>(null)
  const marqueeLiveRef = useRef<null | { x0: number; y0: number; x1: number; y1: number; additive: boolean }>(null)
  const pendingEmptyDown = useRef<null | { x0: number; y0: number; additive: boolean }>(null)
  const [fill, setFill] = useState('#fef3c7')
  const [stroke, setStroke] = useState('#374151')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [noFill, setNoFill] = useState(false)
  const [noStroke, setNoStroke] = useState(false)

  const [draft, setDraft] = useState<
    | null
    | { kind: 'box'; shape: 'rect' | 'ellipse'; x0: number; y0: number; x1: number; y1: number }
    | { kind: 'line'; x0: number; y0: number; x1: number; y1: number }
    | { kind: 'pen'; points: { x: number; y: number }[] }
  >(null)

  const dragRef = useRef<EditorDragState | null>(null)

  const pushDoc = useCallback(
    (next: SketchDocument) => {
      onChange(next)
    },
    [onChange]
  )

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const primarySelected = useMemo(
    () => (selectedIds.length === 1 ? doc.shapes.find((s) => s.id === selectedIds[0]) ?? null : null),
    [doc.shapes, selectedIds]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0 && tool === 'select') {
        const t = e.target as HTMLElement
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
        e.preventDefault()
        const drop = new Set(selectedIds)
        pushDoc({ ...doc, shapes: doc.shapes.filter((s) => !drop.has(s.id)) })
        setSelectedIds([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, selectedIds, tool, pushDoc])

  const styleFill = noFill ? 'none' : fill
  const styleStroke = noStroke ? 'none' : stroke
  const styleW = noStroke ? 0 : strokeWidth

  type ToolbarPaint = {
    noFill: boolean
    fill: string
    noStroke: boolean
    stroke: string
    strokeWidth: number
  }

  const applyPaintToSelection = useCallback(
    (p: ToolbarPaint) => {
      if (tool !== 'select' || selectedIds.length === 0) return
      const fillVal = p.noFill ? 'none' : p.fill
      const strokeVal = p.noStroke ? 'none' : p.stroke
      const strokeW = p.noStroke ? 0 : p.strokeWidth
      const idSet = new Set(selectedIds)
      const shapes = doc.shapes.map((s) => (idSet.has(s.id) ? paintShape(s, fillVal, strokeVal, strokeW) : s))
      pushDoc({ ...doc, shapes })
    },
    [tool, selectedIds, doc, pushDoc]
  )

  const commitDraft = useCallback(() => {
    if (!draft) return
    if (draft.kind === 'box') {
      const x = Math.min(draft.x0, draft.x1)
      const y = Math.min(draft.y0, draft.y1)
      const width = Math.abs(draft.x1 - draft.x0)
      const height = Math.abs(draft.y1 - draft.y0)
      setDraft(null)
      if (width < MIN_DRAW || height < MIN_DRAW) return
      const base = {
        id: uid('sk'),
        x,
        y,
        width,
        height,
        fill: styleFill,
        stroke: styleStroke,
        strokeWidth: styleW,
        text: '',
        fontSize: Math.min(18, Math.max(12, Math.round(Math.min(width, height) / 4))),
      }
      const shape: SketchShape =
        draft.shape === 'rect'
          ? { kind: 'rect', ...base }
          : { kind: 'ellipse', ...base }
      pushDoc({ ...doc, shapes: [...doc.shapes, shape] })
      setSelectedIds([shape.id])
      setTool('select')
      return
    }
    if (draft.kind === 'line') {
      setDraft(null)
      if (Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0) < MIN_DRAW) return
      const shape: SketchShape = {
        id: uid('sk'),
        kind: 'line',
        x1: draft.x0,
        y1: draft.y0,
        x2: draft.x1,
        y2: draft.y1,
        fill: 'none',
        stroke: styleStroke,
        strokeWidth: Math.max(1, styleW || 1),
      }
      pushDoc({ ...doc, shapes: [...doc.shapes, shape] })
      setSelectedIds([shape.id])
      setTool('select')
      return
    }
    if (draft.kind === 'pen') {
      const pts = draft.points
      setDraft(null)
      if (pts.length < MIN_POLY) return
      const shape: SketchShape = {
        id: uid('sk'),
        kind: 'polyline',
        points: pts,
        fill: 'none',
        stroke: styleStroke,
        strokeWidth: Math.max(1, styleW || 1),
      }
      pushDoc({ ...doc, shapes: [...doc.shapes, shape] })
      setSelectedIds([shape.id])
      setTool('select')
    }
  }, [draft, doc, pushDoc, styleFill, styleStroke, styleW])

  const onSvgDown = (e: React.MouseEvent) => {
    const svg = svgRef.current
    if (!svg) return
    const { x, y } = clientToSvg(svg, e.clientX, e.clientY)

    if (tool === 'select') {
      if (e.shiftKey) {
        const id = findTopShapeAt(doc.shapes, x, y)
        if (id) {
          setSelectedIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
          dragRef.current = null
          pendingEmptyDown.current = null
          marqueeLiveRef.current = null
          setMarquee(null)
          e.preventDefault()
          return
        }
        // Shift+drag on empty canvas: additive marquee (handled below)
      }

      const singlePrimary = selectedIds.length === 1 ? doc.shapes.find((s) => s.id === selectedIds[0]) : null
      if (selectedIds.length === 1 && singlePrimary?.kind === 'line') {
        const ln = singlePrimary
        if (nearPoint(x, y, ln.x1, ln.y1, 9)) {
          dragRef.current = { type: 'lineEnd', id: ln.id, end: 1 }
          pendingEmptyDown.current = null
          e.preventDefault()
          return
        }
        if (nearPoint(x, y, ln.x2, ln.y2, 9)) {
          dragRef.current = { type: 'lineEnd', id: ln.id, end: 2 }
          pendingEmptyDown.current = null
          e.preventDefault()
          return
        }
      }
      if (selectedIds.length === 1 && singlePrimary && (singlePrimary.kind === 'rect' || singlePrimary.kind === 'ellipse')) {
        const handles = cornerHandles(singlePrimary)
        if (handles) {
          const c = hitHandle(handles, x, y)
          if (c) {
            dragRef.current = {
              type: 'resize',
              id: singlePrimary.id,
              corner: c,
              start: JSON.parse(JSON.stringify(singlePrimary)) as Extract<SketchShape, { kind: 'rect' | 'ellipse' }>,
            }
            pendingEmptyDown.current = null
            e.preventDefault()
            return
          }
        }
      }

      if (selectedIds.length > 1) {
        const hitSel = findTopShapeInIds(doc.shapes, x, y, selectedSet)
        if (hitSel) {
          const snapshots: Record<string, SketchShape> = {}
          for (const id of selectedIds) {
            const sh = doc.shapes.find((s) => s.id === id)
            if (sh) snapshots[id] = JSON.parse(JSON.stringify(sh)) as SketchShape
          }
          dragRef.current = { type: 'translateMulti', mx0: x, my0: y, snapshots }
          pendingEmptyDown.current = null
          marqueeLiveRef.current = null
          setMarquee(null)
          e.preventDefault()
          return
        }
      }

      const id = findTopShapeAt(doc.shapes, x, y)
      if (id) {
        setSelectedIds([id])
        const s = doc.shapes.find((sh) => sh.id === id)!
        dragRef.current = {
          type: 'translate',
          id,
          mx0: x,
          my0: y,
          snapshot: JSON.parse(JSON.stringify(s)) as SketchShape,
        }
        pendingEmptyDown.current = null
        marqueeLiveRef.current = null
        setMarquee(null)
      } else {
        pendingEmptyDown.current = { x0: x, y0: y, additive: e.shiftKey }
        marqueeLiveRef.current = null
        setMarquee(null)
        dragRef.current = null
      }
      e.preventDefault()
      return
    }

    if (tool === 'rect') {
      setDraft({ kind: 'box', shape: 'rect', x0: x, y0: y, x1: x, y1: y })
      e.preventDefault()
      return
    }
    if (tool === 'ellipse') {
      setDraft({ kind: 'box', shape: 'ellipse', x0: x, y0: y, x1: x, y1: y })
      e.preventDefault()
      return
    }
    if (tool === 'line') {
      setDraft({ kind: 'line', x0: x, y0: y, x1: x, y1: y })
      e.preventDefault()
      return
    }
    if (tool === 'pen') {
      setDraft({ kind: 'pen', points: [{ x, y }] })
      e.preventDefault()
      return
    }
    if (tool === 'text') {
      const shape: SketchShape = {
        id: uid('sk'),
        kind: 'text',
        x,
        y,
        text: 'Text',
        fontSize: 16,
        fill: noFill ? '#374151' : fill,
        stroke: 'none',
        strokeWidth: 0,
      }
      pushDoc({ ...doc, shapes: [...doc.shapes, shape] })
      setSelectedIds([shape.id])
      setTool('select')
      e.preventDefault()
    }
  }

  const onSvgMove = (e: React.MouseEvent) => {
    const svg = svgRef.current
    if (!svg) return
    const { x, y } = clientToSvg(svg, e.clientX, e.clientY)

    if (tool === 'select') {
      if (pendingEmptyDown.current && !dragRef.current) {
        const p = pendingEmptyDown.current
        if (Math.hypot(x - p.x0, y - p.y0) > MARQUEE_DRAG_PX) {
          const next = { x0: p.x0, y0: p.y0, x1: x, y1: y, additive: p.additive }
          marqueeLiveRef.current = next
          setMarquee(next)
          pendingEmptyDown.current = null
        }
      } else if (marqueeLiveRef.current) {
        // Use ref, not `marquee` state — state is stale until re-render so moves would be dropped.
        const m = marqueeLiveRef.current
        const next = { ...m, x1: x, y1: y }
        marqueeLiveRef.current = next
        setMarquee(next)
      }
    }

    const d = dragRef.current
    if (d?.type === 'translateMulti') {
      const dx = x - d.mx0
      const dy = y - d.my0
      const shapes = doc.shapes.map((s) => {
        const snap = d.snapshots[s.id]
        if (!snap) return s
        if (snap.kind === 'rect' || snap.kind === 'ellipse') {
          return { ...snap, x: snap.x + dx, y: snap.y + dy }
        }
        if (snap.kind === 'line') {
          return {
            ...snap,
            x1: snap.x1 + dx,
            y1: snap.y1 + dy,
            x2: snap.x2 + dx,
            y2: snap.y2 + dy,
          }
        }
        if (snap.kind === 'text') {
          return { ...snap, x: snap.x + dx, y: snap.y + dy }
        }
        if (snap.kind === 'polyline') {
          return {
            ...snap,
            points: snap.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          }
        }
        return s
      })
      pushDoc({ ...doc, shapes })
      return
    }

    if (d?.type === 'translate') {
      const dx = x - d.mx0
      const dy = y - d.my0
      const snap = d.snapshot
      const shapes = doc.shapes.map((s) => {
        if (s.id !== d.id) return s
        if (snap.kind === 'rect' || snap.kind === 'ellipse') {
          return { ...snap, x: snap.x + dx, y: snap.y + dy }
        }
        if (snap.kind === 'line') {
          return {
            ...snap,
            x1: snap.x1 + dx,
            y1: snap.y1 + dy,
            x2: snap.x2 + dx,
            y2: snap.y2 + dy,
          }
        }
        if (snap.kind === 'text') {
          return { ...snap, x: snap.x + dx, y: snap.y + dy }
        }
        if (snap.kind === 'polyline') {
          return {
            ...snap,
            points: snap.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          }
        }
        return s
      })
      pushDoc({ ...doc, shapes })
      return
    }

    if (d?.type === 'lineEnd') {
      const shapes = doc.shapes.map((s) => {
        if (s.id !== d.id || s.kind !== 'line') return s
        if (d.end === 1) return { ...s, x1: x, y1: y }
        return { ...s, x2: x, y2: y }
      })
      pushDoc({ ...doc, shapes })
      return
    }

    if (d?.type === 'resize') {
      const start = d.start as Extract<SketchShape, { kind: 'rect' | 'ellipse' }>
      if (start.kind !== 'rect' && start.kind !== 'ellipse') return
      const sx0 = start.x
      const sy0 = start.y
      const sx1 = start.x + start.width
      const sy1 = start.y + start.height
      let nx0 = sx0
      let ny0 = sy0
      let nx1 = sx1
      let ny1 = sy1
      if (d.corner === 'nw') {
        nx0 = x
        ny0 = y
      } else if (d.corner === 'ne') {
        nx1 = x
        ny0 = y
      } else if (d.corner === 'sw') {
        nx0 = x
        ny1 = y
      } else {
        nx1 = x
        ny1 = y
      }
      const rx = Math.min(nx0, nx1)
      const ry = Math.min(ny0, ny1)
      const rw = Math.abs(nx1 - nx0)
      const rh = Math.abs(ny1 - ny0)
      const shapes = doc.shapes.map((s) =>
        s.id === d.id && (s.kind === 'rect' || s.kind === 'ellipse') ? { ...s, x: rx, y: ry, width: rw, height: rh } : s
      )
      pushDoc({ ...doc, shapes })
      return
    }

    if (!draft) return
    if (draft.kind === 'box' || draft.kind === 'line') {
      setDraft({ ...draft, x1: x, y1: y })
    } else if (draft.kind === 'pen') {
      const last = draft.points[draft.points.length - 1]
      if (!last || Math.hypot(x - last.x, y - last.y) > 3) {
        setDraft({ ...draft, points: [...draft.points, { x, y }] })
      }
    }
  }

  const onSvgUp = () => {
    dragRef.current = null
    const live = marqueeLiveRef.current
    if (live) {
      const picked = idsInMarquee(doc.shapes, live.x0, live.y0, live.x1, live.y1)
      if (live.additive) {
        setSelectedIds((prev) => [...new Set([...prev, ...picked])])
      } else {
        setSelectedIds(picked)
      }
      marqueeLiveRef.current = null
      setMarquee(null)
    } else if (pendingEmptyDown.current && !pendingEmptyDown.current.additive) {
      setSelectedIds([])
    }
    pendingEmptyDown.current = null
    if (draft) commitDraft()
  }

  const onSvgLeave = () => {
    dragRef.current = null
    pendingEmptyDown.current = null
    marqueeLiveRef.current = null
    setMarquee(null)
    if (draft?.kind === 'pen') setDraft(null)
    else if (draft) commitDraft()
  }

  const updateSelected = useCallback(
    (patch: Partial<SketchShape>) => {
      const id = primarySelected?.id
      if (!id) return
      const shapes = doc.shapes.map((s) => (s.id === id ? { ...s, ...patch } as SketchShape : s))
      pushDoc({ ...doc, shapes })
    },
    [doc, primarySelected?.id, pushDoc]
  )

  const deleteSelected = () => {
    if (selectedIds.length === 0) return
    const drop = new Set(selectedIds)
    pushDoc({ ...doc, shapes: doc.shapes.filter((s) => !drop.has(s.id)) })
    setSelectedIds([])
  }

  const runAlign = (mode: AlignMode) => {
    if (selectedIds.length < 2) return
    pushDoc({ ...doc, shapes: alignSelectedShapes(doc.shapes, selectedIds, mode) })
  }

  const runDistribute = (axis: 'h' | 'v') => {
    if (selectedIds.length < 3) return
    pushDoc({ ...doc, shapes: distributeSelectedShapes(doc.shapes, selectedIds, axis) })
  }

  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = []
    for (let gx = 0; gx <= doc.width; gx += GRID) {
      lines.push(
        <line key={`v${gx}`} x1={gx} y1={0} x2={gx} y2={doc.height} className="stroke-gray-200" strokeWidth={0.5} />
      )
    }
    for (let gy = 0; gy <= doc.height; gy += GRID) {
      lines.push(
        <line key={`h${gy}`} x1={0} y1={gy} x2={doc.width} y2={gy} className="stroke-gray-200" strokeWidth={0.5} />
      )
    }
    return lines
  }, [doc.width, doc.height])

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-0.5 border-r border-gray-200 pr-2 mr-1">
          <ToolbarBtn active={tool === 'select'} onClick={() => setTool('select')} title="Select / move">
            <MousePointer2 size={15} />
          </ToolbarBtn>
          <ToolbarBtn active={tool === 'rect'} onClick={() => setTool('rect')} title="Rectangle">
            <Square size={15} />
          </ToolbarBtn>
          <ToolbarBtn active={tool === 'ellipse'} onClick={() => setTool('ellipse')} title="Ellipse">
            <Circle size={15} />
          </ToolbarBtn>
          <ToolbarBtn active={tool === 'line'} onClick={() => setTool('line')} title="Line">
            <Minus size={15} className="rotate-45" />
          </ToolbarBtn>
          <ToolbarBtn active={tool === 'pen'} onClick={() => setTool('pen')} title="Freehand">
            <Pencil size={15} />
          </ToolbarBtn>
          <ToolbarBtn active={tool === 'text'} onClick={() => setTool('text')} title="Text — click canvas">
            <Type size={15} />
          </ToolbarBtn>
        </div>
        <label className="flex items-center gap-1 text-[10px] text-gray-600">
          <input
            type="checkbox"
            checked={noFill}
            onChange={(e) => {
              const v = e.target.checked
              setNoFill(v)
              applyPaintToSelection({ noFill: v, fill, noStroke, stroke, strokeWidth })
            }}
          />
          No fill
        </label>
        <input
          type="color"
          value={fill.startsWith('#') && fill.length === 7 ? fill : '#fef3c7'}
          onChange={(e) => {
            const v = e.target.value
            setFill(v)
            setNoFill(false)
            applyPaintToSelection({ noFill: false, fill: v, noStroke, stroke, strokeWidth })
          }}
          disabled={noFill}
          className="h-7 w-8 rounded border border-gray-200 cursor-pointer disabled:opacity-40"
          title="Fill — applies to selection in select mode"
        />
        <label className="flex items-center gap-1 text-[10px] text-gray-600">
          <input
            type="checkbox"
            checked={noStroke}
            onChange={(e) => {
              const v = e.target.checked
              setNoStroke(v)
              applyPaintToSelection({ noFill, fill, noStroke: v, stroke, strokeWidth })
            }}
          />
          No stroke
        </label>
        <input
          type="color"
          value={stroke.startsWith('#') && stroke.length === 7 ? stroke : '#374151'}
          onChange={(e) => {
            const v = e.target.value
            setStroke(v)
            setNoStroke(false)
            applyPaintToSelection({ noFill, fill, noStroke: false, stroke: v, strokeWidth })
          }}
          disabled={noStroke}
          className="h-7 w-8 rounded border border-gray-200 cursor-pointer disabled:opacity-40"
          title="Stroke — applies to selection in select mode"
        />
        <label className="flex items-center gap-1 text-[10px] text-gray-500">
          W
          <input
            type="number"
            min={0}
            max={32}
            value={strokeWidth}
            onChange={(e) => {
              const v = Number(e.target.value) || 0
              setStrokeWidth(v)
              applyPaintToSelection({ noFill, fill, noStroke, stroke, strokeWidth: v })
            }}
            className="w-12 text-xs border border-gray-200 rounded px-1 py-0.5"
          />
        </label>
        {tool === 'select' && selectedIds.length >= 2 && (
          <div className="flex items-center gap-0.5 border-l border-gray-200 pl-2 ml-1 flex-wrap">
            <span className="text-[9px] text-gray-400 uppercase tracking-wide mr-1">Align</span>
            <ToolbarBtn title="Align left" onClick={() => runAlign('left')}><AlignHorizontalJustifyStart size={14} /></ToolbarBtn>
            <ToolbarBtn title="Align horizontal center" onClick={() => runAlign('centerH')}><AlignHorizontalJustifyCenter size={14} /></ToolbarBtn>
            <ToolbarBtn title="Align right" onClick={() => runAlign('right')}><AlignHorizontalJustifyEnd size={14} /></ToolbarBtn>
            <span className="w-px h-4 bg-gray-200 mx-0.5" />
            <ToolbarBtn title="Align top" onClick={() => runAlign('top')}><AlignVerticalJustifyStart size={14} /></ToolbarBtn>
            <ToolbarBtn title="Align vertical center" onClick={() => runAlign('centerV')}><AlignVerticalJustifyCenter size={14} /></ToolbarBtn>
            <ToolbarBtn title="Align bottom" onClick={() => runAlign('bottom')}><AlignVerticalJustifyEnd size={14} /></ToolbarBtn>
            <span className="w-px h-4 bg-gray-200 mx-0.5" />
            <ToolbarBtn
              title="Distribute horizontally (3+ items)"
              onClick={() => selectedIds.length >= 3 && runDistribute('h')}
            >
              <AlignHorizontalDistributeCenter size={14} className={selectedIds.length < 3 ? 'opacity-35' : ''} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Distribute vertically (3+ items)"
              onClick={() => selectedIds.length >= 3 && runDistribute('v')}
            >
              <AlignVerticalDistributeCenter size={14} className={selectedIds.length < 3 ? 'opacity-35' : ''} />
            </ToolbarBtn>
          </div>
        )}
        {selectedIds.length > 0 && tool === 'select' && (
          <button
            type="button"
            onClick={deleteSelected}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100"
          >
            <Trash2 size={12} /> Delete{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
          </button>
        )}
      </div>

      {(primarySelected?.kind === 'line' || primarySelected?.kind === 'polyline') && tool === 'select' && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-slate-50 flex-shrink-0">
          <span className="text-[10px] font-medium text-gray-600">{primarySelected.kind === 'line' ? 'Line' : 'Stroke'}</span>
          <label className="text-[10px] text-gray-500">Color</label>
          <input
            type="color"
            value={
              primarySelected.stroke !== 'none' && primarySelected.stroke.startsWith('#') && primarySelected.stroke.length === 7
                ? primarySelected.stroke
                : '#374151'
            }
            onChange={(e) => updateSelected({ stroke: e.target.value } as Partial<SketchShape>)}
            className="h-7 w-8 rounded border border-gray-200"
          />
          <label className="text-[10px] text-gray-500">Width</label>
          <input
            type="number"
            min={1}
            max={32}
            value={primarySelected.strokeWidth}
            onChange={(e) => updateSelected({ strokeWidth: Number(e.target.value) || 1 } as Partial<SketchShape>)}
            className="w-12 text-xs border border-gray-200 rounded px-1 py-1"
          />
        </div>
      )}

      {(primarySelected?.kind === 'rect' || primarySelected?.kind === 'ellipse' || primarySelected?.kind === 'text') && tool === 'select' && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-amber-50/50 flex-shrink-0">
          {(primarySelected.kind === 'rect' || primarySelected.kind === 'ellipse') && (
            <>
              <label className="text-[10px] text-gray-600 shrink-0">Label in shape</label>
              <input
                type="text"
                value={primarySelected.text ?? ''}
                onChange={(e) => updateSelected({ text: e.target.value } as Partial<SketchShape>)}
                placeholder="Optional text…"
                className="flex-1 min-w-[120px] text-xs border border-amber-200 rounded px-2 py-1"
              />
              <label className="text-[10px] text-gray-500">Size</label>
              <input
                type="number"
                min={8}
                max={72}
                value={primarySelected.fontSize ?? 14}
                onChange={(e) => updateSelected({ fontSize: Number(e.target.value) || 14 } as Partial<SketchShape>)}
                className="w-14 text-xs border border-amber-200 rounded px-1 py-1"
              />
            </>
          )}
          {primarySelected.kind === 'text' && (
            <>
              <label className="text-[10px] text-gray-600 shrink-0">Text</label>
              <input
                type="text"
                value={primarySelected.text}
                onChange={(e) => updateSelected({ text: e.target.value } as Partial<SketchShape>)}
                className="flex-1 min-w-[120px] text-xs border border-amber-200 rounded px-2 py-1"
              />
              <label className="text-[10px] text-gray-500">Size</label>
              <input
                type="number"
                min={8}
                max={96}
                value={primarySelected.fontSize}
                onChange={(e) => updateSelected({ fontSize: Number(e.target.value) || 16 } as Partial<SketchShape>)}
                className="w-14 text-xs border border-amber-200 rounded px-1 py-1"
              />
              <label className="text-[10px] text-gray-500">Color</label>
              <input
                type="color"
                value={primarySelected.fill.startsWith('#') && primarySelected.fill.length === 7 ? primarySelected.fill : '#374151'}
                onChange={(e) => updateSelected({ fill: e.target.value } as Partial<SketchShape>)}
                className="h-7 w-8 rounded border border-amber-200"
              />
            </>
          )}
          {(primarySelected.kind === 'rect' || primarySelected.kind === 'ellipse') && (
            <>
              <label className="text-[10px] text-gray-500 ml-2">Fill</label>
              <input
                type="color"
                value={
                  primarySelected.fill !== 'none' && primarySelected.fill.startsWith('#') && primarySelected.fill.length === 7
                    ? primarySelected.fill
                    : '#fef3c7'
                }
                onChange={(e) => updateSelected({ fill: e.target.value } as Partial<SketchShape>)}
                disabled={primarySelected.fill === 'none'}
                className="h-7 w-8 rounded border border-amber-200 disabled:opacity-40"
              />
              <label className="text-[10px] text-gray-500">Stroke</label>
              <input
                type="color"
                value={
                  primarySelected.stroke !== 'none' && primarySelected.stroke.startsWith('#') && primarySelected.stroke.length === 7
                    ? primarySelected.stroke
                    : '#374151'
                }
                onChange={(e) => updateSelected({ stroke: e.target.value } as Partial<SketchShape>)}
                disabled={primarySelected.stroke === 'none'}
                className="h-7 w-8 rounded border border-amber-200 disabled:opacity-40"
              />
              <label className="text-[10px] text-gray-500">W</label>
              <input
                type="number"
                min={0}
                max={32}
                value={primarySelected.strokeWidth}
                onChange={(e) => updateSelected({ strokeWidth: Number(e.target.value) || 0 } as Partial<SketchShape>)}
                className="w-12 text-xs border border-amber-200 rounded px-1 py-1"
              />
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0 bg-slate-100">
        <svg
          ref={svgRef}
          width={doc.width}
          height={doc.height}
          className="bg-white shadow-md block touch-none"
          style={{ cursor: tool === 'select' ? (marquee ? 'crosshair' : 'default') : 'crosshair' }}
          onMouseDown={onSvgDown}
          onMouseMove={onSvgMove}
          onMouseUp={onSvgUp}
          onMouseLeave={onSvgLeave}
        >
          <g className="opacity-60">{gridLines}</g>
          {doc.shapes.map((s) => {
            const isSel = selectedSet.has(s.id) && tool === 'select'
            const dim = isSel ? SELECTED_SHAPE_OPACITY : 1
            const key = { key: s.id }
            if (s.kind === 'rect') {
              return (
                <g {...key}>
                  <g opacity={dim}>
                    <rect
                      x={s.x}
                      y={s.y}
                      width={s.width}
                      height={s.height}
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={s.strokeWidth}
                    />
                    {(s.text?.trim() || isSel) && (
                      <text
                        x={s.x + s.width / 2}
                        y={s.y + s.height / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={s.stroke !== 'none' ? s.stroke : '#111827'}
                        fontSize={s.fontSize ?? 14}
                        style={{ pointerEvents: 'none' }}
                      >
                        {s.text || (isSel ? '…' : '')}
                      </text>
                    )}
                  </g>
                  {isSel && <SelectionOutline shape={s} />}
                </g>
              )
            }
            if (s.kind === 'ellipse') {
              const cx = s.x + s.width / 2
              const cy = s.y + s.height / 2
              const rx = Math.max(s.width / 2, 0.5)
              const ry = Math.max(s.height / 2, 0.5)
              return (
                <g {...key}>
                  <g opacity={dim}>
                    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />
                    {(s.text?.trim() || isSel) && (
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={s.stroke !== 'none' ? s.stroke : '#111827'}
                        fontSize={s.fontSize ?? 14}
                        style={{ pointerEvents: 'none' }}
                      >
                        {s.text || (isSel ? '…' : '')}
                      </text>
                    )}
                  </g>
                  {isSel && <SelectionOutline shape={s} />}
                </g>
              )
            }
            if (s.kind === 'line') {
              return (
                <g {...key}>
                  <line
                    x1={s.x1}
                    y1={s.y1}
                    x2={s.x2}
                    y2={s.y2}
                    stroke={s.stroke}
                    strokeWidth={s.strokeWidth}
                    fill="none"
                    opacity={dim}
                  />
                  {isSel && <SelectionOutline shape={s} />}
                </g>
              )
            }
            if (s.kind === 'polyline') {
              const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
              return (
                <g {...key}>
                  <path
                    d={d}
                    stroke={s.stroke}
                    strokeWidth={s.strokeWidth}
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={dim}
                  />
                  {isSel && <SelectionOutline shape={s} />}
                </g>
              )
            }
            return (
              <g {...key}>
                <text
                  x={s.x}
                  y={s.y}
                  fill={s.fill}
                  stroke={s.stroke === 'none' ? undefined : s.stroke}
                  strokeWidth={s.stroke === 'none' ? 0 : s.strokeWidth}
                  fontSize={s.fontSize}
                  opacity={dim}
                  style={{ pointerEvents: 'none' }}
                >
                  {s.text}
                </text>
                {isSel && <SelectionOutline shape={s} />}
              </g>
            )
          })}
          {draft?.kind === 'box' && (
            <rect
              x={Math.min(draft.x0, draft.x1)}
              y={Math.min(draft.y0, draft.y1)}
              width={Math.abs(draft.x1 - draft.x0)}
              height={Math.abs(draft.y1 - draft.y0)}
              fill={styleFill}
              fillOpacity={0.35}
              stroke={styleStroke}
              strokeWidth={styleW}
              strokeDasharray="6 4"
            />
          )}
          {draft?.kind === 'line' && (
            <line
              x1={draft.x0}
              y1={draft.y0}
              x2={draft.x1}
              y2={draft.y1}
              stroke={styleStroke}
              strokeWidth={Math.max(1, styleW || 1)}
              strokeDasharray="6 4"
            />
          )}
          {draft?.kind === 'pen' && draft.points.length >= 2 && (
            <path
              d={draft.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
              stroke={styleStroke}
              strokeWidth={Math.max(1, styleW || 1)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 3"
            />
          )}
          {primarySelected && selectedIds.length === 1 && tool === 'select' && (primarySelected.kind === 'rect' || primarySelected.kind === 'ellipse') && cornerHandles(primarySelected)?.map((h) => (
            <rect
              key={h.corner}
              x={h.x - 5}
              y={h.y - 5}
              width={10}
              height={10}
              fill="white"
              stroke="#6366f1"
              strokeWidth={1.5}
            />
          ))}
          {primarySelected && selectedIds.length === 1 && tool === 'select' && primarySelected.kind === 'line' && (
            <g>
              <circle cx={primarySelected.x1} cy={primarySelected.y1} r={5} fill="white" stroke="#6366f1" strokeWidth={1.5} />
              <circle cx={primarySelected.x2} cy={primarySelected.y2} r={5} fill="white" stroke="#6366f1" strokeWidth={1.5} />
            </g>
          )}
          {marquee && tool === 'select' && (
            <rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="rgba(99, 102, 241, 0.12)"
              stroke="#6366f1"
              strokeWidth={1}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}
        </svg>
      </div>
      <p className="text-[10px] text-gray-400 px-3 py-1 border-t border-gray-100 flex-shrink-0">
        Drag on empty canvas to box-select; Shift+click toggles selection. Move a selected item in a group to drag all. Align / distribute need 2+ or 3+ objects.
      </p>
    </div>
  )
}
