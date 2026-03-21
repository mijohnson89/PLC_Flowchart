import { Handle, Position } from '@xyflow/react'
import { Link2 } from 'lucide-react'
import type { PackMLCategory } from '../../types'
import { useDiagramStore } from '../../store/diagramStore'

export interface StateTag {
  label: string
  category: PackMLCategory
  bgColor: string
  textColor: string
  borderColor: string
}

export interface BaseNodeConfig {
  color: string          // accent color (hex)
  typeLabel: string      // e.g. "STEP", "OUTPUT"
  selected?: boolean
  label: string
  sublabel?: string      // secondary line (condition, tag, routine…)
  badge?: string         // small top-left badge (e.g. step number)
  stateTag?: StateTag    // PackML state badge (step nodes only)
  leftHandles?: boolean  // add left + right handles (for actor)
  noTarget?: boolean     // start node has no target
  noSource?: boolean     // end node has no source
  linkedTabId?: string   // cross-diagram anchor target tab
  linkedNodeId?: string  // cross-diagram anchor target node (optional)
}

export function BaseNode({
  color, typeLabel, selected,
  label, sublabel, badge, stateTag,
  leftHandles, noTarget, noSource,
  linkedTabId, linkedNodeId
}: BaseNodeConfig) {
  const selectionRing = selected
    ? 'ring-2 ring-offset-1 ring-blue-400'
    : ''

  function handleLinkClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!linkedTabId) return
    const store = useDiagramStore.getState()
    store.setActiveTab(linkedTabId)
    if (linkedNodeId) store.setPendingFocusNodeId(linkedNodeId)
  }

  return (
    <div
      className={`relative min-w-[152px] max-w-[220px] bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 ${selectionRing}`}
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      {/* Cross-diagram anchor badge — top-right corner */}
      {linkedTabId && (
        <button
          className="absolute top-1 right-1 z-10 flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors leading-none nodrag nopan"
          onClick={handleLinkClick}
          title="Navigate to linked diagram"
        >
          <Link2 size={8} />
        </button>
      )}

      {/* Coloured type-label header strip */}
      <div
        className="flex items-center justify-between px-2.5 pt-1.5 pb-1"
        style={{ backgroundColor: `${color}18` }}
      >
        <span
          className="text-[9px] font-bold uppercase tracking-widest"
          style={{ color }}
        >
          {typeLabel}
        </span>

        {badge !== undefined && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white leading-none"
            style={{ backgroundColor: color }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Main label */}
      <div className="px-3 py-2 text-sm font-semibold text-gray-800 leading-snug text-center">
        {label || typeLabel}
      </div>

      {/* PackML state badge */}
      {stateTag && (
        <div className="px-3 pb-1.5 flex justify-center">
          <span
            className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest border ${
              stateTag.category === 'acting' ? 'italic' : ''
            }`}
            style={{
              backgroundColor: stateTag.bgColor,
              color: stateTag.textColor,
              borderColor: stateTag.borderColor
            }}
          >
            {/* Dot indicator — filled for wait, animated ring for acting */}
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                stateTag.category === 'acting' ? 'animate-pulse' : ''
              }`}
              style={{ backgroundColor: stateTag.borderColor }}
            />
            {stateTag.label}
          </span>
        </div>
      )}

      {/* Optional sublabel */}
      {sublabel && (
        <div className="px-3 pb-2 text-[11px] text-center font-mono text-gray-500 border-t border-gray-100 pt-1 leading-snug">
          {sublabel}
        </div>
      )}

      {/* Handles */}
      {!noTarget && <Handle type="target" position={Position.Top} />}
      {!noSource && <Handle type="source" position={Position.Bottom} />}
      {leftHandles && (
        <>
          <Handle type="target" position={Position.Left}  id="left" />
          <Handle type="source" position={Position.Right} id="right" />
        </>
      )}
      {/* Side handles for backward-flow edges (L5K imports, etc.) */}
      {!noSource && <Handle type="source" position={Position.Right} id="right-source" style={{ opacity: 0, width: 4, height: 4 }} />}
      {!noTarget && <Handle type="target" position={Position.Right} id="right-target" style={{ opacity: 0, width: 4, height: 4 }} />}
    </div>
  )
}
