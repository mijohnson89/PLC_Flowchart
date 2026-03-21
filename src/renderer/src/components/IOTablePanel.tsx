import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Plus, Trash2, Copy, Download, Upload, Search, X,
  ChevronDown, ChevronRight, Server, Pencil
} from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type { IOEntry, IOType, IORack } from '../types'
import { uid } from '../utils/uid'

const IO_TYPES: IOType[] = ['DI', 'DO', 'AI', 'AO', 'RTD', 'TC', '']

const IO_TYPE_COLORS: Record<IOType, { bg: string; text: string; border: string }> = {
  DI:  { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200' },
  DO:  { bg: 'bg-blue-50',     text: 'text-blue-700',     border: 'border-blue-200' },
  AI:  { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200' },
  AO:  { bg: 'bg-purple-50',   text: 'text-purple-700',   border: 'border-purple-200' },
  RTD: { bg: 'bg-rose-50',     text: 'text-rose-700',     border: 'border-rose-200' },
  TC:  { bg: 'bg-cyan-50',     text: 'text-cyan-700',     border: 'border-cyan-200' },
  '':  { bg: 'bg-gray-50',     text: 'text-gray-400',     border: 'border-gray-200' },
}

interface ColumnDef {
  key: keyof IOEntry
  label: string
  width: number
  align?: 'center' | 'right'
  type?: 'text' | 'ioType'
}

const COLUMNS: ColumnDef[] = [
  { key: 'slot',             label: 'Slot',              width: 60,  align: 'center' },
  { key: 'channel',          label: 'Channel',           width: 70,  align: 'center' },
  { key: 'drawingTag',       label: 'Drawing Tag',       width: 130 },
  { key: 'drawingReference', label: 'Drawing Ref',       width: 120 },
  { key: 'description1',     label: 'Description 1',     width: 180 },
  { key: 'description2',     label: 'Description 2',     width: 160 },
  { key: 'description3',     label: 'Description 3',     width: 160 },
  { key: 'ioType',           label: 'IO Type',           width: 80,  align: 'center', type: 'ioType' },
  { key: 'minRawScale',      label: 'Min Raw',           width: 80,  align: 'right' },
  { key: 'maxRawScale',      label: 'Max Raw',           width: 80,  align: 'right' },
  { key: 'minEUScale',       label: 'Min EU',            width: 80,  align: 'right' },
  { key: 'maxEUScale',       label: 'Max EU',            width: 80,  align: 'right' },
]

const ALL_EXPORT_COLS = ['Rack', ...COLUMNS.map((c) => c.label)]

function emptyEntry(rackId: string): IOEntry {
  return {
    id: uid('io'),
    rackId,
    slot: '', channel: '',
    drawingTag: '', drawingReference: '',
    description1: '', description2: '', description3: '',
    ioType: '' as IOType,
    minRawScale: '', maxRawScale: '',
    minEUScale: '', maxEUScale: ''
  }
}

// ── Small reusable components ────────────────────────────────────────────────

function IOTypeSelect({ value, onChange }: { value: IOType; onChange: (v: IOType) => void }) {
  const color = IO_TYPE_COLORS[value]
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as IOType)}
      className={`w-full h-full text-[11px] font-semibold text-center border-0 outline-none cursor-pointer appearance-none ${color.bg} ${color.text}`}
    >
      <option value="">—</option>
      {IO_TYPES.filter(Boolean).map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  )
}

function EditableCell({
  value, onChange, align, isSelected, onFocus,
}: {
  value: string
  onChange: (v: string) => void
  align?: 'center' | 'right'
  isSelected: boolean
  onFocus: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (isSelected) ref.current?.focus() }, [isSelected])

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      className={`w-full h-full px-2 text-[11px] border-0 outline-none bg-transparent focus:bg-indigo-50 transition-colors ${
        align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
      }`}
    />
  )
}

function InlineRename({ value, onCommit, onCancel }: {
  value: string; onCommit: (v: string) => void; onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.select() }, [])
  return (
    <input
      ref={ref}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { const t = draft.trim(); if (t) onCommit(t); else onCancel() }
        if (e.key === 'Escape') onCancel()
        e.stopPropagation()
      }}
      onBlur={() => { const t = draft.trim(); if (t && t !== value) onCommit(t); else onCancel() }}
      onClick={(e) => e.stopPropagation()}
      className="text-sm font-bold bg-white border border-indigo-400 rounded px-2 py-0.5 outline-none w-48"
    />
  )
}

// ── Rack section ─────────────────────────────────────────────────────────────

function RackSection({
  rack, entries, filter, filterType,
  selectedIds, activeCell, onSelectRow, onSetActiveCell,
}: {
  rack: IORack
  entries: IOEntry[]
  filter: string
  filterType: IOType | 'ALL'
  selectedIds: Set<string>
  activeCell: { rowId: string; colKey: string } | null
  onSelectRow: (id: string, shift: boolean) => void
  onSetActiveCell: (cell: { rowId: string; colKey: string }) => void
}) {
  const updateIORack = useDiagramStore((s) => s.updateIORack)
  const removeIORack = useDiagramStore((s) => s.removeIORack)
  const addIOEntry = useDiagramStore((s) => s.addIOEntry)
  const updateIOEntry = useDiagramStore((s) => s.updateIOEntry)
  const removeIOEntry = useDiagramStore((s) => s.removeIOEntry)

  const [collapsed, setCollapsed] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const filtered = useMemo(() => {
    let rows = entries
    if (filterType !== 'ALL') rows = rows.filter((e) => e.ioType === filterType)
    if (filter.trim()) {
      const q = filter.toLowerCase()
      rows = rows.filter((e) =>
        e.drawingTag.toLowerCase().includes(q) ||
        e.drawingReference.toLowerCase().includes(q) ||
        e.description1.toLowerCase().includes(q) ||
        e.description2.toLowerCase().includes(q) ||
        e.description3.toLowerCase().includes(q) ||
        e.slot.toLowerCase().includes(q) ||
        e.channel.toLowerCase().includes(q)
      )
    }
    return rows
  }, [entries, filter, filterType])

  const stats = useMemo(() => {
    const c: Record<string, number> = {}
    entries.forEach((e) => { if (e.ioType) c[e.ioType] = (c[e.ioType] || 0) + 1 })
    return c
  }, [entries])

  const handleAddRow = useCallback(() => {
    const entry = emptyEntry(rack.id)
    addIOEntry(entry)
    setCollapsed(false)
    setTimeout(() => onSetActiveCell({ rowId: entry.id, colKey: 'slot' }), 50)
  }, [rack.id, addIOEntry, onSetActiveCell])

  const handleDeleteRack = useCallback(() => {
    removeIORack(rack.id)
  }, [rack.id, removeIORack])

  return (
    <div className="border-b border-gray-200">
      {/* Rack header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-50 transition-colors">
        <button onClick={() => setCollapsed((v) => !v)} className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-600 rounded">
          {collapsed
            ? <ChevronRight size={14} className="text-gray-400" />
            : <ChevronDown size={14} className="text-gray-400" />
          }
        </button>
        <Server size={14} className="text-indigo-500 flex-shrink-0" />
        {renaming ? (
          <InlineRename
            value={rack.name}
            onCommit={(v) => { updateIORack(rack.id, { name: v }); setRenaming(false) }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <span
            className="text-sm font-bold text-gray-800 cursor-pointer hover:text-indigo-600 transition-colors"
            onDoubleClick={() => setRenaming(true)}
            title="Double-click to rename"
          >
            {rack.name}
          </span>
        )}

        <span className="text-[10px] text-gray-400 tabular-nums ml-1">
          {entries.length} channel{entries.length !== 1 ? 's' : ''}
        </span>

        {/* IO type mini-stats for this rack */}
        <div className="flex items-center gap-0.5 ml-2">
          {IO_TYPES.filter(Boolean).map((t) => {
            const count = stats[t]
            if (!count) return null
            const c = IO_TYPE_COLORS[t]
            return (
              <span key={t} className={`px-1 py-px rounded text-[9px] font-bold ${c.bg} ${c.text}`}>
                {t}:{count}
              </span>
            )
          })}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setRenaming(true)}
          className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"
          title="Rename rack"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={handleAddRow}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
        >
          <Plus size={10} /> Add Row
        </button>
        <button
          onClick={handleDeleteRack}
          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
          title="Delete rack and all its entries"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Table */}
      {!collapsed && (
        filtered.length === 0 ? (
          <div className="px-8 py-4 text-center">
            {entries.length === 0 ? (
              <button
                onClick={handleAddRow}
                className="text-[11px] text-gray-400 hover:text-indigo-600 transition-colors"
              >
                <Plus size={12} className="inline mr-1 -mt-0.5" />
                Add first channel to this rack
              </button>
            ) : (
              <span className="text-[11px] text-gray-400">No matching entries in this rack</span>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs w-full" style={{ minWidth: 'max-content' }}>
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="w-8 border-b border-r border-gray-200 px-1" />
                  <th className="w-10 border-b border-r border-gray-200 text-[10px] font-semibold text-gray-400 px-1">#</th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="border-b border-r border-gray-200 px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                      style={{ minWidth: col.width, textAlign: col.align ?? 'left' }}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="border-b border-gray-200 w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, rowIdx) => {
                  const isSelected = selectedIds.has(entry.id)
                  return (
                    <tr
                      key={entry.id}
                      className={`group transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50/60'}`}
                    >
                      <td className="border-b border-r border-gray-100 px-1 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => onSelectRow(entry.id, e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="border-b border-r border-gray-100 text-center text-[10px] text-gray-400 font-mono tabular-nums">
                        {rowIdx + 1}
                      </td>
                      {COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={`border-b border-r border-gray-100 p-0 ${
                            activeCell?.rowId === entry.id && activeCell?.colKey === col.key
                              ? 'ring-2 ring-inset ring-indigo-400' : ''
                          }`}
                          style={{ minWidth: col.width, height: 32 }}
                        >
                          {col.type === 'ioType' ? (
                            <IOTypeSelect
                              value={entry.ioType}
                              onChange={(v) => updateIOEntry(entry.id, { ioType: v })}
                            />
                          ) : (
                            <EditableCell
                              value={String(entry[col.key] ?? '')}
                              onChange={(v) => updateIOEntry(entry.id, { [col.key]: v })}
                              align={col.align}
                              isSelected={activeCell?.rowId === entry.id && activeCell?.colKey === col.key}
                              onFocus={() => onSetActiveCell({ rowId: entry.id, colKey: col.key })}
                            />
                          )}
                        </td>
                      ))}
                      <td className="border-b border-gray-100 px-1">
                        <button
                          onClick={() => removeIOEntry(entry.id)}
                          className="p-1 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete row"
                        >
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function IOTablePanel() {
  const ioRacks = useDiagramStore((s) => s.ioRacks)
  const ioEntries = useDiagramStore((s) => s.ioEntries)
  const addIORack = useDiagramStore((s) => s.addIORack)
  const addIOEntry = useDiagramStore((s) => s.addIOEntry)
  const removeIOEntry = useDiagramStore((s) => s.removeIOEntry)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeCell, setActiveCell] = useState<{ rowId: string; colKey: string } | null>(null)
  const [filter, setFilter] = useState('')
  const [filterType, setFilterType] = useState<IOType | 'ALL'>('ALL')

  const entriesByRack = useMemo(() => {
    const map = new Map<string, IOEntry[]>()
    ioRacks.forEach((r) => map.set(r.id, []))
    ioEntries.forEach((e) => {
      const list = map.get(e.rackId)
      if (list) list.push(e)
    })
    return map
  }, [ioRacks, ioEntries])

  const globalStats = useMemo(() => {
    const counts: Record<string, number> = {}
    ioEntries.forEach((e) => { if (e.ioType) counts[e.ioType] = (counts[e.ioType] || 0) + 1 })
    return counts
  }, [ioEntries])

  const handleAddRack = useCallback(() => {
    const num = ioRacks.length
    addIORack(`Rack ${num}`)
  }, [ioRacks.length, addIORack])

  const handleRowSelect = useCallback((id: string, shift: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shift) { if (next.has(id)) next.delete(id); else next.add(id) }
      else { if (next.has(id) && next.size === 1) next.delete(id); else { next.clear(); next.add(id) } }
      return next
    })
  }, [])

  const handleDuplicate = useCallback(() => {
    selectedIds.forEach((id) => {
      const src = ioEntries.find((e) => e.id === id)
      if (src) addIOEntry({ ...src, id: uid('io') })
    })
  }, [selectedIds, ioEntries, addIOEntry])

  const handleDeleteSelected = useCallback(() => {
    selectedIds.forEach((id) => removeIOEntry(id))
    setSelectedIds(new Set())
  }, [selectedIds, removeIOEntry])

  const handleExportCSV = useCallback(() => {
    const rackMap = new Map(ioRacks.map((r) => [r.id, r.name]))
    const header = ALL_EXPORT_COLS.join(',')
    const rows = ioEntries.map((e) => {
      const vals = [rackMap.get(e.rackId) ?? '', ...COLUMNS.map((c) => String(e[c.key] ?? ''))]
      return vals.map((v) => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v).join(',')
    })
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'io-table.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [ioRacks, ioEntries])

  const handleImportCSV = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      const lines = text.split('\n').filter(Boolean)
      if (lines.length < 2) return

      const rackMap = new Map(ioRacks.map((r) => [r.name.toLowerCase(), r.id]))
      const colKeys = COLUMNS.map((c) => c.key)

      for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i])
        const rackName = vals[0]?.trim() ?? `Rack ${ioRacks.length}`
        let rackId = rackMap.get(rackName.toLowerCase())
        if (!rackId) {
          rackId = addIORack(rackName)
          rackMap.set(rackName.toLowerCase(), rackId)
        }
        const entry = emptyEntry(rackId)
        colKeys.forEach((key, idx) => {
          if (vals[idx + 1] !== undefined) (entry as Record<string, string>)[key] = vals[idx + 1]
        })
        addIOEntry(entry)
      }
    }
    input.click()
  }, [ioRacks, addIORack, addIOEntry])

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-white">

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleAddRack}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <Server size={12} /> Add Rack
          </button>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={handleDuplicate}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Copy size={11} /> Duplicate
              </button>
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors"
              >
                <Trash2 size={11} /> Delete ({selectedIds.size})
              </button>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* IO type stats */}
        <div className="flex items-center gap-1 mr-2">
          {IO_TYPES.filter(Boolean).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType((prev) => prev === t ? 'ALL' : t)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                filterType === t
                  ? `${IO_TYPE_COLORS[t].bg} ${IO_TYPE_COLORS[t].text} ${IO_TYPE_COLORS[t].border} ring-1 ring-offset-1 ring-indigo-300`
                  : `${IO_TYPE_COLORS[t].bg} ${IO_TYPE_COLORS[t].text} ${IO_TYPE_COLORS[t].border} opacity-60 hover:opacity-100`
              }`}
            >
              {t} <span className="font-normal">{globalStats[t] || 0}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-7 pr-7 py-1.5 text-[11px] border border-gray-200 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          />
          {filter && (
            <button onClick={() => setFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={11} />
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <button
          onClick={handleImportCSV}
          className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Import from CSV"
        >
          <Upload size={11} /> Import
        </button>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Export to CSV"
        >
          <Download size={11} /> Export
        </button>

        <span className="text-[10px] text-gray-400 tabular-nums ml-1">
          {ioRacks.length} rack{ioRacks.length !== 1 ? 's' : ''} · {ioEntries.length} row{ioEntries.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Content */}
      {ioRacks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <Server size={28} className="text-indigo-300" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">No IO racks yet</h3>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Add a rack to start defining your IO mappings. Each rack contains slots and channels.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleAddRack}
                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <Server size={13} /> Add First Rack
              </button>
              <button
                onClick={handleImportCSV}
                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <Upload size={13} /> Import CSV
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {ioRacks.map((rack) => (
            <RackSection
              key={rack.id}
              rack={rack}
              entries={entriesByRack.get(rack.id) ?? []}
              filter={filter}
              filterType={filterType}
              selectedIds={selectedIds}
              activeCell={activeCell}
              onSelectRow={handleRowSelect}
              onSetActiveCell={setActiveCell}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else current += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { result.push(current); current = '' }
      else current += ch
    }
  }
  result.push(current)
  return result
}
