import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import { formatStepStateLabel } from '../utils/stepStateVisual'
import type { DiagramTab, UserInterface, InterfaceInstance, Plant, Area, Location, MatrixData, Task, Alarm, IORack, IOSlot, IOEntry, PLCNode, PLCNodeData } from '../types'
import {
  STEP_MATRIX_FROZEN,
  collectJumpsFrom,
  collectJumpsTo,
  stepTargetBrief,
  type JumpRef,
} from '../utils/stepMatrixJumps'

// ── Shared print table styles ─────────────────────────────────────────────────

const TH: React.CSSProperties = {
  border: '1px solid #bbb',
  padding: '4px 7px',
  textAlign: 'left',
  fontWeight: 'bold',
  backgroundColor: '#f0f0f0',
  fontSize: '9px',
}

const TD: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '3px 7px',
  verticalAlign: 'top',
  fontSize: '9px',
}

const SECTION_HEADING: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 'bold',
  borderBottom: '2px solid #333',
  paddingBottom: '6px',
  marginBottom: '12px',
  marginTop: '0',
}

const SUB_HEADING: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 'bold',
  marginBottom: '6px',
  marginTop: '16px',
  color: '#333',
}

import { locationBreadcrumb as locationBreadcrumbRaw } from '../utils/locationBreadcrumb'

function locationBreadcrumb(
  locationId: string | undefined,
  locations: Location[],
  areas: Area[],
  plants: Plant[]
): string {
  return locationBreadcrumbRaw(locationId, locations, areas, plants) || '—'
}

/** Flowchart tab paired with a sequence: explicit task link, same name, or auto-gen subtask. */
function resolveLinkedFlowchartTab(
  sequenceTab: DiagramTab,
  tasks: Task[],
  flowchartTabs: DiagramTab[]
): DiagramTab | undefined {
  const fromTask = tasks.find((t) => t.sequenceTabId === sequenceTab.id && t.flowchartTabId)
  if (fromTask?.flowchartTabId) {
    const fc = flowchartTabs.find((t) => t.id === fromTask.flowchartTabId)
    if (fc) return fc
  }
  const byName = flowchartTabs.find((t) => t.name === sequenceTab.name)
  if (byName) return byName
  for (const task of tasks) {
    for (const sub of task.subTasks) {
      if (sub.name === sequenceTab.name && sub.linkedTabId) {
        const fc = flowchartTabs.find((t) => t.id === sub.linkedTabId)
        if (fc) return fc
      }
    }
  }
  return undefined
}

// ── Report options types ──────────────────────────────────────────────────────

interface TabReportOptions {
  include: boolean
  showContent: boolean     // steps/nodes for flowchart; actors+messages for sequence
  showCauseEffect: boolean // flowchart only
  showRevisions: boolean
}

interface ReportOptions {
  coverPage: boolean
  tabOptions: Record<string, TabReportOptions>
  showInterfaceLibrary: boolean
  showInstances: boolean
  showLocations: boolean
  showIOList: boolean
  showTasks: boolean
  showAlarms: boolean
  showNotes: boolean
}

// ── Flowchart steps table (shared: flowchart pages + sequence “linked flowchart” block) ──

function FlowchartNodesStepsTable({ tab }: { tab: DiagramTab }) {
  const steps = tab.flowNodes
    .filter((n) => !['start', 'end'].includes(n.type ?? ''))
    .sort((a, b) => (a.data.stepNumber ?? 999) - (b.data.stepNumber ?? 999))
  if (steps.length === 0) return null
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={TH}>Step #</th>
          <th style={TH}>Type</th>
          <th style={TH}>Label</th>
          <th style={TH}>State</th>
          <th style={TH}>Tag / Routine</th>
          <th style={TH}>Description</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((node, i) => (
          <tr key={node.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
            <td style={TD}>{node.data.stepNumber ?? '—'}</td>
            <td style={TD}>{node.type}</td>
            <td style={{ ...TD, fontWeight: 'bold' }}>{node.data.label}</td>
            <td style={TD}>
              {node.data.packMLState
                ? formatStepStateLabel(node.data.packMLState, tab.flowStates)
                : '—'}
            </td>
            <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px' }}>
              {node.data.tagName ?? node.data.routineName ?? '—'}
            </td>
            <td style={TD}>{node.data.description || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Same columns as the Step Matrix pane (sequence diagram, steps-only). */
function PrintJumpBlock({ jumps, nodeMap }: { jumps: JumpRef[]; nodeMap: Map<string, PLCNode> }) {
  if (jumps.length === 0) return <span style={{ color: '#aaa' }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {jumps.map((j) => {
        const brief = stepTargetBrief(nodeMap, j.targetId)
        const targetLine = [brief.num, brief.name].filter(Boolean).join(' ')
        return (
          <div
            key={`${j.kind}-${j.id}`}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '3px',
              padding: '3px 5px',
              backgroundColor: '#fafafa',
              fontSize: '8px',
            }}
          >
            {j.reason.trim() ? (
              <div style={{ fontWeight: 'bold', marginBottom: '2px', color: '#374151' }}>{j.reason}</div>
            ) : null}
            <div style={{ fontFamily: 'monospace', color: '#1e3a8a' }}>{targetLine}</div>
            {j.description.trim() ? (
              <div style={{ marginTop: '2px', color: '#6b7280', fontStyle: 'italic' }}>{j.description}</div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function StepMatrixStyleFlowchartTable({ tab }: { tab: DiagramTab }) {
  const flowNodes = tab.flowNodes
  const nodeMap = new Map(flowNodes.map((n) => [n.id, n]))
  const stepNodes = flowNodes
    .filter((n) => n.type === 'step')
    .sort((a, b) => (a.data.stepNumber ?? 0) - (b.data.stepNumber ?? 0))
  const phases = tab.phases ?? []
  const flowStates = tab.flowStates ?? []

  if (stepNodes.length === 0) return null

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <thead>
        <tr>
          {STEP_MATRIX_FROZEN.map((c) => (
            <th key={c.label} style={{ ...TH, width: `${c.w}px` }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {stepNodes.map((node, i) => {
          const d = node.data as PLCNodeData
          const jumpsTo = collectJumpsTo(node.id, d, tab.flowEdges, nodeMap)
          const jumpsFrom = collectJumpsFrom(node.id, tab.flowEdges, stepNodes)
          const phaseLabel =
            phases.length === 0
              ? '—'
              : phases
                  .filter((p) => (d.phaseIds ?? []).includes(p.id))
                  .map((p) => p.name)
                  .join(', ') || '—'
          const pack =
            d.packMLState != null && d.packMLState !== ''
              ? formatStepStateLabel(d.packMLState, flowStates)
              : '—'
          const stepCol =
            d.stepNumber !== undefined ? `S${d.stepNumber}` : '—'

          return (
            <tr key={node.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px' }}>{stepCol}</td>
              <td style={{ ...TD, fontWeight: 'bold' }}>{(d.label ?? '').trim() || '—'}</td>
              <td style={TD}>{(d.description ?? '').trim() || '—'}</td>
              <td style={TD}>{pack}</td>
              <td style={TD}>{phaseLabel}</td>
              <td style={TD}>
                <PrintJumpBlock jumps={jumpsTo} nodeMap={nodeMap} />
              </td>
              <td style={TD}>
                <PrintJumpBlock jumps={jumpsFrom} nodeMap={nodeMap} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── FlowchartSection ──────────────────────────────────────────────────────────

function FlowchartSection({
  tab,
  opts,
  userInterfaces,
  interfaceInstances,
  matrixData,
}: {
  tab: DiagramTab
  opts: TabReportOptions
  userInterfaces: UserInterface[]
  interfaceInstances: InterfaceInstance[]
  matrixData: MatrixData
}) {
  const steps = tab.flowNodes
    .filter((n) => !['start', 'end'].includes(n.type ?? ''))
    .sort((a, b) => (a.data.stepNumber ?? 999) - (b.data.stepNumber ?? 999))

  return (
    <div style={{ pageBreakBefore: 'always', fontFamily: 'Arial, sans-serif' }}>
      {/* Tab header */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={SECTION_HEADING}>{tab.name}</h2>
        <div style={{ fontSize: '9px', color: '#666' }}>
          Flowchart — {tab.flowNodes.length} nodes · {tab.flowEdges.length} connections
        </div>
      </div>

      {/* Node list */}
      {opts.showContent && steps.length > 0 && (
        <div>
          <h3 style={SUB_HEADING}>Nodes &amp; Steps</h3>
          <FlowchartNodesStepsTable tab={tab} />
        </div>
      )}

      {/* Cause & Effect Matrix */}
      {opts.showCauseEffect && (() => {
        const matrixSteps = tab.flowNodes
          .filter((n) => ['step', 'process', 'output'].includes(n.type ?? ''))
          .sort((a, b) => (a.data.stepNumber ?? 0) - (b.data.stepNumber ?? 0))

        if (matrixSteps.length === 0) return null

        // Collect which instances + fields have any value in this tab
        interface Col {
          instanceId: string
          fieldId: string
          instanceLabel: string
          fieldName: string
          dataType: string
        }

        const usedInstIds = new Set<string>()
        matrixSteps.forEach((s) => {
          const sd = matrixData[s.id]
          if (sd) Object.keys(sd).forEach((iid) => usedInstIds.add(iid))
        })

        if (usedInstIds.size === 0) return null

        const cols: Col[] = []
        usedInstIds.forEach((iid) => {
          const inst = interfaceInstances.find((i) => i.id === iid)
          if (!inst) return
          const iface = userInterfaces.find((u) => u.id === inst.interfaceId)
          if (!iface) return
          const usedFields = new Set<string>()
          matrixSteps.forEach((s) => {
            const sd = matrixData[s.id]?.[iid]
            if (sd) Object.keys(sd).forEach((fid) => usedFields.add(fid))
          })
          iface.fields.forEach((f) => {
            if (usedFields.has(f.id)) {
              cols.push({
                instanceId: iid,
                fieldId: f.id,
                instanceLabel: inst.tagName || inst.name,
                fieldName: f.name,
                dataType: f.dataType,
              })
            }
          })
        })

        if (cols.length === 0) return null

        return (
          <div style={{ marginTop: '20px' }}>
            <h3 style={SUB_HEADING}>Cause &amp; Effect Matrix</h3>
            <div style={{ fontSize: '8px', color: '#888', marginBottom: '6px' }}>
              ✓ = ON · numeric = setpoint value · blank = no request
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '8px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e8eaf0' }}>
                    <th style={{ ...TH, minWidth: '120px' }}>Step</th>
                    <th style={{ ...TH, minWidth: '60px' }}>State</th>
                    {cols.map((col) => (
                      <th
                        key={`${col.instanceId}-${col.fieldId}`}
                        style={{
                          ...TH,
                          writingMode: 'vertical-rl',
                          transform: 'rotate(180deg)',
                          height: '70px',
                          verticalAlign: 'bottom',
                          padding: '4px 3px',
                          whiteSpace: 'nowrap',
                          minWidth: '22px',
                        }}
                        title={`${col.instanceLabel}.${col.fieldName} (${col.dataType})`}
                      >
                        {col.instanceLabel}.{col.fieldName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixSteps.map((step, i) => (
                    <tr key={step.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...TD, fontWeight: 'bold' }}>
                        {step.data.stepNumber ? `S${step.data.stepNumber} · ` : ''}
                        {step.data.label}
                      </td>
                      <td style={TD}>
                        {step.data.packMLState
                          ? formatStepStateLabel(step.data.packMLState, tab.flowStates)
                          : '—'}
                      </td>
                      {cols.map((col) => {
                        const val = matrixData[step.id]?.[col.instanceId]?.[col.fieldId]
                        let display = ''
                        if (val === true) display = '✓'
                        else if (typeof val === 'number') display = String(val)
                        return (
                          <td
                            key={`${col.instanceId}-${col.fieldId}`}
                            style={{ ...TD, textAlign: 'center', color: val === true ? '#166534' : '#1e40af' }}
                          >
                            {display}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Conditions */}
      {tab.conditions.length > 0 && (
        <ConditionsSubSection conditions={tab.conditions} />
      )}

      {/* Revisions */}
      {opts.showRevisions && tab.revisions.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={SUB_HEADING}>Revision History</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Version</th>
                <th style={TH}>Author</th>
                <th style={TH}>Date</th>
                <th style={TH}>Description</th>
              </tr>
            </thead>
            <tbody>
              {tab.revisions.map((rev, i) => (
                <tr key={rev.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...TD, fontWeight: 'bold' }}>{rev.name}</td>
                  <td style={TD}>{rev.author}</td>
                  <td style={TD}>{new Date(rev.date).toLocaleDateString()}</td>
                  <td style={TD}>{rev.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── ConditionsSubSection ─────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  pause: { bg: '#fef3c7', color: '#92400e' },
  stop:  { bg: '#fee2e2', color: '#991b1b' },
  abort: { bg: '#fce7f3', color: '#9d174d' },
}

function ConditionsSubSection({ conditions }: { conditions: import('../types').FlowCondition[] }) {
  return (
    <div style={{ marginTop: '20px' }}>
      <h3 style={SUB_HEADING}>Conditions</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: '30px' }}>#</th>
            <th style={TH}>Condition</th>
            <th style={{ ...TH, width: '70px', textAlign: 'center' }}>Action</th>
            <th style={TH}>Causes</th>
          </tr>
        </thead>
        <tbody>
          {conditions.map((cond, i) => {
            const ac = ACTION_COLORS[cond.action] ?? { bg: '#f3f4f6', color: '#374151' }
            return (
              <tr key={cond.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa', verticalAlign: 'top' }}>
                <td style={{ ...TD, textAlign: 'center', color: '#999' }}>{i + 1}</td>
                <td style={{ ...TD, fontWeight: 'bold' }}>{cond.description}</td>
                <td style={{ ...TD, textAlign: 'center' }}>
                  <span style={{
                    fontSize: '8px', padding: '1px 6px', borderRadius: '3px', fontWeight: 'bold',
                    textTransform: 'uppercase', backgroundColor: ac.bg, color: ac.color,
                  }}>
                    {cond.action}
                  </span>
                </td>
                <td style={TD}>
                  {cond.causes.length === 0
                    ? <span style={{ color: '#aaa', fontStyle: 'italic' }}>No causes</span>
                    : cond.causes.map((c, ci) => (
                        <div key={c.id} style={{ paddingBottom: ci < cond.causes.length - 1 ? '2px' : 0 }}>
                          • {c.description}
                        </div>
                      ))
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── SequenceSection ───────────────────────────────────────────────────────────

function SequenceSection({
  tab,
  opts,
  flowchartTabs,
  tasks,
}: {
  tab: DiagramTab
  opts: TabReportOptions
  flowchartTabs: DiagramTab[]
  tasks: Task[]
}) {
  const sortedMessages = [...tab.seqMessages].sort((a, b) => a.order - b.order)
  const linkedFlowchart = resolveLinkedFlowchartTab(tab, tasks, flowchartTabs)
  const linkedStepCount = linkedFlowchart
    ? linkedFlowchart.flowNodes.filter((n) => n.type === 'step').length
    : 0

  return (
    <div style={{ pageBreakBefore: 'always', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={SECTION_HEADING}>{tab.name}</h2>
        <div style={{ fontSize: '9px', color: '#666' }}>
          Sequence Diagram — {tab.seqActors.length} actors · {tab.seqMessages.length} messages
        </div>
      </div>

      {opts.showContent && (
        <>
          {tab.seqActors.length > 0 && (
            <div>
              <h3 style={SUB_HEADING}>Actors</h3>
              <table style={{ width: '40%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>Name</th>
                    <th style={TH}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {tab.seqActors.map((a, i) => (
                    <tr key={a.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...TD, fontWeight: 'bold' }}>{a.name}</td>
                      <td style={TD}>{a.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sortedMessages.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <h3 style={SUB_HEADING}>Messages</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, width: '30px' }}>#</th>
                    <th style={TH}>From</th>
                    <th style={TH}>To</th>
                    <th style={TH}>Label</th>
                    <th style={TH}>Type</th>
                    <th style={TH}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMessages.map((msg, i) => {
                    const from = tab.seqActors.find((a) => a.id === msg.fromId)
                    const to = tab.seqActors.find((a) => a.id === msg.toId)
                    return (
                      <tr key={msg.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...TD, textAlign: 'center', fontWeight: 'bold' }}>{msg.order}</td>
                        <td style={TD}>{from?.name ?? '—'}</td>
                        <td style={TD}>{to?.name ?? '—'}</td>
                        <td style={{ ...TD, fontWeight: 'bold' }}>{msg.label}</td>
                        <td style={TD}>{msg.type}</td>
                        <td style={TD}>{msg.note || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {linkedFlowchart && (
            <div style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
              <h3 style={SUB_HEADING}>Flowchart: {linkedFlowchart.name}</h3>
              <div style={{ fontSize: '9px', color: '#666', marginBottom: '8px' }}>
                Step matrix columns · {linkedStepCount} step{linkedStepCount !== 1 ? 's' : ''} ·{' '}
                {linkedFlowchart.flowEdges.length} connection{linkedFlowchart.flowEdges.length !== 1 ? 's' : ''}
              </div>
              {linkedStepCount > 0 ? (
                <StepMatrixStyleFlowchartTable tab={linkedFlowchart} />
              ) : (
                <div style={{ fontSize: '9px', color: '#888', fontStyle: 'italic' }}>
                  No steps in this flowchart (Step matrix lists step nodes only).
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Conditions */}
      {tab.conditions.length > 0 && (
        <ConditionsSubSection conditions={tab.conditions} />
      )}

      {opts.showRevisions && tab.revisions.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={SUB_HEADING}>Revision History</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Version</th>
                <th style={TH}>Author</th>
                <th style={TH}>Date</th>
                <th style={TH}>Description</th>
              </tr>
            </thead>
            <tbody>
              {tab.revisions.map((rev, i) => (
                <tr key={rev.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...TD, fontWeight: 'bold' }}>{rev.name}</td>
                  <td style={TD}>{rev.author}</td>
                  <td style={TD}>{new Date(rev.date).toLocaleDateString()}</td>
                  <td style={TD}>{rev.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── IOListSection ────────────────────────────────────────────────────────────

function IOListSection({
  ioRacks, ioSlots, ioEntries,
}: {
  ioRacks: IORack[]
  ioSlots: IOSlot[]
  ioEntries: IOEntry[]
}) {
  const totalEntries = ioEntries.length

  return (
    <div style={{ pageBreakBefore: 'always', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={SECTION_HEADING}>IO List</h2>
      <div style={{ fontSize: '9px', color: '#666', marginBottom: '16px' }}>
        {ioRacks.length} rack{ioRacks.length !== 1 ? 's' : ''} · {ioSlots.length} slot{ioSlots.length !== 1 ? 's' : ''} · {totalEntries} channel{totalEntries !== 1 ? 's' : ''}
      </div>

      {ioRacks.map((rack) => {
        const rackSlots = ioSlots.filter((s) => s.rackId === rack.id)
        return (
          <div key={rack.id} style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 'bold',
                backgroundColor: '#f0f0f0',
                padding: '6px 10px',
                borderLeft: '3px solid #4f46e5',
                marginBottom: '8px',
              }}
            >
              {rack.name}
              <span style={{ fontSize: '9px', fontWeight: 'normal', color: '#666', marginLeft: '8px' }}>
                {rackSlots.length} slot{rackSlots.length !== 1 ? 's' : ''}
              </span>
            </div>

            {rackSlots.map((slot) => {
              const entries = ioEntries.filter((e) => e.slotId === slot.id)
              if (entries.length === 0) return null
              return (
                <div key={slot.id} style={{ marginBottom: '12px', paddingLeft: '12px', pageBreakInside: 'avoid' }}>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', color: '#333' }}>
                    {slot.name}
                    {slot.catalogNumber && (
                      <span style={{ fontWeight: 'normal', color: '#888', marginLeft: '6px', fontFamily: 'monospace', fontSize: '8px' }}>
                        {slot.catalogNumber}
                      </span>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={TH}>Ch</th>
                        <th style={TH}>Tag</th>
                        <th style={TH}>Drawing</th>
                        <th style={TH}>Description</th>
                        <th style={TH}>Type</th>
                        <th style={TH}>Unit</th>
                        <th style={TH}>Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, i) => {
                        const desc = [entry.description1, entry.description2, entry.description3].filter(Boolean).join(' / ')
                        const isAnalog = ['AI', 'AO', 'RTD', 'TC'].includes(entry.ioType)
                        const range = isAnalog && (entry.minEUScale || entry.maxEUScale)
                          ? `${entry.minEUScale}–${entry.maxEUScale}`
                          : '—'
                        return (
                          <tr key={entry.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px', textAlign: 'center' }}>{entry.channel || '—'}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px', fontWeight: 'bold' }}>{entry.drawingTag || '—'}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px' }}>{entry.drawingReference || '—'}</td>
                            <td style={TD}>{desc || '—'}</td>
                            <td style={TD}>
                              {entry.ioType ? (
                                <span style={{
                                  fontSize: '8px', padding: '1px 4px', borderRadius: '3px', fontWeight: 'bold',
                                  backgroundColor: isAnalog ? '#dbeafe' : '#d1fae5',
                                  color: isAnalog ? '#1e40af' : '#065f46',
                                }}>{entry.ioType}</span>
                              ) : '—'}
                            </td>
                            <td style={{ ...TD, fontSize: '8px' }}>{entry.unitOfMeasure || '—'}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px' }}>{range}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── TasksSection ─────────────────────────────────────────────────────────────

function TasksSection({ tasks }: { tasks: Task[] }) {
  const totalSubTasks = tasks.reduce((sum, t) => sum + t.subTasks.length, 0)
  const completedSubTasks = tasks.reduce(
    (sum, t) => sum + t.subTasks.filter((s) => s.designed && s.programmed && s.tested).length,
    0
  )

  return (
    <div style={{ pageBreakBefore: 'always', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={SECTION_HEADING}>Tasks</h2>
      <div style={{ fontSize: '9px', color: '#666', marginBottom: '16px' }}>
        {tasks.length} task group{tasks.length !== 1 ? 's' : ''} · {totalSubTasks} test{totalSubTasks !== 1 ? 's' : ''} · {completedSubTasks} completed
      </div>

      {tasks.map((task) => (
        <div key={task.id} style={{ marginBottom: '16px', pageBreakInside: 'avoid' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 'bold',
              backgroundColor: '#f0f0f0',
              padding: '5px 10px',
              borderLeft: '3px solid #4f46e5',
              marginBottom: '4px',
            }}
          >
            {task.name}
            <span style={{ fontSize: '9px', fontWeight: 'normal', color: '#666', marginLeft: '8px' }}>
              {task.subTasks.length} test{task.subTasks.length !== 1 ? 's' : ''}
            </span>
          </div>

          {task.subTasks.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: '40%' }}>Test</th>
                  <th style={{ ...TH, width: '20%', textAlign: 'center' }}>Designed</th>
                  <th style={{ ...TH, width: '20%', textAlign: 'center' }}>Programmed</th>
                  <th style={{ ...TH, width: '20%', textAlign: 'center' }}>Tested</th>
                </tr>
              </thead>
              <tbody>
                {task.subTasks.map((st, i) => {
                  const done = st.designed && st.programmed && st.tested
                  return (
                    <tr key={st.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...TD, textDecoration: done ? 'line-through' : 'none', color: done ? '#999' : '#111' }}>
                        {st.name}
                      </td>
                      <td style={{ ...TD, textAlign: 'center', color: st.designed ? '#166534' : '#dc2626' }}>
                        {st.designed ? '✓' : '—'}
                      </td>
                      <td style={{ ...TD, textAlign: 'center', color: st.programmed ? '#166534' : '#dc2626' }}>
                        {st.programmed ? '✓' : '—'}
                      </td>
                      <td style={{ ...TD, textAlign: 'center', color: st.tested ? '#166534' : '#dc2626' }}>
                        {st.tested ? '✓' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}

// ── AlarmsSection ────────────────────────────────────────────────────────────

function formatAnalogAlarmSummary(alarm: Alarm): string {
  if (alarm.alarmType !== 'analog' || !alarm.analog) return ''
  const a = alarm.analog
  const parts: string[] = []
  const band = (label: string, b: { enabled: boolean; value: string; reset: string }) => {
    if (b.enabled) parts.push(`${label}=${b.value || '—'} (${b.reset})`)
  }
  band('LL', a.ll)
  band('L', a.l)
  band('H', a.h)
  band('HH', a.hh)
  const h = (label: string, x: { enabled: boolean; value: string }) => {
    if (x.enabled) parts.push(`${label}=${x.value || '—'}`)
  }
  h('LL-Hyst', a.llHyst)
  h('L-Hyst', a.lHyst)
  h('H-Hyst', a.hHyst)
  h('HH-Hyst', a.hhHyst)
  return parts.length ? parts.join(' · ') : 'No limits enabled'
}

function AlarmsSection({
  alarms,
  userInterfaces,
  interfaceInstances,
}: {
  alarms: Alarm[]
  userInterfaces: UserInterface[]
  interfaceInstances: InterfaceInstance[]
}) {
  const rows: { key: string; type: string; message: string; source: string; field: string; detail?: string }[] = []

  const onceOff = alarms.filter((a) => a.alarmType !== 'analog')
  const analogList = alarms.filter((a) => a.alarmType === 'analog')

  for (const alarm of onceOff) {
    rows.push({ key: `s-${alarm.id}`, type: 'Once-off', message: alarm.description, source: '—', field: '—' })
  }

  for (const alarm of analogList) {
    rows.push({
      key: `a-${alarm.id}`,
      type: 'Analog',
      message: alarm.description,
      source: '—',
      field: '—',
      detail: formatAnalogAlarmSummary(alarm),
    })
  }

  for (const iface of userInterfaces) {
    for (const field of iface.fields) {
      if (!field.isAlarm) continue
      const msg = field.alarmMessage || field.name
      const instances = interfaceInstances.filter((inst) => inst.interfaceId === iface.id)
      if (instances.length === 0) {
        rows.push({
          key: `f-${iface.id}-${field.id}-none`,
          type: 'Per-instance',
          message: msg,
          source: `${iface.type}: ${iface.name}`,
          field: field.name,
        })
      } else {
        for (const inst of instances) {
          rows.push({
            key: `f-${iface.id}-${field.id}-${inst.id}`,
            type: 'Per-instance',
            message: `${inst.name} ${msg}`,
            source: `${iface.type}: ${iface.name}`,
            field: field.name,
          })
        }
      }
    }
  }

  if (rows.length === 0) return null

  const perInstanceCount = rows.length - onceOff.length - analogList.length

  return (
    <div style={{ pageBreakBefore: 'always', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={SECTION_HEADING}>Alarms</h2>
      <div style={{ fontSize: '9px', color: '#666', marginBottom: '16px' }}>
        {rows.length} alarm{rows.length !== 1 ? 's' : ''} — {onceOff.length} once-off · {analogList.length} analog · {perInstanceCount} per-instance
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: '30px' }}>#</th>
            <th style={TH}>Type</th>
            <th style={TH}>Alarm Message</th>
            <th style={TH}>Source</th>
            <th style={TH}>Field</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.key} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ ...TD, textAlign: 'center', color: '#999' }}>{i + 1}</td>
              <td style={TD}>
                <span style={{
                  fontSize: '8px',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 'bold',
                  backgroundColor:
                    row.type === 'Once-off' ? '#fef3c7' : row.type === 'Analog' ? '#d1fae5' : '#e0e7ff',
                  color:
                    row.type === 'Once-off' ? '#92400e' : row.type === 'Analog' ? '#065f46' : '#3730a3',
                }}>
                  {row.type}
                </span>
              </td>
              <td style={{ ...TD, fontWeight: 'bold' }}>
                {row.message}
                {row.detail && (
                  <div style={{ fontSize: '8px', fontWeight: 'normal', color: '#666', marginTop: '4px' }}>
                    {row.detail}
                  </div>
                )}
              </td>
              <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px' }}>{row.source}</td>
              <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px' }}>{row.field}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Full report document (rendered into the print portal) ─────────────────────

function ReportDocument({ options }: { options: ReportOptions }) {
  const {
    projectName,
    tabs,
    plants,
    areas,
    locations,
    userInterfaces,
    interfaceInstances,
    matrixData,
    ioRacks,
    ioSlots,
    ioEntries,
    tasks,
    noteItems,
    alarms,
  } = useDiagramStore()

  const flowchartTabs = tabs.filter((t) => t.type === 'flowchart')
  const sequenceTabs = tabs.filter((t) => t.type === 'sequence')
  const now = new Date()

  const totalRevisions = tabs.reduce((sum, t) => sum + t.revisions.length, 0)

  return (
    <div
      style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '10px',
        color: '#111',
        margin: '0',
        padding: '0',
      }}
    >
      {/* ── Cover Page ── */}
      {options.coverPage && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            pageBreakAfter: 'always',
            padding: '40px',
            boxSizing: 'border-box',
          }}
        >
          {/* Logo bar */}
          <div
            style={{
              width: '60px',
              height: '60px',
              backgroundColor: '#4f46e5',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px',
              fontSize: '28px',
            }}
          >
            ⬡
          </div>

          <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>
            {projectName}
          </div>
          <div style={{ fontSize: '14px', color: '#555', marginBottom: '4px' }}>PLC Project Report</div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '40px' }}>
            Generated {now.toLocaleString()}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '20px',
              maxWidth: '400px',
              width: '100%',
              textAlign: 'center',
            }}
          >
            {[
              { label: 'Diagrams', value: tabs.length },
              { label: 'Instances', value: interfaceInstances.length },
              { label: 'Revisions', value: totalRevisions },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#fafafa',
                }}
              >
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#4f46e5' }}>{value}</div>
                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Contents summary */}
          <div
            style={{
              marginTop: '40px',
              textAlign: 'left',
              maxWidth: '320px',
              width: '100%',
              fontSize: '10px',
              color: '#555',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>Contents</div>
            {flowchartTabs
              .filter((t) => options.tabOptions[t.id]?.include)
              .map((t) => (
                <div key={t.id} style={{ padding: '2px 0' }}>
                  ▸ Flowchart: {t.name}
                </div>
              ))}
            {sequenceTabs
              .filter((t) => options.tabOptions[t.id]?.include)
              .map((t) => (
                <div key={t.id} style={{ padding: '2px 0' }}>
                  ▸ Sequence: {t.name}
                </div>
              ))}
            {options.showInterfaceLibrary && userInterfaces.length > 0 && (
              <div style={{ padding: '2px 0' }}>▸ Interface Library ({userInterfaces.length} types)</div>
            )}
            {options.showInstances && interfaceInstances.length > 0 && (
              <div style={{ padding: '2px 0' }}>▸ Instances ({interfaceInstances.length})</div>
            )}
            {options.showLocations && plants.length > 0 && (
              <div style={{ padding: '2px 0' }}>▸ Locations ({plants.length} plants)</div>
            )}
          </div>
        </div>
      )}

      {/* ── Flowchart tabs ── */}
      {flowchartTabs.map((tab) => {
        const opts = options.tabOptions[tab.id]
        if (!opts?.include) return null
        return (
          <FlowchartSection
            key={tab.id}
            tab={tab}
            opts={opts}
            userInterfaces={userInterfaces}
            interfaceInstances={interfaceInstances}
            matrixData={matrixData}
          />
        )
      })}

      {/* ── Sequence tabs ── */}
      {sequenceTabs.map((tab) => {
        const opts = options.tabOptions[tab.id]
        if (!opts?.include) return null
        return (
          <SequenceSection
            key={tab.id}
            tab={tab}
            opts={opts}
            flowchartTabs={flowchartTabs}
            tasks={tasks}
          />
        )
      })}

      {/* ── Interface Library ── */}
      {options.showInterfaceLibrary && userInterfaces.length > 0 && (
        <div style={{ pageBreakBefore: 'always', fontFamily: 'Arial, sans-serif' }}>
          <h2 style={SECTION_HEADING}>Interface Library</h2>
          <div style={{ fontSize: '9px', color: '#666', marginBottom: '16px' }}>
            AOI &amp; UDT Definitions — {userInterfaces.length} type{userInterfaces.length !== 1 ? 's' : ''}
          </div>

          {userInterfaces.map((iface) => (
            <div key={iface.id} style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '6px',
                  paddingBottom: '4px',
                  borderBottom: '1px solid #ddd',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{iface.name}</span>
                <span
                  style={{
                    fontSize: '9px',
                    backgroundColor: iface.type === 'AOI' ? '#e0e7ff' : '#d1fae5',
                    color: iface.type === 'AOI' ? '#3730a3' : '#065f46',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    fontWeight: 'bold',
                  }}
                >
                  {iface.type}
                </span>
                {iface.description && (
                  <span style={{ fontSize: '9px', color: '#666' }}>{iface.description}</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#999' }}>
                  {iface.fields.length} field{iface.fields.length !== 1 ? 's' : ''}
                </span>
              </div>

              {iface.fields.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={TH}>Field Name</th>
                      <th style={TH}>Data Type</th>
                      {iface.type === 'AOI' && <th style={TH}>Usage</th>}
                      <th style={TH}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iface.fields.map((f, i) => (
                      <tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px', fontWeight: 'bold' }}>
                          {f.name}
                        </td>
                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px' }}>{f.dataType}</td>
                        {iface.type === 'AOI' && (
                          <td style={TD}>{f.usage ?? '—'}</td>
                        )}
                        <td style={TD}>{f.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: '9px', color: '#999', fontStyle: 'italic', paddingLeft: '8px' }}>
                  No fields defined
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Instances ── */}
      {options.showInstances && interfaceInstances.length > 0 && (
        <div style={{ pageBreakBefore: 'always', fontFamily: 'Arial, sans-serif' }}>
          <h2 style={SECTION_HEADING}>Instances</h2>
          <div style={{ fontSize: '9px', color: '#666', marginBottom: '12px' }}>
            {interfaceInstances.length} instance{interfaceInstances.length !== 1 ? 's' : ''}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Tag Name</th>
                <th style={TH}>Display Name</th>
                <th style={TH}>Interface</th>
                <th style={TH}>Type</th>
                <th style={TH}>Location</th>
                <th style={TH}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[...interfaceInstances]
                .sort((a, b) => a.tagName.localeCompare(b.tagName))
                .map((inst, i) => {
                  const iface = userInterfaces.find((u) => u.id === inst.interfaceId)
                  const crumb = locationBreadcrumb(inst.locationId, locations, areas, plants)
                  return (
                    <tr key={inst.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px', fontWeight: 'bold' }}>
                        {inst.tagName}
                      </td>
                      <td style={TD}>{inst.name}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: '8px' }}>
                        {iface?.name ?? '—'}
                      </td>
                      <td style={TD}>
                        {iface ? (
                          <span
                            style={{
                              backgroundColor: iface.type === 'AOI' ? '#e0e7ff' : '#d1fae5',
                              color: iface.type === 'AOI' ? '#3730a3' : '#065f46',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontSize: '8px',
                              fontWeight: 'bold',
                            }}
                          >
                            {iface.type}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ ...TD, fontSize: '8px' }}>{crumb}</td>
                      <td style={TD}>{inst.description || '—'}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Locations ── */}
      {options.showLocations && plants.length > 0 && (
        <div style={{ pageBreakBefore: 'always', fontFamily: 'Arial, sans-serif' }}>
          <h2 style={SECTION_HEADING}>Locations</h2>
          <div style={{ fontSize: '9px', color: '#666', marginBottom: '16px' }}>
            Plant › Area › Location Hierarchy — {plants.length} plant{plants.length !== 1 ? 's' : ''}
          </div>

          {plants.map((plant) => {
            const plantAreas = areas.filter((a) => a.plantId === plant.id)
            return (
              <div
                key={plant.id}
                style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 'bold',
                    backgroundColor: '#f0f0f0',
                    padding: '6px 10px',
                    borderLeft: '3px solid #4f46e5',
                    marginBottom: '8px',
                  }}
                >
                  🏭 {plant.name}
                  <span style={{ fontSize: '9px', fontWeight: 'normal', color: '#666', marginLeft: '8px' }}>
                    {plantAreas.length} area{plantAreas.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {plantAreas.length === 0 ? (
                  <div style={{ fontSize: '9px', color: '#aaa', paddingLeft: '16px', fontStyle: 'italic' }}>
                    No areas defined
                  </div>
                ) : (
                  plantAreas.map((area) => {
                    const areaLocs = locations.filter((l) => l.areaId === area.id)
                    return (
                      <div key={area.id} style={{ paddingLeft: '16px', marginBottom: '10px' }}>
                        <div
                          style={{
                            fontSize: '10px',
                            fontWeight: 'bold',
                            marginBottom: '4px',
                            padding: '3px 8px',
                            backgroundColor: '#f8f8f8',
                            borderLeft: '2px solid #a5b4fc',
                          }}
                        >
                          📁 {area.name}
                          <span style={{ fontSize: '9px', fontWeight: 'normal', color: '#888', marginLeft: '6px' }}>
                            {areaLocs.length} location{areaLocs.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {areaLocs.length === 0 ? (
                          <div style={{ fontSize: '9px', color: '#aaa', paddingLeft: '16px', fontStyle: 'italic' }}>
                            No locations defined
                          </div>
                        ) : (
                          <div style={{ paddingLeft: '16px' }}>
                            {areaLocs.map((loc) => {
                              const locInsts = interfaceInstances.filter((i) => i.locationId === loc.id)
                              return (
                                <div
                                  key={loc.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: '8px',
                                    padding: '2px 0',
                                    borderBottom: '1px solid #f0f0f0',
                                    fontSize: '9px',
                                  }}
                                >
                                  <span>📍 <strong>{loc.name}</strong></span>
                                  {locInsts.length > 0 && (
                                    <span style={{ color: '#666', fontFamily: 'monospace', fontSize: '8px' }}>
                                      {locInsts.map((inst) => inst.tagName).join(', ')}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── IO List ── */}
      {options.showIOList && ioEntries.length > 0 && (
        <IOListSection ioRacks={ioRacks} ioSlots={ioSlots} ioEntries={ioEntries} />
      )}

      {/* ── Tasks ── */}
      {options.showTasks && tasks.length > 0 && (
        <TasksSection tasks={tasks} />
      )}

      {/* ── Alarms ── */}
      {options.showAlarms && (
        <AlarmsSection alarms={alarms} userInterfaces={userInterfaces} interfaceInstances={interfaceInstances} />
      )}

      {/* ── Notes ── */}
      {options.showNotes && noteItems.filter((n) => n.type === 'note' && n.content?.trim()).length > 0 && (
        <div style={{ pageBreakBefore: 'always', fontFamily: 'Arial, sans-serif' }}>
          <h2 style={SECTION_HEADING}>Notes</h2>
          {noteItems.filter((n) => n.type === 'note' && n.content?.trim()).map((n) => (
            <div key={n.id} style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 700, margin: '8px 0 4px' }}>{n.name}</h3>
              <div
                style={{ fontSize: '10px', lineHeight: '1.6' }}
                dangerouslySetInnerHTML={{ __html: n.content! }}
              />
            </div>
          ))}
          {noteItems.filter((n) => n.type === 'link' && n.url?.trim()).length > 0 && (
            <>
              <h3 style={{ fontSize: '11px', fontWeight: 700, margin: '12px 0 4px' }}>Reference Links</h3>
              <ul style={{ fontSize: '10px', lineHeight: '1.6', paddingLeft: '16px' }}>
                {noteItems.filter((n) => n.type === 'link' && n.url?.trim()).map((n) => (
                  <li key={n.id}>{n.name} — {n.url}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

export function PrintReportModal({ onClose }: Props) {
  const { projectName, tabs, userInterfaces, interfaceInstances, plants, ioRacks, ioSlots, ioEntries, tasks, alarms, noteItems } = useDiagramStore()

  const flowchartTabs = tabs.filter((t) => t.type === 'flowchart')
  const sequenceTabs = tabs.filter((t) => t.type === 'sequence')

  const [options, setOptions] = useState<ReportOptions>(() => {
    const tabOptions: Record<string, TabReportOptions> = {}
    tabs.forEach((t) => {
      tabOptions[t.id] = {
        include: true,
        showContent: true,
        showCauseEffect: t.type === 'flowchart',
        showRevisions: true,
      }
    })
    return {
      coverPage: true,
      tabOptions,
      showInterfaceLibrary: true,
      showInstances: true,
      showLocations: true,
      showIOList: true,
      showTasks: true,
      showAlarms: true,
      showNotes: true,
    }
  })

  function setTabOpt(tabId: string, key: keyof TabReportOptions, value: boolean) {
    setOptions((prev) => ({
      ...prev,
      tabOptions: {
        ...prev.tabOptions,
        [tabId]: { ...prev.tabOptions[tabId], [key]: value },
      },
    }))
  }

  async function handlePrint() {
    const reportEl = document.getElementById('__plc_report__')
    if (!reportEl) return

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${projectName} — Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; }
    @page { margin: 15mm; size: A4 portrait; }
  </style>
</head>
<body>
  ${reportEl.innerHTML}
</body>
</html>`

    const result = await window.api.printReport(html, `${projectName} Report.pdf`)
    if (result.success) onClose()
  }

  // Render the report off-screen (no display:none, no overflow:hidden — both
  // suppress page-break computation in Chromium's layout engine).
  const reportPortal = createPortal(
    <div
      id="__plc_report__"
      style={{
        position: 'fixed',
        top: 0,
        left: '-9999px',
        width: '210mm',
        pointerEvents: 'none',
      }}
    >
      <ReportDocument options={options} />
    </div>,
    document.body
  )

  return (
    <>
      {reportPortal}

      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-lg"
          style={{ maxHeight: '88vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Printer size={18} className="text-indigo-600" />
              <h2 className="text-base font-semibold text-gray-900">Print Project Report</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

            {/* Cover Page */}
            <CheckRow
              checked={options.coverPage}
              onChange={(v) => setOptions((p) => ({ ...p, coverPage: v }))}
              label="Cover Page"
              hint="Project title, summary statistics and contents"
            />

            {/* Flowchart Tabs */}
            {flowchartTabs.length > 0 && (
              <OptionGroup label="Flowchart Diagrams">
                {flowchartTabs.map((tab) => {
                  const opts = options.tabOptions[tab.id]
                  if (!opts) return null
                  return (
                    <TabCard
                      key={tab.id}
                      name={tab.name}
                      badge={`${tab.flowNodes.length} nodes`}
                      checked={opts.include}
                      onToggle={(v) => setTabOpt(tab.id, 'include', v)}
                    >
                      <SubCheck
                        checked={opts.showContent}
                        onChange={(v) => setTabOpt(tab.id, 'showContent', v)}
                        label="Node / Step list"
                      />
                      <SubCheck
                        checked={opts.showCauseEffect}
                        onChange={(v) => setTabOpt(tab.id, 'showCauseEffect', v)}
                        label="Cause & Effect Matrix"
                      />
                      <SubCheck
                        checked={opts.showRevisions}
                        onChange={(v) => setTabOpt(tab.id, 'showRevisions', v)}
                        label={`Revision history${tab.revisions.length > 0 ? ` (${tab.revisions.length})` : ' (none saved)'}`}
                      />
                    </TabCard>
                  )
                })}
              </OptionGroup>
            )}

            {/* Sequence Tabs */}
            {sequenceTabs.length > 0 && (
              <OptionGroup label="Sequence Diagrams">
                {sequenceTabs.map((tab) => {
                  const opts = options.tabOptions[tab.id]
                  if (!opts) return null
                  return (
                    <TabCard
                      key={tab.id}
                      name={tab.name}
                      badge={`${tab.seqMessages.length} messages`}
                      checked={opts.include}
                      onToggle={(v) => setTabOpt(tab.id, 'include', v)}
                    >
                      <SubCheck
                        checked={opts.showContent}
                        onChange={(v) => setTabOpt(tab.id, 'showContent', v)}
                        label="Actors, messages & linked flowchart (Step matrix columns)"
                      />
                      <SubCheck
                        checked={opts.showRevisions}
                        onChange={(v) => setTabOpt(tab.id, 'showRevisions', v)}
                        label={`Revision history${tab.revisions.length > 0 ? ` (${tab.revisions.length})` : ' (none saved)'}`}
                      />
                    </TabCard>
                  )
                })}
              </OptionGroup>
            )}

            {/* Project-level data */}
            <OptionGroup label="Project Data">
              <CheckRow
                checked={options.showInterfaceLibrary}
                onChange={(v) => setOptions((p) => ({ ...p, showInterfaceLibrary: v }))}
                label="Interface Library"
                hint={`${userInterfaces.length} AOI/UDT definitions with field tables`}
              />
              <CheckRow
                checked={options.showInstances}
                onChange={(v) => setOptions((p) => ({ ...p, showInstances: v }))}
                label="Instances"
                hint={`${interfaceInstances.length} instances with location breadcrumbs`}
              />
              <CheckRow
                checked={options.showLocations}
                onChange={(v) => setOptions((p) => ({ ...p, showLocations: v }))}
                label="Locations"
                hint={`${plants.length} plant${plants.length !== 1 ? 's' : ''} — Plant › Area › Location hierarchy`}
              />
              <CheckRow
                checked={options.showIOList}
                onChange={(v) => setOptions((p) => ({ ...p, showIOList: v }))}
                label="IO List"
                hint={`${ioEntries.length} channel${ioEntries.length !== 1 ? 's' : ''} across ${ioRacks.length} rack${ioRacks.length !== 1 ? 's' : ''} and ${ioSlots.length} slot${ioSlots.length !== 1 ? 's' : ''}`}
              />
              <CheckRow
                checked={options.showTasks}
                onChange={(v) => setOptions((p) => ({ ...p, showTasks: v }))}
                label="Tasks & Tests"
                hint={`${tasks.length} task group${tasks.length !== 1 ? 's' : ''} with designed / programmed / tested status`}
              />
              <CheckRow
                checked={options.showAlarms}
                onChange={(v) => setOptions((p) => ({ ...p, showAlarms: v }))}
                label="Alarms"
                hint={`${alarms.filter((a) => a.alarmType !== 'analog').length} once-off · ${alarms.filter((a) => a.alarmType === 'analog').length} analog + per-instance from interfaces`}
              />
              <CheckRow
                checked={options.showNotes}
                onChange={(v) => setOptions((p) => ({ ...p, showNotes: v }))}
                label="Notes"
                hint={noteItems.length > 0 ? `${noteItems.length} note item(s) in project` : 'No notes yet'}
              />
            </OptionGroup>

            <p className="text-xs text-gray-400 pb-1">
              Tip: for wide Cause &amp; Effect matrices, select <em>Landscape</em> orientation in the print dialog.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <Printer size={15} />
              Print Report
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Small reusable pieces ─────────────────────────────────────────────────────

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{label}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded text-indigo-600 flex-shrink-0"
      />
      <div>
        <div className="text-sm text-gray-800 font-medium leading-tight">{label}</div>
        {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
      </div>
    </label>
  )
}

function SubCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded text-indigo-600 flex-shrink-0"
      />
      <span className="text-xs text-gray-600">{label}</span>
    </label>
  )
}

function TabCard({
  name,
  badge,
  checked,
  onToggle,
  children,
}: {
  name: string
  badge: string
  checked: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <label className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="rounded text-indigo-600 flex-shrink-0"
        />
        <span className="text-sm font-medium text-gray-800 flex-1 truncate">{name}</span>
        <span className="text-[10px] text-gray-400 flex-shrink-0">{badge}</span>
      </label>
      {checked && (
        <div className="px-4 py-2.5 space-y-1.5 border-t border-gray-100 bg-white">
          {children}
        </div>
      )}
    </div>
  )
}
