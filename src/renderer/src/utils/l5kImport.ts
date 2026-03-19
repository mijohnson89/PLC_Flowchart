import type { AOIFieldUsage, InterfaceField, UserInterface } from '../types'

let _importId = 1
function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${_importId++}`
}

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
      description: parseDescription(line)
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
    description: parseDescription(line)
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
    defaultValue: parseDefaultValue(attrs)
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
