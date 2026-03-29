/**
 * Dulux-style IO schedule Excel (column layout as in 217386-SCH-001 Rev D IO List).
 * Import/export maps to IORack / IOSlot / IOEntry.
 */

import * as XLSX from 'xlsx'
import type { IOEntry, IORack, IOSlot, IOType, InterfaceInstance, UserInterface } from '../types'
import { uid } from './uid'

// ── Siemens / vendor I/O labels → app IOType ─────────────────────────────────

const MODULE_SKIP = new Set(['CPU', 'IM', 'RIO', ''])

export function siemensLabelToIOType(raw: string): IOType {
  const u = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
  if (!u) return ''
  if (u === 'DQ' || u.includes('FDQ')) return 'DO'
  if (u === 'DI' || u.includes('FDI')) return 'DI'
  if (u === 'AI' || u.startsWith('AIA') || u.includes('F-AI')) return 'AI'
  if (u === 'AO' || u.includes('F-AO')) return 'AO'
  if (u.includes('RTD') || u === 'F-RTD') return 'RTD'
  if (u.includes('TC') || u === 'F-TC' || u.includes('THERMO')) return 'TC'
  return ''
}

/** Export label from app IOType (contractor-style abbreviations). */
export function ioTypeToScheduleLabel(t: IOType): string {
  switch (t) {
    case 'DO': return 'DQ'
    case 'DI': return 'DI'
    case 'AI': return 'AI'
    case 'AO': return 'AO'
    case 'RTD': return 'RTD'
    case 'TC': return 'TC'
    default: return ''
  }
}

// ── Column layout (indices relative to detected Rack column) ───────────────

export interface DuluxColumnMap {
  rackCol: number
  deviceTag: number
  description: number
  panel: number
  system: number
  plcCard: number
  baseUnit: number
  ioType: number
  slotCol: number
  channelCol: number
  symbolic: number
  /** Optional analog / scale columns (if present in header row) */
  measType?: number
  rangeMin?: number
  rangeMax?: number
  scaledMin?: number
  scaledMax?: number
}

function mapFromRackCol(rackCol: number): DuluxColumnMap {
  return {
    rackCol,
    deviceTag: rackCol - 8,
    description: rackCol - 7,
    panel: rackCol - 6,
    system: rackCol - 5,
    plcCard: rackCol - 4,
    baseUnit: rackCol - 3,
    ioType: rackCol - 1,
    slotCol: rackCol + 1,
    channelCol: rackCol + 2,
    symbolic: rackCol + 3
  }
}

export function normalizeCell(v: unknown): string {
  return String(v ?? '').replace(/\r\n/g, '\n').trim()
}

/** Find the subheader row where Rack, Slot, Channel appear in consecutive cells. */
export function findDuluxSubheaderRow(rows: string[][]): { row: number; rackCol: number } | null {
  const maxR = Math.min(rows.length, 60)
  for (let r = 0; r < maxR; r++) {
    const row = rows[r] || []
    const maxC = Math.min(row.length, 45)
    for (let c = 0; c <= maxC - 3; c++) {
      const a = normalizeCell(row[c])
      const b = normalizeCell(row[c + 1])
      const d = normalizeCell(row[c + 2])
      if (a === 'Rack' && b === 'Slot' && d === 'Channel') {
        return { row: r, rackCol: c }
      }
    }
  }
  return null
}

/** Refine analog column indices from header text on / above the data region. */
function enrichAnalogColumns(rows: string[][], subRow: number, base: DuluxColumnMap): DuluxColumnMap {
  const scanLo = Math.max(0, subRow - 6)
  const scanHi = Math.min(rows.length, subRow + 2)
  const labels: Record<string, keyof Pick<DuluxColumnMap, 'measType' | 'rangeMin' | 'rangeMax' | 'scaledMin' | 'scaledMax'>> = {
    'Measurement Type': 'measType',
    'Range Min': 'rangeMin',
    'Range Max': 'rangeMax',
    'Scaled Min': 'scaledMin',
    'Scaled Max': 'scaledMax'
  }
  const out = { ...base }
  for (let r = scanLo; r < scanHi; r++) {
    const row = rows[r] || []
    for (let c = 0; c < row.length; c++) {
      const cell = normalizeCell(row[c])
      for (const [text, key] of Object.entries(labels)) {
        if (cell.includes(text) && out[key] === undefined) {
          (out as Record<string, number | undefined>)[key] = c
        }
      }
    }
  }
  return out
}

export function detectDuluxColumnMap(rows: string[][]): DuluxColumnMap | null {
  const sub = findDuluxSubheaderRow(rows)
  if (!sub) return null
  const { rackCol, row } = sub
  if (rackCol < 8) return null
  const base = mapFromRackCol(rackCol)
  return enrichAnalogColumns(rows, row, base)
}

const COL_COUNT = 41

function padRow(cells: string[], width: number): string[] {
  const r = [...cells]
  while (r.length < width) r.push('')
  return r.slice(0, width)
}

function isSkippableRow(cols: DuluxColumnMap, row: string[]): boolean {
  const ioRaw = normalizeCell(row[cols.ioType])
  const ch = normalizeCell(row[cols.channelCol])

  if (!ioRaw || MODULE_SKIP.has(ioRaw)) return true
  if (ch === '-' || ch === '') return true
  return false
}

export interface ParsedIOSheet {
  sheetName: string
  panel: string
  racks: IORack[]
  slots: IOSlot[]
  entries: IOEntry[]
}

export interface ParseIOScheduleResult {
  sheets: ParsedIOSheet[]
  errors: string[]
}

function emptyEntry(slotId: string): IOEntry {
  return {
    id: uid('io'),
    slotId,
    channel: '',
    drawingTag: '',
    drawingReference: '',
    description1: '',
    description2: '',
    description3: '',
    ioType: '' as IOType,
    unitOfMeasure: '',
    minRawScale: '',
    maxRawScale: '',
    minEUScale: '',
    maxEUScale: ''
  }
}

/**
 * Parse a single worksheet that uses the Dulux IO layout.
 * Returns new entities with fresh ids, scoped under one rack per distinct Panel column.
 */
export function parseDuluxSheet(sheetName: string, rows: string[][]): ParsedIOSheet | null {
  const cols = detectDuluxColumnMap(rows)
  if (!cols) return null

  const sub = findDuluxSubheaderRow(rows)!
  const dataStart = sub.row + 1

  const panelToRackId = new Map<string, string>()
  const slotKeyToId = new Map<string, string>()
  const racks: IORack[] = []
  const slots: IOSlot[] = []
  const entries: IOEntry[] = []

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || []
    if (!row.some((c) => normalizeCell(c))) continue
    if (isSkippableRow(cols, row)) continue

    const panel = normalizeCell(row[cols.panel]) || sheetName.replace(/^.*IO\s*/i, '').trim() || 'Panel'
    let rackId = panelToRackId.get(panel.toLowerCase())
    if (!rackId) {
      rackId = uid('rack')
      racks.push({ id: rackId, name: panel })
      panelToRackId.set(panel.toLowerCase(), rackId)
    }

    const rackNum = normalizeCell(row[cols.rackCol])
    const slotNum = normalizeCell(row[cols.slotCol])
    const slotName = `${rackNum}-${slotNum}`
    const slotKey = `${rackId}::${slotName.toLowerCase()}`
    let slotId = slotKeyToId.get(slotKey)
    if (!slotId) {
      slotId = uid('slot')
      const catalog = normalizeCell(row[cols.plcCard]) || normalizeCell(row[cols.baseUnit])
      slots.push({ id: slotId, rackId, name: slotName, catalogNumber: catalog || undefined })
      slotKeyToId.set(slotKey, slotId)
    } else {
      const catalog = normalizeCell(row[cols.plcCard]) || normalizeCell(row[cols.baseUnit])
      if (catalog) {
        const sl = slots.find((s) => s.id === slotId)
        if (sl && !sl.catalogNumber) sl.catalogNumber = catalog
      }
    }

    const ioRaw = normalizeCell(row[cols.ioType])
    const ioType = siemensLabelToIOType(ioRaw) || ('' as IOType)

    const entry = emptyEntry(slotId)
    entry.channel = normalizeCell(row[cols.channelCol])
    entry.drawingTag = normalizeCell(row[cols.deviceTag])
    entry.description1 = normalizeCell(row[cols.description])
    entry.drawingReference = normalizeCell(row[cols.symbolic])
    entry.ioType = ioType

    if (cols.measType !== undefined) entry.description2 = normalizeCell(row[cols.measType])
    if (cols.rangeMin !== undefined) entry.minRawScale = normalizeCell(row[cols.rangeMin])
    if (cols.rangeMax !== undefined) entry.maxRawScale = normalizeCell(row[cols.rangeMax])
    if (cols.scaledMin !== undefined) entry.minEUScale = normalizeCell(row[cols.scaledMin])
    if (cols.scaledMax !== undefined) entry.maxEUScale = normalizeCell(row[cols.scaledMax])

    entries.push(entry)
  }

  if (entries.length === 0 && racks.length === 0) return null

  const primaryPanel = racks[0]?.name ?? sheetName
  return { sheetName, panel: primaryPanel, racks, slots, entries }
}

const SHEET_BLOCKLIST = /^(architecture|title|ip address schedule)$/i

export function shouldTryParseSheet(name: string): boolean {
  if (SHEET_BLOCKLIST.test(name.trim())) return false
  return true
}

export function parseIOScheduleWorkbook(buffer: ArrayBuffer): ParseIOScheduleResult {
  const errors: string[] = []
  const sheets: ParsedIOSheet[] = []
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  } catch (e) {
    return { sheets: [], errors: [`Invalid Excel file: ${e instanceof Error ? e.message : String(e)}`] }
  }

  for (const sheetName of wb.SheetNames) {
    if (!shouldTryParseSheet(sheetName)) continue
    const sh = wb.Sheets[sheetName]
    if (!sh) continue
    const rows = XLSX.utils.sheet_to_json<string[]>(sh, { header: 1, defval: '', raw: false }) as string[][]
    const parsed = parseDuluxSheet(sheetName, rows)
    if (parsed && parsed.entries.length > 0) sheets.push(parsed)
  }

  if (sheets.length === 0) {
    errors.push('No IO schedule sheets found. Expected worksheets with Rack / Slot / Channel headers (Dulux-style layout).')
  }

  return { sheets, errors }
}

// ── Export ───────────────────────────────────────────────────────────────────

function safeSheetName(name: string, used: Set<string>): string {
  let safe = name.replace(/[\\/*?[\]:]/g, '').substring(0, 31)
  if (!safe) safe = 'IO'
  let result = safe
  let i = 2
  while (used.has(result)) {
    const suffix = ` (${i++})`
    result = safe.substring(0, 31 - suffix.length) + suffix
  }
  used.add(result)
  return result
}

function buildReverseIO(
  interfaceInstances: InterfaceInstance[],
  userInterfaces: UserInterface[]
): Map<string, string> {
  const ifaceMap = new Map(userInterfaces.map((i) => [i.id, i]))
  const map = new Map<string, string>()
  for (const inst of interfaceInstances) {
    if (!inst.ioMappings) continue
    const iface = ifaceMap.get(inst.interfaceId)
    for (const [fieldId, entryId] of Object.entries(inst.ioMappings)) {
      const field = iface?.fields.find((f) => f.id === fieldId)
      map.set(entryId, `${inst.name}.${field?.name ?? fieldId}`)
    }
  }
  return map
}

export type IOScheduleStoreSnapshot = {
  ioRacks: IORack[]
  ioSlots: IOSlot[]
  ioEntries: IOEntry[]
  addIORack: (name: string) => string
  removeIORack: (id: string) => void
  addIOSlot: (rackId: string, name: string, catalogNumber?: string) => string
  updateIOSlot: (id: string, patch: Partial<IOSlot>) => void
  addIOEntry: (entry: IOEntry) => void
  updateIOEntry: (id: string, patch: Partial<IOEntry>) => void
}

/** Merge parsed Dulux sheets into the project. Replace clears all racks and re-imports. */
export function applyIOScheduleSheets(
  sheets: ParsedIOSheet[],
  replace: boolean,
  getState: () => IOScheduleStoreSnapshot
): void {
  if (sheets.length === 0) return

  if (replace) {
    let snap = getState()
    for (const id of [...snap.ioRacks.map((r) => r.id)]) {
      snap.removeIORack(id)
      snap = getState()
    }
  }

  for (const sh of sheets) {
    const rackIdMap = new Map<string, string>()
    const slotIdMap = new Map<string, string>()

    for (const r of sh.racks) {
      let snap = getState()
      const existing = snap.ioRacks.find((x) => x.name.toLowerCase() === r.name.toLowerCase())
      if (existing) rackIdMap.set(r.id, existing.id)
      else rackIdMap.set(r.id, snap.addIORack(r.name))
    }

    for (const sl of sh.slots) {
      const newRackId = rackIdMap.get(sl.rackId)
      if (!newRackId) continue
      let snap = getState()
      const existingSlot = snap.ioSlots.find(
        (s) => s.rackId === newRackId && s.name.toLowerCase() === sl.name.toLowerCase()
      )
      if (existingSlot) {
        slotIdMap.set(sl.id, existingSlot.id)
        if (sl.catalogNumber && !existingSlot.catalogNumber) {
          snap.updateIOSlot(existingSlot.id, { catalogNumber: sl.catalogNumber })
        }
      } else {
        slotIdMap.set(sl.id, snap.addIOSlot(newRackId, sl.name, sl.catalogNumber))
      }
    }

    for (const en of sh.entries) {
      const newSlotId = slotIdMap.get(en.slotId)
      if (!newSlotId) continue
      let snap = getState()
      const existingEntry = snap.ioEntries.find((e) => e.slotId === newSlotId && e.channel === en.channel)
      if (existingEntry) {
        snap.updateIOEntry(existingEntry.id, {
          drawingTag: en.drawingTag,
          drawingReference: en.drawingReference,
          description1: en.description1,
          description2: en.description2,
          description3: en.description3,
          ioType: en.ioType,
          unitOfMeasure: en.unitOfMeasure,
          minRawScale: en.minRawScale,
          maxRawScale: en.maxRawScale,
          minEUScale: en.minEUScale,
          maxEUScale: en.maxEUScale
        })
      } else {
        snap.addIOEntry({ ...en, id: uid('io'), slotId: newSlotId })
      }
    }
  }
}

/** Append Dulux-style IO sheets to an existing workbook (one sheet per rack). */
export function appendDuluxIOScheduleSheets(
  wb: XLSX.WorkBook,
  usedSheetNames: Set<string>,
  ioRacks: IORack[],
  ioSlots: IOSlot[],
  ioEntries: IOEntry[],
  interfaceInstances: InterfaceInstance[],
  userInterfaces: UserInterface[]
): void {
  const slotMap = new Map(ioSlots.map((s) => [s.id, s]))
  const linked = buildReverseIO(interfaceInstances, userInterfaces)

  const byRack = new Map<string, IOEntry[]>()
  for (const e of ioEntries) {
    const slot = slotMap.get(e.slotId)
    if (!slot) continue
    const list = byRack.get(slot.rackId) ?? []
    list.push(e)
    byRack.set(slot.rackId, list)
  }

  let appended = 0
  for (const rack of ioRacks) {
    const entries = byRack.get(rack.id) ?? []
    const sheetRows: string[][] = []

    const title = `IO ${rack.name}`
    const name = safeSheetName(title, usedSheetNames)

    // Column indices match Dulux sample: Device Tag=5, I/O type=12, Rack=13, Slot=14, Channel=15, Symbolic=16
    sheetRows.push(padRow(['', '', '', '', '', 'Device\nTag', 'Description', 'Panel', 'System', 'PLC / IO Card Model No.', 'Base Unit Model No.', 'I/O', 'I/O', '', '', '', 'Signal', 'Signal'], COL_COUNT))
    sheetRows.push(padRow(['', '', '', '', '', '', '', '', '', '', '', '', 'Type', 'Location', '', '', 'Symbolic Address (From PLC)', '', 'Analog', '', '', '', '', '', '', 'Safety', 'PLC', '', 'P&ID No.', 'Layout Drawing', 'Linked Instance'], COL_COUNT))
    sheetRows.push(padRow(['', '', '', '', '', '', '', '', '', '', '', '', '', 'Rack', 'Slot', 'Channel', '', '', 'Measurement Type', 'Range Min', 'Range Max', 'Scaled Min', 'Scaled Max', 'Calibration', 'Alarms', 'Type', 'Address', '', '', '', ''], COL_COUNT))

    let line = 1
    for (const entry of entries) {
      const slot = slotMap.get(entry.slotId)
      if (!slot) continue
      const m = /^(\d+)\s*-\s*(\d+)$/.exec(slot.name.trim())
      const rackNum = m ? m[1] : '1'
      const slotNum = m ? m[2] : slot.name
      const ioLabel = ioTypeToScheduleLabel(entry.ioType)
      const row = padRow([], COL_COUNT)
      row[0] = String(line++)
      row[4] = 'C'
      row[5] = entry.drawingTag
      row[6] = entry.description1
      row[7] = rack.name
      row[8] = ''
      row[9] = slot.catalogNumber ?? ''
      row[10] = slot.catalogNumber ?? ''
      row[12] = ioLabel
      row[13] = rackNum
      row[14] = slotNum
      row[15] = entry.channel
      row[16] = entry.drawingReference
      if (entry.description2) row[18] = entry.description2
      if (entry.minRawScale) row[19] = entry.minRawScale
      if (entry.maxRawScale) row[20] = entry.maxRawScale
      if (entry.minEUScale) row[21] = entry.minEUScale
      if (entry.maxEUScale) row[22] = entry.maxEUScale
      row[COL_COUNT - 1] = linked.get(entry.id) ?? ''
      sheetRows.push(row)
    }

    if (sheetRows.length <= 3) {
      sheetRows.push(padRow(['1', '', '', '', '', '', '', rack.name, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], COL_COUNT))
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetRows)
    ws['!cols'] = Array.from({ length: COL_COUNT }, () => ({ wch: 12 }))
    XLSX.utils.book_append_sheet(wb, ws, name)
    appended++
  }

  if (appended === 0) {
    const ws = XLSX.utils.aoa_to_sheet([[padRow(['(No IO entries)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], COL_COUNT)]])
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName('IO Schedule', usedSheetNames))
  }
}

/** One sheet per panel (rack), data columns aligned to Dulux-style indices. */
export function buildIOScheduleWorkbook(
  ioRacks: IORack[],
  ioSlots: IOSlot[],
  ioEntries: IOEntry[],
  interfaceInstances: InterfaceInstance[],
  userInterfaces: UserInterface[]
): string {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()
  appendDuluxIOScheduleSheets(wb, used, ioRacks, ioSlots, ioEntries, interfaceInstances, userInterfaces)
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string
}
