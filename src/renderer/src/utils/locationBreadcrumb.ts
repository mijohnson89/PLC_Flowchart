import type { Plant, Area, Location } from '../types'

export function locationBreadcrumb(
  locationId: string | undefined,
  locations: Location[],
  areas: Area[],
  plants: Plant[]
): string {
  if (!locationId) return ''
  const loc = locations.find((l) => l.id === locationId)
  if (!loc) return ''
  const area = areas.find((a) => a.id === loc.areaId)
  const plant = area ? plants.find((p) => p.id === area.plantId) : undefined
  return [plant?.name, area?.name, loc.name].filter(Boolean).join(' › ')
}
