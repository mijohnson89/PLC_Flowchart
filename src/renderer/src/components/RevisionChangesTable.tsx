import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Minus, Pencil, History } from 'lucide-react'
import { useDiagramStore, selectRevisions } from '../store/diagramStore'
import type { RevisionSnapshot, PLCNodeData, PLCEdge, PLCNode } from '../types'
import { formatDate } from '../utils/formatDate'

// ── Change entry ─────────────────────────────────────────────────────────────

interface ChangeEntry {
  revisionName: string
  revisionDate: string
  changeType: 'added' | 'removed' | 'modified'
  elementType: 'node' | 'edge' | 'actor' | 'message'
  elementName: string
  details: string
}

// ── Diff helpers ─────────────────────────────────────────────────────────────

function describeNodeChange(oldNode: PLCNode, newNode: PLCNode): string {
  const parts: string[] = []
  const oldD = oldNode.data as PLCNodeData
  const newD = newNode.data as PLCNodeData
  if (oldNode.type !== newNode.type) parts.push(`type: ${oldNode.type} → ${newNode.type}`)
  if (oldD.label !== newD.label) parts.push(`label: "${oldD.label}" → "${newD.label}"`)
  if (oldD.description !== newD.description) parts.push('description changed')
  if (oldD.condition !== newD.condition) parts.push('condition changed')
  if (oldD.stepNumber !== newD.stepNumber) parts.push(`step#: ${oldD.stepNumber ?? '–'} → ${newD.stepNumber ?? '–'}`)
  if (oldD.packMLState !== newD.packMLState) parts.push(`PackML: ${oldD.packMLState ?? '–'} → ${newD.packMLState ?? '–'}`)
  if (oldD.tagName !== newD.tagName) parts.push('tag name changed')
  if (oldD.outputType !== newD.outputType) parts.push('output type changed')
  if (oldD.actorType !== newD.actorType) parts.push('actor type changed')
  if (oldD.routineName !== newD.routineName) parts.push('routine name changed')
  if (oldD.color !== newD.color) parts.push('color changed')
  if (oldD.linkedTabId !== newD.linkedTabId || oldD.linkedNodeId !== newD.linkedNodeId) parts.push('diagram link changed')
  if (parts.length === 0) {
    if (oldNode.position?.x !== newNode.position?.x || oldNode.position?.y !== newNode.position?.y) {
      return 'position changed'
    }
    return 'properties changed'
  }
  return parts.join(', ')
}

function describeEdgeChange(oldEdge: PLCEdge, newEdge: PLCEdge): string {
  const parts: string[] = []
  if (oldEdge.source !== newEdge.source || oldEdge.target !== newEdge.target) parts.push('connection changed')
  if ((oldEdge.label ?? '') !== (newEdge.label ?? '')) parts.push(`label: "${oldEdge.label ?? ''}" → "${newEdge.label ?? ''}"`)
  return parts.length > 0 ? parts.join(', ') : 'properties changed'
}

function nodeLabel(node: PLCNode): string {
  const d = node.data as PLCNodeData
  return d.label || `[${node.type}]`
}

function edgeLabel(edge: PLCEdge, nodeMap: Map<string, PLCNode>): string {
  const src = nodeMap.get(edge.source)
  const tgt = nodeMap.get(edge.target)
  const srcName = src ? nodeLabel(src) : edge.source
  const tgtName = tgt ? nodeLabel(tgt) : edge.target
  const label = edge.label ? ` "${edge.label}"` : ''
  return `${srcName} → ${tgtName}${label}`
}

function diffSnapshots(
  oldSnap: RevisionSnapshot | null,
  newSnap: RevisionSnapshot,
  revisionName: string,
  revisionDate: string
): ChangeEntry[] {
  const changes: ChangeEntry[] = []

  // ── Flow Nodes ──
  const oldNodes = new Map((oldSnap?.flowNodes ?? []).map((n) => [n.id, n]))
  const newNodes = new Map(newSnap.flowNodes.map((n) => [n.id, n]))

  for (const [id, node] of newNodes) {
    if (!oldNodes.has(id)) {
      changes.push({ revisionName, revisionDate, changeType: 'added', elementType: 'node', elementName: nodeLabel(node), details: `${node.type} node` })
    } else {
      const old = oldNodes.get(id)!
      if (JSON.stringify(old.data) !== JSON.stringify(node.data) || old.type !== node.type) {
        changes.push({ revisionName, revisionDate, changeType: 'modified', elementType: 'node', elementName: nodeLabel(node), details: describeNodeChange(old, node) })
      }
    }
  }
  for (const [id, node] of oldNodes) {
    if (!newNodes.has(id)) {
      changes.push({ revisionName, revisionDate, changeType: 'removed', elementType: 'node', elementName: nodeLabel(node), details: `${node.type} node` })
    }
  }

  // ── Flow Edges ──
  const oldEdges = new Map((oldSnap?.flowEdges ?? []).map((e) => [e.id, e]))
  const newEdges = new Map(newSnap.flowEdges.map((e) => [e.id, e]))
  const allNodesMap = new Map([...oldNodes, ...newNodes])

  for (const [id, edge] of newEdges) {
    if (!oldEdges.has(id)) {
      changes.push({ revisionName, revisionDate, changeType: 'added', elementType: 'edge', elementName: edgeLabel(edge, allNodesMap), details: 'connection' })
    } else {
      const old = oldEdges.get(id)!
      if (old.source !== edge.source || old.target !== edge.target || (old.label ?? '') !== (edge.label ?? '')) {
        changes.push({ revisionName, revisionDate, changeType: 'modified', elementType: 'edge', elementName: edgeLabel(edge, allNodesMap), details: describeEdgeChange(old, edge) })
      }
    }
  }
  for (const [id, edge] of oldEdges) {
    if (!newEdges.has(id)) {
      changes.push({ revisionName, revisionDate, changeType: 'removed', elementType: 'edge', elementName: edgeLabel(edge, allNodesMap), details: 'connection' })
    }
  }

  // ── Sequence Actors ──
  const oldActors = new Map((oldSnap?.seqActors ?? []).map((a) => [a.id, a]))
  const newActors = new Map(newSnap.seqActors.map((a) => [a.id, a]))

  for (const [id, actor] of newActors) {
    if (!oldActors.has(id)) {
      changes.push({ revisionName, revisionDate, changeType: 'added', elementType: 'actor', elementName: actor.name, details: `${actor.type} actor` })
    } else {
      const old = oldActors.get(id)!
      if (old.name !== actor.name || old.type !== actor.type) {
        const parts: string[] = []
        if (old.name !== actor.name) parts.push(`name: "${old.name}" → "${actor.name}"`)
        if (old.type !== actor.type) parts.push(`type: ${old.type} → ${actor.type}`)
        changes.push({ revisionName, revisionDate, changeType: 'modified', elementType: 'actor', elementName: actor.name, details: parts.join(', ') })
      }
    }
  }
  for (const [id, actor] of oldActors) {
    if (!newActors.has(id)) {
      changes.push({ revisionName, revisionDate, changeType: 'removed', elementType: 'actor', elementName: actor.name, details: `${actor.type} actor` })
    }
  }

  // ── Sequence Messages ──
  const oldMsgs = new Map((oldSnap?.seqMessages ?? []).map((m) => [m.id, m]))
  const newMsgs = new Map(newSnap.seqMessages.map((m) => [m.id, m]))
  const actorNames = new Map([...oldActors, ...newActors].map(([, a]) => [a.id, a.name]))

  for (const [id, msg] of newMsgs) {
    const msgName = `${actorNames.get(msg.fromId) ?? '?'} → ${actorNames.get(msg.toId) ?? '?'}: ${msg.label}`
    if (!oldMsgs.has(id)) {
      changes.push({ revisionName, revisionDate, changeType: 'added', elementType: 'message', elementName: msgName, details: `${msg.type} message` })
    } else {
      const old = oldMsgs.get(id)!
      if (old.label !== msg.label || old.type !== msg.type || old.fromId !== msg.fromId || old.toId !== msg.toId) {
        const parts: string[] = []
        if (old.label !== msg.label) parts.push(`label: "${old.label}" → "${msg.label}"`)
        if (old.type !== msg.type) parts.push(`type: ${old.type} → ${msg.type}`)
        if (old.fromId !== msg.fromId || old.toId !== msg.toId) parts.push('participants changed')
        changes.push({ revisionName, revisionDate, changeType: 'modified', elementType: 'message', elementName: msgName, details: parts.join(', ') })
      }
    }
  }
  for (const [id, msg] of oldMsgs) {
    if (!newMsgs.has(id)) {
      const msgName = `${actorNames.get(msg.fromId) ?? '?'} → ${actorNames.get(msg.toId) ?? '?'}: ${msg.label}`
      changes.push({ revisionName, revisionDate, changeType: 'removed', elementType: 'message', elementName: msgName, details: `${msg.type} message` })
    }
  }

  return changes
}


// ── Badge helpers ────────────────────────────────────────────────────────────

const CHANGE_STYLE: Record<ChangeEntry['changeType'], { icon: typeof Plus; bg: string; text: string; label: string }> = {
  added:    { icon: Plus,   bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Added' },
  removed:  { icon: Minus,  bg: 'bg-red-100',     text: 'text-red-700',     label: 'Removed' },
  modified: { icon: Pencil, bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Modified' },
}

const ELEMENT_STYLE: Record<ChangeEntry['elementType'], string> = {
  node:    'bg-indigo-50 text-indigo-700',
  edge:    'bg-gray-100 text-gray-700',
  actor:   'bg-orange-50 text-orange-700',
  message: 'bg-teal-50 text-teal-700',
}

// ── Component ────────────────────────────────────────────────────────────────

export function RevisionChangesTable() {
  const revisions = useDiagramStore(selectRevisions)
  const activeTab = useDiagramStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const [collapsed, setCollapsed] = useState(false)

  const allChanges = useMemo<ChangeEntry[]>(() => {
    if (!activeTab || revisions.length === 0) return []

    const result: ChangeEntry[] = []
    const sorted = [...revisions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Diff each revision against its predecessor
    for (let i = 0; i < sorted.length; i++) {
      const prev = i === 0 ? null : sorted[i - 1].snapshot
      result.push(...diffSnapshots(prev, sorted[i].snapshot, sorted[i].name, sorted[i].date))
    }

    // Diff current state against latest revision
    const latest = sorted[sorted.length - 1]
    const currentSnap: RevisionSnapshot = {
      flowNodes: activeTab.flowNodes,
      flowEdges: activeTab.flowEdges,
      seqActors: activeTab.seqActors,
      seqMessages: activeTab.seqMessages,
    }
    const unrevisedChanges = diffSnapshots(latest.snapshot, currentSnap, 'Current (unsaved)', new Date().toISOString())
    result.push(...unrevisedChanges)

    return result
  }, [revisions, activeTab])

  if (revisions.length === 0) return null

  return (
    <div className="flex-shrink-0 bg-white border-t border-gray-200 flex flex-col" style={{ maxHeight: collapsed ? undefined : '35vh' }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 transition-colors flex-shrink-0"
      >
        {collapsed ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
        <History size={13} className="text-gray-500" />
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Revision Changes</span>
        <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-semibold">{allChanges.length}</span>
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-auto min-h-0">
          {allChanges.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-xs">No changes between revisions.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                  <th className="px-4 py-2">Revision</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Change</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allChanges.map((c, i) => {
                  const style = CHANGE_STYLE[c.changeType]
                  const Icon = style.icon
                  return (
                    <tr key={i} className="hover:bg-gray-50/70">
                      <td className="px-4 py-1.5 font-medium text-gray-700 whitespace-nowrap">{c.revisionName}</td>
                      <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">{formatDate(c.revisionDate)}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${style.bg} ${style.text}`}>
                          <Icon size={9} /> {style.label}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${ELEMENT_STYLE[c.elementType]}`}>
                          {c.elementType}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[200px] truncate" title={c.elementName}>{c.elementName}</td>
                      <td className="px-3 py-1.5 text-gray-500 max-w-[300px] truncate" title={c.details}>{c.details}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
