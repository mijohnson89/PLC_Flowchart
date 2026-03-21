import { useState } from 'react'
import { FileText, RotateCcw, X, ChevronDown } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type { PageSizeKey, PageOrientation } from '../types'
import { PAGE_SIZES } from '../types'

const SIZE_KEYS = Object.keys(PAGE_SIZES) as PageSizeKey[]

interface Props {
  readOnly?: boolean
}

export function PageSizeControl({ readOnly = false }: Props) {
  const pageSize        = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.pageSize ?? null)
  const pageOrientation = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.pageOrientation ?? 'portrait')
  const { setPageSettings } = useDiagramStore()

  const [open, setOpen] = useState(false)

  function selectSize(key: PageSizeKey | null) {
    setPageSettings(key, pageOrientation)
    setOpen(false)
  }

  function toggleOrientation() {
    setPageSettings(pageSize, pageOrientation === 'portrait' ? 'landscape' : 'portrait')
  }

  return (
    <>
      <div className="relative">
          <button
            onClick={() => !readOnly && setOpen((p) => !p)}
            title="Set page size"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shadow transition-all border
              ${pageSize
                ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'
              }
              ${readOnly ? 'opacity-60 cursor-default' : ''}`}
          >
            <FileText size={13} />
            <span>{pageSize ?? 'Page'}</span>
            <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          {open && !readOnly && (
            <div className="absolute top-full right-0 mt-1 w-36 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50">
              <div className="px-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-gray-400">Paper Size</div>

              {/* None option */}
              <button
                onClick={() => selectSize(null)}
                className={`w-full text-left text-xs px-3 py-1.5 flex items-center gap-2 transition-colors
                  ${!pageSize ? 'text-indigo-600 bg-indigo-50 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <X size={11} className="flex-shrink-0" />
                None
              </button>

              <div className="h-px bg-gray-100 my-1" />

              {SIZE_KEYS.map((key) => {
                const { widthMm, heightMm } = PAGE_SIZES[key]
                return (
                  <button
                    key={key}
                    onClick={() => selectSize(key)}
                    className={`w-full text-left text-xs px-3 py-1.5 flex items-center justify-between transition-colors
                      ${pageSize === key ? 'text-indigo-600 bg-indigo-50 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    <span className="font-medium">{key}</span>
                    <span className="text-[10px] text-gray-400">{widthMm}×{heightMm}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Orientation toggle (only visible when a size is selected) ── */}
        {pageSize && (
          <button
            onClick={() => !readOnly && toggleOrientation()}
            title={`Switch to ${pageOrientation === 'portrait' ? 'landscape' : 'portrait'}`}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium shadow border bg-white
              ${readOnly
                ? 'text-gray-400 border-gray-200 cursor-default opacity-60'
                : 'text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'}`}
          >
            <RotateCcw size={12} className={pageOrientation === 'landscape' ? 'rotate-90' : ''} />
            <span className="hidden sm:block">
              {pageOrientation === 'portrait' ? 'Portrait' : 'Landscape'}
            </span>
          </button>
        )}

      {/* Click-away to close dropdown */}
      {open && !readOnly && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  )
}
