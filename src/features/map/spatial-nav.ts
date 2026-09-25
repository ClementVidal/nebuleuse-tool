import { center, type Point, type Rect } from './geometry'

export type Direction = 'left' | 'right' | 'up' | 'down'

const VECTORS: Record<Direction, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
}

/**
 * Picks the node that best continues in `direction` from `from`: within a 60° cone,
 * favouring close nodes that are well aligned with the direction.
 */
export function findNeighbor<T extends Rect & { id: string }>(from: Point, candidates: T[], direction: Direction): T | undefined {
  const dir = VECTORS[direction]
  let best: T | undefined
  let bestScore = Infinity
  for (const candidate of candidates) {
    const c = center(candidate)
    const dx = c.x - from.x
    const dy = c.y - from.y
    const distance = Math.hypot(dx, dy)
    if (distance < 1) continue
    const cos = (dx * dir.x + dy * dir.y) / distance
    if (cos < Math.cos(Math.PI / 3)) continue
    const score = distance * (2 - cos)
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

/** Returns a position for a new node next to `from` (to its right), shifted down until it doesn't overlap. */
export function placeBeside(from: Rect, others: Rect[], size: { width: number; height: number }): Point {
  const gap = 160
  const pos = { x: from.x + from.width + gap, y: from.y }
  const overlaps = (p: Point) =>
    others.some((o) => p.x < o.x + o.width + 20 && p.x + size.width + 20 > o.x && p.y < o.y + o.height + 20 && p.y + size.height + 20 > o.y)
  for (let i = 0; i < 50 && overlaps(pos); i++) pos.y += size.height / 2
  return pos
}
