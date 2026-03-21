let _counter = 1
export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${_counter++}`
}
