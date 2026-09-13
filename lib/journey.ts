/**
 * Journey-time math — single source for distance-based duration estimates.
 *
 * Distance comes from the section's two endpoint stations (haversine × a
 * rail-route factor), duration from a priority-specific effective average
 * speed (includes halts). Rounding to 5 min keeps every estimate within the
 * ±10 min tolerance the Schedule feature promises.
 */

export const AVG_SPEED_KMH: Record<string, number> = {
  express: 65,
  mail: 55,
  passenger: 45,
  freight: 40,
}

/** Straight-line distance inflated to approximate rail routing. */
export const RAIL_ROUTE_FACTOR = 1.22

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Estimated rail distance in km between two stations (when coordinates are known). */
export function railDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) * RAIL_ROUTE_FACTOR
}

/** Duration in minutes for a distance at a priority's effective speed. */
export function durationMinutes(distanceKm: number, priority: string): number {
  const speed = AVG_SPEED_KMH[priority] ?? AVG_SPEED_KMH.express
  return Math.round((distanceKm / speed) * 60)
}

/** Round minutes to the nearest 5 so estimates stay within ±10 min. */
export function round5(minutes: number): number {
  return Math.round(minutes / 5) * 5
}

/** "06:00" + 585 min → "15:45" (wraps past midnight). */
export function addMinutesToTime(hhmm: string, minutes: number): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return hhmm
  const total = (Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440
  const wrapped = (total + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** "15:45" - "06:00" → 585 min (handles overnight wrap). */
export function minutesBetween(hhmmStart: string, hhmmEnd: string): number {
  const toMin = (t: string) => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return 0
    return Number(m[1]) * 60 + Number(m[2])
  }
  const diff = toMin(hhmmEnd) - toMin(hhmmStart)
  return diff < 0 ? diff + 1440 : diff
}
