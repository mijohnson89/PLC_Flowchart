import type { DragEvent } from 'react'
import type { PLCNodeType } from '../types'
import { useDiagramStore } from '../store/diagramStore'

interface PaletteItem {
  type: PLCNodeType
  label: string
  description: string
  icon: string
  bgColor: string
  borderColor: string
}

const PALETTE: PaletteItem[] = [
  {
    type: 'step',
    label: 'Step',
    description: 'SFC step / program state',
    icon: '▣',
    bgColor: '#d1fae5',
    borderColor: '#10b981'
  },
  {
    type: 'decision',
    label: 'Decision',
    description: 'Branching logic / if-else',
    icon: '◈',
    bgColor: '#fef9c3',
    borderColor: '#ca8a04'
  }
]

function onDragStart(e: DragEvent, item: PaletteItem) {
  e.dataTransfer.setData('application/plc-node-type', item.type)
  e.dataTransfer.setData('application/plc-node-label', item.label)
  e.dataTransfer.effectAllowed = 'copy'
}

export function Sidebar() {
  const mode = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.type ?? 'flowchart')
  const addNodeBelow = useDiagramStore((s) => s.addNodeBelow)

  if (mode === 'sequence') {
    return (
      <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Sequence Elements</h2>
        </div>
        <div className="p-3 flex flex-col gap-2 text-xs text-gray-500">
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <div className="font-semibold text-blue-700 mb-1">Actors</div>
            <p>Use the "Add Actor" button in the canvas toolbar to add new lifelines.</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
            <div className="font-semibold text-emerald-700 mb-1">Messages</div>
            <p>Use the "Add Message" button after adding at least 2 actors.</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
            <div className="font-semibold text-amber-700 mb-1">Tips</div>
            <ul className="list-disc list-inside space-y-1">
              <li>Double-click actor names to rename</li>
              <li>Use ↑↓ arrows to reorder messages</li>
              <li>Pick 4 message types: Call, Async, Return, Signal</li>
            </ul>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Node Palette</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">
          <span className="font-medium text-gray-500">Click</span> to add below last node &nbsp;·&nbsp;
          <span className="font-medium text-gray-500">Drag</span> to place anywhere
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
        {PALETTE.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            onClick={() => addNodeBelow(item.type, item.label)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer hover:shadow-sm active:scale-95 transition-all select-none"
            style={{
              backgroundColor: item.bgColor,
              borderColor: item.borderColor
            }}
          >
            <span className="text-lg w-6 text-center flex-shrink-0" style={{ color: item.borderColor }}>
              {item.icon}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-800">{item.label}</div>
              <div className="text-[10px] text-gray-500 leading-tight truncate">{item.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-100 text-[10px] text-gray-400 text-center space-y-1">
        <div>Start &amp; End are auto-placed on every flowchart</div>
        <div>Drop a node onto a line to insert it</div>
      </div>
    </aside>
  )
}
