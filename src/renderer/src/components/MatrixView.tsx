import { useMemo, useRef, useState, useEffect } from 'react'
import {
  Grid3x3, AlertCircle, Network, Check, EyeOff,
  ChevronDown, ChevronRight, Building2, LayoutGrid, MapPin, Layers
} from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type { InterfaceField, InterfaceType, MatrixCellValue, PackMLState } from '../types'
import { PACKML_STATES } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNumericType(dt: string): boolean {
  return /^(SINT|INT|DINT|LINT|USINT|UINT|UDINT|ULINT|REAL|LREAL|BYTE|WORD|DWORD)/.test(dt)
}

function isControllableField(field: InterfaceField, ifaceType: InterfaceType): boolean {
  if (ifaceType === 'UDT') return true
  return field.usage === 'Input' || field.usage === 'InOut'
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatrixCol {
  key: string
  interfaceId: string
  interfaceName: string
  interfaceType: InterfaceType
  instanceId: string
  instanceName: string
  tagName: string
  fieldId: string
  fieldName: string
  dataType: string
  isNumeric: boolean
}

interface MatrixRow {
  nodeId: string
  stepNumber?: number
  stepLabel: string
  packMLState?: PackMLState
}

interface SidebarInstance {
  instanceId: string
  instanceName: string
  tagName: string
  interfaceId: string
  interfaceName: string
  interfaceType: InterfaceType
  fieldCount: number
  locationId?: string
}

// ── Span helper ───────────────────────────────────────────────────────────────

interface Span<T> { data: T; count: number }

function computeSpans<T, K>(items: T[], keyFn: (item: T) => K): Span<T>[] {
  const spans: Span<T>[] = []
  items.forEach((item) => {
    const key = keyFn(item)
    const last = spans[spans.length - 1]
    if (last && keyFn(last.data) === key) last.count++
    else spans.push({ data: item, count: 1 })
  })
  return spans
}

// ── Bool cell ─────────────────────────────────────────────────────────────────

function BoolCell({ value, onChange }: { value: MatrixCellValue; onChange: (v: MatrixCellValue) => void }) {
  const isOn  = value === true
  const isOff = value === false
  function cycle() {
    if (value === null || value === undefined) onChange(true)
    else if (value === true) onChange(false)
    else onChange(null)
  }
  return (
    <button
      onClick={cycle}
      title={isOn ? 'ON — click to set OFF' : isOff ? 'OFF — click to clear' : 'No action — click to set ON'}
      className={`
        w-7 h-7 rounded flex items-center justify-center text-[11px] font-bold
        border transition-all select-none
        ${isOn  ? 'bg-emerald-500 border-emerald-600 text-white shadow-sm' :
          isOff ? 'bg-red-400 border-red-500 text-white shadow-sm' :
                  'bg-white border-gray-200 text-gray-300 hover:border-indigo-300 hover:text-indigo-400'}
      `}
    >
      {isOn ? '1' : isOff ? '0' : '·'}
    </button>
  )
}

// ── Numeric cell ──────────────────────────────────────────────────────────────

function NumericCell({ value, onChange }: { value: MatrixCellValue; onChange: (v: MatrixCellValue) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <input
      ref={inputRef}
      type="number"
      className={`
        w-16 h-7 text-center text-[11px] font-mono border rounded px-1
        focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 transition-colors
        ${value !== null && value !== undefined
          ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
          : 'bg-white border-gray-200 text-gray-400'}
      `}
      placeholder="—"
      value={value !== null && value !== undefined ? String(value) : ''}
      onChange={(e) => {
        const raw = e.target.value
        onChange(raw === '' ? null : Number(raw))
      }}
    />
  )
}

// ── PackML badge ──────────────────────────────────────────────────────────────

function PackMLBadge({ state }: { state: PackMLState }) {
  const def = PACKML_STATES[state]
  if (!def) return null
  return (
    <span
      className="inline-block px-1.5 py-px rounded text-[9px] font-semibold border"
      style={{ background: def.bgColor, color: def.textColor, borderColor: def.borderColor }}
    >
      {def.label}
    </span>
  )
}

// ── Instance checkbox row ─────────────────────────────────────────────────────

function InstanceRow({
  inst,
  checked,
  isUsed,
  onToggle
}: {
  inst: SidebarInstance
  checked: boolean
  isUsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2 pl-6 pr-2 py-1.5 hover:bg-indigo-50 transition-colors border-b border-gray-50 ${
        checked ? '' : 'opacity-45'
      }`}
    >
      <span className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'
      }`}>
        {checked && <Check size={8} className="text-white" />}
      </span>
      <div className="flex flex-col items-start min-w-0 flex-1">
        <span className="text-[11px] font-medium text-gray-800 truncate w-full text-left leading-tight">
          {inst.instanceName}
        </span>
        <span className="font-mono text-[9px] text-gray-400 truncate w-full text-left leading-tight">
          {inst.tagName}
        </span>
      </div>
      {isUsed && (
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" title="Has values in this sequence" />
      )}
    </button>
  )
}

// ── Interface-type group (within a location or the unassigned bucket) ─────────

function IfaceGroupSection({
  interfaceId,
  interfaceName,
  interfaceType,
  instances,
  hiddenInstanceIds,
  usedInstanceIds,
  onToggle
}: {
  interfaceId: string
  interfaceName: string
  interfaceType: InterfaceType
  instances: SidebarInstance[]
  hiddenInstanceIds: Set<string>
  usedInstanceIds: Set<string>
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const allChecked  = instances.every((i) => !hiddenInstanceIds.has(i.instanceId))
  const noneChecked = instances.every((i) =>  hiddenInstanceIds.has(i.instanceId))

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 pl-4 pr-2 py-1 bg-gray-50 hover:bg-gray-100 border-b border-gray-100 transition-colors"
      >
        {open ? <ChevronDown size={10} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={10} className="text-gray-400 flex-shrink-0" />}
        {/* tri-state master checkbox */}
        <span
          className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${
            allChecked ? 'bg-indigo-600 border-indigo-600' : noneChecked ? 'bg-white border-gray-300' : 'bg-indigo-200 border-indigo-400'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            instances.forEach((i) => {
              const hidden = hiddenInstanceIds.has(i.instanceId)
              if (allChecked ? !hidden : hidden) onToggle(i.instanceId)
            })
          }}
        >
          {!noneChecked && <Check size={7} className="text-white" />}
        </span>
        <span className={`text-[9px] font-bold px-1 py-px rounded leading-none ${
          interfaceType === 'AOI' ? 'bg-orange-100 text-orange-700' : 'bg-cyan-100 text-cyan-700'
        }`}>
          {interfaceType}
        </span>
        <span className="text-[10px] font-semibold text-gray-700 truncate flex-1 text-left">{interfaceName}</span>
        <span className="text-[9px] text-gray-400 flex-shrink-0">{instances.length}</span>
      </button>

      {open && instances.map((inst) => (
        <InstanceRow
          key={inst.instanceId}
          inst={inst}
          checked={!hiddenInstanceIds.has(inst.instanceId)}
          isUsed={usedInstanceIds.has(inst.instanceId)}
          onToggle={() => onToggle(inst.instanceId)}
        />
      ))}
    </div>
  )
}

// ── Tree node renderer ────────────────────────────────────────────────────────

function LocationSection({
  locationId,
  locationName,
  instances,
  hiddenInstanceIds,
  usedInstanceIds,
  onToggle
}: {
  locationId: string
  locationName: string
  instances: SidebarInstance[]
  hiddenInstanceIds: Set<string>
  usedInstanceIds: Set<string>
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const ifaceGroups = computeSpans(
    [...instances].sort((a, b) => a.interfaceName.localeCompare(b.interfaceName)),
    (i) => i.interfaceId
  )

  return (
    <div className="ml-3 border-l border-gray-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-gray-50 transition-colors"
      >
        {open ? <ChevronDown size={10} className="text-gray-300 flex-shrink-0" /> : <ChevronRight size={10} className="text-gray-300 flex-shrink-0" />}
        <MapPin size={10} className="text-gray-300 flex-shrink-0" />
        <span className="text-[11px] font-medium text-gray-600 truncate flex-1 text-left">{locationName}</span>
        <span className="text-[9px] text-gray-400 flex-shrink-0">{instances.length}</span>
      </button>
      {open && ifaceGroups.map((span) => {
        const groupInsts = instances.filter((i) => i.interfaceId === span.data.interfaceId)
        return (
          <IfaceGroupSection
            key={span.data.interfaceId}
            interfaceId={span.data.interfaceId}
            interfaceName={span.data.interfaceName}
            interfaceType={span.data.interfaceType}
            instances={groupInsts}
            hiddenInstanceIds={hiddenInstanceIds}
            usedInstanceIds={usedInstanceIds}
            onToggle={onToggle}
          />
        )
      })}
    </div>
  )
}

function AreaSection({
  areaId,
  areaName,
  locationIds,
  locationNames,
  instances,
  hiddenInstanceIds,
  usedInstanceIds,
  onToggle
}: {
  areaId: string
  areaName: string
  locationIds: string[]
  locationNames: Record<string, string>
  instances: SidebarInstance[]
  hiddenInstanceIds: Set<string>
  usedInstanceIds: Set<string>
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="ml-3 border-l border-gray-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-gray-50 transition-colors"
      >
        {open ? <ChevronDown size={10} className="text-gray-300 flex-shrink-0" /> : <ChevronRight size={10} className="text-gray-300 flex-shrink-0" />}
        <LayoutGrid size={10} className="text-indigo-300 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-gray-700 truncate flex-1 text-left">{areaName}</span>
      </button>
      {open && locationIds.map((locId) => {
        const locInsts = instances.filter((i) => i.locationId === locId)
        if (locInsts.length === 0) return null
        return (
          <LocationSection
            key={locId}
            locationId={locId}
            locationName={locationNames[locId] ?? locId}
            instances={locInsts}
            hiddenInstanceIds={hiddenInstanceIds}
            usedInstanceIds={usedInstanceIds}
            onToggle={onToggle}
          />
        )
      })}
    </div>
  )
}

// ── Instance sidebar ──────────────────────────────────────────────────────────

function InstanceSidebar({
  sidebarInstances,
  hiddenInstanceIds,
  usedInstanceIds,
  onToggle,
  onHideUnused,
  onShowAll
}: {
  sidebarInstances: SidebarInstance[]
  hiddenInstanceIds: Set<string>
  usedInstanceIds: Set<string>
  onToggle: (id: string) => void
  onHideUnused: () => void
  onShowAll: () => void
}) {
  const { plants, areas, locations } = useDiagramStore()

  const visibleCount = sidebarInstances.filter((i) => !hiddenInstanceIds.has(i.instanceId)).length

  // Build lookup maps
  const locationNames = useMemo(
    () => Object.fromEntries(locations.map((l) => [l.id, l.name])),
    [locations]
  )
  const areaNames = useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a.name])),
    [areas]
  )

  // Instance groups: assigned (by plant/area/location) and unassigned
  const assignedInstances   = sidebarInstances.filter((i) => i.locationId)
  const unassignedInstances = sidebarInstances.filter((i) => !i.locationId)

  const [plantsOpen, setPlantsOpen] = useState<Record<string, boolean>>({})
  function isPlantOpen(id: string) { return plantsOpen[id] !== false }

  return (
    <div className="flex flex-col w-56 flex-shrink-0 border-l border-gray-200 bg-white overflow-hidden">

      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-800">Instances</span>
          <span className="text-[10px] text-gray-400 tabular-nums">{visibleCount}/{sidebarInstances.length}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
          Tick to add columns to this matrix.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex gap-1.5 px-2 py-1.5 border-b border-gray-100 flex-shrink-0">
        <button onClick={onHideUnused}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          title="Hide instances with no values set">
          <EyeOff size={10} /> Hide unset
        </button>
        <button onClick={onShowAll}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
          Show all
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto text-xs">
        {sidebarInstances.length === 0 ? (
          <div className="p-3 text-center text-gray-400 text-[10px]">No instances with controllable fields.</div>
        ) : (
          <>
            {/* ── Plants ───────────────────────────────────────────────── */}
            {plants.map((plant) => {
              const plantAreas = areas.filter((a) => a.plantId === plant.id)
              // Only show plant if it has instances somewhere inside it
              const plantInstances = assignedInstances.filter((inst) => {
                const loc  = locations.find((l) => l.id === inst.locationId)
                const area = loc ? areas.find((a) => a.id === loc.areaId) : undefined
                return area?.plantId === plant.id
              })
              if (plantInstances.length === 0) return null

              const open = isPlantOpen(plant.id)

              return (
                <div key={plant.id} className="border-b border-gray-100">
                  {/* Plant header */}
                  <button
                    onClick={() => setPlantsOpen((p) => ({ ...p, [plant.id]: !open }))}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                  >
                    {open ? <ChevronDown size={11} className="text-indigo-400 flex-shrink-0" /> : <ChevronRight size={11} className="text-indigo-400 flex-shrink-0" />}
                    <Building2 size={11} className="text-indigo-500 flex-shrink-0" />
                    <span className="text-[11px] font-bold text-indigo-700 truncate flex-1 text-left">{plant.name}</span>
                    <span className="text-[9px] text-indigo-400 flex-shrink-0">{plantInstances.length}</span>
                  </button>

                  {/* Areas within plant */}
                  {open && plantAreas.map((area) => {
                    const areaLocations = locations.filter((l) => l.areaId === area.id)
                    const areaInstances = plantInstances.filter((inst) => {
                      const loc = locations.find((l) => l.id === inst.locationId)
                      return loc?.areaId === area.id
                    })
                    if (areaInstances.length === 0) return null

                    return (
                      <AreaSection
                        key={area.id}
                        areaId={area.id}
                        areaName={area.name}
                        locationIds={areaLocations.map((l) => l.id)}
                        locationNames={locationNames}
                        instances={areaInstances}
                        hiddenInstanceIds={hiddenInstanceIds}
                        usedInstanceIds={usedInstanceIds}
                        onToggle={onToggle}
                      />
                    )
                  })}
                </div>
              )
            })}

            {/* ── Unassigned ────────────────────────────────────────────── */}
            {unassignedInstances.length > 0 && (
              <div className="border-b border-gray-100">
                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50">
                  <Layers size={11} className="text-amber-500 flex-shrink-0" />
                  <span className="text-[11px] font-bold text-amber-700 flex-1">Unassigned</span>
                  <span className="text-[9px] text-amber-500">{unassignedInstances.length}</span>
                </div>
                {computeSpans(
                  [...unassignedInstances].sort((a, b) => a.interfaceName.localeCompare(b.interfaceName)),
                  (i) => i.interfaceId
                ).map((span) => {
                  const groupInsts = unassignedInstances.filter((i) => i.interfaceId === span.data.interfaceId)
                  return (
                    <IfaceGroupSection
                      key={span.data.interfaceId}
                      interfaceId={span.data.interfaceId}
                      interfaceName={span.data.interfaceName}
                      interfaceType={span.data.interfaceType}
                      instances={groupInsts}
                      hiddenInstanceIds={hiddenInstanceIds}
                      usedInstanceIds={usedInstanceIds}
                      onToggle={onToggle}
                    />
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── MatrixView ────────────────────────────────────────────────────────────────

export function MatrixView() {
  const { tabs, userInterfaces, interfaceInstances, matrixData, setMatrixCell } = useDiagramStore()

  const flowchartTabs = useMemo(() => tabs.filter((t) => t.type === 'flowchart'), [tabs])

  const [selectedTabId, setSelectedTabId] = useState<string>(() => flowchartTabs[0]?.id ?? '')
  // Per-flowchart-tab: set of instance IDs to hide
  const [hiddenByTab, setHiddenByTab] = useState<Record<string, string[]>>({})

  // Keep selection valid when tabs change
  useEffect(() => {
    if (selectedTabId && flowchartTabs.find((t) => t.id === selectedTabId)) return
    setSelectedTabId(flowchartTabs[0]?.id ?? '')
  }, [flowchartTabs, selectedTabId])

  const hiddenInstanceIds = useMemo(
    () => new Set(hiddenByTab[selectedTabId] ?? []),
    [hiddenByTab, selectedTabId]
  )

  // ── Rows: steps from the selected flowchart tab ───────────────────────────────
  const rows = useMemo<MatrixRow[]>(() => {
    const tab = tabs.find((t) => t.id === selectedTabId)
    if (!tab) return []
    return tab.flowNodes
      .filter((n) => n.type === 'step')
      .sort((a, b) => (a.data.stepNumber ?? 0) - (b.data.stepNumber ?? 0))
      .map((node) => ({
        nodeId: node.id,
        stepNumber: node.data.stepNumber,
        stepLabel: node.data.label,
        packMLState: node.data.packMLState as PackMLState | undefined
      }))
  }, [tabs, selectedTabId])

  // ── All possible instance-field columns ──────────────────────────────────────
  const allColumns = useMemo<MatrixCol[]>(() => {
    const result: MatrixCol[] = []
    const sorted = [...userInterfaces].sort((a, b) => a.name.localeCompare(b.name))
    sorted.forEach((iface) => {
      const instances = interfaceInstances
        .filter((inst) => inst.interfaceId === iface.id)
        .sort((a, b) => a.name.localeCompare(b.name))
      const fields = iface.fields.filter((f) => isControllableField(f, iface.type))
      instances.forEach((inst) => {
        fields.forEach((field) => {
          result.push({
            key: `${inst.id}::${field.id}`,
            interfaceId: iface.id,
            interfaceName: iface.name,
            interfaceType: iface.type,
            instanceId: inst.id,
            instanceName: inst.name,
            tagName: inst.tagName,
            fieldId: field.id,
            fieldName: field.name,
            dataType: field.dataType,
            isNumeric: isNumericType(field.dataType)
          })
        })
      })
    })
    return result
  }, [userInterfaces, interfaceInstances])

  // Sidebar list: one entry per instance that has ≥1 controllable field
  const sidebarInstances = useMemo<SidebarInstance[]>(() => {
    const result: SidebarInstance[] = []
    const sorted = [...userInterfaces].sort((a, b) => a.name.localeCompare(b.name))
    sorted.forEach((iface) => {
      const fields = iface.fields.filter((f) => isControllableField(f, iface.type))
      if (fields.length === 0) return
      interfaceInstances
        .filter((inst) => inst.interfaceId === iface.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((inst) => {
          result.push({
            instanceId: inst.id,
            instanceName: inst.name,
            tagName: inst.tagName,
            interfaceId: iface.id,
            interfaceName: iface.name,
            interfaceType: iface.type,
            fieldCount: fields.length,
            locationId: inst.locationId
          })
        })
    })
    return result
  }, [userInterfaces, interfaceInstances])

  // Which instances have at least one value set for this flowchart's steps
  const usedInstanceIds = useMemo(() => {
    const used = new Set<string>()
    rows.forEach((row) => {
      allColumns.forEach((col) => {
        const val = matrixData?.[row.nodeId]?.[col.instanceId]?.[col.fieldId]
        if (val !== null && val !== undefined) used.add(col.instanceId)
      })
    })
    return used
  }, [rows, allColumns, matrixData])

  // Visible columns: exclude hidden instances
  const columns = useMemo(
    () => allColumns.filter((col) => !hiddenInstanceIds.has(col.instanceId)),
    [allColumns, hiddenInstanceIds]
  )

  // Header spans
  const ifaceSpans = useMemo(() => computeSpans(columns, (c) => c.interfaceId), [columns])
  const instSpans  = useMemo(() => computeSpans(columns, (c) => c.instanceId),  [columns])

  // ── Sidebar actions ───────────────────────────────────────────────────────────

  function toggleInstance(instanceId: string) {
    setHiddenByTab((prev) => {
      const current = new Set(prev[selectedTabId] ?? [])
      if (current.has(instanceId)) current.delete(instanceId)
      else current.add(instanceId)
      return { ...prev, [selectedTabId]: Array.from(current) }
    })
  }

  function hideUnused() {
    const toHide = sidebarInstances
      .filter((i) => !usedInstanceIds.has(i.instanceId))
      .map((i) => i.instanceId)
    setHiddenByTab((prev) => ({
      ...prev,
      [selectedTabId]: Array.from(new Set([...(prev[selectedTabId] ?? []), ...toHide]))
    }))
  }

  function showAll() {
    setHiddenByTab((prev) => ({ ...prev, [selectedTabId]: [] }))
  }

  // ── Early empty state (no flowcharts at all) ──────────────────────────────────

  if (flowchartTabs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400 max-w-xs">
          <Grid3x3 size={40} className="mx-auto mb-3 opacity-25" />
          <p className="text-sm font-semibold">No flowchart diagrams</p>
          <p className="text-xs mt-1 leading-relaxed">
            Create a <span className="font-medium">Flowchart</span> tab and add
            <span className="font-medium"> Step</span> nodes to populate the matrix rows.
          </p>
        </div>
      </div>
    )
  }

  const selectedTab  = flowchartTabs.find((t) => t.id === selectedTabId)
  const stepCount    = rows.length
  const hiddenCount  = hiddenInstanceIds.size

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* ── Flowchart tab selector bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-2 bg-white border-b border-gray-200 flex-shrink-0 overflow-x-auto">
        <Network size={12} className="text-gray-400 flex-shrink-0 mr-1" />
        {flowchartTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedTabId(tab.id)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              tab.id === selectedTabId
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100 hover:text-indigo-600'
            }`}
          >
            {tab.name}
          </button>
        ))}
        {hiddenCount > 0 && (
          <span className="ml-2 text-[10px] text-gray-400 flex-shrink-0">
            {hiddenCount} instance{hiddenCount !== 1 ? 's' : ''} hidden
          </span>
        )}
      </div>

      {/* ── Main area: table + sidebar ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Matrix table area */}
        {stepCount === 0 ? (
          <div className="flex flex-1 items-center justify-center bg-gray-50">
            <div className="text-center text-gray-400 max-w-xs">
              <AlertCircle size={36} className="mx-auto mb-3 opacity-25" />
              <p className="text-sm font-semibold">No steps in "{selectedTab?.name}"</p>
              <p className="text-xs mt-1">Add <span className="font-medium">Step</span> nodes to this flowchart diagram.</p>
            </div>
          </div>
        ) : columns.length === 0 ? (
          <div className="flex flex-1 items-center justify-center bg-gray-50">
            <div className="text-center text-gray-400 max-w-xs">
              <Grid3x3 size={36} className="mx-auto mb-3 opacity-25" />
              <p className="text-sm font-semibold">No instances selected</p>
              <p className="text-xs mt-1">Tick instances in the panel on the right to add their fields as columns.</p>
            </div>
          </div>
        ) : (

          <div className="flex-1 overflow-auto bg-gray-50">
            <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>

              <thead>

                {/* Row 1: Interface group — h:28, top:0 */}
                <tr style={{ height: 28 }}>
                  <th
                    rowSpan={3}
                    className="sticky left-0 z-[40] bg-gray-50 text-left align-bottom px-3 pb-2 border-r-2 border-b border-gray-300"
                    style={{ minWidth: 240, top: 0 }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Step</span>
                      <span className="text-[9px] text-gray-300 font-normal">
                        {stepCount} step{stepCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </th>
                  {ifaceSpans.map((span) => (
                    <th
                      key={span.data.interfaceId}
                      colSpan={span.count}
                      className="sticky top-0 z-[30] text-center border-r border-b border-gray-200 px-2 whitespace-nowrap bg-white"
                      style={{ height: 28 }}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span className={`px-1.5 py-px rounded text-[9px] font-bold tracking-wider ${
                          span.data.interfaceType === 'AOI'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-cyan-100 text-cyan-700'
                        }`}>
                          {span.data.interfaceType}
                        </span>
                        <span className="font-semibold text-gray-700">{span.data.interfaceName}</span>
                        <span className="text-gray-400 font-normal text-[10px]">({span.count})</span>
                      </div>
                    </th>
                  ))}
                </tr>

                {/* Row 2: Instance — h:36, top:28 */}
                <tr style={{ height: 36 }}>
                  {instSpans.map((span) => (
                    <th
                      key={span.data.instanceId}
                      colSpan={span.count}
                      className="sticky z-[30] text-center border-r border-b border-gray-200 px-2"
                      style={{ top: 28, height: 36, background: '#f5f3ff' }}
                    >
                      <div className="font-semibold text-indigo-800 leading-tight text-[11px]">{span.data.instanceName}</div>
                      <div className="font-mono text-[10px] text-indigo-400 leading-tight">{span.data.tagName}</div>
                    </th>
                  ))}
                </tr>

                {/* Row 3: Field name — h:28, top:64 */}
                <tr style={{ height: 28 }}>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="sticky z-[30] text-center border-r border-b-2 border-gray-300 px-2 whitespace-nowrap"
                      style={{ top: 64, height: 28, background: '#f8fafc' }}
                    >
                      <span className="text-gray-700 font-medium">{col.fieldName}</span>
                      <span className={`ml-1 text-[9px] font-normal ${col.isNumeric ? 'text-blue-500' : 'text-emerald-500'}`}>
                        {col.dataType}
                      </span>
                    </th>
                  ))}
                </tr>

              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.nodeId} className="group hover:bg-indigo-50/30 transition-colors">

                    {/* Sticky step cell */}
                    <td
                      className="sticky left-0 z-[20] bg-white group-hover:bg-indigo-50/50 border-r-2 border-b border-gray-200 px-3 py-2 whitespace-nowrap transition-colors"
                      style={{ minWidth: 240 }}
                    >
                      <div className="flex items-start gap-2">
                        {row.stepNumber !== undefined && (
                          <span className="flex-shrink-0 w-6 h-6 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center mt-px">
                            S{row.stepNumber}
                          </span>
                        )}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-medium text-gray-800 leading-tight" title={row.stepLabel}>
                            {row.stepLabel}
                          </span>
                          {row.packMLState && <PackMLBadge state={row.packMLState} />}
                        </div>
                      </div>
                    </td>

                    {/* Data cells */}
                    {columns.map((col) => {
                      const val = matrixData?.[row.nodeId]?.[col.instanceId]?.[col.fieldId] ?? null
                      return (
                        <td
                          key={col.key}
                          className="border-r border-b border-gray-100 text-center align-middle"
                          style={{ minWidth: col.isNumeric ? 80 : 52, height: row.packMLState ? 48 : 36 }}
                        >
                          <div className="flex items-center justify-center h-full">
                            {col.isNumeric ? (
                              <NumericCell
                                value={val}
                                onChange={(v) => setMatrixCell(row.nodeId, col.instanceId, col.fieldId, v)}
                              />
                            ) : (
                              <BoolCell
                                value={val}
                                onChange={(v) => setMatrixCell(row.nodeId, col.instanceId, col.fieldId, v)}
                              />
                            )}
                          </div>
                        </td>
                      )
                    })}

                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        )}

        {/* ── Right-docked instance sidebar ─────────────────────────────────── */}
        <InstanceSidebar
          sidebarInstances={sidebarInstances}
          hiddenInstanceIds={hiddenInstanceIds}
          usedInstanceIds={usedInstanceIds}
          onToggle={toggleInstance}
          onHideUnused={hideUnused}
          onShowAll={showAll}
        />

      </div>
    </div>
  )
}
