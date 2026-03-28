import { Handle, Position } from '@xyflow/react'
import { Link2, ArrowRight } from 'lucide-react'
import type { PackMLCategory, StepLink, PLCNodeData } from '../../types'
import { useDiagramStore, selectFlowNodes } from '../../store/diagramStore'

export interface StateTag {
  label: string
  category: PackMLCategory
  bgColor: string
  textColor: string
  borderColor: string
}

export interface BaseNodeConfig {
  color: string
  typeLabel: string
  selected?: boolean
  label: string
  sublabel?: string
  badge?: string
  stateTag?: StateTag
  leftHandles?: boolean
  noTarget?: boolean
  noSource?: boolean
  linkedTabId?: string
  linkedNodeId?: string
  stepLinks?: StepLink[]
}

export function BaseNode({
  color, typeLabel, selected,
  label, sublabel, badge, stateTag,
  leftHandles, noTarget, noSource,
  linkedTabId, linkedNodeId, stepLinks
}: BaseNodeConfig) {
  const flowNodes = useDiagramStore(selectFlowNodes)
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

  function handleStepLinkClick(e: React.MouseEvent, targetNodeId: string) {
    e.stopPropagation()
    const store = useDiagramStore.getState()
    store.setPendingFocusNodeId(targetNodeId)
  }

  function resolveLabel(nodeId: string): string {
    const node = flowNodes.find((n) => n.id === nodeId)
    if (!node) return '???'
    const d = node.data as PLCNodeData
    return d.label || node.type || nodeId
  }

  const activeLinks = stepLinks?.filter((l) => flowNodes.some((n) => n.id === l.targetNodeId))

  return (
    <div
      className={`relative min-w-[152px] max-w-[220px] bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 ${selectionRing}`}
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      {linkedTabId && (
        <button
          className="absolute top-1 right-1 z-10 flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors leading-none nodrag nopan"
          onClick={handleLinkClick}
          title="Navigate to linked diagram"
        >
          <Link2 size={8} />
        </button>
      )}

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

      <div className="px-3 py-2 text-sm font-semibold text-gray-800 leading-snug text-center">
        {label || typeLabel}
      </div>

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

      {sublabel && (
        <div className="px-3 pb-2 text-[11px] text-center font-mono text-gray-500 border-t border-gray-100 pt-1 leading-snug">
          {sublabel}
        </div>
      )}

      {activeLinks && activeLinks.length > 0 && (
        <div className="border-t border-gray-100 px-1.5 py-1 space-y-1">
          {activeLinks.map((link) => (
            <button
              key={link.id}
              onClick={(e) => handleStepLinkClick(e, link.targetNodeId)}
              className="nodrag nopan w-full flex flex-col items-stretch gap-0.5 px-1.5 py-0.5 rounded text-left hover:bg-blue-50 transition-colors group/link"
              title={`${link.reason ? `${link.reason} → ` : ''}${resolveLabel(link.targetNodeId)}`}
            >
              {link.reason && link.reason.trim() && (
                <span className="text-[9px] font-semibold text-gray-800 leading-tight w-full truncate">
                  {link.reason.trim()}
                </span>
              )}
              <div className="flex items-center gap-1 min-w-0 w-full">
                <ArrowRight size={8} className="text-blue-500 flex-shrink-0 group-hover/link:translate-x-0.5 transition-transform" />
                <span className="text-[9px] font-semibold text-blue-600 truncate">{resolveLabel(link.targetNodeId)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {!noTarget && <Handle type="target" position={Position.Top} />}
      {!noSource && <Handle type="source" position={Position.Bottom} />}
      {leftHandles && (
        <>
          <Handle type="target" position={Position.Left}  id="left" />
          <Handle type="source" position={Position.Right} id="right" />
        </>
      )}
      {!noSource && <Handle type="source" position={Position.Right} id="right-source" style={{ opacity: 0, width: 4, height: 4 }} />}
      {!noTarget && <Handle type="target" position={Position.Right} id="right-target" style={{ opacity: 0, width: 4, height: 4 }} />}
    </div>
  )
}
