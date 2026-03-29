import * as XLSX from 'xlsx'
import { useDiagramStore } from '../store/diagramStore'
import { appendDuluxIOScheduleSheets } from './ioScheduleExcel'
import type {
  DiagramTab, UserInterface, InterfaceInstance, InterfaceField,
  IORack, IOSlot, IOEntry, InterfaceType, MatrixData
} from '../types'
import { formatStepStateLabel } from './stepStateVisual'

type Row = Record<string, string | number | boolean | undefined>

function ws(data: Row[]): XLSX.WorkSheet {
  return XLSX.utils.json_to_sheet(data)
}

function autoWidth(sheet: XLSX.WorkSheet): void {
  const ref = sheet['!ref']
  if (!ref) return
  const range = XLSX.utils.decode_range(ref)
  const cols: XLSX.ColInfo[] = []
  for (let c = range.s.c; c <= range.e.c; c++) {
    let max = 10
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      if (cell?.v != null) {
        const len = String(cell.v).length
        if (len > max) max = len
      }
    }
    cols.push({ wch: Math.min(max + 2, 60) })
  }
  sheet['!cols'] = cols
}

function isNumericType(dt: string): boolean {
  return /^(SINT|INT|DINT|LINT|USINT|UINT|UDINT|ULINT|REAL|LREAL|BYTE|WORD|DWORD)/.test(dt)
}

function isControllableField(field: InterfaceField, ifaceType: InterfaceType): boolean {
  if (field.includeInMatrix !== undefined) return field.includeInMatrix
  if (ifaceType === 'UDT') return true
  return field.usage === 'Input' || field.usage === 'InOut'
}

// ── IO Table sheet ───────────────────────────────────────────────────────────

function buildIOTableSheet(
  ioRacks: IORack[],
  ioSlots: IOSlot[],
  ioEntries: IOEntry[],
  interfaceInstances: InterfaceInstance[],
  userInterfaces: UserInterface[]
): XLSX.WorkSheet {
  const rackMap = new Map(ioRacks.map((r) => [r.id, r]))
  const slotMap = new Map(ioSlots.map((s) => [s.id, s]))
  const ifaceMap = new Map(userInterfaces.map((i) => [i.id, i]))

  const reverseIO = new Map<string, { instanceName: string; fieldName: string }>()
  for (const inst of interfaceInstances) {
    if (!inst.ioMappings) continue
    const iface = ifaceMap.get(inst.interfaceId)
    for (const [fieldId, entryId] of Object.entries(inst.ioMappings)) {
      const field = iface?.fields.find((f) => f.id === fieldId)
      reverseIO.set(entryId, {
        instanceName: inst.name,
        fieldName: field?.name ?? fieldId
      })
    }
  }

  const rows: Row[] = ioEntries.map((entry) => {
    const slot = slotMap.get(entry.slotId)
    const rack = slot ? rackMap.get(slot.rackId) : undefined
    const linked = reverseIO.get(entry.id)
    return {
      'Rack': rack?.name ?? '',
      'Slot': slot?.name ?? '',
      'Catalog Number': slot?.catalogNumber ?? '',
      'Channel': entry.channel,
      'IO Type': entry.ioType,
      'Drawing Tag': entry.drawingTag,
      'Drawing Reference': entry.drawingReference,
      'Description 1': entry.description1,
      'Description 2': entry.description2,
      'Description 3': entry.description3,
      'Unit of Measure': entry.unitOfMeasure,
      'Min Raw Scale': entry.minRawScale,
      'Max Raw Scale': entry.maxRawScale,
      'Min EU Scale': entry.minEUScale,
      'Max EU Scale': entry.maxEUScale,
      'Linked Instance': linked ? `${linked.instanceName}.${linked.fieldName}` : ''
    }
  })
  if (rows.length === 0) rows.push({ 'Rack': '(No IO entries defined)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

// ── Per-tab C&E Matrix sheet ─────────────────────────────────────────────────

interface MatrixCol {
  instanceId: string
  instanceName: string
  fieldId: string
  fieldName: string
  dataType: string
  isNumeric: boolean
}

function buildTabMatrixSheet(
  tab: DiagramTab,
  matrixData: MatrixData,
  shownInstanceIds: string[] | undefined,
  interfaceInstances: InterfaceInstance[],
  userInterfaces: UserInterface[]
): XLSX.WorkSheet {
  const ifaceMap = new Map(userInterfaces.map((i) => [i.id, i]))
  const shownSet = shownInstanceIds ? new Set(shownInstanceIds) : null

  // Rows: step nodes sorted by step number
  const stepNodes = tab.flowNodes
    .filter((n) => n.type === 'step')
    .sort((a, b) => (a.data.stepNumber ?? 0) - (b.data.stepNumber ?? 0))

  // Columns: controllable fields from shown instances
  const columns: MatrixCol[] = []
  const sortedIfaces = [...userInterfaces].sort((a, b) => a.name.localeCompare(b.name))
  for (const iface of sortedIfaces) {
    const fields = iface.fields.filter((f) => isControllableField(f, iface.type))
    if (fields.length === 0) continue
    const instances = interfaceInstances
      .filter((inst) => inst.interfaceId === iface.id)
      .filter((inst) => !shownSet || shownSet.has(inst.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const inst of instances) {
      for (const field of fields) {
        columns.push({
          instanceId: inst.id,
          instanceName: inst.name,
          fieldId: field.id,
          fieldName: field.name,
          dataType: field.dataType,
          isNumeric: isNumericType(field.dataType)
        })
      }
    }
  }

  const customStates = tab.flowStates ?? []
  const rows: Row[] = stepNodes.map((node) => {
    const row: Row = {
      'Step #': node.data.stepNumber ?? '',
      'Step': node.data.label ?? '',
      'State': node.data.packMLState
        ? formatStepStateLabel(node.data.packMLState, customStates)
        : ''
    }
    for (const col of columns) {
      const header = `${col.instanceName}.${col.fieldName}`
      const val = matrixData?.[node.id]?.[col.instanceId]?.[col.fieldId]
      if (col.isNumeric) {
        row[header] = val != null ? val as number : ''
      } else {
        row[header] = val === true ? 'X' : val === false ? '0' : ''
      }
    }
    return row
  })

  if (rows.length === 0 && columns.length === 0) {
    rows.push({ 'Step #': '(No matrix data)' })
  } else if (rows.length === 0) {
    rows.push({ 'Step #': '(No steps defined)' })
  }

  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

// ── Safe sheet name (Excel max 31 chars, no special chars) ───────────────────

function safeSheetName(name: string, existing: Set<string>): string {
  let safe = name.replace(/[\\/*?\[\]:]/g, '').substring(0, 31)
  if (!safe) safe = 'Sheet'
  let result = safe
  let i = 2
  while (existing.has(result)) {
    const suffix = ` (${i++})`
    result = safe.substring(0, 31 - suffix.length) + suffix
  }
  existing.add(result)
  return result
}

// ── Main export ──────────────────────────────────────────────────────────────

export function exportToExcel(): string {
  const state = useDiagramStore.getState()
  const {
    tabs, userInterfaces, interfaceInstances,
    ioRacks, ioSlots, ioEntries,
    matrixData, matrixShownInstances
  } = state

  const wb = XLSX.utils.book_new()
  const usedNames = new Set<string>()

  // IO Table tab
  const ioName = safeSheetName('IO', usedNames)
  XLSX.utils.book_append_sheet(
    wb,
    buildIOTableSheet(ioRacks, ioSlots, ioEntries, interfaceInstances, userInterfaces),
    ioName
  )

  appendDuluxIOScheduleSheets(
    wb,
    usedNames,
    ioRacks,
    ioSlots,
    ioEntries,
    interfaceInstances,
    userInterfaces
  )

  // One tab per flowchart with its C&E matrix
  const flowchartTabs = tabs.filter((t) => t.type === 'flowchart')
  for (const tab of flowchartTabs) {
    const sheetName = safeSheetName(tab.name, usedNames)
    const shownIds = matrixShownInstances[tab.id]
    XLSX.utils.book_append_sheet(
      wb,
      buildTabMatrixSheet(tab, matrixData, shownIds, interfaceInstances, userInterfaces),
      sheetName
    )
  }

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string
}
