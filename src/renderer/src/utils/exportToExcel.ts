import * as XLSX from 'xlsx'
import { useDiagramStore } from '../store/diagramStore'
import type {
  DiagramTab, UserInterface, InterfaceInstance,
  IORack, IOSlot, IOEntry, Task, Alarm,
  Plant, Area, Location
} from '../types'

type Row = Record<string, string | number | boolean | undefined>

function ws(data: Row[]): XLSX.WorkSheet {
  return XLSX.utils.json_to_sheet(data)
}

function autoWidth(sheet: XLSX.WorkSheet): void {
  const ref = sheet['!ref']
  if (!ref) return
  const range = XLSX.utils.decode_range(ref)
  const cols: XLSX.ColInfo[] = []
  for (let c = range.s.c; c <= range.e.c; c++) {
    let max = 10
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      if (cell?.v != null) {
        const len = String(cell.v).length
        if (len > max) max = len
      }
    }
    cols.push({ wch: Math.min(max + 2, 60) })
  }
  sheet['!cols'] = cols
}

function buildLocationMap(plants: Plant[], areas: Area[], locations: Location[]) {
  const plantMap = new Map(plants.map((p) => [p.id, p.name]))
  const areaMap = new Map(areas.map((a) => [a.id, a]))
  const locMap = new Map(locations.map((l) => [l.id, l]))

  return (locationId?: string) => {
    if (!locationId) return { plant: '', area: '', location: '' }
    const loc = locMap.get(locationId)
    if (!loc) return { plant: '', area: '', location: '' }
    const area = areaMap.get(loc.areaId)
    const plant = area ? plantMap.get(area.plantId) : undefined
    return {
      plant: plant ?? '',
      area: area?.name ?? '',
      location: loc.name
    }
  }
}

function buildInterfacesSheet(userInterfaces: UserInterface[]): XLSX.WorkSheet {
  const rows: Row[] = []
  for (const iface of userInterfaces) {
    if (iface.fields.length === 0) {
      rows.push({
        'Interface': iface.name,
        'Type': iface.type,
        'Description': iface.description ?? '',
        'Field Name': '',
        'Data Type': '',
        'Usage': '',
        'Field Description': '',
        'Include In Matrix': '',
        'Is Alarm': '',
        'Alarm Message': '',
        'Is IO': ''
      })
    }
    for (const f of iface.fields) {
      rows.push({
        'Interface': iface.name,
        'Type': iface.type,
        'Description': iface.description ?? '',
        'Field Name': f.name,
        'Data Type': f.dataType,
        'Usage': f.usage ?? '',
        'Field Description': f.description ?? '',
        'Include In Matrix': f.includeInMatrix ? 'Yes' : '',
        'Is Alarm': f.isAlarm ? 'Yes' : '',
        'Alarm Message': f.alarmMessage ?? '',
        'Is IO': f.isIO ? 'Yes' : ''
      })
    }
  }
  if (rows.length === 0) rows.push({ 'Interface': '(No interfaces defined)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

function buildInstancesSheet(
  interfaceInstances: InterfaceInstance[],
  userInterfaces: UserInterface[],
  resolve: ReturnType<typeof buildLocationMap>
): XLSX.WorkSheet {
  const ifaceMap = new Map(userInterfaces.map((i) => [i.id, i]))
  const rows: Row[] = interfaceInstances.map((inst) => {
    const iface = ifaceMap.get(inst.interfaceId)
    const loc = resolve(inst.locationId)
    return {
      'Instance Name': inst.name,
      'Tag Name': inst.tagName,
      'Interface': iface?.name ?? '',
      'Interface Type': iface?.type ?? '',
      'Description': inst.description ?? '',
      'Plant': loc.plant,
      'Area': loc.area,
      'Location': loc.location
    }
  })
  if (rows.length === 0) rows.push({ 'Instance Name': '(No instances defined)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

function buildIOTableSheet(
  ioRacks: IORack[],
  ioSlots: IOSlot[],
  ioEntries: IOEntry[],
  interfaceInstances: InterfaceInstance[],
  userInterfaces: UserInterface[]
): XLSX.WorkSheet {
  const rackMap = new Map(ioRacks.map((r) => [r.id, r]))
  const slotMap = new Map(ioSlots.map((s) => [s.id, s]))
  const ifaceMap = new Map(userInterfaces.map((i) => [i.id, i]))

  const reverseIO = new Map<string, { instanceName: string; fieldName: string }>()
  for (const inst of interfaceInstances) {
    if (!inst.ioMappings) continue
    const iface = ifaceMap.get(inst.interfaceId)
    for (const [fieldId, entryId] of Object.entries(inst.ioMappings)) {
      const field = iface?.fields.find((f) => f.id === fieldId)
      reverseIO.set(entryId, {
        instanceName: inst.name,
        fieldName: field?.name ?? fieldId
      })
    }
  }

  const rows: Row[] = ioEntries.map((entry) => {
    const slot = slotMap.get(entry.slotId)
    const rack = slot ? rackMap.get(slot.rackId) : undefined
    const linked = reverseIO.get(entry.id)
    return {
      'Rack': rack?.name ?? '',
      'Slot': slot?.name ?? '',
      'Catalog Number': slot?.catalogNumber ?? '',
      'Channel': entry.channel,
      'IO Type': entry.ioType,
      'Drawing Tag': entry.drawingTag,
      'Drawing Reference': entry.drawingReference,
      'Description 1': entry.description1,
      'Description 2': entry.description2,
      'Description 3': entry.description3,
      'Unit of Measure': entry.unitOfMeasure,
      'Min Raw Scale': entry.minRawScale,
      'Max Raw Scale': entry.maxRawScale,
      'Min EU Scale': entry.minEUScale,
      'Max EU Scale': entry.maxEUScale,
      'Linked Instance': linked ? `${linked.instanceName}.${linked.fieldName}` : ''
    }
  })
  if (rows.length === 0) rows.push({ 'Rack': '(No IO entries defined)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

function buildLocationsSheet(plants: Plant[], areas: Area[], locations: Location[]): XLSX.WorkSheet {
  const plantMap = new Map(plants.map((p) => [p.id, p.name]))
  const areaMap = new Map(areas.map((a) => [a.id, a]))

  const rows: Row[] = []
  for (const loc of locations) {
    const area = areaMap.get(loc.areaId)
    rows.push({
      'Plant': area ? (plantMap.get(area.plantId) ?? '') : '',
      'Area': area?.name ?? '',
      'Location': loc.name
    })
  }
  if (rows.length === 0) {
    for (const area of areas) {
      rows.push({
        'Plant': plantMap.get(area.plantId) ?? '',
        'Area': area.name,
        'Location': ''
      })
    }
  }
  if (rows.length === 0) {
    for (const plant of plants) {
      rows.push({ 'Plant': plant.name, 'Area': '', 'Location': '' })
    }
  }
  if (rows.length === 0) rows.push({ 'Plant': '(No locations defined)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

function buildTasksSheet(
  tasks: Task[],
  tabs: DiagramTab[],
  ioRacks: IORack[],
  ioSlots: IOSlot[],
  ioEntries: IOEntry[],
  interfaceInstances: InterfaceInstance[]
): XLSX.WorkSheet {
  const tabMap = new Map(tabs.map((t) => [t.id, t.name]))
  const rackMap = new Map(ioRacks.map((r) => [r.id, r.name]))
  const slotMap = new Map(ioSlots.map((s) => [s.id, s]))
  const instMap = new Map(interfaceInstances.map((i) => [i.id, i.name]))
  const entryMap = new Map(ioEntries.map((e) => [e.id, e]))

  const rows: Row[] = []
  for (const task of tasks) {
    const flowTab = task.flowchartTabId ? tabMap.get(task.flowchartTabId) : ''
    const seqTab = task.sequenceTabId ? tabMap.get(task.sequenceTabId) : ''
    const rackName = task.ioRackId ? rackMap.get(task.ioRackId) : ''
    const slot = task.ioSlotId ? slotMap.get(task.ioSlotId) : undefined
    const entry = task.ioEntryId ? entryMap.get(task.ioEntryId) : undefined
    const instName = task.instanceId ? instMap.get(task.instanceId) : ''

    if (task.subTasks.length === 0) {
      rows.push({
        'Task': task.name,
        'Flowchart Tab': flowTab ?? '',
        'Sequence Tab': seqTab ?? '',
        'Rack': rackName ?? '',
        'Slot': slot?.name ?? '',
        'IO Channel': entry?.channel ?? '',
        'Instance': instName ?? '',
        'Sub-Task': '',
        'Designed': '',
        'Programmed': '',
        'Tested': ''
      })
    }
    for (const st of task.subTasks) {
      rows.push({
        'Task': task.name,
        'Flowchart Tab': flowTab ?? '',
        'Sequence Tab': seqTab ?? '',
        'Rack': rackName ?? '',
        'Slot': slot?.name ?? '',
        'IO Channel': entry?.channel ?? '',
        'Instance': instName ?? '',
        'Sub-Task': st.name,
        'Designed': st.designed ? 'Yes' : 'No',
        'Programmed': st.programmed ? 'Yes' : 'No',
        'Tested': st.tested ? 'Yes' : 'No'
      })
    }
  }
  if (rows.length === 0) rows.push({ 'Task': '(No tasks defined)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

function buildAlarmsSheet(
  alarms: Alarm[],
  userInterfaces: UserInterface[],
  interfaceInstances: InterfaceInstance[]
): XLSX.WorkSheet {
  const rows: Row[] = []

  for (const alarm of alarms) {
    rows.push({ 'Source': 'Global', 'Instance': '', 'Field': '', 'Alarm Description': alarm.description })
  }

  for (const inst of interfaceInstances) {
    const iface = userInterfaces.find((i) => i.id === inst.interfaceId)
    if (!iface) continue
    for (const field of iface.fields) {
      if (!field.isAlarm) continue
      rows.push({
        'Source': 'Instance',
        'Instance': inst.name,
        'Field': field.name,
        'Alarm Description': field.alarmMessage ? `${inst.name} - ${field.alarmMessage}` : ''
      })
    }
  }

  if (rows.length === 0) rows.push({ 'Source': '(No alarms defined)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

function buildDiagramsSheet(tabs: DiagramTab[]): XLSX.WorkSheet {
  const rows: Row[] = tabs.map((tab) => ({
    'Tab Name': tab.name,
    'Type': tab.type,
    'Group': tab.group ?? '',
    'Sub-Group': tab.subGroup ?? '',
    'Flow Nodes': tab.flowNodes.length,
    'Flow Edges': tab.flowEdges.length,
    'Seq Actors': tab.seqActors.length,
    'Seq Messages': tab.seqMessages.length,
    'Revisions': tab.revisions.length,
    'Conditions': tab.conditions.length
  }))
  if (rows.length === 0) rows.push({ 'Tab Name': '(No diagrams)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

function buildFlowchartDetailsSheet(tabs: DiagramTab[]): XLSX.WorkSheet {
  const rows: Row[] = []
  for (const tab of tabs) {
    if (tab.type !== 'flowchart') continue
    for (const node of tab.flowNodes) {
      rows.push({
        'Diagram': tab.name,
        'Node Type': node.type ?? '',
        'Label': node.data.label ?? '',
        'Step Number': node.data.stepNumber ?? '',
        'PackML State': node.data.packMLState ?? '',
        'Routine': node.data.routineName ?? '',
        'Condition': node.data.condition ?? '',
        'Description': node.data.description ?? '',
        'Output Type': node.data.outputType ?? '',
        'Tag Name': node.data.tagName ?? ''
      })
    }
  }
  if (rows.length === 0) rows.push({ 'Diagram': '(No flowchart nodes)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

function buildSequenceDetailsSheet(tabs: DiagramTab[]): XLSX.WorkSheet {
  const rows: Row[] = []
  for (const tab of tabs) {
    if (tab.type !== 'sequence') continue
    const actorMap = new Map(tab.seqActors.map((a) => [a.id, a.name]))
    for (const msg of [...tab.seqMessages].sort((a, b) => a.order - b.order)) {
      rows.push({
        'Diagram': tab.name,
        'Order': msg.order,
        'From': actorMap.get(msg.fromId) ?? msg.fromId,
        'To': actorMap.get(msg.toId) ?? msg.toId,
        'Message': msg.label,
        'Type': msg.type,
        'Note': msg.note ?? ''
      })
    }
  }
  if (rows.length === 0) rows.push({ 'Diagram': '(No sequence messages)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

function buildConditionsSheet(tabs: DiagramTab[]): XLSX.WorkSheet {
  const rows: Row[] = []
  for (const tab of tabs) {
    for (const cond of tab.conditions) {
      if (cond.causes.length === 0) {
        rows.push({
          'Diagram': tab.name,
          'Condition': cond.description,
          'Action': cond.action,
          'Cause': '',
        })
      }
      for (const cause of cond.causes) {
        rows.push({
          'Diagram': tab.name,
          'Condition': cond.description,
          'Action': cond.action,
          'Cause': cause.description,
        })
      }
    }
  }
  if (rows.length === 0) rows.push({ 'Diagram': '(No conditions defined)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

function buildMatrixSheet(
  matrixData: Record<string, Record<string, Record<string, unknown>>>,
  tabs: DiagramTab[],
  interfaceInstances: InterfaceInstance[],
  userInterfaces: UserInterface[]
): XLSX.WorkSheet {
  const ifaceMap = new Map(userInterfaces.map((i) => [i.id, i]))
  const instMap = new Map(interfaceInstances.map((i) => [i.id, i]))

  const allNodeMap = new Map<string, { tabName: string; label: string; stepNumber?: number }>()
  for (const tab of tabs) {
    for (const node of tab.flowNodes) {
      allNodeMap.set(node.id, {
        tabName: tab.name,
        label: node.data.label ?? '',
        stepNumber: node.data.stepNumber
      })
    }
  }

  const fieldColumns: { key: string; header: string }[] = []
  const seenKeys = new Set<string>()
  for (const instId of Object.keys(matrixData)) {
    for (const [fieldId] of Object.entries(
      Object.values(matrixData[instId] ?? {}).reduce<Record<string, true>>((acc, fields) => {
        for (const k of Object.keys(fields)) acc[k] = true
        return acc
      }, {})
    )) {
      // wrong nesting – matrix is stepId → instId → fieldId
    }
  }

  // matrix shape: stepNodeId → instanceId → fieldId → value
  const stepIds = new Set<string>()
  const colKeys = new Map<string, string>() // "instId::fieldId" → header
  for (const [stepId, byInst] of Object.entries(matrixData)) {
    stepIds.add(stepId)
    for (const [instId, byField] of Object.entries(byInst)) {
      const inst = instMap.get(instId)
      const iface = inst ? ifaceMap.get(inst.interfaceId) : undefined
      for (const fieldId of Object.keys(byField)) {
        const k = `${instId}::${fieldId}`
        if (!colKeys.has(k)) {
          const field = iface?.fields.find((f) => f.id === fieldId)
          colKeys.set(k, `${inst?.name ?? instId}.${field?.name ?? fieldId}`)
        }
      }
    }
  }

  const cols = Array.from(colKeys.entries())
  const rows: Row[] = []
  for (const stepId of stepIds) {
    const node = allNodeMap.get(stepId)
    const row: Row = {
      'Diagram': node?.tabName ?? '',
      'Step': node?.label ?? stepId,
      'Step #': node?.stepNumber ?? ''
    }
    for (const [key, header] of cols) {
      const [instId, fieldId] = key.split('::')
      const val = matrixData[stepId]?.[instId]?.[fieldId]
      row[header] = val === true ? 'X' : val === false ? '' : (val as string | number | undefined) ?? ''
    }
    rows.push(row)
  }

  if (rows.length === 0) rows.push({ 'Diagram': '(No matrix data)' })
  const sheet = ws(rows)
  autoWidth(sheet)
  return sheet
}

export function exportToExcel(): Uint8Array {
  const state = useDiagramStore.getState()
  const {
    tabs, plants, areas, locations,
    userInterfaces, interfaceInstances,
    ioRacks, ioSlots, ioEntries,
    tasks, alarms, matrixData
  } = state

  const resolve = buildLocationMap(plants, areas, locations)
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, buildDiagramsSheet(tabs), 'Diagrams')
  XLSX.utils.book_append_sheet(wb, buildFlowchartDetailsSheet(tabs), 'Flowchart Nodes')
  XLSX.utils.book_append_sheet(wb, buildSequenceDetailsSheet(tabs), 'Sequence Messages')
  XLSX.utils.book_append_sheet(wb, buildConditionsSheet(tabs), 'Conditions')
  XLSX.utils.book_append_sheet(wb, buildInterfacesSheet(userInterfaces), 'Interfaces')
  XLSX.utils.book_append_sheet(wb, buildInstancesSheet(interfaceInstances, userInterfaces, resolve), 'Instances')
  XLSX.utils.book_append_sheet(wb, buildIOTableSheet(ioRacks, ioSlots, ioEntries, interfaceInstances, userInterfaces), 'IO Table')
  XLSX.utils.book_append_sheet(wb, buildLocationsSheet(plants, areas, locations), 'Locations')
  XLSX.utils.book_append_sheet(wb, buildTasksSheet(tasks, tabs, ioRacks, ioSlots, ioEntries, interfaceInstances), 'Tasks')
  XLSX.utils.book_append_sheet(wb, buildAlarmsSheet(alarms, userInterfaces, interfaceInstances), 'Alarms')

  if (matrixData && Object.keys(matrixData).length > 0) {
    XLSX.utils.book_append_sheet(wb, buildMatrixSheet(matrixData, tabs, interfaceInstances, userInterfaces), 'C&E Matrix')
  }

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}
