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
export function borderPoint(r: Rect, toward: Point, gap = 6): Point {
  const c = center(r)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return c
  const hw = r.width / 2 + gap
  const hh = r.height / 2 + gap
  const scale = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy))
  return { x: c.x + dx * scale, y: c.y + dy * scale }
}

export interface EdgeGeometry {
  path: string
  start: Point
  end: Point
  /** Quadratic control point for curved edges. */
  control: Point | null
  /** Direction the path leaves `start`, and arrives at `end` (unit vectors). */
  startDir: Point
  endDir: Point
  labelAt: Point
}

function unit(p: Point): Point {
  const len = Math.hypot(p.x, p.y) || 1
  return { x: p.x / len, y: p.y / len }
}

/** "Floating" edge between two node rects: anchored on the borders, straight or gently curved. */
export function edgeGeometry(source: Rect, target: Rect, curved: boolean): EdgeGeometry {
  const start = borderPoint(source, center(target))
  const end = borderPoint(target, center(source))
  if (!curved) {
    const dir = unit({ x: end.x - start.x, y: end.y - start.y })
    return {
      path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      start,
      end,
      control: null,
      startDir: dir,
      endDir: dir,
      labelAt: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    }
  }
  // Quadratic curve bowed perpendicular to the chord, like Excalidraw's curved arrows.
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const chord = { x: end.x - start.x, y: end.y - start.y }
  const bow = Math.min(80, Math.hypot(chord.x, chord.y) * 0.2)
  const normal = unit({ x: -chord.y, y: chord.x })
  const control = { x: mid.x + normal.x * bow, y: mid.y + normal.y * bow }
  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    start,
    end,
    control,
    startDir: unit({ x: control.x - start.x, y: control.y - start.y }),
    endDir: unit({ x: end.x - control.x, y: end.y - control.y }),
    // Point at t = 0.5 on the quadratic curve.
    labelAt: { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 },
  }
}

/** SVG path of the edge with its ends pulled back (e.g. to make room for arrowheads). */
export function insetPath(g: EdgeGeometry, startInset: number, endInset: number): string {
  const start = { x: g.start.x + g.startDir.x * startInset, y: g.start.y + g.startDir.y * startInset }
  const end = { x: g.end.x - g.endDir.x * endInset, y: g.end.y - g.endDir.y * endInset }
  return g.control
    ? `M ${start.x} ${start.y} Q ${g.control.x} ${g.control.y} ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} L ${end.x} ${end.y}`
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
