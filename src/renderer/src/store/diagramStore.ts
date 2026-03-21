import { create } from 'zustand'
import { addEdge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeChange, EdgeChange, Connection } from '@xyflow/react'
import type {
  DiagramMode, DiagramTab, PLCNode, PLCEdge, PLCNodeType, PLCNodeData,
  SequenceActor, SequenceMessage, DiagramProject, Revision,
  PageSizeKey, PageOrientation,
  UserInterface, InterfaceInstance, InterfaceField,
  MatrixData, MatrixCellValue,
  Plant, Area, Location,
  TreeFolder,
  Task, SubTask, TaskAutoGenSettings,
  IORack, IOSlot, IOEntry
} from '../types'
import { INTERFACES_TAB_ID, LOCATIONS_TAB_ID, TASKS_TAB_ID, IO_TABLE_TAB_ID } from '../types'

const PROJECT_VERSION = '2.0'
import { uid } from '../utils/uid'

const DROP_GAP = 64

// ── Helpers ──────────────────────────────────────────────────────────────────

const PROTECTED_NODE_TYPES: PLCNodeType[] = ['start', 'end']

function emptyTab(name: string, type: DiagramMode): DiagramTab {
  const flowNodes: PLCNode[] = type === 'flowchart'
    ? [
        { id: uid('start'), type: 'start', position: { x: 200, y: 60  }, data: { label: 'Start' } as PLCNodeData },
        { id: uid('end'),   type: 'end',   position: { x: 200, y: 520 }, data: { label: 'End'   } as PLCNodeData }
      ]
    : []

  return {
    id: uid('tab'),
    name,
    type,
    folderId: null,
    sortIndex: 0,
    flowNodes,
    flowEdges: [],
    seqActors: [],
    seqMessages: [],
    lastTouchedNodeId: null,
    revisions: [],
    pageSize: null,
    pageOrientation: 'portrait'
  }
}

function defaultTabs(): DiagramTab[] {
  return [emptyTab('Main Flow', 'flowchart')]
}

// Patch the active tab immutably
function patchActive(
  tabs: DiagramTab[],
  activeTabId: string,
  patch: Partial<DiagramTab>
): DiagramTab[] {
  return tabs.map((t) => (t.id === activeTabId ? { ...t, ...patch } : t))
}

function updateById<T extends { id: string }>(items: T[], id: string, patch: Partial<T>): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id)
}

function clearLocationRefs(instances: InterfaceInstance[], locationIds: string[]): InterfaceInstance[] {
  const ids = new Set(locationIds)
  return instances.map((i) => ids.has(i.locationId ?? '') ? { ...i, locationId: undefined } : i)
}

function findOrCreateAutoGenTask(
  tasks: Task[],
  autoGenKey: string,
  defaultName: string
): { tasks: Task[]; task: Task } {
  const existing = tasks.find((t) => t.autoGenKey === autoGenKey)
  if (existing) return { tasks, task: existing }
  const task: Task = {
    id: uid('task'),
    name: defaultName,
    flowchartTabId: null,
    sequenceTabId: null,
    ioRackId: null,
    ioSlotId: null,
    ioEntryId: null,
    instanceId: null,
    subTasks: [],
    autoGenKey
  }
  return { tasks: [...tasks, task], task }
}

interface SubTaskLinks {
  linkedTabId?: string
  linkedSlotId?: string
  linkedEntryId?: string
  linkedInstanceId?: string
}

function addAutoGenSubTask(
  tasks: Task[],
  taskId: string,
  subName: string,
  dedupeKey?: string,
  links?: SubTaskLinks
): Task[] {
  return tasks.map((t) => {
    if (t.id !== taskId) return t
    if (dedupeKey && t.subTasks.some((st) => st.name === dedupeKey)) return t
    const sub: SubTask = {
      id: uid('sub'), name: subName,
      designed: false, programmed: false, tested: false,
      ...links
    }
    return { ...t, subTasks: [...t.subTasks, sub] }
  })
}

/** Migrate legacy group/subGroup tab properties into explicit TreeFolder entries */
function migrateLegacyGroupsToFolders(tabs: DiagramTab[]): { migratedFolders: TreeFolder[]; migratedTabs: DiagramTab[] } {
  const folders: TreeFolder[] = []
  const taskFolderIds = new Map<string, string>()
  const progFolderIds = new Map<string, string>()
  let taskIdx = 0

  for (const tab of tabs) {
    const task = tab.group ?? ''
    const prog = tab.subGroup ?? ''
    if (!task && !prog) continue

    if (task && !taskFolderIds.has(task)) {
      const id = uid('folder')
      folders.push({ id, name: task, parentId: null, sortIndex: taskIdx++ })
      taskFolderIds.set(task, id)
    }

    if (prog) {
      const compositeKey = `${task}::${prog}`
      if (!progFolderIds.has(compositeKey)) {
        const id = uid('folder')
        const parentId = task ? taskFolderIds.get(task)! : null
        const siblingCount = folders.filter((f) => f.parentId === parentId).length
        folders.push({ id, name: prog, parentId, sortIndex: siblingCount })
        progFolderIds.set(compositeKey, id)
      }
    }
  }

  const parentCounters = new Map<string | null, number>()
  const migratedTabs = tabs.map((tab) => {
    const task = tab.group ?? ''
    const prog = tab.subGroup ?? ''
    let folderId: string | null = null
    if (prog) {
      folderId = progFolderIds.get(`${task}::${prog}`) ?? null
    } else if (task) {
      folderId = taskFolderIds.get(task) ?? null
    }
    const count = parentCounters.get(folderId) ?? 0
    parentCounters.set(folderId, count + 1)
    return { ...tab, folderId, sortIndex: count }
  })

  return { migratedFolders: folders, migratedTabs }
}

// ── Store interface ───────────────────────────────────────────────────────────

interface HistoryEntry {
  tabs: DiagramTab[]
}

interface DiagramStore {
  // ── Project ────────────────────────────────────────────────────────────────
  projectName: string
  isDirty: boolean
  currentFilePath: string | null
  setProjectName: (name: string) => void
  setCurrentFilePath: (path: string | null) => void

  // ── Tabs ───────────────────────────────────────────────────────────────────
  tabs: DiagramTab[]
  activeTabId: string
  openTabIds: string[]
  addTab: (name: string, type: DiagramMode, opts?: { nodes?: PLCNode[]; edges?: PLCEdge[]; group?: string; subGroup?: string; folderId?: string | null; activate?: boolean }) => string
  removeTab: (id: string) => void
  closeTab: (id: string) => void
  renameTab: (id: string, name: string) => void
  setActiveTab: (id: string) => void
  moveTab: (tabId: string, folderId: string | null, sortIndex: number) => void
  duplicateTab: (id: string) => void

  // ── Folders ─────────────────────────────────────────────────────────────────
  folders: TreeFolder[]
  addFolder: (name: string, parentId?: string | null) => string
  renameFolder: (id: string, name: string) => void
  removeFolder: (id: string) => void
  moveFolder: (folderId: string, parentId: string | null, sortIndex: number) => void

  // ── Flowchart (operates on active tab) ────────────────────────────────────
  onFlowNodesChange: (changes: NodeChange<PLCNode>[]) => void
  onFlowEdgesChange: (changes: EdgeChange<PLCEdge>[]) => void
  onFlowConnect: (connection: Connection) => void
  setFlowNodes: (nodes: PLCNode[]) => void
  setFlowEdges: (edges: PLCEdge[]) => void
  addNodeBelow: (type: PLCNodeType, label: string) => void
  setLastTouchedNodeId: (id: string | null) => void

  // ── Sequence (operates on active tab) ─────────────────────────────────────
  addSeqActor: (actor: SequenceActor) => void
  updateSeqActor: (id: string, patch: Partial<SequenceActor>) => void
  removeSeqActor: (id: string) => void
  addSeqMessage: (msg: SequenceMessage) => void
  updateSeqMessage: (id: string, patch: Partial<SequenceMessage>) => void
  removeSeqMessage: (id: string) => void
  reorderSeqMessage: (id: string, newOrder: number) => void

  // ── Page Size ──────────────────────────────────────────────────────────────
  setPageSettings: (size: PageSizeKey | null, orientation: PageOrientation) => void

  // ── Revision History ───────────────────────────────────────────────────────
  viewingRevisionId: string | null
  createRevision: (name: string, author: string, description?: string) => void
  setViewingRevision: (id: string | null) => void

  // ── Selection ──────────────────────────────────────────────────────────────
  selectedNodeId: string | null
  selectedEdgeId: string | null
  setSelectedNode: (id: string | null) => void
  setSelectedEdge: (id: string | null) => void

  // ── Cross-diagram Navigation ────────────────────────────────────────────────
  pendingFocusNodeId: string | null
  setPendingFocusNodeId: (id: string | null) => void

  // ── History ────────────────────────────────────────────────────────────────
  history: HistoryEntry[]
  historyIndex: number
  pushHistory: () => void
  undo: () => void
  redo: () => void

  // ── Plant / Area / Location ────────────────────────────────────────────────
  plants: Plant[]
  areas: Area[]
  locations: Location[]
  addPlant: (plant: Plant) => void
  updatePlant: (id: string, patch: Partial<Plant>) => void
  removePlant: (id: string) => void
  addArea: (area: Area) => void
  updateArea: (id: string, patch: Partial<Area>) => void
  removeArea: (id: string) => void
  addLocation: (location: Location) => void
  updateLocation: (id: string, patch: Partial<Location>) => void
  removeLocation: (id: string) => void

  // ── Interfaces (project-level library) ────────────────────────────────────
  userInterfaces: UserInterface[]
  interfaceInstances: InterfaceInstance[]
  addUserInterface: (iface: UserInterface) => void
  addUserInterfacesBulk: (ifaces: UserInterface[]) => void
  updateUserInterface: (id: string, patch: Partial<UserInterface>) => void
  removeUserInterface: (id: string) => void
  addInterfaceInstance: (instance: InterfaceInstance) => void
  updateInterfaceInstance: (id: string, patch: Partial<InterfaceInstance>) => void
  removeInterfaceInstance: (id: string) => void
  addFieldToInterface: (interfaceId: string, field: InterfaceField) => void
  updateFieldInInterface: (interfaceId: string, fieldId: string, patch: Partial<InterfaceField>) => void
  removeFieldFromInterface: (interfaceId: string, fieldId: string) => void

  // ── Cause & Effect Matrix ──────────────────────────────────────────────────
  matrixData: MatrixData
  setMatrixCell: (stepId: string, instanceId: string, fieldId: string, value: MatrixCellValue) => void
  matrixShownInstances: Record<string, string[]>
  setMatrixShownInstances: (tabId: string, instanceIds: string[]) => void

  // ── IO Table ────────────────────────────────────────────────────────────────
  ioRacks: IORack[]
  addIORack: (name: string) => string
  updateIORack: (id: string, patch: Partial<IORack>) => void
  removeIORack: (id: string) => void
  ioSlots: IOSlot[]
  addIOSlot: (rackId: string, name: string, catalogNumber?: string) => string
  updateIOSlot: (id: string, patch: Partial<IOSlot>) => void
  removeIOSlot: (id: string) => void
  ioEntries: IOEntry[]
  addIOEntry: (entry: IOEntry) => void
  updateIOEntry: (id: string, patch: Partial<IOEntry>) => void
  removeIOEntry: (id: string) => void
  reorderIOEntry: (id: string, newIndex: number) => void

  // ── Tasks ──────────────────────────────────────────────────────────────────
  tasks: Task[]
  addTask: (name: string) => string
  updateTask: (id: string, patch: Partial<Pick<Task, 'name' | 'flowchartTabId' | 'sequenceTabId' | 'ioRackId' | 'ioSlotId' | 'ioEntryId' | 'instanceId'>>) => void
  removeTask: (id: string) => void
  reorderTask: (id: string, newIndex: number) => void
  addSubTask: (taskId: string, name: string) => void
  updateSubTask: (taskId: string, subTaskId: string, patch: Partial<Pick<SubTask, 'name' | 'designed' | 'programmed' | 'tested' | 'linkedTabId' | 'linkedSlotId' | 'linkedEntryId' | 'linkedInstanceId'>>) => void
  removeSubTask: (taskId: string, subTaskId: string) => void
  taskNotes: string
  setTaskNotes: (html: string) => void
  taskAutoGen: TaskAutoGenSettings
  setTaskAutoGen: (patch: Partial<TaskAutoGenSettings>) => void

  // ── Project I/O ────────────────────────────────────────────────────────────
  newProject: () => void
  loadProject: (project: DiagramProject, filePath: string) => void
  toProject: () => DiagramProject
}

// ── Store implementation ──────────────────────────────────────────────────────

const initialTabs = defaultTabs()

export const useDiagramStore = create<DiagramStore>((set, get) => ({
  // ── Project ────────────────────────────────────────────────────────────────
  projectName: 'Untitled Project',
  isDirty: false,
  currentFilePath: null,
  setProjectName: (name) => set({ projectName: name, isDirty: true }),
  setCurrentFilePath: (path) => set({ currentFilePath: path }),

  // ── Tabs ───────────────────────────────────────────────────────────────────
  tabs: initialTabs,
  activeTabId: INTERFACES_TAB_ID,
  openTabIds: [],

  addTab: (name, type, opts) => {
    const folderId = opts?.folderId ?? null
    const sortIndex = get().tabs.filter((t) => t.folderId === folderId).length
    const activate = opts?.activate !== false
    const tab: DiagramTab = {
      ...emptyTab(name, type),
      folderId,
      sortIndex,
      ...(opts?.nodes ? { flowNodes: opts.nodes } : {}),
      ...(opts?.edges ? { flowEdges: opts.edges } : {}),
      ...(opts?.group ? { group: opts.group } : {}),
      ...(opts?.subGroup ? { subGroup: opts.subGroup } : {})
    }
    set((s) => {
      const result: Record<string, unknown> = {
        tabs: [...s.tabs, tab],
        isDirty: true
      }
      if (activate) {
        result.activeTabId = tab.id
        result.selectedNodeId = null
        result.selectedEdgeId = null
        result.openTabIds = [...s.openTabIds, tab.id]
      }
      if (s.taskAutoGen.sequenceTesting && type === 'flowchart') {
        const { tasks: t1, task } = findOrCreateAutoGenTask(s.tasks, 'auto:sequences', 'Sequences')
        result.tasks = addAutoGenSubTask(t1, task.id, name, name, { linkedTabId: tab.id })
      }
      return result
    })
    get().pushHistory()
    return tab.id
  },

  removeTab: (id) => {
    const { tabs, activeTabId, openTabIds } = get()
    if (tabs.length <= 1) return
    const newTabs = tabs.filter((t) => t.id !== id)
    const newOpenIds = openTabIds.filter((oid) => oid !== id)
    let newActiveId = activeTabId
    if (id === activeTabId) {
      if (newOpenIds.length > 0) {
        const oldIdx = openTabIds.indexOf(id)
        newActiveId = newOpenIds[Math.min(oldIdx, newOpenIds.length - 1)]
      } else {
        newActiveId = INTERFACES_TAB_ID
      }
    }
    set({ tabs: newTabs, openTabIds: newOpenIds, activeTabId: newActiveId, isDirty: true })
    get().pushHistory()
  },

  closeTab: (id) => {
    const { activeTabId, openTabIds } = get()
    const newOpenIds = openTabIds.filter((oid) => oid !== id)
    let newActiveId = activeTabId
    if (id === activeTabId) {
      if (newOpenIds.length > 0) {
        const oldIdx = openTabIds.indexOf(id)
        newActiveId = newOpenIds[Math.min(oldIdx, newOpenIds.length - 1)]
      } else {
        newActiveId = INTERFACES_TAB_ID
      }
    }
    set({ activeTabId: newActiveId, openTabIds: newOpenIds })
  },

  renameTab: (id, name) => {
    set((s) => ({ tabs: updateById(s.tabs, id, { name }), isDirty: true }))
  },

  setActiveTab: (id) => set((s) => ({
    activeTabId: id,
    selectedNodeId: null,
    selectedEdgeId: null,
    viewingRevisionId: null,
    openTabIds: id !== INTERFACES_TAB_ID && id !== LOCATIONS_TAB_ID && id !== TASKS_TAB_ID && id !== IO_TABLE_TAB_ID && !s.openTabIds.includes(id)
      ? [...s.openTabIds, id]
      : s.openTabIds
  })),

  moveTab: (tabId, folderId, sortIndex) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      if (!tab) return s
      const oldFolderId = tab.folderId
      let tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, folderId, sortIndex } : t
      )
      // Compact sort indices in old parent
      if (oldFolderId !== folderId) {
        const oldSiblings = tabs.filter((t) => t.folderId === oldFolderId && t.id !== tabId)
          .sort((a, b) => a.sortIndex - b.sortIndex)
        tabs = tabs.map((t) => {
          if (t.folderId === oldFolderId && t.id !== tabId) {
            return { ...t, sortIndex: oldSiblings.indexOf(t) }
          }
          return t
        })
      }
      // Bump siblings at or after the new sortIndex in the target folder
      const targetSiblings = tabs.filter((t) => t.folderId === folderId && t.id !== tabId)
      tabs = tabs.map((t) => {
        if (t.folderId === folderId && t.id !== tabId && t.sortIndex >= sortIndex) {
          return { ...t, sortIndex: t.sortIndex + 1 }
        }
        return t
      })
      // Compact target folder sort indices
      const finalSiblings = tabs.filter((t) => t.folderId === folderId)
        .sort((a, b) => a.sortIndex - b.sortIndex)
      tabs = tabs.map((t) => {
        if (t.folderId === folderId) {
          return { ...t, sortIndex: finalSiblings.indexOf(t) }
        }
        return t
      })
      return { tabs, isDirty: true }
    })
  },

  duplicateTab: (id) => {
    const { tabs, pushHistory } = get()
    const src = tabs.find((t) => t.id === id)
    if (!src) return
    const newTab: DiagramTab = {
      ...JSON.parse(JSON.stringify(src)),
      id: uid('tab'),
      name: `${src.name} (Copy)`,
      sortIndex: tabs.filter((t) => t.folderId === src.folderId).length,
      revisions: []
    }
    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: newTab.id,
      openTabIds: [...s.openTabIds, newTab.id],
      isDirty: true
    }))
    pushHistory()
  },

  // ── Folders ─────────────────────────────────────────────────────────────────
  folders: [],

  addFolder: (name, parentId = null) => {
    const id = uid('folder')
    const sortIndex = get().folders.filter((f) => f.parentId === (parentId ?? null)).length
    const folder: TreeFolder = { id, name, parentId: parentId ?? null, sortIndex }
    set((s) => ({ folders: [...s.folders, folder], isDirty: true }))
    return id
  },

  renameFolder: (id, name) => {
    set((s) => ({ folders: updateById(s.folders, id, { name }), isDirty: true }))
  },

  removeFolder: (id) => {
    set((s) => {
      const folder = s.folders.find((f) => f.id === id)
      if (!folder) return s
      const parentId = folder.parentId
      // Collect all descendant folder IDs
      const descendants = new Set<string>()
      const collectDescendants = (fid: string) => {
        descendants.add(fid)
        s.folders.filter((f) => f.parentId === fid).forEach((f) => collectDescendants(f.id))
      }
      collectDescendants(id)
      // Move tabs in deleted folders to the parent
      const nextSortBase = s.tabs.filter((t) => t.folderId === parentId).length
      let bump = 0
      const tabs = s.tabs.map((t) => {
        if (descendants.has(t.folderId ?? '')) {
          return { ...t, folderId: parentId, sortIndex: nextSortBase + bump++ }
        }
        return t
      })
      // Remove the folder and all its descendant folders
      const folders = s.folders.filter((f) => !descendants.has(f.id))
      return { folders, tabs, isDirty: true }
    })
  },

  moveFolder: (folderId, parentId, sortIndex) => {
    set((s) => {
      const folder = s.folders.find((f) => f.id === folderId)
      if (!folder) return s
      // Prevent circular: cannot move a folder into one of its descendants
      const isDescendant = (pid: string | null): boolean => {
        if (pid === null) return false
        if (pid === folderId) return true
        const parent = s.folders.find((f) => f.id === pid)
        return parent ? isDescendant(parent.parentId) : false
      }
      if (isDescendant(parentId)) return s
      const oldParent = folder.parentId
      let folders = s.folders.map((f) =>
        f.id === folderId ? { ...f, parentId, sortIndex } : f
      )
      // Compact old parent
      if (oldParent !== parentId) {
        const oldSiblings = folders.filter((f) => f.parentId === oldParent && f.id !== folderId)
          .sort((a, b) => a.sortIndex - b.sortIndex)
        folders = folders.map((f) => {
          if (f.parentId === oldParent && f.id !== folderId) {
            return { ...f, sortIndex: oldSiblings.indexOf(f) }
          }
          return f
        })
      }
      // Bump and compact new parent
      folders = folders.map((f) => {
        if (f.parentId === parentId && f.id !== folderId && f.sortIndex >= sortIndex) {
          return { ...f, sortIndex: f.sortIndex + 1 }
        }
        return f
      })
      const finalSiblings = folders.filter((f) => f.parentId === parentId)
        .sort((a, b) => a.sortIndex - b.sortIndex)
      folders = folders.map((f) => {
        if (f.parentId === parentId) {
          return { ...f, sortIndex: finalSiblings.indexOf(f) }
        }
        return f
      })
      return { folders, isDirty: true }
    })
  },

  // ── Flowchart ──────────────────────────────────────────────────────────────
  onFlowNodesChange: (changes) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId)
      if (!tab) return s
      // Prevent removal of protected node types (start / end)
      const safeChanges = changes.filter((c) => {
        if (c.type !== 'remove') return true
        const node = tab.flowNodes.find((n) => n.id === c.id)
        return !PROTECTED_NODE_TYPES.includes(node?.type as PLCNodeType)
      })
      return {
        tabs: patchActive(s.tabs, s.activeTabId, {
          flowNodes: applyNodeChanges(safeChanges, tab.flowNodes) as PLCNode[]
        }),
        isDirty: true
      }
    })
  },

  onFlowEdgesChange: (changes) => {
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeTabId, {
        flowEdges: applyEdgeChanges(
          changes,
          s.tabs.find((t) => t.id === s.activeTabId)?.flowEdges ?? []
        ) as PLCEdge[]
      }),
      isDirty: true
    }))
  },

  onFlowConnect: (connection) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId)
      if (!tab) return s
      return {
        tabs: patchActive(s.tabs, s.activeTabId, {
          flowEdges: addEdge(
            { ...connection, type: 'editable', animated: false },
            tab.flowEdges
          ) as PLCEdge[]
        }),
        isDirty: true
      }
    })
    get().pushHistory()
  },

  setFlowNodes: (nodes) => {
    set((s) => ({ tabs: patchActive(s.tabs, s.activeTabId, { flowNodes: nodes }), isDirty: true }))
  },

  setFlowEdges: (edges) => {
    set((s) => ({ tabs: patchActive(s.tabs, s.activeTabId, { flowEdges: edges }), isDirty: true }))
  },

  setLastTouchedNodeId: (id) => {
    set((s) => ({ tabs: patchActive(s.tabs, s.activeTabId, { lastTouchedNodeId: id }) }))
  },

  addNodeBelow: (type, label) => {
    const { tabs, activeTabId, pushHistory } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return

    const anchor = tab.lastTouchedNodeId
      ? (tab.flowNodes.find((n) => n.id === tab.lastTouchedNodeId) as
          (PLCNode & { measured?: { width?: number; height?: number } }) | undefined)
      : null

    const position = anchor
      ? {
          x: anchor.position.x + ((anchor.measured?.width ?? 152) / 2) - 76,
          y: anchor.position.y + (anchor.measured?.height ?? 60) + DROP_GAP
        }
      : { x: 160, y: 160 }

    const newNode: PLCNode = { id: uid(), type, position, data: { label } as PLCNodeData }

    set((s) => ({
      tabs: patchActive(s.tabs, s.activeTabId, {
        flowNodes: [...(s.tabs.find((t) => t.id === s.activeTabId)?.flowNodes ?? []), newNode],
        lastTouchedNodeId: newNode.id
      }),
      selectedNodeId: newNode.id,
      isDirty: true
    }))
    pushHistory()
  },

  // ── Sequence ───────────────────────────────────────────────────────────────
  addSeqActor: (actor) => {
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeTabId, {
        seqActors: [...(s.tabs.find((t) => t.id === s.activeTabId)?.seqActors ?? []), actor]
      }),
      isDirty: true
    }))
    get().pushHistory()
  },

  updateSeqActor: (id, patch) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId)
      if (!tab) return s
      return {
        tabs: patchActive(s.tabs, s.activeTabId, { seqActors: updateById(tab.seqActors, id, patch) }),
        isDirty: true
      }
    })
  },

  removeSeqActor: (id) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId)
      if (!tab) return s
      return {
        tabs: patchActive(s.tabs, s.activeTabId, {
          seqActors: removeById(tab.seqActors, id),
          seqMessages: tab.seqMessages.filter((m) => m.fromId !== id && m.toId !== id)
        }),
        isDirty: true
      }
    })
  },

  addSeqMessage: (msg) => {
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeTabId, {
        seqMessages: [...(s.tabs.find((t) => t.id === s.activeTabId)?.seqMessages ?? []), msg]
      }),
      isDirty: true
    }))
    get().pushHistory()
  },

  updateSeqMessage: (id, patch) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId)
      if (!tab) return s
      return {
        tabs: patchActive(s.tabs, s.activeTabId, { seqMessages: updateById(tab.seqMessages, id, patch) }),
        isDirty: true
      }
    })
  },

  removeSeqMessage: (id) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId)
      if (!tab) return s
      return {
        tabs: patchActive(s.tabs, s.activeTabId, { seqMessages: removeById(tab.seqMessages, id) }),
        isDirty: true
      }
    })
  },

  reorderSeqMessage: (id, newOrder) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId)
      if (!tab) return s
      const msg = tab.seqMessages.find((m) => m.id === id)
      if (!msg) return s
      const oldOrder = msg.order
      const dir = newOrder > oldOrder ? 1 : -1
      return {
        tabs: patchActive(s.tabs, s.activeTabId, {
          seqMessages: tab.seqMessages.map((m) => {
            if (m.id === id) return { ...m, order: newOrder }
            if (dir === 1 && m.order > oldOrder && m.order <= newOrder) return { ...m, order: m.order - 1 }
            if (dir === -1 && m.order >= newOrder && m.order < oldOrder) return { ...m, order: m.order + 1 }
            return m
          })
        }),
        isDirty: true
      }
    })
  },

  // ── Page Size ──────────────────────────────────────────────────────────────
  setPageSettings: (size, orientation) => {
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeTabId, { pageSize: size, pageOrientation: orientation }),
      isDirty: true
    }))
  },

  // ── Revision History ───────────────────────────────────────────────────────
  viewingRevisionId: null,

  createRevision: (name, author, description) => {
    const { tabs, activeTabId } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return
    const revision: Revision = {
      id: `rev_${Date.now()}`,
      name,
      author,
      date: new Date().toISOString(),
      description,
      snapshot: {
        flowNodes: JSON.parse(JSON.stringify(tab.flowNodes)),
        flowEdges: JSON.parse(JSON.stringify(tab.flowEdges)),
        seqActors: JSON.parse(JSON.stringify(tab.seqActors)),
        seqMessages: JSON.parse(JSON.stringify(tab.seqMessages))
      }
    }
    set((s) => ({
      tabs: patchActive(s.tabs, s.activeTabId, {
        revisions: [...(s.tabs.find((t) => t.id === s.activeTabId)?.revisions ?? []), revision]
      }),
      isDirty: true
    }))
  },

  setViewingRevision: (id) => set({ viewingRevisionId: id }),

  // ── Selection ──────────────────────────────────────────────────────────────
  selectedNodeId: null,
  selectedEdgeId: null,
  setSelectedNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  // ── Cross-diagram Navigation ────────────────────────────────────────────────
  pendingFocusNodeId: null,
  setPendingFocusNodeId: (id) => set({ pendingFocusNodeId: id }),

  // ── History ────────────────────────────────────────────────────────────────
  history: [{ tabs: initialTabs }],
  historyIndex: 0,

  pushHistory: () => {
    const { history, historyIndex, tabs } = get()
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push({ tabs })
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const prev = history[historyIndex - 1]
    set({ tabs: prev.tabs, historyIndex: historyIndex - 1, isDirty: true })
  },

  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const next = history[historyIndex + 1]
    set({ tabs: next.tabs, historyIndex: historyIndex + 1, isDirty: true })
  },

  // ── Plant / Area / Location ─────────────────────────────────────────────────
  plants: [],
  areas: [],
  locations: [],

  addPlant: (plant) => set((s) => ({ plants: [...s.plants, plant], isDirty: true })),
  updatePlant: (id, patch) => set((s) => ({ plants: updateById(s.plants, id, patch), isDirty: true })),
  removePlant: (id) => set((s) => {
    const removedAreas = s.areas.filter((a) => a.plantId === id).map((a) => a.id)
    const removedLocs  = s.locations.filter((l) => removedAreas.includes(l.areaId)).map((l) => l.id)
    return {
      plants:             removeById(s.plants, id),
      areas:              s.areas.filter((a) => a.plantId !== id),
      locations:          s.locations.filter((l) => !removedAreas.includes(l.areaId)),
      interfaceInstances: clearLocationRefs(s.interfaceInstances, removedLocs),
      isDirty: true
    }
  }),

  addArea: (area) => set((s) => ({ areas: [...s.areas, area], isDirty: true })),
  updateArea: (id, patch) => set((s) => ({ areas: updateById(s.areas, id, patch), isDirty: true })),
  removeArea: (id) => set((s) => {
    const removedLocs = s.locations.filter((l) => l.areaId === id).map((l) => l.id)
    return {
      areas:              removeById(s.areas, id),
      locations:          s.locations.filter((l) => l.areaId !== id),
      interfaceInstances: clearLocationRefs(s.interfaceInstances, removedLocs),
      isDirty: true
    }
  }),

  addLocation: (location) => set((s) => ({ locations: [...s.locations, location], isDirty: true })),
  updateLocation: (id, patch) => set((s) => ({ locations: updateById(s.locations, id, patch), isDirty: true })),
  removeLocation: (id) => set((s) => ({
    locations:          removeById(s.locations, id),
    interfaceInstances: clearLocationRefs(s.interfaceInstances, [id]),
    isDirty: true
  })),

  // ── Interfaces ─────────────────────────────────────────────────────────────
  userInterfaces: [],
  interfaceInstances: [],

  addUserInterface: (iface) => set((s) => ({
    userInterfaces: [...s.userInterfaces, iface],
    isDirty: true
  })),

  addUserInterfacesBulk: (ifaces) => set((s) => ({
    userInterfaces: [...s.userInterfaces, ...ifaces],
    isDirty: true
  })),

  updateUserInterface: (id, patch) => set((s) => ({ userInterfaces: updateById(s.userInterfaces, id, patch), isDirty: true })),

  removeUserInterface: (id) => set((s) => ({
    userInterfaces: removeById(s.userInterfaces, id),
    interfaceInstances: s.interfaceInstances.filter((inst) => inst.interfaceId !== id),
    isDirty: true
  })),

  addInterfaceInstance: (instance) => set((s) => {
    const result: Record<string, unknown> = {
      interfaceInstances: [...s.interfaceInstances, instance],
      isDirty: true
    }
    if (s.taskAutoGen.deviceTesting) {
      const iface = s.userInterfaces.find((ui) => ui.id === instance.interfaceId)
      if (iface && iface.type === 'AOI') {
        const label = instance.name || instance.tagName
        const { tasks: t1, task } = findOrCreateAutoGenTask(s.tasks, 'auto:devices', 'Devices')
        result.tasks = addAutoGenSubTask(t1, task.id, label, label, { linkedInstanceId: instance.id })
      }
    }
    return result
  }),
  updateInterfaceInstance: (id, patch) => set((s) => ({ interfaceInstances: updateById(s.interfaceInstances, id, patch), isDirty: true })),
  removeInterfaceInstance: (id) => set((s) => ({ interfaceInstances: removeById(s.interfaceInstances, id), isDirty: true })),

  addFieldToInterface: (interfaceId, field) => set((s) => ({
    userInterfaces: s.userInterfaces.map((i) =>
      i.id === interfaceId ? { ...i, fields: [...i.fields, field] } : i
    ),
    isDirty: true
  })),

  updateFieldInInterface: (interfaceId, fieldId, patch) => set((s) => ({
    userInterfaces: s.userInterfaces.map((i) =>
      i.id === interfaceId
        ? { ...i, fields: i.fields.map((f) => f.id === fieldId ? { ...f, ...patch } : f) }
        : i
    ),
    isDirty: true
  })),

  removeFieldFromInterface: (interfaceId, fieldId) => set((s) => ({
    userInterfaces: s.userInterfaces.map((i) =>
      i.id === interfaceId
        ? { ...i, fields: i.fields.filter((f) => f.id !== fieldId) }
        : i
    ),
    isDirty: true
  })),

  // ── Cause & Effect Matrix ──────────────────────────────────────────────────
  matrixData: {},

  setMatrixCell: (stepId, instanceId, fieldId, value) => set((s) => {
    const prev = s.matrixData
    const step = { ...prev[stepId] }
    const inst = { ...(step[instanceId] ?? {}) }

    if (value === null) {
      delete inst[fieldId]
      if (Object.keys(inst).length === 0) {
        delete step[instanceId]
      } else {
        step[instanceId] = inst
      }
      if (Object.keys(step).length === 0) {
        const next = { ...prev }
        delete next[stepId]
        return { matrixData: next, isDirty: true }
      }
    } else {
      inst[fieldId] = value
      step[instanceId] = inst
    }

    return { matrixData: { ...prev, [stepId]: step }, isDirty: true }
  }),

  matrixShownInstances: {},
  setMatrixShownInstances: (tabId, instanceIds) => set((s) => ({
    matrixShownInstances: { ...s.matrixShownInstances, [tabId]: instanceIds }
  })),

  // ── IO Table ────────────────────────────────────────────────────────────────
  ioRacks: [],

  addIORack: (name) => {
    const id = uid('rack')
    set((s) => ({ ioRacks: [...s.ioRacks, { id, name }], isDirty: true }))
    get().pushHistory()
    return id
  },

  updateIORack: (id, patch) => {
    set((s) => ({
      ioRacks: s.ioRacks.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      isDirty: true
    }))
  },

  removeIORack: (id) => {
    set((s) => {
      const slotIds = new Set(s.ioSlots.filter((sl) => sl.rackId === id).map((sl) => sl.id))
      return {
        ioRacks: s.ioRacks.filter((r) => r.id !== id),
        ioSlots: s.ioSlots.filter((sl) => sl.rackId !== id),
        ioEntries: s.ioEntries.filter((e) => !slotIds.has(e.slotId)),
        isDirty: true
      }
    })
    get().pushHistory()
  },

  ioSlots: [],

  addIOSlot: (rackId, name, catalogNumber) => {
    const id = uid('slot')
    const slot: IOSlot = { id, rackId, name, catalogNumber }
    set((s) => {
      const next: Partial<ReturnType<typeof get>> & { ioSlots: IOSlot[]; isDirty: boolean } = {
        ioSlots: [...s.ioSlots, slot],
        isDirty: true
      }
      if (s.taskAutoGen.ioCardFAT) {
        const rack = s.ioRacks.find((r) => r.id === rackId)
        const label = rack ? `${rack.name} / ${name}` : name
        const { tasks: t1, task } = findOrCreateAutoGenTask(s.tasks, 'auto:fat', 'Factory Acceptance Test')
        next.tasks = addAutoGenSubTask(t1, task.id, `IO Check — ${label}`, undefined, { linkedSlotId: id })
      }
      return next
    })
    get().pushHistory()
    return id
  },

  updateIOSlot: (id, patch) => {
    set((s) => ({
      ioSlots: s.ioSlots.map((sl) => (sl.id === id ? { ...sl, ...patch } : sl)),
      isDirty: true
    }))
  },

  removeIOSlot: (id) => {
    set((s) => ({
      ioSlots: s.ioSlots.filter((sl) => sl.id !== id),
      ioEntries: s.ioEntries.filter((e) => e.slotId !== id),
      isDirty: true
    }))
    get().pushHistory()
  },

  ioEntries: [],

  addIOEntry: (entry) => {
    set((s) => {
      const next: Partial<ReturnType<typeof get>> & { ioEntries: IOEntry[]; isDirty: boolean } = {
        ioEntries: [...s.ioEntries, entry],
        isDirty: true
      }
      const analogTypes = new Set(['AI', 'AO', 'RTD', 'TC'])
      if (s.taskAutoGen.analogSAT && analogTypes.has(entry.ioType)) {
        const tag = entry.drawingTag || entry.description1 || `${entry.ioType} Ch ${entry.channel}`
        const { tasks: t1, task } = findOrCreateAutoGenTask(s.tasks, 'auto:sat', 'Site Acceptance Test')
        next.tasks = addAutoGenSubTask(t1, task.id, `Scale & Prove — ${tag}`, undefined, { linkedEntryId: entry.id })
      }
      return next
    })
    get().pushHistory()
  },

  updateIOEntry: (id, patch) => {
    set((s) => {
      const oldEntry = s.ioEntries.find((e) => e.id === id)
      const newEntries = s.ioEntries.map((e) => (e.id === id ? { ...e, ...patch } : e))
      const result: Record<string, unknown> = { ioEntries: newEntries, isDirty: true }

      const analogTypes = new Set(['AI', 'AO', 'RTD', 'TC'])
      if (
        s.taskAutoGen.analogSAT &&
        patch.ioType &&
        analogTypes.has(patch.ioType) &&
        oldEntry &&
        !analogTypes.has(oldEntry.ioType)
      ) {
        const updated = { ...oldEntry, ...patch }
        const tag = updated.drawingTag || updated.description1 || `${updated.ioType} Ch ${updated.channel}`
        const { tasks: t1, task } = findOrCreateAutoGenTask(s.tasks, 'auto:sat', 'Site Acceptance Test')
        result.tasks = addAutoGenSubTask(t1, task.id, `Scale & Prove — ${tag}`, undefined, { linkedEntryId: id })
      }
      return result
    })
  },

  removeIOEntry: (id) => {
    set((s) => ({ ioEntries: s.ioEntries.filter((e) => e.id !== id), isDirty: true }))
    get().pushHistory()
  },

  reorderIOEntry: (id, newIndex) => {
    set((s) => {
      const list = [...s.ioEntries]
      const oldIdx = list.findIndex((e) => e.id === id)
      if (oldIdx === -1) return s
      const [item] = list.splice(oldIdx, 1)
      list.splice(newIndex, 0, item)
      return { ioEntries: list, isDirty: true }
    })
    get().pushHistory()
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  tasks: [],

  addTask: (name) => {
    const id = uid('task')
    const task: Task = { id, name, flowchartTabId: null, sequenceTabId: null, ioRackId: null, ioSlotId: null, ioEntryId: null, instanceId: null, subTasks: [] }
    set((s) => ({ tasks: [...s.tasks, task], isDirty: true }))
    get().pushHistory()
    return id
  },

  updateTask: (id, patch) => {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      isDirty: true
    }))
    get().pushHistory()
  },

  removeTask: (id) => {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), isDirty: true }))
    get().pushHistory()
  },

  reorderTask: (id, newIndex) => {
    set((s) => {
      const list = [...s.tasks]
      const oldIdx = list.findIndex((t) => t.id === id)
      if (oldIdx === -1) return s
      const [item] = list.splice(oldIdx, 1)
      list.splice(newIndex, 0, item)
      return { tasks: list, isDirty: true }
    })
    get().pushHistory()
  },

  addSubTask: (taskId, name) => {
    const sub: SubTask = { id: uid('sub'), name, designed: false, programmed: false, tested: false }
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, subTasks: [...t.subTasks, sub] } : t
      ),
      isDirty: true
    }))
    get().pushHistory()
  },

  updateSubTask: (taskId, subTaskId, patch) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, subTasks: t.subTasks.map((st) => (st.id === subTaskId ? { ...st, ...patch } : st)) }
          : t
      ),
      isDirty: true
    }))
    get().pushHistory()
  },

  removeSubTask: (taskId, subTaskId) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, subTasks: t.subTasks.filter((st) => st.id !== subTaskId) } : t
      ),
      isDirty: true
    }))
    get().pushHistory()
  },

  taskNotes: '',
  setTaskNotes: (html) => set({ taskNotes: html, isDirty: true }),

  taskAutoGen: { ioCardFAT: true, analogSAT: true, sequenceTesting: true, deviceTesting: true },
  setTaskAutoGen: (patch) => set((s) => ({ taskAutoGen: { ...s.taskAutoGen, ...patch }, isDirty: true })),

  // ── Project I/O ────────────────────────────────────────────────────────────
  newProject: () => {
    const tabs = defaultTabs()
    set({
      projectName: 'Untitled Project',
      isDirty: false,
      currentFilePath: null,
      tabs,
      folders: [],
      activeTabId: INTERFACES_TAB_ID,
      openTabIds: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      viewingRevisionId: null,
      pendingFocusNodeId: null,
      history: [{ tabs }],
      historyIndex: 0,
      plants: [],
      areas: [],
      locations: [],
      userInterfaces: [],
      interfaceInstances: [],
      matrixData: {},
      matrixShownInstances: {},
      ioRacks: [],
      ioSlots: [],
      ioEntries: [],
      tasks: [],
      taskNotes: '',
      taskAutoGen: { ioCardFAT: true, analogSAT: true, sequenceTesting: true, deviceTesting: true }
    })
  },

  loadProject: (project, filePath) => {
    let tabs: DiagramTab[]
    let activeTabId: string

    if (project.tabs) {
      tabs = project.tabs.map((t) => ({
        revisions: [], pageSize: null, pageOrientation: 'portrait' as PageOrientation,
        folderId: null, sortIndex: 0,
        ...t
      }))
      activeTabId = project.activeTabId ?? project.tabs[0]?.id
    } else {
      const ft = emptyTab('Flowchart', 'flowchart')
      ft.flowNodes = (project as never as { flowchart: { nodes: PLCNode[] } }).flowchart?.nodes ?? []
      ft.flowEdges = (project as never as { flowchart: { edges: PLCEdge[] } }).flowchart?.edges ?? []
      const st = emptyTab('Sequence', 'sequence')
      st.seqActors = (project as never as { sequence: { actors: SequenceActor[] } }).sequence?.actors ?? []
      st.seqMessages = (project as never as { sequence: { messages: SequenceMessage[] } }).sequence?.messages ?? []
      tabs = [ft, st]
      activeTabId = ft.id
    }

    // Migrate legacy group/subGroup → explicit folders if project has no folders
    let folders: TreeFolder[] = project.folders ?? []
    if (folders.length === 0) {
      const { migratedFolders, migratedTabs } = migrateLegacyGroupsToFolders(tabs)
      folders = migratedFolders
      tabs = migratedTabs
    }

    set({
      projectName: project.name,
      isDirty: false,
      currentFilePath: filePath,
      tabs,
      folders,
      activeTabId,
      openTabIds: project.openTabIds ?? [],
      selectedNodeId: null,
      selectedEdgeId: null,
      history: [{ tabs }],
      historyIndex: 0,
      plants: project.plants ?? [],
      areas: project.areas ?? [],
      locations: project.locations ?? [],
      userInterfaces: project.userInterfaces ?? [],
      interfaceInstances: project.interfaceInstances ?? [],
      matrixData: project.matrixData ?? {},
      matrixShownInstances: project.matrixShownInstances ?? {},
      ioRacks: project.ioRacks ?? [],
      ioSlots: project.ioSlots ?? [],
      ioEntries: project.ioEntries ?? [],
      tasks: project.tasks ?? [],
      taskNotes: project.taskNotes ?? '',
      taskAutoGen: project.taskAutoGen ?? { ioCardFAT: true, analogSAT: true, sequenceTesting: true, deviceTesting: true }
    })
  },

  toProject: (): DiagramProject => {
    const { projectName, tabs, folders, activeTabId, openTabIds, plants, areas, locations, userInterfaces, interfaceInstances, matrixData, matrixShownInstances, ioRacks, ioSlots, ioEntries, tasks, taskNotes, taskAutoGen } = get()
    return {
      version: PROJECT_VERSION,
      name: projectName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tabs,
      folders,
      activeTabId,
      openTabIds,
      plants,
      areas,
      locations,
      userInterfaces,
      interfaceInstances,
      matrixData,
      matrixShownInstances,
      ioRacks,
      ioSlots,
      ioEntries,
      tasks,
      taskNotes,
      taskAutoGen
    }
  }
}))

// ── Convenience selectors ─────────────────────────────────────────────────────

export const selectActiveTab = (s: DiagramStore) =>
  s.tabs.find((t) => t.id === s.activeTabId)

function activeRevisionSnapshot(s: DiagramStore) {
  if (!s.viewingRevisionId) return null
  const tab = selectActiveTab(s)
  return tab?.revisions.find((r) => r.id === s.viewingRevisionId)?.snapshot ?? null
}

export const selectFlowNodes = (s: DiagramStore) =>
  activeRevisionSnapshot(s)?.flowNodes ?? selectActiveTab(s)?.flowNodes ?? []

export const selectFlowEdges = (s: DiagramStore) =>
  activeRevisionSnapshot(s)?.flowEdges ?? selectActiveTab(s)?.flowEdges ?? []

export const selectSeqActors = (s: DiagramStore) =>
  activeRevisionSnapshot(s)?.seqActors ?? selectActiveTab(s)?.seqActors ?? []

export const selectSeqMessages = (s: DiagramStore) =>
  activeRevisionSnapshot(s)?.seqMessages ?? selectActiveTab(s)?.seqMessages ?? []

export const selectRevisions = (s: DiagramStore) =>
  selectActiveTab(s)?.revisions ?? []

export const selectIsViewingRevision = (s: DiagramStore) =>
  s.viewingRevisionId !== null
