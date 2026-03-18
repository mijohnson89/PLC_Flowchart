import { useReactFlow, useStore, Panel } from '@xyflow/react'
import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround
} from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'

interface AlignBtn {
  icon: React.ReactNode
  title: string
  action: () => void
}

export function AlignmentToolbar() {
  const { getNodes, setNodes } = useReactFlow()
  const pushHistory = useDiagramStore((s) => s.pushHistory)

  // Count selected nodes from the React Flow internal store
  const selectedCount = useStore((s) => s.nodes.filter((n) => n.selected).length)

  if (selectedCount < 2) return null

  function getSelected() {
    return getNodes().filter((n) => n.selected)
  }

  function nodeW(n: ReturnType<typeof getNodes>[number]) {
    return n.measured?.width ?? 120
  }
  function nodeH(n: ReturnType<typeof getNodes>[number]) {
    return n.measured?.height ?? 60
  }

  function apply(updater: (n: ReturnType<typeof getNodes>[number]) => { x: number; y: number }) {
    const selected = getSelected()
    const updates = new Map(selected.map((n) => [n.id, updater(n)]))
    setNodes(
      getNodes().map((n) =>
        updates.has(n.id)
          ? { ...n, position: updates.get(n.id)! }
          : n
      )
    )
    pushHistory()
  }

  // ── Alignment actions ────────────────────────────────────────────────────

  function alignLeft() {
    const minX = Math.min(...getSelected().map((n) => n.position.x))
    apply((n) => ({ x: minX, y: n.position.y }))
  }

  function alignCenterH() {
    const sel = getSelected()
    const avgCX = sel.reduce((sum, n) => sum + n.position.x + nodeW(n) / 2, 0) / sel.length
    apply((n) => ({ x: avgCX - nodeW(n) / 2, y: n.position.y }))
  }

  function alignRight() {
    const maxRight = Math.max(...getSelected().map((n) => n.position.x + nodeW(n)))
    apply((n) => ({ x: maxRight - nodeW(n), y: n.position.y }))
  }

  function alignTop() {
    const minY = Math.min(...getSelected().map((n) => n.position.y))
    apply((n) => ({ x: n.position.x, y: minY }))
  }

  function alignMiddleV() {
    const sel = getSelected()
    const avgCY = sel.reduce((sum, n) => sum + n.position.y + nodeH(n) / 2, 0) / sel.length
    apply((n) => ({ x: n.position.x, y: avgCY - nodeH(n) / 2 }))
  }

  function alignBottom() {
    const maxBottom = Math.max(...getSelected().map((n) => n.position.y + nodeH(n)))
    apply((n) => ({ x: n.position.x, y: maxBottom - nodeH(n) }))
  }

  function distributeH() {
    const sel = [...getSelected()].sort((a, b) => a.position.x - b.position.x)
    const totalW = sel.reduce((s, n) => s + nodeW(n), 0)
    const spanLeft = sel[0].position.x
    const spanRight = sel[sel.length - 1].position.x + nodeW(sel[sel.length - 1])
    const gap = (spanRight - spanLeft - totalW) / (sel.length - 1)
    let cursor = spanLeft
    const positions = sel.map((n) => {
      const pos = { x: cursor, y: n.position.y }
      cursor += nodeW(n) + gap
      return [n.id, pos] as [string, { x: number; y: number }]
    })
    const map = new Map(positions)
    setNodes(getNodes().map((n) => (map.has(n.id) ? { ...n, position: map.get(n.id)! } : n)))
    pushHistory()
  }

  function distributeV() {
    const sel = [...getSelected()].sort((a, b) => a.position.y - b.position.y)
    const totalH = sel.reduce((s, n) => s + nodeH(n), 0)
    const spanTop = sel[0].position.y
    const spanBottom = sel[sel.length - 1].position.y + nodeH(sel[sel.length - 1])
    const gap = (spanBottom - spanTop - totalH) / (sel.length - 1)
    let cursor = spanTop
    const positions = sel.map((n) => {
      const pos = { x: n.position.x, y: cursor }
      cursor += nodeH(n) + gap
      return [n.id, pos] as [string, { x: number; y: number }]
    })
    const map = new Map(positions)
    setNodes(getNodes().map((n) => (map.has(n.id) ? { ...n, position: map.get(n.id)! } : n)))
    pushHistory()
  }

  const groups: { label: string; buttons: AlignBtn[] }[] = [
    {
      label: 'Align',
      buttons: [
        { icon: <AlignStartVertical size={14} />,   title: 'Align Left',           action: alignLeft },
        { icon: <AlignCenterVertical size={14} />,  title: 'Align Center (H)',     action: alignCenterH },
        { icon: <AlignEndVertical size={14} />,     title: 'Align Right',          action: alignRight },
        { icon: <AlignStartHorizontal size={14} />, title: 'Align Top',            action: alignTop },
        { icon: <AlignCenterHorizontal size={14} />,title: 'Align Middle (V)',     action: alignMiddleV },
        { icon: <AlignEndHorizontal size={14} />,   title: 'Align Bottom',         action: alignBottom },
      ]
    },
    {
      label: 'Distribute',
      buttons: [
        { icon: <AlignHorizontalSpaceAround size={14} />, title: 'Distribute Horizontally', action: distributeH },
        { icon: <AlignVerticalSpaceAround size={14} />,   title: 'Distribute Vertically',   action: distributeV },
      ]
    }
  ]

  return (
    <Panel position="top-center">
      <div className="flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-1.5 pointer-events-auto">
        {/* Selection badge */}
        <div className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 mr-1 whitespace-nowrap">
          {selectedCount} selected
        </div>

        {groups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="w-px h-5 bg-gray-200 mx-1" />}
            <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide mr-0.5">
              {group.label}
            </span>
            {group.buttons.map((btn) => (
              <button
                key={btn.title}
                onClick={btn.action}
                title={btn.title}
                className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                {btn.icon}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  )
}
