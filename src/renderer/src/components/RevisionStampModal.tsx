import { useState, useEffect, useRef } from 'react'
import { X, GitCommitHorizontal } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'

const AUTHOR_KEY = 'plc-uml-last-author'

interface Props {
  onClose: () => void
}

export function RevisionStampModal({ onClose }: Props) {
  const { createRevision, tabs, activeTabId } = useDiagramStore()
  const nextRevisionNumber =
    (tabs.find((t) => t.id === activeTabId)?.revisions.length ?? 0) + 1

  const [author, setAuthor] = useState(() => localStorage.getItem(AUTHOR_KEY) ?? '')
  const [description, setDescription] = useState('')
  const authorRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    authorRef.current?.focus()
  }, [])

  function handleSubmit() {
    const trimAuthor = author.trim()
    if (!trimAuthor) return
    localStorage.setItem(AUTHOR_KEY, trimAuthor)
    createRevision(trimAuthor, description.trim() || undefined)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-96 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <GitCommitHorizontal size={16} className="text-emerald-600" />
            <span className="font-semibold text-gray-800 text-sm">Stamp Revision</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5">Revision number</p>
            <p className="text-sm font-semibold text-emerald-900 tabular-nums">
              {nextRevisionNumber}
              <span className="text-xs font-normal text-emerald-700 ml-1">(assigned automatically)</span>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Author <span className="text-red-500">*</span>
            </label>
            <input
              ref={authorRef}
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Your name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Change Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what changed in this revision…"
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!author.trim()}
            className="px-4 py-1.5 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Stamp revision {nextRevisionNumber}
          </button>
        </div>
      </div>
    </div>
  )
}
