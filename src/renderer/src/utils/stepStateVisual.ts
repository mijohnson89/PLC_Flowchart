import type { FlowStateItem, PackMLCategory, PackMLState } from '../types'
import { PACKML_STATES } from '../types'

function hexToRgba(hex: string, alpha: number): string {
  const t = hex.trim()
  const m6 = /^#?([0-9a-f]{6})$/i.exec(t)
  if (m6) {
    const n = parseInt(m6[1], 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
  }
  const m3 = /^#?([0-9a-f]{3})$/i.exec(t)
  if (m3) {
    const [a, b, c] = m3[1].split('').map((ch) => ch + ch)
    const n = parseInt(`${a}${b}${c}`, 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
  }
  return `rgba(100, 116, 139, ${alpha})`
}

export interface StepStateVisual {
  label: string
  bgColor: string
  textColor: string
  borderColor: string
  category: PackMLCategory
}

/** Resolve badge colors and label for a step state key (built-in or custom tab state). */
export function getStepStateVisual(key: string, customStates: FlowStateItem[] | undefined): StepStateVisual {
  const builtIn = PACKML_STATES[key as PackMLState]
  if (builtIn) {
    return {
      label: builtIn.label,
      bgColor: builtIn.bgColor,
      textColor: builtIn.textColor,
      borderColor: builtIn.borderColor,
      category: builtIn.category
    }
  }
  const c = customStates?.find((x) => x.id === key)
  if (c) {
    const border = c.color ?? '#64748b'
    const category = c.category ?? 'wait'
    return {
      label: c.name,
      bgColor: hexToRgba(border, 0.16),
      textColor: '#0f172a',
      borderColor: border,
      category
    }
  }
  return {
    label: key,
    bgColor: '#f1f5f9',
    textColor: '#475569',
    borderColor: '#cbd5e1',
    category: 'wait'
  }
}

export function formatStepStateLabel(key: string | undefined, customStates: FlowStateItem[] | undefined): string {
  if (key == null || key === '') return ''
  const builtIn = PACKML_STATES[key as PackMLState]
  if (builtIn) return builtIn.label
  return customStates?.find((x) => x.id === key)?.name ?? key
}
