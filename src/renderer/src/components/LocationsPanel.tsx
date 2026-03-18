import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Plus, Trash2, Pencil,
  Check, X, Building2, LayoutGrid, MapPin
} from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type { Plant, Area, Location } from '../types'

// ── Uid helper ────────────────────────────────────────────────────────────────

let _id = 1
function uid(prefix: string) { return `${prefix}_${Date.now()}_${_id++}` }

// ── Inline rename input ───────────────────────────────────────────────────────
// Shown in place of the name when editing = true.

function RenameInput({
  value,
  onSave,
  onCancel
}: {
  value: string
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)

  function commit() {
    const trimmed = draft.trim()
    if (trimmed) onSave(trimmed)
    else onCancel()
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        autoFocus
        className="flex-1 min-w-0 bg-white border border-indigo-400 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel() }}
      />
      <button
        onMouseDown={(e) => { e.preventDefault(); commit() }}
        className="p-0.5 text-indigo-600 hover:text-indigo-800 rounded flex-shrink-0"
        title="Save"
      >
        <Check size={12} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); onCancel() }}
        className="p-0.5 text-gray-400 hover:text-gray-600 rounded flex-shrink-0"
        title="Cancel"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ── Add-item row ──────────────────────────────────────────────────────────────
// Shows a "+ Add …" button; clicking expands to an inline input.

function AddRow({
  label,
  placeholder,
  icon,
  onAdd,
  indent = false
}: {
  label: string
  placeholder: string
  icon: React.ReactNode
  onAdd: (name: string) => void
  indent?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setName('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 py-1.5 rounded hover:bg-indigo-50 transition-colors w-full ${indent ? 'px-3' : 'px-2'}`}
      >
        <Plus size={12} className="flex-shrink-0" /> {label}
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-2 py-1.5 ${indent ? 'px-3' : 'px-2'}`}>
      <span className="text-gray-400 flex-shrink-0">{icon}</span>
      <input
        autoFocus
        className="flex-1 min-w-0 bg-white border border-indigo-400 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
        onBlur={() => { if (!name.trim()) setOpen(false) }}
      />
      <button
        onMouseDown={(e) => { e.preventDefault(); submit() }}
        disabled={!name.trim()}
        className="p-0.5 text-indigo-600 hover:text-indigo-800 disabled:opacity-40 rounded flex-shrink-0"
        title="Add"
      >
        <Check size={12} />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); setOpen(false) }}
        className="p-0.5 text-gray-400 hover:text-gray-600 rounded flex-shrink-0"
        title="Cancel"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ── Location node ─────────────────────────────────────────────────────────────

function LocationNode({
  location,
  instanceCount
}: {
  location: Location
  instanceCount: number
}) {
  const { updateLocation, removeLocation } = useDiagramStore()
  const [editing, setEditing] = useState(false)

  return (
    <div className="flex items-center gap-2 pl-2 pr-2 py-1.5 rounded hover:bg-gray-50">
      <MapPin size={12} className="text-gray-300 flex-shrink-0" />

      {editing ? (
        <RenameInput
          value={location.name}
          onSave={(name) => { updateLocation(location.id, { name }); setEditing(false) }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">{location.name}</span>
          {instanceCount > 0 && (
            <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">
              {instanceCount} inst.
            </span>
          )}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => setEditing(true)}
              className="p-0.5 text-gray-300 hover:text-indigo-600 rounded transition-colors" title="Rename">
              <Pencil size={11} />
            </button>
            <button onClick={() => removeLocation(location.id)}
              className="p-0.5 text-gray-300 hover:text-red-500 rounded transition-colors" title="Delete">
              <Trash2 size={11} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Area node ─────────────────────────────────────────────────────────────────

function AreaNode({
  area,
  locations,
  instanceCounts
}: {
  area: Area
  locations: Location[]
  instanceCounts: Record<string, number>
}) {
  const { updateArea, removeArea, addLocation } = useDiagramStore()
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing]   = useState(false)
  const areaLocations = locations.filter((l) => l.areaId === area.id)

  return (
    <div className="ml-3 border-l-2 border-gray-100 mt-0.5">
      {/* Area header */}
      <div className="flex items-center gap-1.5 pl-2 pr-2 py-1.5 rounded hover:bg-gray-50">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-300 hover:text-gray-500 flex-shrink-0 transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <LayoutGrid size={12} className="text-indigo-300 flex-shrink-0" />

        {editing ? (
          <RenameInput
            value={area.name}
            onSave={(name) => { updateArea(area.id, { name }); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <span className="flex-1 min-w-0 text-sm font-medium text-gray-700 truncate">{area.name}</span>
            <span className="text-[10px] text-gray-400 flex-shrink-0">
              {areaLocations.length} loc.
            </span>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button onClick={() => setEditing(true)}
                className="p-0.5 text-gray-300 hover:text-indigo-600 rounded transition-colors" title="Rename">
                <Pencil size={11} />
              </button>
              <button onClick={() => removeArea(area.id)}
                className="p-0.5 text-gray-300 hover:text-red-500 rounded transition-colors" title="Delete area and its locations">
                <Trash2 size={11} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Locations */}
      {expanded && (
        <div className="ml-3">
          {areaLocations.length === 0 && (
            <p className="text-[11px] text-gray-400 italic px-2 py-1">No locations yet.</p>
          )}
          {areaLocations.map((loc) => (
            <LocationNode
              key={loc.id}
              location={loc}
              instanceCount={instanceCounts[loc.id] ?? 0}
            />
          ))}
          <AddRow
            label="Add location"
            placeholder="Location name"
            icon={<MapPin size={11} />}
            onAdd={(name) => addLocation({ id: uid('loc'), name, areaId: area.id })}
          />
        </div>
      )}
    </div>
  )
}

// ── Plant node ────────────────────────────────────────────────────────────────

function PlantNode({
  plant,
  areas,
  locations,
  instanceCounts
}: {
  plant: Plant
  areas: Area[]
  locations: Location[]
  instanceCounts: Record<string, number>
}) {
  const { updatePlant, removePlant, addArea } = useDiagramStore()
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing]   = useState(false)
  const plantAreas = areas.filter((a) => a.plantId === plant.id)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-3">
      {/* Plant header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0 transition-colors"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Building2 size={14} className="text-indigo-400 flex-shrink-0" />

        {editing ? (
          <RenameInput
            value={plant.name}
            onSave={(name) => { updatePlant(plant.id, { name }); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <span className="flex-1 min-w-0 text-sm font-bold text-gray-800 truncate">{plant.name}</span>
            <span className="text-[10px] text-gray-400 flex-shrink-0">
              {plantAreas.length} area{plantAreas.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors flex-shrink-0"
              title="Rename plant"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => removePlant(plant.id)}
              className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors flex-shrink-0"
              title="Delete plant and all its areas and locations"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      {/* Areas */}
      {expanded && (
        <div className="px-2 py-1.5">
          {plantAreas.length === 0 && (
            <p className="text-[11px] text-gray-400 italic px-2 py-1">No areas yet — add one below.</p>
          )}
          {plantAreas.map((area) => (
            <AreaNode
              key={area.id}
              area={area}
              locations={locations}
              instanceCounts={instanceCounts}
            />
          ))}
          <AddRow
            label="Add area"
            placeholder="Area name"
            icon={<LayoutGrid size={11} />}
            onAdd={(name) => addArea({ id: uid('area'), name, plantId: plant.id })}
            indent
          />
        </div>
      )}
    </div>
  )
}

// ── LocationsPanel ────────────────────────────────────────────────────────────

export function LocationsPanel() {
  const { plants, areas, locations, interfaceInstances, addPlant } = useDiagramStore()

  const instanceCounts = interfaceInstances.reduce<Record<string, number>>((acc, inst) => {
    if (inst.locationId) acc[inst.locationId] = (acc[inst.locationId] ?? 0) + 1
    return acc
  }, {})

  const unassigned = interfaceInstances.filter((i) => !i.locationId).length

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-200 bg-white flex-shrink-0 flex items-center gap-3">
        <Building2 size={15} className="text-indigo-500" />
        <h2 className="text-sm font-bold text-gray-800">Plant Hierarchy</h2>
        <div className="flex gap-1.5 ml-auto flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold">
            {plants.length} plant{plants.length !== 1 ? 's' : ''}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold">
            {areas.length} area{areas.length !== 1 ? 's' : ''}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold">
            {locations.length} location{locations.length !== 1 ? 's' : ''}
          </span>
          {unassigned > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold">
              {unassigned} unassigned
            </span>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-4">

        {plants.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-12 text-gray-400 mb-4">
            <Building2 size={32} className="mb-3 opacity-25" />
            <p className="text-sm font-medium">No plants defined yet</p>
            <p className="text-xs mt-1 leading-relaxed">
              Click <strong>Add Plant</strong> below to start building your hierarchy.
              <br />Instances can then be assigned to a specific location.
            </p>
          </div>
        )}

        {plants.map((plant) => (
          <PlantNode
            key={plant.id}
            plant={plant}
            areas={areas}
            locations={locations}
            instanceCounts={instanceCounts}
          />
        ))}

        {/* Add plant — uses the same inline input pattern */}
        <AddRow
          label="Add Plant"
          placeholder="Plant name"
          icon={<Building2 size={13} />}
          onAdd={(name) => addPlant({ id: uid('plant'), name })}
        />
      </div>
    </div>
  )
}

// ── Shared helpers (used by InterfacesPanel) ──────────────────────────────────

export interface LocationOption {
  locationId: string
  label: string
}

export function useLocationOptions(): LocationOption[] {
  const { plants, areas, locations } = useDiagramStore()
  const options: LocationOption[] = []
  plants.forEach((plant) => {
    areas.filter((a) => a.plantId === plant.id).forEach((area) => {
      locations.filter((l) => l.areaId === area.id).forEach((loc) => {
        options.push({
          locationId: loc.id,
          label: `${plant.name} › ${area.name} › ${loc.name}`
        })
      })
    })
  })
  return options
}

export function LocationBreadcrumb({ locationId }: { locationId?: string }) {
  const { plants, areas, locations } = useDiagramStore()
  if (!locationId) return null
  const loc   = locations.find((l) => l.id === locationId)
  if (!loc) return null
  const area  = areas.find((a) => a.id === loc.areaId)
  const plant = area ? plants.find((p) => p.id === area.plantId) : undefined
  const parts = [plant?.name, area?.name, loc.name].filter(Boolean)

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-500 font-medium">
      <MapPin size={9} className="flex-shrink-0" />
      {parts.join(' › ')}
    </span>
  )
}
