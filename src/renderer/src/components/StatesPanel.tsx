import { useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useDiagramStore, selectActiveTab } from '../store/diagramStore'
import type { FlowStateItem, PackMLCategory } from '../types'

/**
 * Flowchart-only sidebar: define custom step states for the active tab (built-in reference states stay in the matrix/properties).
 */
export function StatesPanel() {
  const activeTab = useDiagramStore(selectActiveTab)
  const pushHistory = useDiagramStore((s) => s.pushHistory)
  const addFlowState = useDiagramStore((s) => s.addFlowState)
  const updateFlowState = useDiagramStore((s) => s.updateFlowState)
  const removeFlowState = useDiagramStore((s) => s.removeFlowState)

  const flowStates = activeTab?.flowStates ?? []
  const readOnly = useDiagramStore((s) => s.viewingRevisionId !== null)

  const onNameBlur = useCallback(() => {
    pushHistory()
  }, [pushHistory])

  const onRemove = useCallback(
    (st: FlowStateItem) => {
      if (!confirm(`Remove state “${st.name}”? Steps using it will have the state cleared.`)) return
      removeFlowState(st.id)
    },
    [removeFlowState]
  )

  if (!activeTab || activeTab.type !== 'flowchart') return null

  return (
    <div className="flex flex-col border-t border-gray-200 bg-white flex-shrink-0 max-h-[min(32vh,220px)] min-h-0">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2 flex-shrink-0">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">States</h2>
        {!readOnly && (
          <button
            type="button"
            onClick={() => addFlowState()}
            className="p-0.5 text-gray-400 hover:text-indigo-600 rounded transition-colors"
            title="Add custom state"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 min-h-0">
        <p className="text-[10px] text-gray-400 leading-snug px-1">
          Reference states (Idle, Execute, …) are always available in the matrix. Add your own labels here.
        </p>
        {flowStates.length === 0 && (
          <p className="text-[10px] text-gray-400 leading-snug px-1">
            No custom states yet. Use + to add one, then pick it on each step.
          </p>
        )}
        {flowStates.map((st) => (
          <div
            key={st.id}
            className="flex items-center gap-1 rounded-lg border border-gray-100 bg-gray-50/80 px-1.5 py-1"
          >
            {!readOnly && (
              <label className="shrink-0 cursor-pointer" title="Color">
                <input
                  type="color"
                  value={st.color ?? '#6366f1'}
                  onChange={(e) => {
                    updateFlowState(st.id, { color: e.target.value })
                    pushHistory()
                  }}
                  className="w-5 h-5 rounded border border-gray-200 p-0 cursor-pointer overflow-hidden"
                />
              </label>
            )}
            {readOnly && (
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-gray-200"
                style={{ background: st.color ?? '#94a3b8' }}
              />
            )}
            <input
              disabled={readOnly}
              className="flex-1 min-w-0 text-[11px] border border-transparent rounded px-1 py-0.5 bg-white disabled:bg-transparent disabled:opacity-70"
              value={st.name}
              onChange={(e) => updateFlowState(st.id, { name: e.target.value })}
              onBlur={onNameBlur}
            />
            <select
              disabled={readOnly}
              className="shrink-0 text-[9px] border border-gray-200 rounded px-0.5 py-0.5 bg-white max-w-[76px] disabled:opacity-60"
              title="Stable vs transitional styling"
              value={st.category ?? 'wait'}
              onChange={(e) => {
                updateFlowState(st.id, { category: e.target.value as PackMLCategory })
                pushHistory()
              }}
            >
              <option value="wait">Stable</option>
              <option value="acting">Moving</option>
            </select>
            {!readOnly && (
              <button
                type="button"
                className="shrink-0 p-0.5 text-gray-400 hover:text-red-600 rounded"
                title="Remove state"
                onClick={() => onRemove(st)}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
