import { useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useDiagramStore, selectActiveTab } from '../store/diagramStore'
import type { FlowPhase } from '../types'

/**
 * Flowchart-only sidebar: define phases for the active tab and assign them to steps in the matrix.
 */
export function PhasesPanel() {
  const activeTab = useDiagramStore(selectActiveTab)
  const pushHistory = useDiagramStore((s) => s.pushHistory)
  const addPhase = useDiagramStore((s) => s.addPhase)
  const updatePhase = useDiagramStore((s) => s.updatePhase)
  const removePhase = useDiagramStore((s) => s.removePhase)

  const phases = activeTab?.phases ?? []
  const readOnly = useDiagramStore((s) => s.viewingRevisionId !== null)

  const onNameBlur = useCallback(() => {
    pushHistory()
  }, [pushHistory])

  const onRemove = useCallback(
    (p: FlowPhase) => {
      if (!confirm(`Remove phase “${p.name}” from this sequence? Step assignments will be cleared for this phase.`)) return
      removePhase(p.id)
    },
    [removePhase]
  )

  if (!activeTab || activeTab.type !== 'flowchart') return null

  return (
    <div className="flex flex-col border-t border-gray-200 bg-white flex-shrink-0 max-h-[min(38vh,260px)] min-h-0">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2 flex-shrink-0">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Phases</h2>
        {!readOnly && (
          <button
            type="button"
            onClick={() => addPhase()}
            className="p-0.5 text-gray-400 hover:text-indigo-600 rounded transition-colors"
            title="Add phase"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 min-h-0">
        {phases.length === 0 && (
          <p className="text-[10px] text-gray-400 leading-snug px-1">
            Add phases (e.g. Cleaning, Discharge). Toggle them on each step in the matrix.
          </p>
        )}
        {phases.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50/80 px-1.5 py-1"
          >
            {!readOnly && (
              <label className="shrink-0 cursor-pointer" title="Color">
                <input
                  type="color"
                  value={p.color ?? '#6366f1'}
                  onChange={(e) => {
                    updatePhase(p.id, { color: e.target.value })
                    pushHistory()
                  }}
                  className="w-5 h-5 rounded border border-gray-200 p-0 cursor-pointer overflow-hidden"
                />
              </label>
            )}
            {readOnly && (
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-gray-200"
                style={{ background: p.color ?? '#94a3b8' }}
              />
            )}
            <input
              disabled={readOnly}
              className="flex-1 min-w-0 text-[11px] border border-transparent rounded px-1 py-0.5 bg-white disabled:bg-transparent disabled:opacity-70"
              value={p.name}
              onChange={(e) => updatePhase(p.id, { name: e.target.value })}
              onBlur={onNameBlur}
            />
            {!readOnly && (
              <button
                type="button"
                className="shrink-0 p-0.5 text-gray-400 hover:text-red-600 rounded"
                title="Remove phase"
                onClick={() => onRemove(p)}
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
