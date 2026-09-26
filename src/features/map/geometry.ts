export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function center(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/** Point where the segment from the rect's center towards `toward` crosses the rect border, pushed out by `gap`. */
export function borderPoint(r: Rect, toward: Point, gap = EDGE_GAP): Point {
  const c = center(r)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return c
  const hw = r.width / 2 + gap
  const hh = r.height / 2 + gap
  const scale = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy))
  return { x: c.x + dx * scale, y: c.y + dy * scale }
}

/** Space left between an edge end and the node border. */
const EDGE_GAP = 8

export interface EdgeGeometry {
  path: string
  start: Point
  end: Point
  /** Cubic control points for curved edges (null for straight ones). */
  controls: [Point, Point] | null
  /** Direction the path leaves `start`, and arrives at `end` (unit vectors). */
  startDir: Point
  endDir: Point
  labelAt: Point
}

function unit(p: Point): Point {
  const len = Math.hypot(p.x, p.y) || 1
  return { x: p.x / len, y: p.y / len }
}

function cubicPath(start: Point, [c1, c2]: [Point, Point], end: Point) {
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`
}

/**
 * Edge between two node rects.
 * - straight: "floating" line between the borders, along the line joining the centers;
 * - curved: leaves each node perpendicular to the side facing the other one and bends smoothly
 *   (the connector style of Miro / Whimsical / React Flow bezier edges).
 */
export function edgeGeometry(source: Rect, target: Rect, curved: boolean): EdgeGeometry {
  if (!curved) {
    const start = borderPoint(source, center(target))
    const end = borderPoint(target, center(source))
    const dir = unit({ x: end.x - start.x, y: end.y - start.y })
    return {
      path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      start,
      end,
      controls: null,
      startDir: dir,
      endDir: dir,
      labelAt: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    }
  }

  const sc = center(source)
  const tc = center(target)
  const dx = tc.x - sc.x
  const dy = tc.y - sc.y
  // Connect through the axis with the most free space between the two boxes.
  const gapX = Math.abs(dx) - (source.width + target.width) / 2
  const gapY = Math.abs(dy) - (source.height + target.height) / 2
  const horizontal = gapX >= gapY
  const sx = Math.sign(dx) || 1
  const sy = Math.sign(dy) || 1
  const startNormal = horizontal ? { x: sx, y: 0 } : { x: 0, y: sy }
  const endNormal = { x: -startNormal.x, y: -startNormal.y }
  const start = horizontal
    ? { x: sc.x + sx * (source.width / 2 + EDGE_GAP), y: sc.y }
    : { x: sc.x, y: sc.y + sy * (source.height / 2 + EDGE_GAP) }
  const end = horizontal
    ? { x: tc.x - sx * (target.width / 2 + EDGE_GAP), y: tc.y }
    : { x: tc.x, y: tc.y - sy * (target.height / 2 + EDGE_GAP) }
  const along = horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y)
  const pull = Math.max(30, Math.min(160, along * 0.5 + Math.abs(horizontal ? dy : dx) * 0.15))
  const c1 = { x: start.x + startNormal.x * pull, y: start.y + startNormal.y * pull }
  const c2 = { x: end.x + endNormal.x * pull, y: end.y + endNormal.y * pull }
  return {
    path: cubicPath(start, [c1, c2], end),
    start,
    end,
    controls: [c1, c2],
    startDir: startNormal,
    endDir: { x: -endNormal.x, y: -endNormal.y },
    // Point at t = 0.5 on the cubic curve.
    labelAt: { x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8, y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8 },
  }
}

/** SVG path of the edge with its ends pulled back (e.g. to make room for arrowheads). */
export function insetPath(g: EdgeGeometry, startInset: number, endInset: number): string {
  const start = { x: g.start.x + g.startDir.x * startInset, y: g.start.y + g.startDir.y * startInset }
  const end = { x: g.end.x - g.endDir.x * endInset, y: g.end.y - g.endDir.y * endInset }
  return g.controls ? cubicPath(start, g.controls, end) : `M ${start.x} ${start.y} L ${end.x} ${end.y}`
}

/** The two wing segments of an arrowhead whose tip is `tip`, pointing along `dir`. */
export function arrowheadWings(tip: Point, dir: Point, size: number): [Point, Point] {
  const angle = Math.PI / 7
  const back = { x: -dir.x * size, y: -dir.y * size }
  const rotate = (p: Point, a: number) => ({
    x: p.x * Math.cos(a) - p.y * Math.sin(a),
    y: p.x * Math.sin(a) + p.y * Math.cos(a),
  })
  const w1 = rotate(back, angle)
  const w2 = rotate(back, -angle)
  return [
    { x: tip.x + w1.x, y: tip.y + w1.y },
    { x: tip.x + w2.x, y: tip.y + w2.y },
  ]
}
