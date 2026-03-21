import type { Node, Edge } from '@xyflow/react'

export type DiagramMode = 'flowchart' | 'sequence'

// ── PLC Node Types ───────────────────────────────────────────────────────────

export type PLCNodeType =
  | 'start'
  | 'end'
  | 'step'
  | 'process'
  | 'output'
  | 'actor'
  | 'transition'
  | 'note'

export interface PLCNodeData extends Record<string, unknown> {
  label: string
  description?: string
  condition?: string       // for transition nodes
  tagName?: string         // for output nodes
  outputType?: 'coil' | 'move' | 'compare' | 'timer' | 'counter'
  stepNumber?: number      // for step nodes
  packMLState?: PackMLState // optional PackML state tag for step nodes
  actorType?: 'plc' | 'hmi' | 'device' | 'operator' | 'system'
  color?: string           // custom override color
  routineName?: string     // for process nodes
  linkedTabId?: string     // cross-diagram anchor: target tab ID
  linkedNodeId?: string    // cross-diagram anchor: target node ID within that tab (optional)
}

export type PLCNode = Node<PLCNodeData, PLCNodeType>
export interface PLCEdgeData extends Record<string, unknown> {
  label?: string
  condition?: string
  waypoints?: { x: number; y: number }[]
}

export type PLCEdge = Edge<PLCEdgeData>

// ── Sequence Diagram ─────────────────────────────────────────────────────────

export interface SequenceActor {
  id: string
  name: string
  type: 'plc' | 'hmi' | 'device' | 'operator' | 'system'
  color: string
}

export type MessageType = 'sync' | 'async' | 'return' | 'signal'

export interface SequenceMessage {
  id: string
  fromId: string
  toId: string
  label: string
  type: MessageType
  note?: string
  order: number
}

// ── PackML States ─────────────────────────────────────────────────────────────

/** ISA-88 / OMAC PackML state machine states */
export type PackMLState =
  // ── Wait states (stable — equipment stationary) ──────────────────────────
  | 'stopped' | 'idle' | 'suspended' | 'execute' | 'held' | 'complete' | 'aborted'
  // ── Acting states (transitional — equipment performing actions) ──────────
  | 'clearing' | 'starting' | 'stopping' | 'aborting'
  | 'holding' | 'unholding' | 'suspending' | 'unsuspending'
  | 'resetting' | 'completing'

export type PackMLCategory = 'wait' | 'acting'

export interface PackMLStateDef {
  label: string
  category: PackMLCategory
  bgColor: string
  textColor: string
  borderColor: string
}

export const PACKML_STATES: Record<PackMLState, PackMLStateDef> = {
  // ── Wait states ───────────────────────────────────────────────────────────
  execute:      { label: 'Execute',      category: 'wait',   bgColor: '#dcfce7', textColor: '#166534', borderColor: '#16a34a' },
  idle:         { label: 'Idle',         category: 'wait',   bgColor: '#dbeafe', textColor: '#1e40af', borderColor: '#2563eb' },
  complete:     { label: 'Complete',     category: 'wait',   bgColor: '#ccfbf1', textColor: '#0f766e', borderColor: '#0d9488' },
  stopped:      { label: 'Stopped',      category: 'wait',   bgColor: '#f1f5f9', textColor: '#475569', borderColor: '#64748b' },
  aborted:      { label: 'Aborted',      category: 'wait',   bgColor: '#fee2e2', textColor: '#991b1b', borderColor: '#dc2626' },
  held:         { label: 'Held',         category: 'wait',   bgColor: '#fef3c7', textColor: '#92400e', borderColor: '#d97706' },
  suspended:    { label: 'Suspended',    category: 'wait',   bgColor: '#fef9c3', textColor: '#854d0e', borderColor: '#ca8a04' },
  // ── Acting states (transitional) ─────────────────────────────────────────
  starting:     { label: 'Starting',     category: 'acting', bgColor: '#d1fae5', textColor: '#065f46', borderColor: '#059669' },
  stopping:     { label: 'Stopping',     category: 'acting', bgColor: '#fee2e2', textColor: '#991b1b', borderColor: '#dc2626' },
  aborting:     { label: 'Aborting',     category: 'acting', bgColor: '#fecaca', textColor: '#7f1d1d', borderColor: '#ef4444' },
  clearing:     { label: 'Clearing',     category: 'acting', bgColor: '#e0f2fe', textColor: '#075985', borderColor: '#0284c7' },
  resetting:    { label: 'Resetting',    category: 'acting', bgColor: '#dbeafe', textColor: '#1e40af', borderColor: '#3b82f6' },
  holding:      { label: 'Holding',      category: 'acting', bgColor: '#fef3c7', textColor: '#92400e', borderColor: '#f59e0b' },
  unholding:    { label: 'Unholding',    category: 'acting', bgColor: '#fef3c7', textColor: '#92400e', borderColor: '#f59e0b' },
  suspending:   { label: 'Suspending',   category: 'acting', bgColor: '#fef9c3', textColor: '#854d0e', borderColor: '#eab308' },
  unsuspending: { label: 'Unsuspending', category: 'acting', bgColor: '#fef9c3', textColor: '#854d0e', borderColor: '#eab308' },
  completing:   { label: 'Completing',   category: 'acting', bgColor: '#ccfbf1', textColor: '#0f766e', borderColor: '#14b8a6' },
}

/** All wait-state keys in display order */
export const PACKML_WAIT_STATES: PackMLState[] = [
  'execute', 'idle', 'complete', 'stopped', 'held', 'suspended', 'aborted'
]
/** All acting-state keys in display order */
export const PACKML_ACTING_STATES: PackMLState[] = [
  'starting', 'stopping', 'completing', 'aborting', 'clearing',
  'holding', 'unholding', 'suspending', 'unsuspending', 'resetting'
]

// ── Page Size ─────────────────────────────────────────────────────────────────

export type PageSizeKey = 'A4' | 'A3' | 'A2' | 'A1' | 'A0'
export type PageOrientation = 'portrait' | 'landscape'

/** Physical dimensions in millimetres (portrait orientation) */
export interface PageSizeDef { widthMm: number; heightMm: number }

export const PAGE_SIZES: Record<PageSizeKey, PageSizeDef> = {
  A4: { widthMm: 210,  heightMm: 297  },
  A3: { widthMm: 297,  heightMm: 420  },
  A2: { widthMm: 420,  heightMm: 594  },
  A1: { widthMm: 594,  heightMm: 841  },
  A0: { widthMm: 841,  heightMm: 1189 },
}

/** Convert mm to canvas units (96 DPI: 1 in = 96 px, 1 mm = 96/25.4 px) */
export const MM_TO_PX = 96 / 25.4

/** Returns page width × height in canvas units, applying orientation */
export function pageDimensions(key: PageSizeKey, orientation: PageOrientation): { w: number; h: number } {
  const { widthMm, heightMm } = PAGE_SIZES[key]
  const wPx = Math.round(widthMm * MM_TO_PX)
  const hPx = Math.round(heightMm * MM_TO_PX)
  return orientation === 'portrait' ? { w: wPx, h: hPx } : { w: hPx, h: wPx }
}

// ── Revision History ─────────────────────────────────────────────────────────

export interface RevisionSnapshot {
  flowNodes: PLCNode[]
  flowEdges: PLCEdge[]
  seqActors: SequenceActor[]
  seqMessages: SequenceMessage[]
}

export interface Revision {
  id: string
  name: string
  author: string
  date: string       // ISO string
  description?: string
  snapshot: RevisionSnapshot
}

// ── Plant / Area / Location ───────────────────────────────────────────────────

export interface Plant {
  id: string
  name: string
}

export interface Area {
  id: string
  name: string
  plantId: string
}

export interface Location {
  id: string
  name: string
  areaId: string
}

// ── Locations ────────────────────────────────────────────────────────────────

export const LOCATIONS_TAB_ID = '__locations__'

// ── Interfaces ───────────────────────────────────────────────────────────────

export const INTERFACES_TAB_ID = '__interfaces__'

export type InterfaceType = 'AOI' | 'UDT'

export type AOIFieldUsage = 'Input' | 'Output' | 'InOut' | 'Local'

export interface InterfaceField {
  id: string
  name: string
  dataType: string          // e.g. 'BOOL', 'DINT', 'REAL', 'STRING[82]'
  usage?: AOIFieldUsage     // relevant for AOI parameters
  description?: string
  defaultValue?: string
  includeInMatrix?: boolean // explicit override for C&E matrix inclusion
}

export interface UserInterface {
  id: string
  name: string
  type: InterfaceType
  description?: string
  fields: InterfaceField[]
  createdAt: string
}

export interface InterfaceInstance {
  id: string
  name: string
  tagName: string
  interfaceId: string       // references UserInterface.id
  locationId?: string       // references Location.id
  description?: string
  createdAt: string
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export const TASKS_TAB_ID = '__tasks__'

export interface SubTask {
  id: string
  name: string
  designed: boolean
  programmed: boolean
  tested: boolean
  linkedTabId?: string
  linkedSlotId?: string
  linkedEntryId?: string
  linkedInstanceId?: string
}

export interface Task {
  id: string
  name: string
  flowchartTabId: string | null
  sequenceTabId: string | null
  ioRackId: string | null
  ioSlotId: string | null
  ioEntryId: string | null
  instanceId: string | null
  subTasks: SubTask[]
  autoGenKey?: string
}

export interface TaskAutoGenSettings {
  ioCardFAT: boolean
  analogSAT: boolean
  sequenceTesting: boolean
  deviceTesting: boolean
}

// ── IO Table ──────────────────────────────────────────────────────────────────

export const IO_TABLE_TAB_ID = '__iotable__'

export type IOType = 'DI' | 'DO' | 'AI' | 'AO' | 'RTD' | 'TC' | ''

export interface IORack {
  id: string
  name: string
}

export interface IOSlot {
  id: string
  rackId: string
  name: string
  catalogNumber?: string
}

export interface IOEntry {
  id: string
  slotId: string
  channel: string
  drawingTag: string
  drawingReference: string
  description1: string
  description2: string
  description3: string
  ioType: IOType
  unitOfMeasure: string
  minRawScale: string
  maxRawScale: string
  minEUScale: string
  maxEUScale: string
}

// ── Cause & Effect Matrix ─────────────────────────────────────────────────────

/** Sparse 3-level map: stepNodeId → instanceId → fieldId → value */
export type MatrixCellValue = boolean | number | null
export type MatrixData = Record<string, Record<string, Record<string, MatrixCellValue>>>

// ── Tree Folder ──────────────────────────────────────────────────────────────

export interface TreeFolder {
  id: string
  name: string
  parentId: string | null
  sortIndex: number
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export interface DiagramTab {
  id: string
  name: string
  type: DiagramMode
  folderId: string | null
  sortIndex: number
  group?: string              // PLC task name (L5K metadata)
  subGroup?: string           // PLC program name (L5K metadata)
  flowNodes: PLCNode[]
  flowEdges: PLCEdge[]
  seqActors: SequenceActor[]
  seqMessages: SequenceMessage[]
  lastTouchedNodeId: string | null
  revisions: Revision[]
  pageSize: PageSizeKey | null
  pageOrientation: PageOrientation
}

// ── Project ──────────────────────────────────────────────────────────────────

export interface DiagramProject {
  version: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  tabs: DiagramTab[]
  folders?: TreeFolder[]
  activeTabId: string
  openTabIds?: string[]
  plants?: Plant[]
  areas?: Area[]
  locations?: Location[]
  userInterfaces?: UserInterface[]
  interfaceInstances?: InterfaceInstance[]
  matrixData?: MatrixData
  matrixShownInstances?: Record<string, string[]>
  ioRacks?: IORack[]
  ioSlots?: IOSlot[]
  ioEntries?: IOEntry[]
  tasks?: Task[]
  taskNotes?: string
  taskAutoGen?: TaskAutoGenSettings
}

// ── Electron API ─────────────────────────────────────────────────────────────

export interface ElectronAPI {
  saveFile: (content: unknown, defaultName?: string) => Promise<{ success: boolean; filePath?: string }>
  openFile: () => Promise<{ success: boolean; content?: DiagramProject; filePath?: string }>
  exportImage: (ext: string) => Promise<string | null>
  writeFile: (filePath: string, data: string, encoding?: string) => Promise<boolean>
  onMenu: (channel: string, cb: () => void) => () => void
  loadLibrary: () => Promise<UserInterface[]>
  saveLibrary: (items: UserInterface[]) => Promise<boolean>
  importInterfaces: () => Promise<UserInterface[] | null>
  exportInterfaces: (items: UserInterface[], defaultName?: string) => Promise<boolean>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
