export function formatDate(iso: string, includeTime = false): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  if (!includeTime) return date
  return date + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
