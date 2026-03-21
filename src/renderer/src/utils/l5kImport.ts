import { MarkerType } from '@xyflow/react'
import type { AOIFieldUsage, InterfaceField, UserInterface, PLCNode, PLCEdge } from '../types'
import { uid } from './uid'

function parseDescription(attrs: string): string | undefined {
  const m = attrs.match(/Description\s*:=\s*"([^"]*)"/i)
  return m?.[1]?.trim() || undefined
}

function parseDefaultValue(attrs: string): string | undefined {
  const m = attrs.match(/DefaultData\s*:=\s*([^,\)]+)/i)
  return m?.[1]?.trim() || undefined
}

function parseUsage(attrs: string): AOIFieldUsage | undefined {
  const m = attrs.match(/Usage\s*:=\s*(Input|Output|InOut|Local)/i)
  const usage = m?.[1]
  if (!usage) return undefined
  if (usage === 'Input' || usage === 'Output' || usage === 'InOut' || usage === 'Local') return usage
  return undefined
}

function parseUdtField(line: string): InterfaceField | null {
  const bitMatch = line.match(/^\s*BIT\s+([A-Za-z_][\w]*)\s+/i)
  if (bitMatch) {
    return {
      id: uid('field'),
      name: bitMatch[1],
      dataType: 'BOOL',
      description: parseDescription(line),
      includeInMatrix: false
    }
  }

  const m = line.match(/^\s*([A-Za-z_][\w]*)\s+([A-Za-z_][\w]*)\s*(\[[^\]]+\])?.*;/)
  if (!m) return null

  const baseType = m[1]
  const fieldName = m[2]
  const suffix = m[3] ?? ''

  return {
    id: uid('field'),
    name: fieldName,
    dataType: `${baseType}${suffix}`,
    description: parseDescription(line),
    includeInMatrix: false
  }
}

function parseAoiParameter(statement: string): InterfaceField | null {
  const clean = statement.replace(/\s+/g, ' ').trim()
  const m = clean.match(/^([A-Za-z_][\w]*)\s*:\s*([A-Za-z_][\w]*(?:\[[^\]]+\])?)\s*\((.*)\)\s*;$/)
  if (!m) return null

  const [, name, dataType, attrs] = m

  return {
    id: uid('field'),
    name,
    dataType,
    usage: parseUsage(attrs),
    description: parseDescription(attrs),
    defaultValue: parseDefaultValue(attrs),
    includeInMatrix: false
  }
}

export function parseL5KInterfaces(text: string): UserInterface[] {
  const lines = text.split(/\r?\n/)
  const parsed: UserInterface[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    const udtHeader = line.match(/^\s*DATATYPE\s+([A-Za-z_][\w]*)\s*(\((.*)\))?/i)
    if (udtHeader) {
      const name = udtHeader[1]
      const attrs = udtHeader[3] ?? ''
      const fields: InterfaceField[] = []
      i++
      while (i < lines.length && !/^\s*END_DATATYPE/i.test(lines[i])) {
        const field = parseUdtField(lines[i])
        if (field) fields.push(field)
        i++
      }
      parsed.push({
        id: uid('iface'),
        name,
        type: 'UDT',
        description: parseDescription(attrs),
        fields,
        createdAt: new Date().toISOString()
      })
      i++
      continue
    }

    const aoiHeader = line.match(/^\s*ADD_ON_INSTRUCTION_DEFINITION\s+([A-Za-z_][\w]*)\s*(\((.*)\))?/i)
    if (aoiHeader) {
      const name = aoiHeader[1]
      const attrs = aoiHeader[3] ?? ''
      const fields: InterfaceField[] = []
      i++

      while (i < lines.length && !/^\s*END_ADD_ON_INSTRUCTION_DEFINITION/i.test(lines[i])) {
        if (/^\s*PARAMETERS/i.test(lines[i])) {
          i++
          let stmt = ''
          while (i < lines.length && !/^\s*END_PARAMETERS/i.test(lines[i])) {
            const current = lines[i]
            if (!stmt && !/^\s*[A-Za-z_][\w]*\s*:/.test(current)) {
              i++
              continue
            }

            stmt += `${current} `
            if (current.includes(';')) {
              const field = parseAoiParameter(stmt)
              if (field) fields.push(field)
              stmt = ''
            }
            i++
          }
        }
        i++
      }

      parsed.push({
        id: uid('iface'),
        name,
        type: 'AOI',
        description: parseDescription(attrs),
        fields,
        createdAt: new Date().toISOString()
      })
      i++
      continue
    }

    i++
  }

  return parsed
}

// ── L5K Sequence Extraction (AOI_Sequence programs) ───────────────────────────

export interface L5KStepTransition {
  fromStep: number
  toStep: number
  condition?: string   // simplified, e.g. "Start_Req", "STS_PreCond"
  description?: string // from RC comment
}

export interface L5KSequence {
  programName: string
  rawProgramName: string     // original program name before display transformation
  sequenceTagName: string
  taskName?: string
  steps: Array<{
    stepNumber: number
    label?: string
    transitions: L5KStepTransition[]
  }>
}

function parseRcComment(line: string): string | undefined {
  const m = line.match(/^\s*RC:\s*"((?:[^"]|\$N)*)"/i)
  if (!m) return undefined
  return m[1].replace(/\$N/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractCondition(expr: string): string | undefined {
  // Simplify: extract XIC(...) or XIO(...) or key identifiers
  const xic = expr.match(/XIC\(([^)]+)\)/i)
  if (xic) return xic[1].split('.').pop() ?? xic[1]
  const xio = expr.match(/XIO\(([^)]+)\)/i)
  if (xio) return `NOT ${xio[1].split('.').pop() ?? xio[1]}`
  return undefined
}

export function parseL5KTasks(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/)
  const map = new Map<string, string>()
  let i = 0

  while (i < lines.length) {
    const taskMatch = lines[i].match(/^\s*TASK\s+([A-Za-z_][\w]*)\s*\(/i)
    if (taskMatch) {
      const taskName = taskMatch[1]
      i++
      while (i < lines.length && !/^\s*END_TASK/i.test(lines[i])) {
        const progRef = lines[i].match(/^\s*([A-Za-z_][\w]*)\s*;/)
        if (progRef) {
          map.set(progRef[1], taskName)
        }
        i++
      }
    }
    i++
  }

  return map
}

export function parseL5KSequences(text: string, taskMap?: Map<string, string>): L5KSequence[] {
  const lines = text.split(/\r?\n/)
  const result: L5KSequence[] = []
  let i = 0

  // Matches both Step_Current/Step_Next (newer) and Step_Index/Step_Buffer (older)
  const STEP_READ_FIELD  = '(?:Step_Current|Step_Index)'
  const STEP_WRITE_FIELD = '(?:Step_Next|Step_Buffer|Step_Index|Step_Current)'

  while (i < lines.length) {
    const progMatch = lines[i].match(/^\s*PROGRAM\s+([A-Za-z_][\w]*)\s*\(/i)
    if (!progMatch) {
      i++
      continue
    }

    const programName = progMatch[1]
    // Per-tag step map: tagName → (stepNumber → { label, transitions })
    const tagStepMaps = new Map<string, Map<number, { label?: string; transitions: L5KStepTransition[] }>>()
    // Track preferred routines per tag to allow overriding
    const tagHasPreferred = new Set<string>()
    i++

    while (i < lines.length && !/^\s*END_PROGRAM/i.test(lines[i])) {
      // ROUTINE block
      const routineMatch = lines[i].match(/^\s*ROUTINE\s+([A-Za-z_][\w]*)\s*$/i)
      if (routineMatch) {
        const routineName = routineMatch[1]
        const isPreferred = /_0100_2|Sequence_Steps/i.test(routineName)
        i++
        let lastRc = ''

        // Temporary per-tag maps for this routine
        const routineStepMaps = new Map<string, Map<number, { label?: string; transitions: L5KStepTransition[] }>>()

        while (i < lines.length && !/^\s*END_ROUTINE/i.test(lines[i])) {
          const line = lines[i]
          const rc = parseRcComment(line)
          if (rc) lastRc = rc

          if (/Step_Current|Step_Next|Step_Index|Step_Buffer/.test(line)) {
            // Generic regex: extract the tag name dynamically from the EQU pattern
            const eqRe = new RegExp(`EQU\\(([A-Za-z_]\\w*)\\.${STEP_READ_FIELD}\\s*,\\s*(\\d+)\\)`, 'i')
            const eqMatch = line.match(eqRe)
            if (eqMatch) {
              const tagName = eqMatch[1]
              const fromStep = parseInt(eqMatch[2], 10)

              if (!routineStepMaps.has(tagName)) {
                routineStepMaps.set(tagName, new Map())
              }
              const stepMap = routineStepMaps.get(tagName)!
              if (!stepMap.has(fromStep)) {
                stepMap.set(fromStep, { transitions: [] })
              }
              const entry = stepMap.get(fromStep)!
              if (lastRc) entry.label = lastRc

              const tagEsc = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const movRe = new RegExp(`MOV\\(\\s*(\\d+)\\s*,\\s*${tagEsc}\\.${STEP_WRITE_FIELD}\\s*\\)`, 'gi')
              const clrRe = new RegExp(`CLR\\(\\s*${tagEsc}\\.${STEP_WRITE_FIELD}\\s*\\)`, 'gi')

              const toSteps: number[] = []
              let m
              while ((m = movRe.exec(line)) !== null) {
                toSteps.push(parseInt(m[1], 10))
              }
              if (clrRe.test(line)) toSteps.push(0)

              for (const toStep of toSteps) {
                if (!entry.transitions.some((t) => t.toStep === toStep)) {
                  entry.transitions.push({
                    fromStep,
                    toStep,
                    condition: extractCondition(line),
                    description: lastRc || undefined
                  })
                }
              }
            }
          }
          i++
        }

        // Merge this routine's results into the program-level maps
        for (const [tagName, stepMap] of routineStepMaps) {
          if (stepMap.size === 0) continue

          const shouldReplace = isPreferred && !tagHasPreferred.has(tagName)
          if (shouldReplace) tagHasPreferred.add(tagName)

          if (!tagStepMaps.has(tagName) || shouldReplace) {
            tagStepMaps.set(tagName, stepMap)
          } else {
            // Merge: add any new steps (don't overwrite existing)
            const existing = tagStepMaps.get(tagName)!
            for (const [stepNum, data] of stepMap) {
              if (!existing.has(stepNum)) {
                existing.set(stepNum, data)
              }
            }
          }
        }
        continue
      }

      i++
    }

    // Create one L5KSequence per tag that has steps
    const tagsWithSteps = [...tagStepMaps.entries()].filter(([, sm]) => sm.size > 0)
    for (const [tagName, stepMap] of tagsWithSteps) {
      const steps = Array.from(stepMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([stepNumber, data]) => ({
          stepNumber,
          label: data.label,
          transitions: data.transitions
        }))

      const displayName = tagsWithSteps.length > 1 ? `${programName} — ${tagName}` : programName
      result.push({ programName: displayName, rawProgramName: programName, sequenceTagName: tagName, taskName: taskMap?.get(programName), steps })
    }
    i++
  }

  return result
}

// ── Convert L5KSequence to flowchart nodes and edges ───────────────────────────

let _nodeId = 1
function nodeId(prefix: string) { return `${prefix}_${Date.now()}_${_nodeId++}` }

const NODE_WIDTH = 180
const NODE_HEIGHT = 80
const V_GAP = 140
const START_X = 220

export function l5kSequenceToFlowchart(seq: L5KSequence): { nodes: PLCNode[]; edges: PLCEdge[] } {
  const nodes: PLCNode[] = []
  const edges: PLCEdge[] = []
  const stepIdMap = new Map<number, string>()

  const startId = nodeId('start')
  const endId = nodeId('end')

  nodes.push({
    id: startId,
    type: 'start',
    position: { x: START_X, y: 40 },
    data: { label: 'Start' }
  })

  const sortedSteps = [...seq.steps].sort((a, b) => a.stepNumber - b.stepNumber)
  sortedSteps.forEach((s, idx) => {
    const id = nodeId('step')
    stepIdMap.set(s.stepNumber, id)
    const label = s.label || `Step ${s.stepNumber}`
    nodes.push({
      id,
      type: 'step',
      position: { x: START_X, y: 120 + idx * V_GAP },
      data: {
        label,
        stepNumber: s.stepNumber,
        description: s.transitions.map((t) =>
          t.condition ? `→ ${t.toStep} when ${t.condition}` : `→ ${t.toStep}`
        ).join('; ')
      }
    })
  })

  // End node always present — transitions to step 0 route here instead
  nodes.push({
    id: endId,
    type: 'end',
    position: { x: START_X, y: 120 + sortedSteps.length * V_GAP },
    data: { label: 'End' }
  })

  const arrow = { type: MarkerType.ArrowClosed, width: 16, height: 16 }

  const firstStep = sortedSteps[0]?.stepNumber ?? 0
  const firstId = stepIdMap.get(firstStep)
  if (firstId) {
    edges.push({ id: nodeId('edge'), source: startId, target: firstId, type: 'editable', markerEnd: arrow })
  }

  // Build a step-number → array-index map for detecting backward jumps
  const stepIndex = new Map<number, number>()
  sortedSteps.forEach((s, idx) => stepIndex.set(s.stepNumber, idx))

  for (const s of sortedSteps) {
    const sourceId = stepIdMap.get(s.stepNumber)
    if (!sourceId) continue
    const srcIdx = stepIndex.get(s.stepNumber) ?? 0

    for (const t of s.transitions) {
      if (t.toStep === 0) {
        edges.push({
          id: nodeId('edge'),
          source: sourceId,
          target: endId,
          type: 'editable',
          label: t.condition,
          markerEnd: arrow,
          data: { condition: t.condition }
        })
      } else {
        const targetId = stepIdMap.get(t.toStep)
        if (!targetId) continue
        const tgtIdx = stepIndex.get(t.toStep) ?? 0
        const isBackward = tgtIdx <= srcIdx

        if (isBackward) {
          edges.push({
            id: nodeId('edge'),
            source: sourceId,
            sourceHandle: 'right-source',
            target: targetId,
            targetHandle: 'right-target',
            type: 'smoothstep',
            label: t.condition,
            markerEnd: arrow,
            animated: true,
            style: { strokeDasharray: '6 3' },
            data: { condition: t.condition }
          })
        } else {
          edges.push({
            id: nodeId('edge'),
            source: sourceId,
            target: targetId,
            type: 'editable',
            label: t.condition,
            markerEnd: arrow,
            data: { condition: t.condition }
          })
        }
      }
    }
  }

  return { nodes, edges }
}

// ── L5K Controller name ────────────────────────────────────────────────────────

export function parseL5KControllerName(text: string): string | undefined {
  const m = text.match(/^\s*CONTROLLER\s+([A-Za-z_][\w]*)\s*\(/im)
  return m?.[1]
}

// ── L5K Program Tag extraction ─────────────────────────────────────────────────

export interface L5KProgramTag {
  tagName: string
  dataType: string
  description?: string
  programName: string | null
}

export function parseL5KProgramTags(text: string): L5KProgramTag[] {
  const lines = text.split(/\r?\n/)
  const tags: L5KProgramTag[] = []
  let i = 0
  let currentProgram: string | null = null

  while (i < lines.length) {
    const line = lines[i]

    const progStart = line.match(/^\s*PROGRAM\s+([A-Za-z_][\w]*)\s*\(/i)
    if (progStart) {
      currentProgram = progStart[1]
      i++
      continue
    }

    if (/^\s*END_PROGRAM/i.test(line)) {
      currentProgram = null
      i++
      continue
    }

    if (/^\s*TAG\s*$/i.test(line)) {
      i++
      let stmt = ''
      while (i < lines.length && !/^\s*END_TAG/i.test(lines[i])) {
        stmt += lines[i] + ' '
        if (lines[i].includes(';')) {
          const tagMatch = stmt.match(
            /^\s*([A-Za-z_][\w]*)\s*:\s*([A-Za-z_][\w]*(?:\[[^\]]+\])?)/
          )
          if (tagMatch) {
            tags.push({
              tagName: tagMatch[1],
              dataType: tagMatch[2].replace(/\[.*\]$/, ''),
              description: parseDescription(stmt),
              programName: currentProgram
            })
          }
          stmt = ''
        }
        i++
      }
      i++
      continue
    }

    i++
  }

  return tags
}
