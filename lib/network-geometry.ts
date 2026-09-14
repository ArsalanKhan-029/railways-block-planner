/**
 * Track geometry engine.
 *
 * public/network/routes.json holds the real curved track polylines extracted
 * from the RailMind network map (grouped by corridor color, unit coordinates).
 * This module snaps each section's two endpoint stations onto the best-matching
 * polyline so that:
 *   • track lines render along real curved corridors (not straight chords)
 *   • trains move along those curves with arc-length parameterization
 *   • traveled-path trails can be drawn behind a moving train
 *
 * Everything degrades gracefully: if the file is missing or no polyline lies
 * near a section's endpoints, callers fall back to their previous rendering.
 */

export interface Pt {
  x: number
  y: number
}

export interface SnappedPath {
  /** Resampled points from endpoint A to endpoint B, in order. */
  pts: Pt[]
  /** Cumulative arc length at each point (same length as pts). */
  cum: number[]
  totalLen: number
}

type Poly = Pt[]

/** Load + flatten all track polylines from routes.json. */
export async function loadTrackPolylines(): Promise<Poly[]> {
  try {
    const res = await fetch('/network/routes.json')
    if (!res.ok) return []
    const data = (await res.json()) as Record<string, { pts: number[][]; len?: number }[]>
    const polys: Poly[] = []
    for (const segs of Object.values(data)) {
      for (const seg of segs) {
        if (!seg.pts || seg.pts.length < 2) continue
        polys.push(seg.pts.map(([x, y]) => ({ x, y })))
      }
    }
    return polys
  } catch {
    return []
  }
}

function nearestPointOnPoly(poly: Poly, p: Pt): { idx: number; dist: number } {
  let best = { idx: -1, dist: Infinity }
  for (let i = 0; i < poly.length; i++) {
    const d = Math.hypot(poly[i].x - p.x, poly[i].y - p.y)
    if (d < best.dist) best = { idx: i, dist: d }
  }
  return best
}

/**
 * Snap a section (endpoint unit coords a → b) onto the best polyline:
 * the one that passes close to BOTH endpoints with the smallest combined
 * distance. Returns the sub-path between the two attach points, oriented
 * a → b, resampled to a bounded point count.
 */
export function snapSection(polys: Poly[], a: Pt, b: Pt, maxAttach = 0.02): SnappedPath | null {
  let best: { poly: Poly; ia: number; ib: number; score: number } | null = null
  for (const poly of polys) {
    const na = nearestPointOnPoly(poly, a)
    const nb = nearestPointOnPoly(poly, b)
    if (na.dist > maxAttach || nb.dist > maxAttach) continue
    const score = na.dist + nb.dist
    if (!best || score < best.score) best = { poly, ia: na.idx, ib: nb.idx, score }
  }
  if (!best) return null

  const { poly, ia, ib } = best
  const forward = ia <= ib
  const slice = forward ? poly.slice(ia, ib + 1) : poly.slice(ib, ia + 1).reverse()
  // Snap the exact endpoints onto the station coords so trains touch the hubs.
  const pts = [a, ...slice.slice(1, -1), b]
  return resample(pts, 80)
}

/** Resample a polyline to ≤ maxPoints by arc length. */
function resample(pts: Pt[], maxPoints: number): SnappedPath {
  const cum: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }
  const totalLen = cum[cum.length - 1] || 1e-9
  if (pts.length <= maxPoints) return { pts, cum, totalLen }

  const out: Pt[] = [pts[0]]
  const outCum: number[] = [0]
  const step = totalLen / (maxPoints - 1)
  let target = step
  for (let i = 1; i < pts.length - 1 && out.length < maxPoints - 1; i++) {
    if (cum[i] >= target) {
      out.push(pts[i])
      outCum.push(cum[i])
      target += step
    }
  }
  out.push(pts[pts.length - 1])
  outCum.push(totalLen)
  return { pts: out, cum: outCum, totalLen }
}

/** Position + traveled arc length at parameter t (0..1) along a snapped path. */
export function pointOnPath(path: SnappedPath, t: number): { p: Pt; traveled: number } {
  const clamped = Math.min(1, Math.max(0, t))
  const target = clamped * path.totalLen
  const { pts, cum } = path
  // binary search for the segment
  let lo = 0
  let hi = cum.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= target) lo = mid
    else hi = mid
  }
  const segLen = cum[hi] - cum[lo] || 1e-9
  const f = (target - cum[lo]) / segLen
  return {
    p: {
      x: pts[lo].x + (pts[hi].x - pts[lo].x) * f,
      y: pts[lo].y + (pts[hi].y - pts[lo].y) * f,
    },
    traveled: target,
  }
}

/** Sub-path from the start up to traveled arc length — for movement trails. */
export function pathUpTo(path: SnappedPath, traveled: number): string {
  const { pts, cum } = path
  let d = `M${(pts[0].x * 1000).toFixed(1)},${(pts[0].y * 1000).toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] <= traveled) {
      d += `L${(pts[i].x * 1000).toFixed(1)},${(pts[i].y * 1000).toFixed(1)}`
    } else {
      const segLen = cum[i] - cum[i - 1] || 1e-9
      const f = (traveled - cum[i - 1]) / segLen
      const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f
      const y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f
      d += `L${(x * 1000).toFixed(1)},${(y * 1000).toFixed(1)}`
      break
    }
  }
  return d
}

/** Great-circle distance in km between two lat/lng pairs. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
