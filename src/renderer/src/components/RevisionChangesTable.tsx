import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Minus, Pencil, History, Lock, Eye, ArrowLeftCircle } from 'lucide-react'
import { useDiagramStore, selectRevisions, selectIsViewingRevision } from '../store/diagramStore'
import type { Revision, RevisionSnapshot, PLCNodeData, PLCEdge, PLCEdgeData, PLCNode, StepLink } from '../types'
import { formatDate } from '../utils/formatDate'
import { stepTargetBrief } from '../utils/stepMatrixJumps'
import { RevisionStampModal } from './RevisionStampModal'

// ── Change entry ─────────────────────────────────────────────────────────────

interface ChangeEntry {
  revisionName: string
  revisionDate: string
  author: string
  changeType: 'added' | 'removed' | 'modified'
  elementType: 'node' | 'edge' | 'actor' | 'message'
  elementName: string
  details: string
}

// ── Text helpers ─────────────────────────────────────────────────────────────

const TRUNC = 56
/** Longer limit for jump conditions / notes so revision logs stay readable. */
const TRUNC_JUMP = 100

function truncate(s: string, max = TRUNC): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function fmtTextField(
  label: string,
  oldS: string | undefined,
  newS: string | undefined,
  maxLen = TRUNC
): string | null {
  const o = (oldS ?? '').trim()
  const n = (newS ?? '').trim()
  if (o === n) return null
  if (!o) return `${label} set to "${truncate(n, maxLen)}"`
  if (!n) return `${label} cleared (was "${truncate(o, maxLen)}")`
  return `${label}: "${truncate(o, maxLen)}" → "${truncate(n, maxLen)}"`
}

function fmtScalar(label: string, oldV: unknown, newV: unknown): string | null {
  if (oldV === newV) return null
  const os = oldV === undefined || oldV === null || oldV === '' ? '—' : String(oldV)
  const ns = newV === undefined || newV === null || newV === '' ? '—' : String(newV)
  return `${label}: ${os} → ${ns}`
}

// ── Node / edge diff ─────────────────────────────────────────────────────────

function nodeVisualChanged(oldNode: PLCNode, newNode: PLCNode): boolean {
  if (oldNode.position?.x !== newNode.position?.x || oldNode.position?.y !== newNode.position?.y) return true
  return false
}

function jumpTargetLabel(nodeMap: Map<string, PLCNode>, targetId: string): string {
  const { num, name } = stepTargetBrief(nodeMap, targetId)
  const bits = [num, name].filter((b) => b && b !== '—')
  return bits.length ? bits.join(' ').trim() : targetId.slice(0, 8)
}

/** Per–step-link diff (matrix / embedded jumps), with target step names. */
function describeStepLinksDelta(
  oldLinks: StepLink[] | undefined,
  newLinks: StepLink[] | undefined,
  nodeMap: Map<string, PLCNode>
): string[] {
  const o = oldLinks ?? []
  const n = newLinks ?? []
  if (JSON.stringify(o) === JSON.stringify(n)) return []

  const parts: string[] = []
  const oldById = new Map(o.map((sl) => [sl.id, sl]))
  const newById = new Map(n.map((sl) => [sl.id, sl]))

  for (const sl of n) {
    if (oldById.has(sl.id)) continue
    const tgt = jumpTargetLabel(nodeMap, sl.targetNodeId)
    const r = (sl.reason ?? '').trim()
    const desc = (sl.description ?? '').trim()
    if (r && desc) {
      parts.push(`Jump added → ${tgt}: "${truncate(r, TRUNC_JUMP)}" (${truncate(desc, TRUNC_JUMP)})`)
    } else if (r) {
      parts.push(`Jump added → ${tgt}: "${truncate(r, TRUNC_JUMP)}"`)
    } else if (desc) {
      parts.push(`Jump added → ${tgt} (${truncate(desc, TRUNC_JUMP)})`)
    } else {
      parts.push(`Jump added → ${tgt}`)
    }
  }

  for (const sl of o) {
    if (newById.has(sl.id)) continue
    const tgt = jumpTargetLabel(nodeMap, sl.targetNodeId)
    const r = (sl.reason ?? '').trim()
    if (r) parts.push(`Jump removed (was → ${tgt}: "${truncate(r, TRUNC_JUMP)}")`)
    else parts.push(`Jump removed (was → ${tgt})`)
  }

  for (const newSl of n) {
    const oldSl = oldById.get(newSl.id)
    if (!oldSl) continue
    if (
      oldSl.targetNodeId === newSl.targetNodeId &&
      (oldSl.reason ?? '') === (newSl.reason ?? '') &&
      (oldSl.description ?? '') === (newSl.description ?? '')
    ) {
      continue
    }
    const sub: string[] = []
    if (oldSl.targetNodeId !== newSl.targetNodeId) {
      sub.push(
        `target ${jumpTargetLabel(nodeMap, oldSl.targetNodeId)} → ${jumpTargetLabel(nodeMap, newSl.targetNodeId)}`
      )
    }
    const jc = fmtTextField('jump condition', oldSl.reason, newSl.reason, TRUNC_JUMP)
    if (jc) sub.push(jc)
    const nd = fmtTextField('jump notes', oldSl.description, newSl.description, TRUNC_JUMP)
    if (nd) sub.push(nd)
    if (sub.length) parts.push(`Jump updated (${jumpTargetLabel(nodeMap, newSl.targetNodeId)}): ${sub.join('; ')}`)
  }

  return parts
}

function describeNodeChange(oldNode: PLCNode, newNode: PLCNode, nodeMap: Map<string, PLCNode>): string {
  const parts: string[] = []
  const oldD = oldNode.data as PLCNodeData
  const newD = newNode.data as PLCNodeData

  if (oldNode.type !== newNode.type) parts.push(`type: ${oldNode.type} → ${newNode.type}`)

  const nameKey = newNode.type === 'step' ? 'Step name' : 'label'
  const t1 = fmtTextField(nameKey, oldD.label, newD.label)
  if (t1) parts.push(t1)
  const t2 = fmtTextField('description', oldD.description, newD.description)
  if (t2) parts.push(t2)
  const t3 = fmtTextField('condition', oldD.condition, newD.condition)
  if (t3) parts.push(t3)
  const t4 = fmtTextField('tag name', oldD.tagName, newD.tagName)
  if (t4) parts.push(t4)
  const t5 = fmtTextField('routine', oldD.routineName, newD.routineName)
  if (t5) parts.push(t5)
  const t6 = fmtTextField('actions', oldD.actions, newD.actions)
  if (t6) parts.push(t6)

  const out = fmtScalar('output type', oldD.outputType, newD.outputType)
  if (out) parts.push(out)
  const sn = fmtScalar('step #', oldD.stepNumber, newD.stepNumber)
  if (sn) parts.push(sn)
  const pk = fmtScalar('State', oldD.packMLState, newD.packMLState)
  if (pk) parts.push(pk)
  const at = fmtScalar('actor type', oldD.actorType, newD.actorType)
  if (at) parts.push(at)
  const col = fmtTextField('color', oldD.color, newD.color)
  if (col) parts.push(col)

  const lt = fmtScalar('linked tab', oldD.linkedTabId, newD.linkedTabId)
  if (lt) parts.push(lt)
  const ln = fmtScalar('linked node', oldD.linkedNodeId, newD.linkedNodeId)
  if (ln) parts.push(ln)

  parts.push(...describeStepLinksDelta(oldD.stepLinks, newD.stepLinks, nodeMap))

  const phOld = Array.isArray(oldD.phaseIds) ? oldD.phaseIds.join(', ') : ''
  const phNew = Array.isArray(newD.phaseIds) ? newD.phaseIds.join(', ') : ''
  const ph = fmtTextField('phases', phOld || undefined, phNew || undefined)
  if (ph) parts.push(ph)

  const handled = new Set([
    'label', 'description', 'condition', 'tagName', 'outputType', 'stepNumber', 'packMLState',
    'actorType', 'color', 'routineName', 'linkedTabId', 'linkedNodeId', 'stepLinks', 'actions', 'phaseIds',
  ])
  const keys = new Set([...Object.keys(oldD), ...Object.keys(newD)])
  for (const k of keys) {
    if (handled.has(k)) continue
    if (oldD[k] === newD[k]) continue
    const oj = JSON.stringify(oldD[k])
    const nj = JSON.stringify(newD[k])
    if (oj === nj) continue
    parts.push(`${k}: ${truncate(oj, 40)} → ${truncate(nj, 40)}`)
  }

  if (nodeVisualChanged(oldNode, newNode)) {
    const ox = Math.round(oldNode.position?.x ?? 0)
    const oy = Math.round(oldNode.position?.y ?? 0)
    const nx = Math.round(newNode.position?.x ?? 0)
    const ny = Math.round(newNode.position?.y ?? 0)
    const posLabel = newNode.type === 'step' ? 'Step moved on canvas' : 'Position'
    parts.push(`${posLabel}: (${ox}, ${oy}) → (${nx}, ${ny})`)
  }

  if (parts.length === 0) return 'diagram element updated (no field-level diff captured)'
  return parts.join('; ')
}

function describeEdgeChange(oldEdge: PLCEdge, newEdge: PLCEdge, allNodesMap: Map<string, PLCNode>): string {
  const parts: string[] = []
  if (oldEdge.source !== newEdge.source || oldEdge.target !== newEdge.target) {
    parts.push(`connection: ${edgeEndpointsLabel(oldEdge, allNodesMap)} → ${edgeEndpointsLabel(newEdge, allNodesMap)}`)
  }
  const oldTop = oldEdge.label ?? ''
  const newTop = newEdge.label ?? ''
  const t = fmtTextField('edge label', oldTop || undefined, newTop || undefined)
  if (t) parts.push(t)

  const oldD = (oldEdge.data ?? {}) as PLCEdgeData
  const newD = (newEdge.data ?? {}) as PLCEdgeData
  const c = fmtTextField('jump condition', oldD.condition, newD.condition, TRUNC_JUMP)
  if (c) parts.push(c)
  const d = fmtTextField('notes', oldD.description, newD.description, TRUNC_JUMP)
  if (d) parts.push(d)
  const el = fmtTextField('data label', oldD.label, newD.label)
  if (el) parts.push(el)

  const ow = oldD.waypoints
  const nw = newD.waypoints
  if (JSON.stringify(ow) !== JSON.stringify(nw)) {
    const ol = Array.isArray(ow) ? ow.length : 0
    const nl = Array.isArray(nw) ? nw.length : 0
    parts.push(`route waypoints: ${ol} → ${nl} point(s)`)
  }

  const handled = new Set(['label', 'condition', 'description', 'waypoints'])
  const keys = new Set([...Object.keys(oldD), ...Object.keys(newD)])
  for (const k of keys) {
    if (handled.has(k)) continue
    if (oldD[k] === newD[k]) continue
    const oj = JSON.stringify(oldD[k])
    const nj = JSON.stringify(newD[k])
    if (oj === nj) continue
    parts.push(`${k}: ${truncate(oj, 36)} → ${truncate(nj, 36)}`)
  }

  if (parts.length === 0) return 'edge updated'
  return parts.join('; ')
}

function edgeEndpointsLabel(edge: PLCEdge, nodeMap: Map<string, PLCNode>): string {
  const src = nodeMap.get(edge.source)
  const tgt = nodeMap.get(edge.target)
  const srcName = src ? nodeLabel(src) : edge.source.slice(0, 8)
  const tgtName = tgt ? nodeLabel(tgt) : edge.target.slice(0, 8)
  return `${srcName} → ${tgtName}`
}

function nodeLabel(node: PLCNode): string {
  const d = node.data as PLCNodeData
  return d.label || `[${node.type}]`
}

function edgeLabel(edge: PLCEdge, nodeMap: Map<string, PLCNode>): string {
  const label = edge.label ? ` "${edge.label}"` : ''
  return `${edgeEndpointsLabel(edge, nodeMap)}${label}`
}

function nodeDataOrTypeChanged(old: PLCNode, next: PLCNode): boolean {
  if (old.type !== next.type) return true
  if (JSON.stringify(old.data) !== JSON.stringify(next.data)) return true
  if (nodeVisualChanged(old, next)) return true
  return false
}

function edgeChanged(old: PLCEdge, next: PLCEdge): boolean {
  if (old.source !== next.source || old.target !== next.target) return true
  if ((old.label ?? '') !== (next.label ?? '')) return true
  if (JSON.stringify(old.data ?? {}) !== JSON.stringify(next.data ?? {})) return true
  return false
}

function diffSnapshots(
  oldSnap: RevisionSnapshot | null,
  newSnap: RevisionSnapshot,
  revisionName: string,
  revisionDate: string,
  author: string
): ChangeEntry[] {
  const changes: ChangeEntry[] = []

  // ── Flow Nodes ──
  const oldNodes = new Map((oldSnap?.flowNodes ?? []).map((n) => [n.id, n]))
  const newNodes = new Map(newSnap.flowNodes.map((n) => [n.id, n]))
  const allNodesMap = new Map([...oldNodes, ...newNodes])

  for (const [id, node] of newNodes) {
    if (!oldNodes.has(id)) {
      changes.push({
        revisionName,
        revisionDate,
        author,
        changeType: 'added',
        elementType: 'node',
        elementName: nodeLabel(node),
        details: `Added ${node.type} node`,
      })
    } else {
      const old = oldNodes.get(id)!
      if (nodeDataOrTypeChanged(old, node)) {
        changes.push({
          revisionName,
          revisionDate,
          author,
          changeType: 'modified',
          elementType: 'node',
          elementName: nodeLabel(node),
          details: describeNodeChange(old, node, allNodesMap),
        })
      }
    }
  }
  for (const [id, node] of oldNodes) {
    if (!newNodes.has(id)) {
      changes.push({
        revisionName,
        revisionDate,
        author,
        changeType: 'removed',
        elementType: 'node',
        elementName: nodeLabel(node),
        details: `Removed ${node.type} node`,
      })
    }
  }

  // ── Flow Edges ──
  const oldEdges = new Map((oldSnap?.flowEdges ?? []).map((e) => [e.id, e]))
  const newEdges = new Map(newSnap.flowEdges.map((e) => [e.id, e]))

  function edgeJumpSummary(e: PLCEdge): string | null {
    const ed = (e.data ?? {}) as PLCEdgeData
    const cond = (ed.condition ?? e.label ?? '').trim()
    const note = (ed.description ?? '').trim()
    if (cond && note) return `jump: "${truncate(cond, TRUNC_JUMP)}"; notes: "${truncate(note, TRUNC_JUMP)}"`
    if (cond) return `jump condition: "${truncate(cond, TRUNC_JUMP)}"`
    if (note) return `notes: "${truncate(note, TRUNC_JUMP)}"`
    return null
  }

  for (const [id, edge] of newEdges) {
    if (!oldEdges.has(id)) {
      const jump = edgeJumpSummary(edge)
      changes.push({
        revisionName,
        revisionDate,
        author,
        changeType: 'added',
        elementType: 'edge',
        elementName: edgeLabel(edge, allNodesMap),
        details: jump
          ? `New connection: ${edgeEndpointsLabel(edge, allNodesMap)}; ${jump}`
          : `New connection: ${edgeEndpointsLabel(edge, allNodesMap)}`,
      })
    } else {
      const old = oldEdges.get(id)!
      if (edgeChanged(old, edge)) {
        changes.push({
          revisionName,
          revisionDate,
          author,
          changeType: 'modified',
          elementType: 'edge',
          elementName: edgeLabel(edge, allNodesMap),
          details: describeEdgeChange(old, edge, allNodesMap),
        })
      }
    }
  }
  for (const [id, edge] of oldEdges) {
    if (!newEdges.has(id)) {
      const jump = edgeJumpSummary(edge)
      changes.push({
        revisionName,
        revisionDate,
        author,
        changeType: 'removed',
        elementType: 'edge',
        elementName: edgeLabel(edge, allNodesMap),
        details: jump
          ? `Removed connection: ${edgeEndpointsLabel(edge, allNodesMap)}; was ${jump}`
          : `Removed connection: ${edgeEndpointsLabel(edge, allNodesMap)}`,
      })
    }
  }

  // ── Sequence Actors ──
  const oldActors = new Map((oldSnap?.seqActors ?? []).map((a) => [a.id, a]))
  const newActors = new Map(newSnap.seqActors.map((a) => [a.id, a]))

  for (const [id, actor] of newActors) {
    if (!oldActors.has(id)) {
      changes.push({
        revisionName,
        revisionDate,
        author,
        changeType: 'added',
        elementType: 'actor',
        elementName: actor.name,
        details: `Added ${actor.type} actor "${actor.name}"`,
      })
    } else {
      const old = oldActors.get(id)!
      if (old.name !== actor.name || old.type !== actor.type || old.color !== actor.color) {
        const parts: string[] = []
        if (old.name !== actor.name) parts.push(`name: "${old.name}" → "${actor.name}"`)
        if (old.type !== actor.type) parts.push(`type: ${old.type} → ${actor.type}`)
        if (old.color !== actor.color) parts.push(`color: ${old.color || '—'} → ${actor.color || '—'}`)
        changes.push({
          revisionName,
          revisionDate,
          author,
          changeType: 'modified',
          elementType: 'actor',
          elementName: actor.name,
          details: parts.join('; '),
        })
      }
    }
  }
  for (const [id, actor] of oldActors) {
    if (!newActors.has(id)) {
      changes.push({
        revisionName,
        revisionDate,
        author,
        changeType: 'removed',
        elementType: 'actor',
        elementName: actor.name,
        details: `Removed ${actor.type} actor "${actor.name}"`,
      })
    }
  }

  // ── Sequence Messages ──
  const oldMsgs = new Map((oldSnap?.seqMessages ?? []).map((m) => [m.id, m]))
  const newMsgs = new Map(newSnap.seqMessages.map((m) => [m.id, m]))
  const actorNames = new Map([...oldActors, ...newActors].map(([, a]) => [a.id, a.name]))

  function msgLine(msg: { fromId: string; toId: string; label: string }) {
    return `${actorNames.get(msg.fromId) ?? '?'} → ${actorNames.get(msg.toId) ?? '?'}: ${msg.label}`
  }

  for (const [id, msg] of newMsgs) {
    const msgName = msgLine(msg)
    if (!oldMsgs.has(id)) {
      changes.push({
        revisionName,
        revisionDate,
        author,
        changeType: 'added',
        elementType: 'message',
        elementName: msgName,
        details: `Added ${msg.type} message`,
      })
    } else {
      const old = oldMsgs.get(id)!
      if (old.label !== msg.label || old.type !== msg.type || old.fromId !== msg.fromId || old.toId !== msg.toId || old.note !== msg.note) {
        const parts: string[] = []
        if (old.label !== msg.label) {
          const ft = fmtTextField('label', old.label, msg.label)
          if (ft) parts.push(ft)
        }
        if (old.type !== msg.type) parts.push(`type: ${old.type} → ${msg.type}`)
        if (old.fromId !== msg.fromId || old.toId !== msg.toId) {
          const oldLine = `${actorNames.get(old.fromId) ?? '?'} → ${actorNames.get(old.toId) ?? '?'}`
          const newLine = `${actorNames.get(msg.fromId) ?? '?'} → ${actorNames.get(msg.toId) ?? '?'}`
          parts.push(`participants: ${oldLine} → ${newLine}`)
        }
        const n = fmtTextField('note', old.note, msg.note)
        if (n) parts.push(n)
        changes.push({
          revisionName,
          revisionDate,
          author,
          changeType: 'modified',
          elementType: 'message',
          elementName: msgName,
          details: parts.join('; '),
        })
      }
    }
  }
  for (const [id, msg] of oldMsgs) {
    if (!newMsgs.has(id)) {
      const msgName = msgLine(msg)
      changes.push({
        revisionName,
        revisionDate,
        author,
        changeType: 'removed',
        elementType: 'message',
        elementName: msgName,
        details: `Removed ${msg.type} message`,
      })
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

// ── Snapshots column (formerly right sidebar) ───────────────────────────────

interface RevisionCardProps {
  revision: Revision
  isViewing: boolean
  isLatest: boolean
  onView: () => void
}

function RevisionCard({ revision, isViewing, isLatest, onView }: RevisionCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`rounded-lg border text-xs transition-all ${
        isViewing
          ? 'border-amber-400 bg-amber-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-2 p-2.5">
        <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
          <div
            className={`w-2.5 h-2.5 rounded-full border-2 ${
              isLatest
                ? 'bg-emerald-500 border-emerald-500'
                : isViewing
                  ? 'bg-amber-400 border-amber-400'
                  : 'bg-white border-gray-300'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="font-semibold text-gray-800 truncate">{revision.name}</span>
            {isViewing && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                <Eye size={9} /> Viewing
              </span>
            )}
          </div>

          <div className="text-gray-500 mt-0.5">
            <span className="font-medium text-gray-600">{revision.author}</span>
            <span className="mx-1 text-gray-300">·</span>
            {formatDate(revision.date, true)}
          </div>

          {revision.description && (
            <div className="mt-1">
              <button
                type="button"
                className="flex items-center gap-0.5 text-gray-400 hover:text-gray-600"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                <span>{expanded ? 'Hide' : 'Show'} notes</span>
              </button>
              {expanded && (
                <p className="mt-1 text-gray-500 bg-gray-50 rounded p-1.5 leading-relaxed border border-gray-100">
                  {revision.description}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 px-2.5 py-1.5 flex justify-end">
        {isViewing ? (
          <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
            <Lock size={10} /> Read-only snapshot
          </span>
        ) : (
          <button
            type="button"
            onClick={onView}
            className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-medium"
          >
            <Eye size={10} /> View this revision
          </button>
        )}
      </div>
    </div>
  )
}

function RevisionSnapshotsColumn() {
  const revisions = useDiagramStore(selectRevisions)
  const isViewingRevision = useDiagramStore(selectIsViewingRevision)
  const viewingRevisionId = useDiagramStore((s) => s.viewingRevisionId)
  const { setViewingRevision } = useDiagramStore()
  const [stampOpen, setStampOpen] = useState(false)

  const sorted = [...revisions].reverse()

  return (
    <div className="w-64 flex-shrink-0 bg-white flex flex-col min-h-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <History size={14} className="text-gray-400 flex-shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate">Snapshots</h2>
        </div>
        <button
          type="button"
          onClick={() => setStampOpen(true)}
          title="Stamp a new revision"
          className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white text-[10px] font-semibold rounded hover:bg-emerald-700 transition-colors flex-shrink-0"
        >
          <Plus size={10} /> Stamp
        </button>
      </div>

      {isViewingRevision && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          <Lock size={12} className="text-amber-600 flex-shrink-0" />
          <span className="text-[10px] text-amber-700 font-medium leading-tight flex-1 min-w-0">
            Viewing read-only snapshot
          </span>
          <button
            type="button"
            onClick={() => setViewingRevision(null)}
            className="flex items-center gap-0.5 text-[10px] text-amber-700 hover:text-amber-900 font-semibold whitespace-nowrap flex-shrink-0"
          >
            <ArrowLeftCircle size={11} /> Back
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 p-2 flex flex-col gap-2">
        <div
          className={`rounded-lg border text-xs transition-all ${
            !isViewingRevision
              ? 'border-emerald-400 bg-emerald-50 shadow-sm'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-start gap-2 p-2.5">
            <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
              <div
                className={`w-2.5 h-2.5 rounded-full border-2 ${
                  !isViewingRevision ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-gray-300'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold text-gray-800">Current</span>
                {!isViewingRevision && (
                  <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    <Eye size={9} /> Active
                  </span>
                )}
              </div>
              <div className="text-gray-400 mt-0.5">Live working state</div>
            </div>
          </div>
          {isViewingRevision && (
            <div className="border-t border-gray-100 px-2.5 py-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingRevision(null)}
                className="flex items-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-900 font-medium"
              >
                <Eye size={10} /> Return to current
              </button>
            </div>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="text-center py-4 text-gray-400">
            <History size={22} className="mx-auto mb-2 opacity-30" />
            <p className="text-[10px] leading-relaxed px-1">
              No revisions yet.
              <br />
              Click <strong>Stamp</strong> to save a snapshot.
            </p>
          </div>
        ) : (
          sorted.map((rev, idx) => (
            <RevisionCard
              key={rev.id}
              revision={rev}
              isViewing={viewingRevisionId === rev.id}
              isLatest={idx === 0}
              onView={() => setViewingRevision(rev.id)}
            />
          ))
        )}
      </div>

      {stampOpen && <RevisionStampModal onClose={() => setStampOpen(false)} />}
    </div>
  )
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

    for (let i = 0; i < sorted.length; i++) {
      const prev = i === 0 ? null : sorted[i - 1].snapshot
      const rev = sorted[i]
      result.push(...diffSnapshots(prev, rev.snapshot, rev.name, rev.date, rev.author))
    }

    const latest = sorted[sorted.length - 1]
    const currentSnap: RevisionSnapshot = {
      flowNodes: activeTab.flowNodes,
      flowEdges: activeTab.flowEdges,
      seqActors: activeTab.seqActors,
      seqMessages: activeTab.seqMessages,
    }
    result.push(
      ...diffSnapshots(latest.snapshot, currentSnap, 'Current (unsaved)', new Date().toISOString(), '—')
    )

    return result
  }, [revisions, activeTab])

  return (
    <div
      className="flex-shrink-0 bg-white border-t border-gray-200 flex flex-col min-h-0 overflow-hidden"
      style={
        collapsed
          ? undefined
          : { maxHeight: '42vh', height: '42vh' }
      }
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 transition-colors flex-shrink-0"
      >
        {collapsed ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
        <History size={13} className="text-gray-500" />
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Revision history</span>
        <span
          className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-semibold tabular-nums"
          title="Stamped snapshots"
        >
          {revisions.length}
        </span>
        {revisions.length > 0 && (
          <span
            className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-semibold tabular-nums"
            title="Tracked changes (including vs current)"
          >
            {allChanges.length} Δ
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="flex flex-1 min-h-0 divide-x divide-gray-200">
          <RevisionSnapshotsColumn />
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-white">
            {revisions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-center px-4 py-6 text-gray-400 text-xs">
                Stamp a revision to start history. After each new stamp, a detailed change log appears here.
              </div>
            ) : allChanges.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-center px-4 py-6 text-gray-400 text-xs">
                No changes between revisions.
              </div>
            ) : (
              <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-xs table-fixed">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                  <th className="px-3 py-2 w-[52px]">Rev</th>
                  <th className="px-2 py-2 w-[100px]">Author</th>
                  <th className="px-2 py-2 w-[88px]">Date</th>
                  <th className="px-2 py-2 w-[88px]">Change</th>
                  <th className="px-2 py-2 w-[72px]">Type</th>
                  <th className="px-2 py-2 w-[min(22%,180px)]">Element</th>
                  <th className="px-3 py-2">What changed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allChanges.map((c, i) => {
                  const style = CHANGE_STYLE[c.changeType]
                  const Icon = style.icon
                  const detailTitle = c.details.length > 80 ? c.details : undefined
                  return (
                    <tr key={i} className="hover:bg-gray-50/70 align-top">
                      <td className="px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap tabular-nums">{c.revisionName}</td>
                      <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap truncate" title={c.author}>{c.author}</td>
                      <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap text-[10px]">{formatDate(c.revisionDate)}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${style.bg} ${style.text}`}>
                          <Icon size={9} /> {style.label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${ELEMENT_STYLE[c.elementType]}`}>
                          {c.elementType}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-medium text-gray-800 break-words" title={c.elementName}>{c.elementName}</td>
                      <td className="px-3 py-1.5 text-gray-600 text-[11px] leading-snug break-words" title={detailTitle}>{c.details}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
