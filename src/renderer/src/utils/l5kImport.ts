import { MarkerType } from '@xyflow/react'
import type { AOIFieldUsage, InterfaceField, UserInterface, PLCNode, PLCEdge, IOType, IORack, IOSlot, IOEntry } from '../types'
import { uid } from './uid'

function parseDescription(attrs: string): string | undefined {
  const m = attrs.match(/Description\s*:=\s*"([^"]*)"/i)
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

// ── L5K IO Module extraction ──────────────────────────────────────────────────

/** One IO "block" within a module — a module can produce multiple blocks
 *  (e.g. a CompactLogix controller with embedded DI + DO + AI). */
interface IOBlock {
  ioType: IOType
  channelCount: number
}

// ── Catalog → IO type mapping (dedicated IO modules) ─────────────────────────

const CATALOG_IO_MAP: Array<{ pattern: RegExp; type: IOType }> = [
  // 1756 ControlLogix
  { pattern: /^1756-I[ABCGHKMNR]/i, type: 'DI' },
  { pattern: /^1756-O[ABCGHWNKXV]/i, type: 'DO' },
  { pattern: /^1756-IF/i,  type: 'AI' },
  { pattern: /^1756-OF/i,  type: 'AO' },
  { pattern: /^1756-IT/i,  type: 'TC' },
  { pattern: /^1756-IR/i,  type: 'RTD' },
  // 1769 CompactLogix expansion
  { pattern: /^1769-I[QAMFK]/i, type: 'DI' },
  { pattern: /^1769-O[BWQAV]/i, type: 'DO' },
  { pattern: /^1769-IF/i,  type: 'AI' },
  { pattern: /^1769-OF/i,  type: 'AO' },
  { pattern: /^1769-IT/i,  type: 'TC' },
  { pattern: /^1769-IR/i,  type: 'RTD' },
  // 1734 POINT I/O
  { pattern: /^1734-[A-Z]*I[BEPV]/i, type: 'DI' },
  { pattern: /^1734-[A-Z]*O[BWV]/i,  type: 'DO' },
  { pattern: /^1734-IE/i,  type: 'AI' },
  { pattern: /^1734-OE/i,  type: 'AO' },
  { pattern: /^1734-IT/i,  type: 'TC' },
  { pattern: /^1734-IR/i,  type: 'RTD' },
  // 1794 FLEX I/O
  { pattern: /^1794-I[BREFV]/i,  type: 'DI' },
  { pattern: /^1794-O[BAWEV]/i,  type: 'DO' },
  { pattern: /^1794-IF/i,  type: 'AI' },
  { pattern: /^1794-OF/i,  type: 'AO' },
  { pattern: /^1794-IT/i,  type: 'TC' },
  { pattern: /^1794-IR/i,  type: 'RTD' },
  // 5069 Compact 5000 I/O
  { pattern: /^5069-I[BYWK]/i,  type: 'DI' },
  { pattern: /^5069-O[BYWXK]/i, type: 'DO' },
  { pattern: /^5069-IF/i,  type: 'AI' },
  { pattern: /^5069-OF/i,  type: 'AO' },
  { pattern: /^5069-IT/i,  type: 'TC' },
  { pattern: /^5069-IR/i,  type: 'RTD' },
]

/** Rockwell ProductType values that indicate IO modules */
const IO_PRODUCT_TYPES: Record<number, IOType> = {
  7: 'DI',   // Generic Digital I/O
  10: 'AI',  // Analog I/O
}

function catalogToIOType(catalog: string): IOType | null {
  const clean = catalog.replace(/^"|"$/g, '').trim()
  for (const entry of CATALOG_IO_MAP) {
    if (entry.pattern.test(clean)) return entry.type
  }
  return null
}

function catalogToChannelCount(catalog: string, ioType: IOType): number {
  const clean = catalog.replace(/^"|"$/g, '').trim()
  // Extract trailing digits from the model portion: "1756-IB16" → 16, "1756-IF8" → 8
  const m = clean.match(/\d{4}-[A-Z]{2,6}(\d+)/i)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n > 0 && n <= 128) return n
  }
  if (ioType === 'DI' || ioType === 'DO') return 16
  if (ioType === 'AI' || ioType === 'AO') return 8
  if (ioType === 'TC' || ioType === 'RTD') return 8
  return 0
}

// ── Embedded IO detection for CompactLogix / Compact GuardLogix ──────────────

/** Decode the embedded IO suffix on CompactLogix catalogs.
 *  E.g. "1769-L33ER"       → relay DO block
 *       "1769-L24ER-BB1B"  → DI + relay DO blocks
 *       "1769-L24ER-QB1B"  → DI + DO + AI + AO blocks
 *       "5069-L340ERM"     → embedded IO
 *  Returns IO blocks that the controller's onboard IO provides. */
function detectEmbeddedIO(catalog: string): IOBlock[] {
  const clean = catalog.replace(/^"|"$/g, '').trim().toUpperCase()

  // Must be a CompactLogix / Compact 5000 controller catalog
  if (!/^(1769-L|5069-L|5380-L)/i.test(clean)) return []

  const blocks: IOBlock[] = []

  // Suffix after the dash-separated controller model, e.g. "-BB1B", "-QB1B", "-QBFC1B"
  const suffixMatch = clean.match(/-L\d+E\w*[-]?(.*)$/)
  const suffix = suffixMatch?.[1] ?? ''

  // "ER" or "ERM" in the main part = embedded relay outputs (typically 16 DO)
  if (/ER/.test(clean)) {
    blocks.push({ ioType: 'DO', channelCount: 16 })
  }

  if (suffix) {
    // B = DC I/O block (16 DI + 16 DO)
    // BB = two blocks → typically 16 DI + 16 DO (already counted DO if ER)
    // QB = B + analog block → 16 DI + 16 DO + analog
    // QBFC = QB + fast counter / analog out
    if (/B/.test(suffix)) {
      blocks.push({ ioType: 'DI', channelCount: 16 })
      // Only add DO if we didn't already from ER
      if (!blocks.some((b) => b.ioType === 'DO')) {
        blocks.push({ ioType: 'DO', channelCount: 16 })
      }
    }
    if (/Q/.test(suffix)) {
      blocks.push({ ioType: 'AI', channelCount: 4 })
    }
    if (/FC/.test(suffix)) {
      blocks.push({ ioType: 'AO', channelCount: 2 })
    }
  }

  // If just "ER" with no suffix blocks, controller still has embedded relay outputs
  // but no DI unless suffix says so. Still include what we found.
  return blocks
}

// ── Combo module splitting ───────────────────────────────────────────────────

/** Handle combo catalog numbers like "1769-IQ6XOW4" → 6 DI + 4 DO */
function splitComboModule(catalog: string): IOBlock[] | null {
  const clean = catalog.replace(/^"|"$/g, '').trim().toUpperCase()
  // Pattern: 1769-IQ6XOW4  (DI count + X + DO count)
  const combo = clean.match(/^\d{4}-I[A-Z]*(\d+)XO[A-Z]*(\d+)/)
  if (combo) {
    return [
      { ioType: 'DI', channelCount: parseInt(combo[1], 10) },
      { ioType: 'DO', channelCount: parseInt(combo[2], 10) },
    ]
  }
  return null
}

/**
 * Parse MODULE blocks from an L5K file and return IO racks + slots + entries.
 * Handles ControlLogix (1756), CompactLogix (1769), POINT I/O (1734),
 * FLEX I/O (1794), Compact 5000 (5069), and remote adapter-based chassis.
 */
export function parseL5KIOModules(text: string): { racks: IORack[]; slots: IOSlot[]; entries: IOEntry[] } {
  const lines = text.split(/\r?\n/)

  interface RawModule {
    name: string; description: string; parent: string; catalogNumber: string
    productType: number | null; slot: number | null; chassisSize: number | null
    hasInputTag: boolean; hasOutputTag: boolean
  }

  const rawModules: RawModule[] = []
  let i = 0

  while (i < lines.length) {
    // Match module names including $-prefixed (e.g. $NoName)
    const modMatch = lines[i].match(/^\s*MODULE\s+([\$A-Za-z_][\w$]*)\s*\(/i)
    if (!modMatch) { i++; continue }

    const modName = modMatch[1]
    // Collect full header up to CONFIG/CONNECTION/END_MODULE or next indented data
    let header = lines[i]
    i++
    while (i < lines.length && !/^\s*(CONFIG|CONNECTION|END_MODULE)\b/i.test(lines[i]) &&
           !/^\s*(ConfigData|ConfigScript|InputAliasComments|ExtendedProp)\b/i.test(lines[i])) {
      header += ' ' + lines[i]
      i++
    }

    // Handle quoted Parent values: Parent := "REM01" or unquoted Parent := Local
    const parentMatch = header.match(/Parent\s*:=\s*"([^"]+)"/i) ?? header.match(/Parent\s*:=\s*([A-Za-z_][\w]*)/i)
    const catalogMatch = header.match(/CatalogNumber\s*:=\s*"([^"]*)"/i)
    const ptMatch = header.match(/ProductType\s*:=\s*(\d+)/i)
    const slotMatch = header.match(/(?:^|[\s,])Slot\s*:=\s*(\d+)/i)
    const chassisMatch = header.match(/ChassisSize\s*:=\s*(\d+)/i)
    const descMatch = header.match(/Description\s*:=\s*"([^"]*)"/i)

    const parent = parentMatch?.[1] ?? ''
    const catalog = catalogMatch?.[1] ?? ''
    const productType = ptMatch ? parseInt(ptMatch[1], 10) : null
    let slot: number | null = slotMatch ? parseInt(slotMatch[1], 10) : null
    const chassisSize = chassisMatch ? parseInt(chassisMatch[1], 10) : null
    const description = descMatch?.[1] ?? ''

    let hasInputTag = false
    let hasOutputTag = false

    while (i < lines.length && !/^\s*END_MODULE/i.test(lines[i])) {
      const line = lines[i]
      const tagMatch = line.match(/(?:InputTag|ConfigTag|OutputTag)\s*:=\s*(\S+)/i)
      if (tagMatch) {
        if (/InputTag/i.test(line)) hasInputTag = true
        if (/OutputTag/i.test(line)) hasOutputTag = true
        // Fallback: extract slot from connection tag path if header didn't have it
        if (slot === null) {
          const pathSlot = tagMatch[1].match(/:(\d+):/)
          if (pathSlot) slot = parseInt(pathSlot[1], 10)
        }
      }
      i++
    }
    i++ // skip END_MODULE

    rawModules.push({
      name: modName, description, parent, catalogNumber: catalog,
      productType, slot, chassisSize, hasInputTag, hasOutputTag
    })
  }

  // ── Build a lookup of all modules by name (for rack naming) ────────────────

  const moduleByName = new Map<string, RawModule>()
  for (const mod of rawModules) moduleByName.set(mod.name, mod)

  // ── Resolve IO blocks per module ───────────────────────────────────────────

  interface ResolvedModule {
    name: string; parent: string; catalogNumber: string
    slot: number | null; blocks: IOBlock[]
  }
  const resolved: ResolvedModule[] = []

  for (const mod of rawModules) {
    const catalog = mod.catalogNumber

    // 1) Dedicated IO module — catalog matches a known IO pattern
    const directType = catalogToIOType(catalog)
    if (directType) {
      resolved.push({
        name: mod.name, parent: mod.parent, catalogNumber: catalog,
        slot: mod.slot,
        blocks: [{ ioType: directType, channelCount: catalogToChannelCount(catalog, directType) }]
      })
      continue
    }

    // 2) Combo module (e.g. 1769-IQ6XOW4)
    const combo = splitComboModule(catalog)
    if (combo) {
      resolved.push({
        name: mod.name, parent: mod.parent, catalogNumber: catalog,
        slot: mod.slot, blocks: combo
      })
      continue
    }

    // 3) CompactLogix / Compact 5000 controller with embedded IO
    const embedded = detectEmbeddedIO(catalog)
    if (embedded.length > 0) {
      resolved.push({
        name: mod.name, parent: mod.parent, catalogNumber: catalog,
        slot: mod.slot ?? 0, blocks: embedded
      })
      continue
    }

    // 4) Fallback: ProductType indicates IO and module has IO connections
    if (mod.productType !== null && IO_PRODUCT_TYPES[mod.productType] && (mod.hasInputTag || mod.hasOutputTag)) {
      const fallbackType = mod.hasOutputTag && !mod.hasInputTag ? 'DO'
                         : mod.hasInputTag && !mod.hasOutputTag ? 'DI'
                         : IO_PRODUCT_TYPES[mod.productType]
      resolved.push({
        name: mod.name, parent: mod.parent, catalogNumber: catalog,
        slot: mod.slot,
        blocks: [{ ioType: fallbackType, channelCount: 16 }]
      })
    }
  }

  if (resolved.length === 0) return { racks: [], slots: [], entries: [] }

  // ── Group by parent → racks ────────────────────────────────────────────────
  // Each unique parent becomes a rack. The rack name uses the description or
  // module name of the parent module (the adapter/chassis).

  const parentGroups = new Map<string, ResolvedModule[]>()
  for (const mod of resolved) {
    const key = mod.parent || 'Local'
    if (!parentGroups.has(key)) parentGroups.set(key, [])
    parentGroups.get(key)!.push(mod)
  }

  for (const [, mods] of parentGroups) {
    mods.sort((a, b) => (a.slot ?? 999) - (b.slot ?? 999))
  }

  /** Derive a human-friendly rack name from the parent module */
  function rackNameFor(parentKey: string): string {
    if (parentKey === 'Local') {
      const ctrl = rawModules.find((m) => m.parent === 'Local' && m.productType === 14)
      if (ctrl) return ctrl.description ? `Local — ${ctrl.description}` : `Local (${ctrl.catalogNumber || ctrl.name})`
      return 'Local'
    }
    const parentMod = moduleByName.get(parentKey)
    if (parentMod) {
      if (parentMod.description) return `${parentKey} — ${parentMod.description}`
      if (parentMod.catalogNumber) return `${parentKey} (${parentMod.catalogNumber})`
    }
    return parentKey
  }

  const racks: IORack[] = []
  const slots: IOSlot[] = []
  const entries: IOEntry[] = []

  for (const [parentName, mods] of parentGroups) {
    const rackId = uid('rack')
    racks.push({ id: rackId, name: rackNameFor(parentName) })

    for (const mod of mods) {
      for (const block of mod.blocks) {
        const slotId = uid('slot')
        const blockSuffix = mod.blocks.length > 1 ? ` (${block.ioType})` : ''
        slots.push({
          id: slotId,
          rackId,
          name: `${mod.name}${blockSuffix}`,
          catalogNumber: mod.catalogNumber || undefined
        })

        for (let ch = 0; ch < block.channelCount; ch++) {
          entries.push({
            id: uid('io'),
            slotId,
            channel: String(ch),
            drawingTag: '',
            drawingReference: '',
            description1: '',
            description2: '',
            description3: '',
            ioType: block.ioType,
            unitOfMeasure: '',
            minRawScale: '',
            maxRawScale: '',
            minEUScale: '',
            maxEUScale: '',
          })
        }
      }
    }
  }

  return { racks, slots, entries }
}
