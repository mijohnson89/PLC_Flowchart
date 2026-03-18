import { create } from 'zustand'
import { addEdge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeChange, EdgeChange, Connection } from '@xyflow/react'
import type {
  DiagramMode, DiagramTab, PLCNode, PLCEdge, PLCNodeType, PLCNodeData,
  SequenceActor, SequenceMessage, DiagramProject, Revision,
  PageSizeKey, PageOrientation,
  UserInterface, InterfaceInstance, InterfaceField,
  MatrixData, MatrixCellValue,
  Plant, Area, Location
} from '../types'
import { INTERFACES_TAB_ID } from '../types'

const PROJECT_VERSION = '2.0'
const DROP_GAP = 64
let _idCounter = 1
function uid(prefix = 'node') { return `${prefix}_${Date.now()}_${_idCounter++}` }

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
  activeTab: () => DiagramTab | undefined
  addTab: (name: string, type: DiagramMode) => void
  removeTab: (id: string) => void
  renameTab: (id: string, name: string) => void
  setActiveTab: (id: string) => void

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

  activeTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId)
  },

  addTab: (name, type) => {
    const tab = emptyTab(name, type)
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
      isDirty: true,
      selectedNodeId: null,
      selectedEdgeId: null
    }))
    get().pushHistory()
  },

  removeTab: (id) => {
    const { tabs, activeTabId } = get()
    if (tabs.length <= 1) return // always keep at least one tab
    const idx = tabs.findIndex((t) => t.id === id)
    const newTabs = tabs.filter((t) => t.id !== id)
    const newActiveId = id === activeTabId
      ? (newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0].id)
      : activeTabId
    set({ tabs: newTabs, activeTabId: newActiveId, isDirty: true })
    get().pushHistory()
  },

  renameTab: (id, name) => {
    set((s) => ({ tabs: patchActive(s.tabs, id, { name }), isDirty: true }))
  },

  setActiveTab: (id) => set({
    activeTabId: id,
    selectedNodeId: null,
    selectedEdgeId: null,
    viewingRevisionId: null
  }),

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
        tabs: patchActive(s.tabs, s.activeTabId, {
          seqActors: tab.seqActors.map((a) => (a.id === id ? { ...a, ...patch } : a))
        }),
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
          seqActors: tab.seqActors.filter((a) => a.id !== id),
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
        tabs: patchActive(s.tabs, s.activeTabId, {
          seqMessages: tab.seqMessages.map((m) => (m.id === id ? { ...m, ...patch } : m))
        }),
        isDirty: true
      }
    })
  },

  removeSeqMessage: (id) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId)
      if (!tab) return s
      return {
        tabs: patchActive(s.tabs, s.activeTabId, {
          seqMessages: tab.seqMessages.filter((m) => m.id !== id)
        }),
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
  updatePlant: (id, patch) => set((s) => ({
    plants: s.plants.map((p) => p.id === id ? { ...p, ...patch } : p),
    isDirty: true
  })),
  removePlant: (id) => set((s) => {
    const removedAreas    = s.areas.filter((a) => a.plantId === id).map((a) => a.id)
    const removedLocs     = s.locations.filter((l) => removedAreas.includes(l.areaId)).map((l) => l.id)
    return {
      plants:             s.plants.filter((p) => p.id !== id),
      areas:              s.areas.filter((a) => a.plantId !== id),
      locations:          s.locations.filter((l) => !removedAreas.includes(l.areaId)),
      interfaceInstances: s.interfaceInstances.map((i) =>
        removedLocs.includes(i.locationId ?? '') ? { ...i, locationId: undefined } : i
      ),
      isDirty: true
    }
  }),

  addArea: (area) => set((s) => ({ areas: [...s.areas, area], isDirty: true })),
  updateArea: (id, patch) => set((s) => ({
    areas: s.areas.map((a) => a.id === id ? { ...a, ...patch } : a),
    isDirty: true
  })),
  removeArea: (id) => set((s) => {
    const removedLocs = s.locations.filter((l) => l.areaId === id).map((l) => l.id)
    return {
      areas:              s.areas.filter((a) => a.id !== id),
      locations:          s.locations.filter((l) => l.areaId !== id),
      interfaceInstances: s.interfaceInstances.map((i) =>
        removedLocs.includes(i.locationId ?? '') ? { ...i, locationId: undefined } : i
      ),
      isDirty: true
    }
  }),

  addLocation: (location) => set((s) => ({ locations: [...s.locations, location], isDirty: true })),
  updateLocation: (id, patch) => set((s) => ({
    locations: s.locations.map((l) => l.id === id ? { ...l, ...patch } : l),
    isDirty: true
  })),
  removeLocation: (id) => set((s) => ({
    locations:          s.locations.filter((l) => l.id !== id),
    interfaceInstances: s.interfaceInstances.map((i) =>
      i.locationId === id ? { ...i, locationId: undefined } : i
    ),
    isDirty: true
  })),

  // ── Interfaces ─────────────────────────────────────────────────────────────
  userInterfaces: [],
  interfaceInstances: [],

  addUserInterface: (iface) => set((s) => ({
    userInterfaces: [...s.userInterfaces, iface],
    isDirty: true
  })),

  updateUserInterface: (id, patch) => set((s) => ({
    userInterfaces: s.userInterfaces.map((i) => i.id === id ? { ...i, ...patch } : i),
    isDirty: true
  })),

  removeUserInterface: (id) => set((s) => ({
    userInterfaces: s.userInterfaces.filter((i) => i.id !== id),
    interfaceInstances: s.interfaceInstances.filter((inst) => inst.interfaceId !== id),
    isDirty: true
  })),

  addInterfaceInstance: (instance) => set((s) => ({
    interfaceInstances: [...s.interfaceInstances, instance],
    isDirty: true
  })),

  updateInterfaceInstance: (id, patch) => set((s) => ({
    interfaceInstances: s.interfaceInstances.map((i) => i.id === id ? { ...i, ...patch } : i),
    isDirty: true
  })),

  removeInterfaceInstance: (id) => set((s) => ({
    interfaceInstances: s.interfaceInstances.filter((i) => i.id !== id),
    isDirty: true
  })),

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

  // ── Project I/O ────────────────────────────────────────────────────────────
  newProject: () => {
    const tabs = defaultTabs()
    set({
      projectName: 'Untitled Project',
      isDirty: false,
      currentFilePath: null,
      tabs,
      activeTabId: INTERFACES_TAB_ID,
      selectedNodeId: null,
      selectedEdgeId: null,
      history: [{ tabs }],
      historyIndex: 0,
      plants: [],
      areas: [],
      locations: [],
      userInterfaces: [],
      interfaceInstances: [],
      matrixData: {}
    })
  },

  loadProject: (project, filePath) => {
    // Handle legacy v1 format (single flowchart + sequence)
    let tabs: DiagramTab[]
    let activeTabId: string

    if (project.tabs) {
      tabs = project.tabs.map((t) => ({ revisions: [], pageSize: null, pageOrientation: 'portrait' as PageOrientation, ...t }))
      activeTabId = project.activeTabId ?? project.tabs[0]?.id
    } else {
      // Migrate v1 → v2
      const ft = emptyTab('Flowchart', 'flowchart')
      ft.flowNodes = (project as never as { flowchart: { nodes: PLCNode[] } }).flowchart?.nodes ?? []
      ft.flowEdges = (project as never as { flowchart: { edges: PLCEdge[] } }).flowchart?.edges ?? []
      const st = emptyTab('Sequence', 'sequence')
      st.seqActors = (project as never as { sequence: { actors: SequenceActor[] } }).sequence?.actors ?? []
      st.seqMessages = (project as never as { sequence: { messages: SequenceMessage[] } }).sequence?.messages ?? []
      tabs = [ft, st]
      activeTabId = ft.id
    }

    set({
      projectName: project.name,
      isDirty: false,
      currentFilePath: filePath,
      tabs,
      activeTabId,
      selectedNodeId: null,
      selectedEdgeId: null,
      history: [{ tabs }],
      historyIndex: 0,
      plants: project.plants ?? [],
      areas: project.areas ?? [],
      locations: project.locations ?? [],
      userInterfaces: project.userInterfaces ?? [],
      interfaceInstances: project.interfaceInstances ?? [],
      matrixData: project.matrixData ?? {}
    })
  },

  toProject: (): DiagramProject => {
    const { projectName, tabs, activeTabId, plants, areas, locations, userInterfaces, interfaceInstances, matrixData } = get()
    return {
      version: PROJECT_VERSION,
      name: projectName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tabs,
      activeTabId,
      plants,
      areas,
      locations,
      userInterfaces,
      interfaceInstances,
      matrixData
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
