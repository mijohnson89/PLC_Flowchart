import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Search, X, Link2, GripVertical, Pencil, Info
} from 'lucide-react'
import { useDiagramStore, selectFlowNodes, selectFlowEdges } from '../store/diagramStore'
import type { PLCNode, PLCNodeData, PLCEdgeData, PLCEdge, StepLink, FlowPhase, FlowStateItem } from '../types'
import { PACKML_WAIT_STATES, PACKML_ACTING_STATES } from '../types'
import { getStepStateVisual } from '../utils/stepStateVisual'
import { uid } from '../utils/uid'
import {
  BoolCell, NumericCell, PackMLBadge, computeSpans, InstanceSidebar,
  isNumericType, isControllableField, type MatrixCol, type SidebarInstance
} from './MatrixView'
import {
  STEP_MATRIX_FROZEN,
  type JumpRef,
  collectJumpsFrom,
  collectJumpsTo,
  nodeLabel,
  stepTargetBrief,
} from '../utils/stepMatrixJumps'

const FROZEN = STEP_MATRIX_FROZEN

/** Step numbers are spaced by this increment after reorder (10, 20, 30, …). */
const STEP_NUMBER_GAP = 10

/** Preset jump condition labels (stored as the step link / edge condition string). */
const JUMP_CONDITION_OPTIONS = [
  'Start',
  'Stop',
  'Pause',
  'Abort',
  'Hold',
  'Resume',
  'Complete',
  'Time Elapsed',
  'User Condition'
] as const

const JUMP_CONDITION_STANDARD_SET = new Set<string>([
  'Start',
  'Stop',
  'Pause',
  'Abort',
  'Hold',
  'Resume',
  'Complete',
  'Time Elapsed'
])

const JUMP_NEW_STEP_VALUE = '__new_step__'

function resolveJumpCondition(preset: string, userConditionText: string): string {
  if (preset === 'User Condition') return userConditionText.trim()
  return preset
}

function splitJumpConditionForDraft(reason: string): { conditionPreset: string; userConditionText: string } {
  const t = reason.trim()
  if (JUMP_CONDITION_STANDARD_SET.has(t)) {
    return { conditionPreset: t, userConditionText: '' }
  }
  return { conditionPreset: 'User Condition', userConditionText: reason }
}

function stickyLeft(colIndex: number): number {
  let x = 0
  for (let i = 0; i < colIndex; i++) x += FROZEN[i].w
  return x
}

type JumpEditModalState =
  | { mode: 'add'; sourceNodeId: string }
  | { mode: 'edit'; sourceNodeId: string; jump: JumpRef }

type JumpViewModalState = { jump: JumpRef; title: string }

export type StepMatrixVariant = 'stepsOnly' | 'causeEffectOnly'

/** When set, the matrix shows this slice instead of the active tab / revision overlay (compare mode). */
export interface StepMatrixDiagramOverride {
  flowNodes: PLCNode[]
  flowEdges: PLCEdge[]
  phases: FlowPhase[]
  flowStates: FlowStateItem[]
}

export interface StepMatrixViewProps {
  readOnly?: boolean
  /** Step columns only, or Cause &amp; Effect grid + instance sidebar (split diagram layout). */
  variant: StepMatrixVariant
  diagramOverride?: StepMatrixDiagramOverride
}

export function StepMatrixView({
  readOnly = false,
  variant,
  diagramOverride
}: StepMatrixViewProps) {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const tabs = useDiagramStore((s) => s.tabs)
  const userInterfaces = useDiagramStore((s) => s.userInterfaces)
  const interfaceInstances = useDiagramStore((s) => s.interfaceInstances)
  const matrixData = useDiagramStore((s) => s.matrixData)
  const setMatrixCell = useDiagramStore((s) => s.setMatrixCell)
  const matrixShownInstances = useDiagramStore((s) => s.matrixShownInstances)
  const setMatrixShownInstances = useDiagramStore((s) => s.setMatrixShownInstances)
  const setFlowNodes = useDiagramStore((s) => s.setFlowNodes)
  const setFlowEdges = useDiagramStore((s) => s.setFlowEdges)
  const pushHistory = useDiagramStore((s) => s.pushHistory)
  const pendingFocusNodeId = useDiagramStore((s) => s.pendingFocusNodeId)
  const setPendingFocusNodeId = useDiagramStore((s) => s.setPendingFocusNodeId)
  const setSelectedNode = useDiagramStore((s) => s.setSelectedNode)
  const selectedNodeId = useDiagramStore((s) => s.selectedNodeId)

  const storeFlowNodes = useDiagramStore(selectFlowNodes)
  const storeFlowEdges = useDiagramStore(selectFlowEdges)
  const storePhases = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.phases ?? [])
  const storeFlowStates = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.flowStates ?? [])
  const flowNodes = diagramOverride?.flowNodes ?? storeFlowNodes
  const flowEdges = diagramOverride?.flowEdges ?? storeFlowEdges
  const phases = diagramOverride?.phases ?? storePhases
  const flowStates = diagramOverride?.flowStates ?? storeFlowStates

  const [search, setSearch] = useState('')
  const [reorderMode, setReorderMode] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [jumpEditModal, setJumpEditModal] = useState<JumpEditModalState | null>(null)
  const [jumpViewModal, setJumpViewModal] = useState<JumpViewModalState | null>(null)
  const [jumpModalDraft, setJumpModalDraft] = useState({
    targetId: '',
    description: '',
    conditionPreset: 'Start' as string,
    userConditionText: ''
  })

  useEffect(() => {
    if (!jumpEditModal) return
    if (jumpEditModal.mode === 'edit') {
      const { conditionPreset, userConditionText } = splitJumpConditionForDraft(jumpEditModal.jump.reason)
      setJumpModalDraft({
        targetId: jumpEditModal.jump.targetId,
        description: jumpEditModal.jump.description,
        conditionPreset,
        userConditionText
      })
    } else {
      setJumpModalDraft({
        targetId: '',
        description: '',
        conditionPreset: 'Start',
        userConditionText: ''
      })
    }
  }, [jumpEditModal])

  useEffect(() => {
    if (!jumpEditModal && !jumpViewModal) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setJumpEditModal(null)
        setJumpViewModal(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jumpEditModal, jumpViewModal])

  useEffect(() => {
    if (!pendingFocusNodeId) return
    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-step-matrix-row="${pendingFocusNodeId}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setSelectedNode(pendingFocusNodeId)
      setPendingFocusNodeId(null)
    }, 100)
    return () => clearTimeout(t)
  }, [pendingFocusNodeId, setPendingFocusNodeId, setSelectedNode])

  useEffect(() => {
    setReorderMode(false)
    setJumpEditModal(null)
    setJumpViewModal(null)
  }, [activeTabId])

  const nodeMap = useMemo(() => new Map(flowNodes.map((n) => [n.id, n])), [flowNodes])

  const stepNodes = useMemo(
    () =>
      flowNodes
        .filter((n) => n.type === 'step')
        .sort((a, b) => (a.data.stepNumber ?? 0) - (b.data.stepNumber ?? 0)),
    [flowNodes]
  )

  const filteredSteps = useMemo(() => {
    if (!search.trim()) return stepNodes
    const q = search.toLowerCase()
    return stepNodes.filter((n) => {
      const d = n.data as PLCNodeData
      return (
        (d.label ?? '').toLowerCase().includes(q) ||
        String(d.stepNumber ?? '').includes(q) ||
        (d.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [stepNodes, search])

  const read = readOnly

  const dragReorder = reorderMode && !read && !search.trim()
  const displaySteps = dragReorder ? stepNodes : filteredSteps

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

  const rowMeta = useMemo(() => {
    return displaySteps.map((n) => ({ nodeId: n.id, stepNumber: n.data.stepNumber, packML: n.data.packMLState }))
  }, [displaySteps])

  const hiddenInstanceIds = useMemo(() => {
    const shown = new Set(matrixShownInstances[activeTabId] ?? [])
    return new Set(sidebarInstances.map((i) => i.instanceId).filter((id) => !shown.has(id)))
  }, [sidebarInstances, matrixShownInstances, activeTabId])

  const usedInstanceIds = useMemo(() => {
    const used = new Set<string>()
    rowMeta.forEach((row) => {
      allColumns.forEach((col) => {
        const val = matrixData?.[row.nodeId]?.[col.instanceId]?.[col.fieldId]
        if (val !== null && val !== undefined) used.add(col.instanceId)
      })
    })
    return used
  }, [rowMeta, allColumns, matrixData])

  const columns = useMemo(
    () => allColumns.filter((col) => !hiddenInstanceIds.has(col.instanceId)),
    [allColumns, hiddenInstanceIds]
  )

  const ifaceSpans = useMemo(() => computeSpans(columns, (c) => c.interfaceId), [columns])
  const instSpans = useMemo(() => computeSpans(columns, (c) => c.instanceId), [columns])

  function toggleInstance(instanceId: string) {
    const current = new Set(matrixShownInstances[activeTabId] ?? [])
    if (current.has(instanceId)) current.delete(instanceId)
    else current.add(instanceId)
    setMatrixShownInstances(activeTabId, Array.from(current))
  }

  function hideUnused() {
    const current = new Set(matrixShownInstances[activeTabId] ?? [])
    sidebarInstances.forEach((i) => {
      if (!usedInstanceIds.has(i.instanceId)) current.delete(i.instanceId)
    })
    setMatrixShownInstances(activeTabId, Array.from(current))
  }

  function showAll() {
    setMatrixShownInstances(activeTabId, sidebarInstances.map((i) => i.instanceId))
  }

  const patchStep = useCallback(
    (nodeId: string, patch: Partial<PLCNodeData>) => {
      setFlowNodes(
        flowNodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...patch } as PLCNodeData } : n
        )
      )
    },
    [flowNodes, setFlowNodes]
  )

  const toggleStepPhase = useCallback(
    (nodeId: string, phaseId: string) => {
      const n = flowNodes.find((x) => x.id === nodeId)
      if (!n || n.type !== 'step') return
      const d = n.data as PLCNodeData
      const cur = new Set(d.phaseIds ?? [])
      if (cur.has(phaseId)) cur.delete(phaseId)
      else cur.add(phaseId)
      patchStep(nodeId, { phaseIds: cur.size > 0 ? Array.from(cur) : undefined })
      pushHistory()
    },
    [flowNodes, patchStep, pushHistory]
  )

  const addStep = useCallback(() => {
    const nums = stepNodes.map((s) => s.data.stepNumber ?? 0)
    const max = nums.length ? Math.max(...nums) : 0
    const next = max <= 0
      ? STEP_NUMBER_GAP
      : Math.floor(max / STEP_NUMBER_GAP) * STEP_NUMBER_GAP + STEP_NUMBER_GAP
    const id = uid('node')
    const newNode: PLCNode = {
      id,
      type: 'step',
      position: { x: 0, y: 0 },
      data: { label: `Step ${next}`, stepNumber: next }
    }
    setFlowNodes([...flowNodes, newNode])
    pushHistory()
  }, [flowNodes, stepNodes, setFlowNodes, pushHistory])

  const deleteStep = useCallback(
    (nodeId: string) => {
      const nextNodes = flowNodes
        .filter((n) => n.id !== nodeId)
        .map((n) => {
          const d = n.data as PLCNodeData
          const filtered = d.stepLinks?.filter((l) => l.targetNodeId !== nodeId) ?? []
          if (filtered.length === (d.stepLinks?.length ?? 0)) return n
          return {
            ...n,
            data: { ...d, stepLinks: filtered.length ? filtered : undefined } as PLCNodeData
          }
        })
      const nextEdges = flowEdges.filter((e) => e.source !== nodeId && e.target !== nodeId)
      setFlowNodes(nextNodes)
      setFlowEdges(nextEdges)
      if (selectedNodeId === nodeId) setSelectedNode(null)
      pushHistory()
    },
    [flowNodes, flowEdges, setFlowNodes, setFlowEdges, pushHistory, selectedNodeId, setSelectedNode]
  )

  const removeJump = useCallback(
    (nodeId: string, jump: JumpRef, data: PLCNodeData) => {
      if (jump.kind === 'edge') {
        setFlowEdges(flowEdges.filter((e) => e.id !== jump.id))
      } else {
        const links = (data.stepLinks ?? []).filter((l) => l.id !== jump.id)
        patchStep(nodeId, { stepLinks: links.length ? links : undefined })
      }
      pushHistory()
    },
    [flowEdges, setFlowEdges, patchStep, pushHistory]
  )

  const addStepLink = useCallback(
    (nodeId: string, targetId: string, reason: string, description: string) => {
      const n = flowNodes.find((x) => x.id === nodeId)
      if (!n || !targetId) return
      const d = n.data as PLCNodeData
      const links: StepLink[] = [
        ...(d.stepLinks ?? []),
        {
          id: uid('sl'),
          targetNodeId: targetId,
          reason: reason.trim() || undefined,
          description: description.trim() || undefined
        }
      ]
      patchStep(nodeId, { stepLinks: links })
      pushHistory()
    },
    [flowNodes, patchStep, pushHistory]
  )

  /** Append a step at the end (next S# gap of 10) and add a step-link jump from source to it. One undo step. */
  const addJumpToNewStepAtEnd = useCallback((sourceNodeId: string, reason: string, description: string) => {
    const { tabs, activeTabId, setFlowNodes, pushHistory } = useDiagramStore.getState()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return
    const nodes = tab.flowNodes
    const stepOnly = nodes.filter((n) => n.type === 'step')
    const nums = stepOnly.map((x) => (x.data as PLCNodeData).stepNumber ?? 0)
    const max = nums.length ? Math.max(...nums) : 0
    const next =
      max <= 0 ? STEP_NUMBER_GAP : Math.floor(max / STEP_NUMBER_GAP) * STEP_NUMBER_GAP + STEP_NUMBER_GAP
    const newId = uid('node')
    const newNode: PLCNode = {
      id: newId,
      type: 'step',
      position: { x: 0, y: 0 },
      data: { label: `Step ${next}`, stepNumber: next }
    }
    const reasonTrim = reason.trim() || undefined
    const descTrim = description.trim() || undefined
    const nextNodes = nodes.map((n) => {
      if (n.id !== sourceNodeId) return n
      const d = n.data as PLCNodeData
      const newLink: StepLink = {
        id: uid('sl'),
        targetNodeId: newId,
        reason: reasonTrim,
        description: descTrim
      }
      return { ...n, data: { ...d, stepLinks: [...(d.stepLinks ?? []), newLink] } as PLCNodeData }
    })
    setFlowNodes([...nextNodes, newNode])
    pushHistory()
  }, [])

  const updateJumpField = useCallback(
    (nodeId: string, jump: JumpRef, patch: { reason?: string; description?: string }) => {
      if (jump.kind === 'edge') {
        setFlowEdges(
          flowEdges.map((e) => {
            if (e.id !== jump.id) return e
            const prev = (e.data as PLCEdgeData | undefined) ?? {}
            const nextData: PLCEdgeData = { ...prev }
            if (patch.reason !== undefined) {
              nextData.condition = patch.reason || undefined
            }
            if (patch.description !== undefined) {
              nextData.description = patch.description || undefined
            }
            const nextLabel = patch.reason !== undefined ? patch.reason || undefined : e.label
            return { ...e, label: nextLabel, data: nextData }
          })
        )
        return
      }
      const n = flowNodes.find((x) => x.id === nodeId)
      if (!n) return
      const d = n.data as PLCNodeData
      const links = (d.stepLinks ?? []).map((l) =>
        l.id === jump.id
          ? {
              ...l,
              ...(patch.reason !== undefined ? { reason: patch.reason || undefined } : {}),
              ...(patch.description !== undefined ? { description: patch.description || undefined } : {})
            }
          : l
      )
      patchStep(nodeId, { stepLinks: links })
    },
    [flowEdges, flowNodes, setFlowEdges, patchStep]
  )

  const applyReorderAndRenumber = useCallback(
    (fromId: string, targetId: string, e: React.DragEvent) => {
      if (fromId === targetId) return
      const arr = stepNodes.slice()
      const fi = arr.findIndex((n) => n.id === fromId)
      const ti = arr.findIndex((n) => n.id === targetId)
      if (fi < 0 || ti < 0) return
      const rowEl = e.currentTarget as HTMLElement
      const rect = rowEl.getBoundingClientRect()
      const dropAfter = e.clientY > rect.top + rect.height / 2
      const [moved] = arr.splice(fi, 1)
      let insertIdx = arr.findIndex((n) => n.id === targetId)
      if (dropAfter) insertIdx += 1
      arr.splice(insertIdx, 0, moved)
      const newNums = new Map(arr.map((n, i) => [n.id, (i + 1) * STEP_NUMBER_GAP]))
      setFlowNodes(
        flowNodes.map((n) => {
          if (n.type !== 'step') return n
          const num = newNums.get(n.id)
          if (num === undefined) return n
          return { ...n, data: { ...n.data, stepNumber: num } as PLCNodeData }
        })
      )
      pushHistory()
    },
    [flowNodes, stepNodes, setFlowNodes, pushHistory]
  )

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isSteps = variant === 'stepsOnly'
  const isCE = variant === 'causeEffectOnly'

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 flex-shrink-0 flex-wrap">
        <span className="text-xs font-bold text-gray-700">{activeTab?.name ?? 'Sequence'}</span>
        <span className="text-[10px] text-gray-400">
          {isSteps ? 'Step matrix' : 'Cause & effect'}
        </span>
        {isSteps && !read && !dragReorder && (
          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700"
          >
            <Plus size={12} /> Add step
          </button>
        )}
        <div className="flex items-center gap-1 flex-1 min-w-[120px] max-w-xs ml-2 border border-gray-200 rounded-lg px-2 py-1 bg-gray-50">
          <Search size={12} className="text-gray-400" />
          <input
            className="flex-1 text-xs bg-transparent outline-none"
            placeholder="Search steps…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isSteps && !read && (
          <button
            type="button"
            title="Drag steps to reorder; step numbers become 10, 20, 30, …"
            onClick={() => setReorderMode((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border ${
              reorderMode ? 'bg-violet-100 border-violet-400 text-violet-800' : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            <GripVertical size={13} />
            Reorder steps
          </button>
        )}
        <span className="text-[10px] text-gray-400">{displaySteps.length} step{displaySteps.length !== 1 ? 's' : ''}</span>
      </div>

      {reorderMode && !read && search.trim() && (
        <div className="px-3 py-1.5 bg-violet-50 text-violet-800 text-[11px] border-b border-violet-100">
          Clear the search box to drag-reorder all steps and renumber by {STEP_NUMBER_GAP}s.
        </div>
      )}
      {dragReorder && (
        <div className="px-3 py-1.5 bg-violet-50/80 text-violet-900 text-[11px] border-b border-violet-100">
          Drag the <GripVertical size={11} className="inline align-text-bottom" /> handle. Drop above or below a row. All step numbers update to {STEP_NUMBER_GAP}, {STEP_NUMBER_GAP * 2}, {STEP_NUMBER_GAP * 3}…
        </div>
      )}

      {read && (
        <div className="px-3 py-1.5 bg-amber-50 text-amber-800 text-[11px] border-b border-amber-100">Read-only (revision)</div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto bg-gray-50">
          {displaySteps.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm p-8 text-center">
              {stepNodes.length === 0
                ? isCE
                  ? 'No steps yet. Add steps in the Step matrix pane or import L5K.'
                  : 'No steps yet. Click “Add step” or import L5K.'
                : 'No steps match search.'}
            </div>
          ) : isSteps ? (
            <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
              <thead>
                <tr style={{ height: 28 }}>
                  {FROZEN.map((f, i) => (
                    <th
                      key={f.label}
                      className="sticky z-[40] bg-gray-100 text-left px-2 py-1 border-r border-b border-gray-300 font-bold text-[10px] uppercase text-gray-500"
                      style={{ left: stickyLeft(i), minWidth: f.w, width: f.w, top: 0, zIndex: 50 - i }}
                    >
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displaySteps.map((node) => {
                  const d = node.data as PLCNodeData
                  const jumpsTo = collectJumpsTo(node.id, d, flowEdges, nodeMap)
                  const jumpsFrom = collectJumpsFrom(node.id, flowEdges, stepNodes)
                  const isSel = selectedNodeId === node.id
                  const isDragOver = dragReorder && dragOverId === node.id && draggingId !== node.id
                  return (
                    <tr
                      key={node.id}
                      data-step-matrix-row={node.id}
                      className={`group border-b border-gray-100 ${isSel ? 'bg-indigo-50/80' : 'hover:bg-white'} ${
                        draggingId === node.id ? 'opacity-50' : ''
                      } ${isDragOver ? 'ring-2 ring-violet-400 ring-inset bg-violet-50/40' : ''}`}
                      onDragOver={
                        dragReorder
                          ? (e) => {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              setDragOverId(node.id)
                            }
                          : undefined
                      }
                      onDragLeave={
                        dragReorder
                          ? (e) => {
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null)
                            }
                          : undefined
                      }
                      onDrop={
                        dragReorder
                          ? (e) => {
                              e.preventDefault()
                              setDragOverId(null)
                              const fromId = e.dataTransfer.getData('text/plain')
                              if (fromId) applyReorderAndRenumber(fromId, node.id, e)
                            }
                          : undefined
                      }
                    >
                      <td
                        className="sticky z-[20] bg-white group-hover:bg-indigo-50/30 border-r border-gray-200 px-1 py-1 align-top"
                        style={{ left: stickyLeft(0), minWidth: FROZEN[0].w, zIndex: 29 }}
                      >
                        <div className="flex items-center gap-0.5">
                          {dragReorder && (
                            <span
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', node.id)
                                e.dataTransfer.effectAllowed = 'move'
                                setDraggingId(node.id)
                              }}
                              onDragEnd={() => {
                                setDraggingId(null)
                                setDragOverId(null)
                              }}
                              className="cursor-grab active:cursor-grabbing text-violet-500 hover:text-violet-700 p-0.5 flex-shrink-0 nodrag"
                              title="Drag to reorder"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              <GripVertical size={14} />
                            </span>
                          )}
                          <input
                            disabled={read || dragReorder}
                            type="number"
                            className="flex-1 min-w-0 text-[11px] border border-transparent rounded px-1 py-1 font-mono disabled:opacity-48"
                            value={d.stepNumber ?? ''}
                            onChange={(e) => patchStep(node.id, { stepNumber: Number(e.target.value) || undefined })}
                            onBlur={() => pushHistory()}
                          />
                          {!read && !dragReorder && (
                            <button
                              type="button"
                              className="p-0.5 text-gray-400 hover:text-red-600 flex-shrink-0"
                              title="Delete step"
                              onClick={() => {
                                if (confirm('Delete this step and its connections?')) deleteStep(node.id)
                              }}
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td
                        className="sticky z-[20] bg-white group-hover:bg-indigo-50/30 border-r border-gray-200 px-1 py-1 align-top"
                        style={{ left: stickyLeft(1), minWidth: FROZEN[1].w, zIndex: 28 }}
                      >
                        <input
                          disabled={read || dragReorder}
                          className="w-full text-[11px] border border-transparent rounded px-1 py-1 font-medium disabled:opacity-48"
                          value={d.label ?? ''}
                          onChange={(e) => patchStep(node.id, { label: e.target.value })}
                          onBlur={() => pushHistory()}
                        />
                      </td>
                      <td
                        className="sticky z-[20] bg-white group-hover:bg-indigo-50/30 border-r border-gray-200 px-1 py-1 align-top"
                        style={{ left: stickyLeft(2), minWidth: FROZEN[2].w, zIndex: 27 }}
                      >
                        <textarea
                          disabled={read || dragReorder}
                          rows={2}
                          className="w-full text-[10px] border border-transparent rounded px-1 py-0.5 resize-none disabled:opacity-48"
                          value={d.description ?? ''}
                          onChange={(e) => patchStep(node.id, { description: e.target.value })}
                          onBlur={() => pushHistory()}
                        />
                      </td>
                      <td
                        className="sticky z-[20] bg-white group-hover:bg-indigo-50/30 border-r border-gray-200 px-1 py-1 align-top"
                        style={{ left: stickyLeft(3), minWidth: FROZEN[3].w, zIndex: 26 }}
                      >
                        <select
                          disabled={read || dragReorder}
                          className="w-full text-[10px] border border-gray-200 rounded px-1 py-1 disabled:opacity-48"
                          value={d.packMLState ?? ''}
                          onChange={(e) => {
                            patchStep(node.id, {
                              packMLState: e.target.value || undefined
                            })
                            pushHistory()
                          }}
                        >
                          <option value="">—</option>
                          {flowStates.length > 0 && (
                            <optgroup label="Custom">
                              {flowStates.map((st) => (
                                <option key={st.id} value={st.id}>{st.name}</option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Reference — stable">
                            {PACKML_WAIT_STATES.map((s) => (
                              <option key={s} value={s}>{getStepStateVisual(s, flowStates).label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Reference — transitional">
                            {PACKML_ACTING_STATES.map((s) => (
                              <option key={s} value={s}>{getStepStateVisual(s, flowStates).label}</option>
                            ))}
                          </optgroup>
                        </select>
                        {d.packMLState && <div className="mt-1"><PackMLBadge state={d.packMLState} /></div>}
                      </td>
                      <td
                        className="sticky z-[20] bg-white group-hover:bg-indigo-50/30 border-r border-gray-200 px-1 py-1 align-top"
                        style={{ left: stickyLeft(4), minWidth: FROZEN[4].w, zIndex: 25 }}
                      >
                        <div className="flex flex-wrap gap-0.5">
                          {phases.length === 0 ? (
                            <span className="text-[10px] text-gray-300">—</span>
                          ) : (
                            phases.map((p) => {
                              const on = (d.phaseIds ?? []).includes(p.id)
                              const c = p.color ?? '#64748b'
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  disabled={read || dragReorder}
                                  title={on ? `Remove from “${p.name}”` : `Add to “${p.name}”`}
                                  onClick={() => toggleStepPhase(node.id, p.id)}
                                  className={`max-w-full truncate text-[9px] px-1 py-0.5 rounded border transition-colors ${
                                    on
                                      ? 'font-semibold shadow-sm'
                                      : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:bg-gray-50'
                                  } disabled:opacity-50 disabled:pointer-events-none`}
                                  style={
                                    on
                                      ? {
                                          borderColor: c,
                                          backgroundColor: `${c}26`,
                                          color: c
                                        }
                                      : undefined
                                  }
                                >
                                  {p.name}
                                </button>
                              )
                            })
                          )}
                        </div>
                      </td>
                      <td
                        className="sticky z-[20] bg-white group-hover:bg-indigo-50/30 border-r border-gray-200 px-1 py-1 align-top relative"
                        style={{ left: stickyLeft(5), minWidth: FROZEN[5].w, zIndex: 24 }}
                      >
                        <div className="flex flex-col gap-1">
                          {jumpsTo.map((j) => {
                            const brief = stepTargetBrief(nodeMap, j.targetId)
                            const hasDetails = !!(j.reason.trim() || j.description.trim())
                            return (
                              <div
                                key={`${j.kind}-${j.id}`}
                                className="flex flex-col gap-0.5 text-[10px] bg-blue-50 border border-blue-100 rounded px-1 py-0.5"
                              >
                                {j.reason.trim() && (
                                  <div
                                    className="text-[9px] font-semibold text-gray-800 leading-tight truncate border-b border-blue-100/80 pb-0.5"
                                    title={j.reason}
                                  >
                                    {j.reason}
                                  </div>
                                )}
                                <div className="flex items-center gap-0.5 min-h-[20px]">
                                  <button
                                    type="button"
                                    className="flex-1 min-w-0 text-left flex items-baseline gap-1 hover:opacity-80"
                                    onClick={() => useDiagramStore.getState().setPendingFocusNodeId(j.targetId)}
                                    title="Go to step"
                                  >
                                    {brief.num && (
                                      <span className="font-mono text-blue-700 shrink-0 tabular-nums">{brief.num}</span>
                                    )}
                                    <span className="truncate text-blue-900">{brief.name}</span>
                                  </button>
                                  {hasDetails && (
                                    <span
                                      className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400"
                                      title="Has description (open to view)"
                                    />
                                  )}
                                  {hasDetails && (read || dragReorder) && (
                                    <button
                                      type="button"
                                      className="shrink-0 p-0.5 rounded text-gray-500 hover:bg-gray-200"
                                      title="View condition & description"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setJumpViewModal({
                                          jump: j,
                                          title: `Jump to ${nodeLabel(nodeMap, j.targetId)}`
                                        })
                                      }}
                                    >
                                      <Info size={12} />
                                    </button>
                                  )}
                                  {!read && !dragReorder && (
                                    <>
                                      <button
                                        type="button"
                                        className="shrink-0 p-0.5 rounded text-indigo-600 hover:bg-indigo-100"
                                        title="Condition & description"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setJumpEditModal({ mode: 'edit', sourceNodeId: node.id, jump: j })
                                        }}
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        className="shrink-0 p-0.5 text-gray-400 hover:text-red-500"
                                        onClick={() => removeJump(node.id, j, d)}
                                        title="Remove jump"
                                      >
                                        <X size={10} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {!read && !dragReorder && (
                            <button
                              type="button"
                              className="text-[10px] text-indigo-600 flex items-center gap-0.5 mt-0.5"
                              onClick={() => setJumpEditModal({ mode: 'add', sourceNodeId: node.id })}
                            >
                              <Link2 size={10} /> Add jump
                            </button>
                          )}
                        </div>
                      </td>
                      <td
                        className="sticky z-[20] bg-white group-hover:bg-indigo-50/30 border-r-2 border-gray-300 px-1 py-1 align-top"
                        style={{ left: stickyLeft(6), minWidth: FROZEN[6].w, zIndex: 23 }}
                      >
                        <div className="flex flex-col gap-1">
                          {jumpsFrom.map((j) => {
                            const brief = stepTargetBrief(nodeMap, j.targetId)
                            const hasDetails = !!(j.reason.trim() || j.description.trim())
                            return (
                              <div
                                key={`${j.kind}-${j.id}`}
                                className="flex flex-col gap-0.5 text-[10px] bg-gray-50 border border-gray-100 rounded px-1 py-0.5"
                              >
                                {j.reason.trim() && (
                                  <div
                                    className="text-[9px] font-semibold text-gray-700 leading-tight truncate border-b border-gray-200/80 pb-0.5"
                                    title={j.reason}
                                  >
                                    {j.reason}
                                  </div>
                                )}
                                <div className="flex items-center gap-0.5 min-h-[20px]">
                                  <button
                                    type="button"
                                    className="flex-1 min-w-0 text-left flex items-baseline gap-1 text-gray-700 hover:bg-gray-100 rounded px-0.5 -mx-0.5"
                                    onClick={() => useDiagramStore.getState().setPendingFocusNodeId(j.targetId)}
                                    title="Go to source step"
                                  >
                                    {brief.num && (
                                      <span className="font-mono text-gray-600 shrink-0 tabular-nums">{brief.num}</span>
                                    )}
                                    <span className="truncate">{brief.name}</span>
                                  </button>
                                  {hasDetails && (
                                    <button
                                      type="button"
                                      className="shrink-0 p-0.5 rounded text-gray-500 hover:bg-gray-200"
                                      title="View condition & description"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setJumpViewModal({
                                          jump: j,
                                          title: `From ${nodeLabel(nodeMap, j.targetId)}`
                                        })
                                      }}
                                    >
                                      <Info size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {jumpsFrom.length === 0 && <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
              <thead>
                <tr style={{ height: 28 }}>
                  {FROZEN.slice(0, 3).map((f, i) => (
                    <th
                      key={f.label}
                      rowSpan={3}
                      className="sticky z-[40] bg-gray-100 text-left px-2 py-1 border-r border-b border-gray-300 font-bold text-[10px] uppercase text-gray-500"
                      style={{ left: stickyLeft(i), minWidth: f.w, width: f.w, top: 0, zIndex: 50 - i }}
                    >
                      {f.label}
                    </th>
                  ))}
                  {columns.length === 0 ? (
                    <th
                      rowSpan={3}
                      className="bg-white border-b border-gray-200 px-4 text-left text-[10px] text-gray-400 align-top pt-2"
                      style={{ minWidth: 200 }}
                    >
                      Cause &amp; Effect — select instances on the right →
                    </th>
                  ) : (
                    ifaceSpans.map((span) => (
                      <th
                        key={span.data.interfaceId}
                        colSpan={span.count}
                        className="sticky top-0 z-[30] text-center border-r border-b border-gray-200 px-2 whitespace-nowrap bg-white"
                        style={{ height: 28 }}
                      >
                        <span className={`px-1.5 py-px rounded text-[9px] font-bold ${
                          span.data.interfaceType === 'AOI' ? 'bg-orange-100 text-orange-700' : 'bg-cyan-100 text-cyan-700'
                        }`}>
                          {span.data.interfaceType}
                        </span>
                        <span className="font-semibold text-gray-700 ml-1">{span.data.interfaceName}</span>
                      </th>
                    ))
                  )}
                </tr>
                {columns.length > 0 && (
                  <tr style={{ height: 36 }}>
                    {instSpans.map((span) => (
                      <th
                        key={span.data.instanceId}
                        colSpan={span.count}
                        className="sticky z-[30] text-center border-r border-b border-gray-200 px-2"
                        style={{ top: 28, height: 36, background: '#f5f3ff' }}
                      >
                        <div className="font-semibold text-indigo-800 text-[11px]">{span.data.instanceName}</div>
                        <div className="font-mono text-[10px] text-indigo-400">{span.data.tagName}</div>
                      </th>
                    ))}
                  </tr>
                )}
                {columns.length > 0 && (
                  <tr style={{ height: 28 }}>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className="sticky z-[30] text-center border-r border-b-2 border-gray-300 px-1"
                        style={{ top: 64, height: 28, background: '#f8fafc' }}
                      >
                        <span className="text-gray-700 font-medium">{col.fieldName}</span>
                        <span className={`ml-0.5 text-[9px] ${col.isNumeric ? 'text-blue-500' : 'text-emerald-500'}`}>
                          {col.dataType}
                        </span>
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {displaySteps.map((node) => {
                  const d = node.data as PLCNodeData
                  const isSel = selectedNodeId === node.id
                  return (
                    <tr
                      key={node.id}
                      data-step-matrix-row={node.id}
                      className={`group border-b border-gray-100 ${isSel ? 'bg-indigo-50/80' : 'hover:bg-white'}`}
                    >
                      <td
                        className="sticky z-[20] bg-white group-hover:bg-indigo-50/30 border-r border-gray-200 px-1 py-1 align-top"
                        style={{ left: stickyLeft(0), minWidth: FROZEN[0].w, zIndex: 29 }}
                      >
                        <span className="font-mono text-[11px] text-gray-700 tabular-nums">
                          {d.stepNumber !== undefined ? `S${d.stepNumber}` : '—'}
                        </span>
                      </td>
                      <td
                        className="sticky z-[20] bg-white group-hover:bg-indigo-50/30 border-r border-gray-200 px-1 py-1 align-top"
                        style={{ left: stickyLeft(1), minWidth: FROZEN[1].w, zIndex: 28 }}
                      >
                        <span className="text-[11px] font-medium text-gray-800">{(d.label ?? '').trim() || '—'}</span>
                      </td>
                      <td
                        className="sticky z-[20] bg-white group-hover:bg-indigo-50/30 border-r border-gray-200 px-1 py-1 align-top"
                        style={{ left: stickyLeft(2), minWidth: FROZEN[2].w, zIndex: 27 }}
                      >
                        {read ? (
                          <span className="text-[10px] text-gray-700 whitespace-pre-wrap break-words">
                            {(d.description ?? '').trim() || '—'}
                          </span>
                        ) : (
                          <textarea
                            rows={2}
                            className="w-full text-[10px] border border-transparent rounded px-1 py-0.5 resize-none bg-white hover:border-gray-200 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
                            value={d.description ?? ''}
                            onChange={(e) => patchStep(node.id, { description: e.target.value })}
                            onBlur={() => pushHistory()}
                            placeholder="Description…"
                          />
                        )}
                      </td>
                      {columns.length === 0 ? (
                        <td className="border-b border-gray-100 bg-gray-50/50" />
                      ) : (
                        columns.map((col) => {
                          const val = matrixData?.[node.id]?.[col.instanceId]?.[col.fieldId] ?? null
                          const h = d.packMLState ? 48 : 40
                          return (
                            <td
                              key={col.key}
                              className="border-r border-b border-gray-100 text-center align-middle bg-white"
                              style={{ minWidth: col.isNumeric ? 80 : 52, height: h }}
                            >
                              {read ? (
                                <span className="text-[10px] text-gray-500">{String(val ?? '—')}</span>
                              ) : col.isNumeric ? (
                                <NumericCell value={val} onChange={(v) => setMatrixCell(node.id, col.instanceId, col.fieldId, v)} />
                              ) : (
                                <BoolCell value={val} onChange={(v) => setMatrixCell(node.id, col.instanceId, col.fieldId, v)} />
                              )}
                            </td>
                          )
                        })
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {isCE && (
        <InstanceSidebar
          sidebarInstances={sidebarInstances}
          hiddenInstanceIds={hiddenInstanceIds}
          usedInstanceIds={usedInstanceIds}
          onToggle={toggleInstance}
          onHideUnused={hideUnused}
          onShowAll={showAll}
        />
        )}

        {isSteps && jumpEditModal && (
          <div
            role="presentation"
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setJumpEditModal(null)
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="jump-edit-title"
              className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col border border-gray-200"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 id="jump-edit-title" className="text-sm font-semibold text-gray-900 pr-2">
                  {jumpEditModal.mode === 'add'
                    ? 'Add jump'
                    : (() => {
                        const b = stepTargetBrief(nodeMap, jumpEditModal.jump.targetId)
                        const head = [b.num, b.name].filter(Boolean).join(' ')
                        return `Jump → ${head}`.trim()
                      })()}
                </h2>
                <button
                  type="button"
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 shrink-0"
                  onClick={() => setJumpEditModal(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-4 py-3 flex flex-col gap-3 overflow-y-auto flex-1 min-h-0">
                {jumpEditModal.mode === 'add' && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase text-gray-500">Target step</span>
                    <select
                      className="text-sm border border-gray-200 rounded-lg px-2 py-2"
                      value={jumpModalDraft.targetId}
                      onChange={(e) => setJumpModalDraft((prev) => ({ ...prev, targetId: e.target.value }))}
                    >
                      <option value="">Select step…</option>
                      <option value={JUMP_NEW_STEP_VALUE}>Add new step at end (next # +10)</option>
                      {stepNodes
                        .filter((s) => s.id !== jumpEditModal.sourceNodeId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            S{s.data.stepNumber} {s.data.label}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase text-gray-500">Condition</span>
                  <select
                    className="text-sm border border-gray-200 rounded-lg px-2 py-2"
                    value={jumpModalDraft.conditionPreset}
                    onChange={(e) =>
                      setJumpModalDraft((prev) => ({ ...prev, conditionPreset: e.target.value }))
                    }
                  >
                    {JUMP_CONDITION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                {jumpModalDraft.conditionPreset === 'User Condition' && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase text-gray-500">Custom condition</span>
                    <input
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2"
                      placeholder="Describe the condition…"
                      value={jumpModalDraft.userConditionText}
                      onChange={(e) =>
                        setJumpModalDraft((prev) => ({ ...prev, userConditionText: e.target.value }))
                      }
                    />
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase text-gray-500">Description</span>
                  <textarea
                    className="w-full min-h-[240px] text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans resize-y"
                    rows={12}
                    placeholder="Longer notes or documentation for this jump…"
                    value={jumpModalDraft.description}
                    onChange={(e) => setJumpModalDraft((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/80">
                <div>
                  {jumpEditModal.mode === 'edit' && (
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:underline"
                      onClick={() => {
                        if (jumpEditModal.mode !== 'edit') return
                        const n = flowNodes.find((x) => x.id === jumpEditModal.sourceNodeId)
                        if (n) removeJump(jumpEditModal.sourceNodeId, jumpEditModal.jump, n.data as PLCNodeData)
                        setJumpEditModal(null)
                      }}
                    >
                      Remove jump
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                    onClick={() => setJumpEditModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-40"
                    disabled={
                      jumpEditModal.mode === 'add' &&
                      (!jumpModalDraft.targetId ||
                        (jumpModalDraft.conditionPreset === 'User Condition' &&
                          !jumpModalDraft.userConditionText.trim()))
                    }
                    onClick={() => {
                      if (!jumpEditModal) return
                      const resolvedReason = resolveJumpCondition(
                        jumpModalDraft.conditionPreset,
                        jumpModalDraft.userConditionText
                      )
                      if (jumpEditModal.mode === 'add') {
                        if (!jumpModalDraft.targetId) return
                        if (jumpModalDraft.conditionPreset === 'User Condition' && !resolvedReason) return
                        if (jumpModalDraft.targetId === JUMP_NEW_STEP_VALUE) {
                          addJumpToNewStepAtEnd(
                            jumpEditModal.sourceNodeId,
                            resolvedReason,
                            jumpModalDraft.description
                          )
                          setJumpEditModal(null)
                          return
                        }
                        addStepLink(
                          jumpEditModal.sourceNodeId,
                          jumpModalDraft.targetId,
                          resolvedReason,
                          jumpModalDraft.description
                        )
                        setJumpEditModal(null)
                        return
                      }
                      updateJumpField(jumpEditModal.sourceNodeId, jumpEditModal.jump, {
                        reason: resolvedReason,
                        description: jumpModalDraft.description
                      })
                      pushHistory()
                      setJumpEditModal(null)
                    }}
                  >
                    {jumpEditModal.mode === 'add' ? 'Add jump' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isSteps && jumpViewModal && (
          <div
            role="presentation"
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setJumpViewModal(null)
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="jump-view-title"
              className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col border border-gray-200"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 id="jump-view-title" className="text-sm font-semibold text-gray-900 pr-2">
                  {jumpViewModal.title}
                </h2>
                <button
                  type="button"
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 shrink-0"
                  onClick={() => setJumpViewModal(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-4 py-3 flex flex-col gap-3 overflow-y-auto">
                <div>
                  <div className="text-[10px] font-semibold uppercase text-gray-500 mb-1">Condition</div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 min-h-[2.5rem]">
                    {jumpViewModal.jump.reason.trim() || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase text-gray-500 mb-1">Description</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap rounded-lg bg-gray-50 border border-gray-100 px-3 py-3 min-h-[200px] max-h-[50vh] overflow-y-auto">
                    {jumpViewModal.jump.description.trim() || '—'}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex justify-end bg-gray-50/80">
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                  onClick={() => setJumpViewModal(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
