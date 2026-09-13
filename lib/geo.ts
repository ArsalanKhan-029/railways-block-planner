/**
 * Equirectangular projection tuned for India's bounding box.
 * x/y are normalized 0..1 so the map renders into any container.
 */

export const INDIA_BOUNDS = {
  minLat: 6.5,
  maxLat: 37.5,
  minLng: 67.5,
  maxLng: 97.5,
}

export function projectToUnit(lat: number, lng: number): { x: number; y: number } {
  const { minLat, maxLat, minLng, maxLng } = INDIA_BOUNDS
  const x = (lng - minLng) / (maxLng - minLng)
  // scale latitude by cos(mid-latitude) so shapes are not vertically stretched
  const latScale = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180))
  const y = 1 - (lat - minLat) / ((maxLat - minLat) * latScale)
  return { x, y }
}
