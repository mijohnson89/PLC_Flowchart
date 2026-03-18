import { useState } from 'react'
import { History, Lock, Eye, Plus, ChevronDown, ChevronUp, ArrowLeftCircle } from 'lucide-react'
import { useDiagramStore, selectRevisions, selectIsViewingRevision } from '../store/diagramStore'
import type { Revision } from '../types'
import { RevisionStampModal } from './RevisionStampModal'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

interface RevisionCardProps {
  revision: Revision
  isViewing: boolean
  isLatest: boolean
  onView: () => void
}

function RevisionCard({ revision, isViewing, isLatest, onView }: RevisionCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`rounded-lg border text-xs transition-all ${
        isViewing
          ? 'border-amber-400 bg-amber-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-2 p-2.5">
        {/* Timeline dot */}
        <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
          <div className={`w-2.5 h-2.5 rounded-full border-2 ${
            isLatest
              ? 'bg-emerald-500 border-emerald-500'
              : isViewing
                ? 'bg-amber-400 border-amber-400'
                : 'bg-white border-gray-300'
          }`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="font-semibold text-gray-800 truncate">{revision.name}</span>
            {isViewing && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                <Eye size={9} /> Viewing
              </span>
            )}
          </div>

          <div className="text-gray-500 mt-0.5">
            <span className="font-medium text-gray-600">{revision.author}</span>
            <span className="mx-1 text-gray-300">·</span>
            {formatDate(revision.date)}
          </div>

          {revision.description && (
            <div className="mt-1">
              <button
                className="flex items-center gap-0.5 text-gray-400 hover:text-gray-600"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                <span>{expanded ? 'Hide' : 'Show'} notes</span>
              </button>
              {expanded && (
                <p className="mt-1 text-gray-500 bg-gray-50 rounded p-1.5 leading-relaxed border border-gray-100">
                  {revision.description}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 px-2.5 py-1.5 flex justify-end">
        {isViewing ? (
          <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
            <Lock size={10} /> Read-only snapshot
          </span>
        ) : (
          <button
            onClick={onView}
            className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-medium"
          >
            <Eye size={10} /> View this revision
          </button>
        )}
      </div>
    </div>
  )
}

export function RevisionPanel() {
  const revisions = useDiagramStore(selectRevisions)
  const isViewingRevision = useDiagramStore(selectIsViewingRevision)
  const viewingRevisionId = useDiagramStore((s) => s.viewingRevisionId)
  const { setViewingRevision } = useDiagramStore()
  const [stampOpen, setStampOpen] = useState(false)

  // Show newest first
  const sorted = [...revisions].reverse()

  return (
    <aside className="w-64 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <History size={14} className="text-gray-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Revisions</h2>
        </div>
        <button
          onClick={() => setStampOpen(true)}
          title="Stamp a new revision"
          className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white text-[10px] font-semibold rounded hover:bg-emerald-700 transition-colors"
        >
          <Plus size={10} /> Stamp
        </button>
      </div>

      {/* Viewing-revision banner */}
      {isViewingRevision && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          <Lock size={12} className="text-amber-600 flex-shrink-0" />
          <span className="text-[10px] text-amber-700 font-medium leading-tight flex-1">
            Viewing read-only snapshot
          </span>
          <button
            onClick={() => setViewingRevision(null)}
            className="flex items-center gap-0.5 text-[10px] text-amber-700 hover:text-amber-900 font-semibold whitespace-nowrap"
          >
            <ArrowLeftCircle size={11} /> Back
          </button>
        </div>
      )}

      {/* Revision list */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
        {/* Current state entry */}
        <div className={`rounded-lg border text-xs transition-all ${
          !isViewingRevision
            ? 'border-emerald-400 bg-emerald-50 shadow-sm'
            : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex items-start gap-2 p-2.5">
            <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
              <div className={`w-2.5 h-2.5 rounded-full border-2 ${
                !isViewingRevision
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'bg-white border-gray-300'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">Current</span>
                {!isViewingRevision && (
                  <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                    <Eye size={9} /> Active
                  </span>
                )}
              </div>
              <div className="text-gray-400 mt-0.5">Live working state</div>
            </div>
          </div>
          {isViewingRevision && (
            <div className="border-t border-gray-100 px-2.5 py-1.5 flex justify-end">
              <button
                onClick={() => setViewingRevision(null)}
                className="flex items-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-900 font-medium"
              >
                <Eye size={10} /> Return to current
              </button>
            </div>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <History size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-[10px] leading-relaxed">
              No revisions yet.<br />
              Click <strong>Stamp</strong> to save a snapshot.
            </p>
          </div>
        ) : (
          sorted.map((rev, idx) => (
            <RevisionCard
              key={rev.id}
              revision={rev}
              isViewing={viewingRevisionId === rev.id}
              isLatest={idx === 0}
              onView={() => setViewingRevision(rev.id)}
            />
          ))
        )}
      </div>

      {stampOpen && <RevisionStampModal onClose={() => setStampOpen(false)} />}
    </aside>
  )
}
