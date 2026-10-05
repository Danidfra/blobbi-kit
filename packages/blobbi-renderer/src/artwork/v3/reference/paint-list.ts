/**
 * THE PAINT LIST: what a V3 drawing paints, read back from its markup with
 * everything that is only markup taken out.
 *
 * `visual_algorithm = 1` promises the same Blobbi, not the same SVG (see
 * `procedural/version.ts`). So the reference tests cannot compare strings.
 * They compare this instead: for each shape the drawing paints, in paint
 * order,
 *
 * ```
 *   WHERE   its outline's box (centre, width, height), its length and the
 *           area it encloses, and its stroke width, in the root <svg>'s own
 *           user units (the adult frame is 211.67 x 238.125 of them) with
 *           every transform applied
 *   HOW     its paint, hashed: fill and stroke (a colour, or a gradient's
 *           kind and stops), opacity (its own, and its groups'), line caps,
 *           blur radius, and what it is clipped to
 *   +       where a gradient in user space lies (the body's light, a limb's
 *           shading, the pattern's fade)
 * ```
 *
 * WHAT DOES NOT REACH IT: element and attribute order within a shape, ids,
 * grouping, whitespace, number formatting, whether a transform is nested or
 * baked into coordinates, whether an ellipse is an `<ellipse>` or a path,
 * how a filter or a clip is spelled, `data-*` attributes, CSS. A shape that
 * paints nothing (no fill and no stroke, or fully transparent) is not in it.
 *
 * WHAT DOES: any shape moving, growing, bending or changing paint; a shape
 * appearing or disappearing; two shapes swapping paint order.
 *
 * TOLERANCE. Positions and sizes are compared as NUMBERS, within
 * {@link TOLERANCE} (0.02 units: 1/12000 of the frame's height, under a
 * tenth of a pixel on a 1000-pixel Blobbi, and some 75 times the writer's own
 * rounding of 0.001 root units). Hashing rounded coordinates instead would
 * make a harmless change in rounding flip a hash wherever a value sits near
 * a rounding edge. A length gets four times that (it adds up round an
 * outline). An area gets what a TENTH of the tolerance along the whole
 * outline would add: it is the only measure that sees an outline bend
 * between its extremes, so it is held tighter than the others. Paint is
 * discrete (colours, fixed opacities) and is compared exactly.
 *
 * WHAT CAN PASS UNDER IT: a change that keeps a shape's box, length and area
 * within those margins, which for the largest outline (the body) means a
 * local bend of less than about a tenth of a unit. Nothing a screen shows.
 *
 * It is an INSTRUMENT, not the definition of a Blobbi: it reads the SVG the
 * renderer writes today, and throws on any construct it does not understand
 * rather than skip paint it cannot measure.
 */

type Matrix = readonly [number, number, number, number, number, number];
type Point = readonly [number, number];
interface Subpath {
  points: Point[];
  closed: boolean;
}

const UNIT: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, [x, y]: Point): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** How much a matrix scales lengths, on average: what a stroke width or a blur radius is multiplied by. */
const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

const numbers = (text: string) => (text.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

function parseTransform(value: string | null): Matrix {
  if (!value) return UNIT;
  let out: Matrix = UNIT;
  const FUNCTION = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  if (value.replace(FUNCTION, '').replace(/[\s,]/g, '') !== '') throw new Error(`paint list: transform "${value}" is not understood`);
  for (const match of value.matchAll(FUNCTION)) {
    const n = numbers(match[2]);
    switch (match[1]) {
      case 'matrix':
        out = multiply(out, [n[0], n[1], n[2], n[3], n[4], n[5]]);
        break;
      case 'translate':
        out = multiply(out, [1, 0, 0, 1, n[0], n[1] ?? 0]);
        break;
      case 'scale':
        out = multiply(out, [n[0], 0, 0, n[1] ?? n[0], 0, 0]);
        break;
      case 'rotate': {
        const r = (n[0] * Math.PI) / 180;
        const turn: Matrix = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
        out = n.length >= 3 ? multiply(multiply(multiply(out, [1, 0, 0, 1, n[1], n[2]]), turn), [1, 0, 0, 1, -n[1], -n[2]]) : multiply(out, turn);
        break;
      }
      default:
        throw new Error(`paint list: transform "${match[1]}" is not understood`);
    }
  }
  return out;
}

const CURVE_STEPS = 64;
const ROUND_STEPS = 256;

/** An SVG elliptical arc, as points (the end included, the start not). */
function arcPoints(from: Point, rx: number, ry: number, rotation: number, large: boolean, sweep: boolean, to: Point): Point[] {
  if (rx === 0 || ry === 0) return [to];
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  let a = Math.abs(rx);
  let b = Math.abs(ry);
  const lambda = (x1 * x1) / (a * a) + (y1 * y1) / (b * b);
  if (lambda > 1) {
    a *= Math.sqrt(lambda);
    b *= Math.sqrt(lambda);
  }
  const k = Math.sqrt(Math.max(0, (a * a * b * b - a * a * y1 * y1 - b * b * x1 * x1) / (a * a * y1 * y1 + b * b * x1 * x1))) * (large === sweep ? -1 : 1);
  const cxp = (k * a * y1) / b;
  const cyp = (-k * b * x1) / a;
  const cx = cos * cxp - sin * cyp + (from[0] + to[0]) / 2;
  const cy = sin * cxp + cos * cyp + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1 - cxp) / a, (y1 - cyp) / b);
  let delta = angle((x1 - cxp) / a, (y1 - cyp) / b, (-x1 - cxp) / a, (-y1 - cyp) / b);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const out: Point[] = [];
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = start + (delta * i) / CURVE_STEPS;
    out.push([cx + a * Math.cos(t) * cos - b * Math.sin(t) * sin, cy + a * Math.cos(t) * sin + b * Math.sin(t) * cos]);
  }
  return out;
}

/** A path's outline as polylines, in its own coordinates. Absolute commands only: the writer uses no others. */
function flattenPath(d: string): Subpath[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out: Subpath[] = [];
  let current: Subpath | null = null;
  let at: Point = [0, 0];
  let i = 0;
  const take = () => {
    const value = Number(tokens[i++]);
    if (!Number.isFinite(value)) throw new Error(`paint list: bad number in path "${d.slice(0, 60)}"`);
    return value;
  };
  const point = (): Point => [take(), take()];
  let command = '';
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    switch (command) {
      case 'M':
        at = point();
        current = { points: [at], closed: false };
        out.push(current);
        // Further pairs after a moveto are linetos.
        command = 'L';
        break;
      case 'L':
        at = point();
        current!.points.push(at);
        break;
      case 'C': {
        const c1 = point();
        const c2 = point();
        const end = point();
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS;
          const u = 1 - t;
          current!.points.push([
            u * u * u * at[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
            u * u * u * at[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
          ]);
        }
        at = end;
        break;
      }
      case 'Q': {
        const c = point();
        const end = point();
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS;
          const u = 1 - t;
          current!.points.push([u * u * at[0] + 2 * u * t * c[0] + t * t * end[0], u * u * at[1] + 2 * u * t * c[1] + t * t * end[1]]);
        }
        at = end;
        break;
      }
      case 'A': {
        const rx = take();
        const ry = take();
        const rotation = take();
        const large = take() !== 0;
        const sweep = take() !== 0;
        const end = point();
        current!.points.push(...arcPoints(at, rx, ry, rotation, large, sweep, end));
        at = end;
        break;
      }
      case 'Z':
        if (current) {
          current.closed = true;
          at = current.points[0];
        }
        break;
      default:
        throw new Error(`paint list: path command "${command}" is not understood`);
    }
  }
  return out;
}

const num = (el: Element, name: string, fallback = 0) => {
  const raw = el.getAttribute(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`paint list: <${el.tagName} ${name}="${raw}">`);
  return value;
};

const SHAPES = ['path', 'ellipse', 'circle', 'rect'];

/** A shape's outline, in its own coordinates (its `transform` not yet applied). */
function outlineOf(el: Element): Subpath[] {
  switch (el.tagName) {
    case 'path':
      return flattenPath(el.getAttribute('d') ?? '');
    case 'ellipse':
    case 'circle': {
      const cx = num(el, 'cx');
      const cy = num(el, 'cy');
      const rx = el.tagName === 'circle' ? num(el, 'r') : num(el, 'rx');
      const ry = el.tagName === 'circle' ? num(el, 'r') : num(el, 'ry');
      const points: Point[] = [];
      for (let i = 0; i < ROUND_STEPS; i++) {
        const t = (i / ROUND_STEPS) * 2 * Math.PI;
        points.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
      }
      return [{ points, closed: true }];
    }
    case 'rect': {
      const x = num(el, 'x');
      const y = num(el, 'y');
      const w = num(el, 'width');
      const h = num(el, 'height');
      return [{ points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }];
    }
    default:
      throw new Error(`paint list: <${el.tagName}> is not a shape`);
  }
}

interface Measures {
  cx: number;
  cy: number;
  width: number;
  height: number;
  length: number;
  area: number;
  box: { left: number; right: number; top: number; bottom: number };
}

function measure(outline: readonly Subpath[], m: Matrix): Measures {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  let length = 0;
  let area = 0;
  for (const sub of outline) {
    const points = sub.points.map((p) => apply(m, p));
    let twice = 0;
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      const last = i === points.length - 1;
      const [nx, ny] = points[last ? 0 : i + 1];
      // The enclosed area is that of the outline closed; an open line's own length stops at its end.
      twice += x * ny - nx * y;
      if (!last || sub.closed) length += Math.hypot(nx - x, ny - y);
    }
    area += Math.abs(twice) / 2;
  }
  if (!Number.isFinite(left)) return { cx: 0, cy: 0, width: 0, height: 0, length: 0, area: 0, box: { left: 0, right: 0, top: 0, bottom: 0 } };
  return { cx: (left + right) / 2, cy: (top + bottom) / 2, width: right - left, height: bottom - top, length, area, box: { left, right, top, bottom } };
}

/** FNV-1a, 32 bits, as eight hexadecimal digits. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const fixed = (value: number, digits: number) => {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
};

export interface PaintLayer {
  /** The nearest `data-part` name: a label for a human reading a difference. Never compared. */
  part: string;
  /** Box centre, box width and height, outline length, enclosed area, stroke width (0 when unstroked). */
  where: [cx: number, cy: number, width: number, height: number, length: number, area: number, stroke: number];
  /** Everything about how it is painted, as readable text; `print` is its hash. */
  paint: string;
  print: string;
  /** Where the fill's gradient lies, when it is stated in user space: its two ends, or its centre and two radii. */
  light: number[];
}

interface Inherited {
  matrix: Matrix;
  fill: string | null;
  stroke: string | null;
  strokeWidth: string | null;
  strokeOpacity: string | null;
  linecap: string | null;
  linejoin: string | null;
  groupOpacity: number;
  clips: { el: Element; matrix: Matrix }[];
  blur: number;
  part: string;
}

const CONTAINERS = ['svg', 'g'];
const NOT_PAINTED = ['defs', 'style', 'title', 'desc'];
/** Attributes that would change what is painted and that this instrument does not model. */
const UNMODELLED = ['mask', 'fill-opacity', 'fill-rule', 'stroke-dasharray', 'visibility', 'display', 'mix-blend-mode'];

/**
 * Read a drawing's paint list.
 *
 * Throws on anything it does not understand, so new kinds of markup cannot
 * go unmeasured.
 */
export function paintList(svg: string): PaintLayer[] {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.tagName !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) throw new Error('paint list: not an SVG document');
  const byId = new Map<string, Element>();
  for (const el of root.querySelectorAll('[id]')) byId.set(el.getAttribute('id')!, el);
  const referenced = (value: string | null, what: string): Element | null => {
    if (!value || value === 'none') return null;
    const id = /^url\(#([^)]+)\)$/.exec(value)?.[1];
    const el = id ? byId.get(id) : undefined;
    if (!el) throw new Error(`paint list: ${what} "${value}" refers to nothing`);
    return el;
  };

  const layers: PaintLayer[] = [];

  /** A colour, or a gradient's kind and stops; with where it lies when that is stated in user space. */
  const paintOf = (value: string, matrix: Matrix): { text: string; light: number[] } => {
    if (/^#[0-9a-f]{6}$/.test(value)) return { text: value, light: [] };
    const el = referenced(value, 'paint');
    if (!el || (el.tagName !== 'linearGradient' && el.tagName !== 'radialGradient')) throw new Error(`paint list: paint "${value}" is not understood`);
    const stops = [...el.children].map((stop) => {
      if (stop.tagName !== 'stop') throw new Error(`paint list: <${stop.tagName}> in a gradient`);
      return `${fixed(num(stop, 'offset'), 3)}:${stop.getAttribute('stop-color')}:${fixed(num(stop, 'stop-opacity', 1), 3)}`;
    });
    const linear = el.tagName === 'linearGradient';
    const user = el.getAttribute('gradientUnits') === 'userSpaceOnUse';
    const own = parseTransform(el.getAttribute('gradientTransform'));
    const frame: Point[] = linear
      ? [
          [num(el, 'x1', 0), num(el, 'y1', 0)],
          [num(el, 'x2', 1), num(el, 'y2', 0)],
        ]
      : [
          [num(el, 'cx', 0.5), num(el, 'cy', 0.5)],
          [num(el, 'cx', 0.5) + num(el, 'r', 0.5), num(el, 'cy', 0.5)],
          [num(el, 'cx', 0.5), num(el, 'cy', 0.5) + num(el, 'r', 0.5)],
        ];
    if (user) {
      // In the shape's user space: it lies where these points land.
      const placed = frame.map((p) => apply(multiply(matrix, own), p));
      return { text: `${linear ? 'linear' : 'radial'}(${stops.join(' ')})`, light: placed.flat() };
    }
    // Relative to the shape's own box: the numbers are fractions of it, and say everything.
    const relative = frame.map((p) => apply(own, p)).flat().map((v) => fixed(v, 3));
    return { text: `${linear ? 'linear' : 'radial'}-in-box[${relative.join(',')}](${stops.join(' ')})`, light: [] };
  };

  const clipText = (clips: Inherited['clips']): string =>
    clips
      .map(({ el, matrix }) => {
        const shapes = [...el.children].map((child) => measure(outlineOf(child), multiply(matrix, parseTransform(child.getAttribute('transform')))));
        // A clip is nearly always a shape the drawing also paints (the body's silhouette): name that layer.
        const same = shapes.length === 1 ? layers.findIndex((layer) => layer.where.slice(0, 6).every((v, i) => Math.abs(v - [shapes[0].cx, shapes[0].cy, shapes[0].width, shapes[0].height, shapes[0].length, shapes[0].area][i]) <= toleranceAt(i, layer.where))) : -1;
        if (same >= 0) return `layer ${same}`;
        return shapes.map((s) => `${fixed(s.cx, 1)},${fixed(s.cy, 1)},${fixed(s.width, 1)},${fixed(s.height, 1)}`).join('+');
      })
      .join(' & ');

  const visit = (el: Element, inherited: Inherited) => {
    const tag = el.tagName;
    if (NOT_PAINTED.includes(tag)) return;
    if (!CONTAINERS.includes(tag) && !SHAPES.includes(tag)) throw new Error(`paint list: <${tag}> is not understood`);
    for (const name of UNMODELLED) if (el.hasAttribute(name)) throw new Error(`paint list: <${tag} ${name}> is not understood`);
    if (/(?:^|;)\s*(?:transform|opacity|fill|stroke|display|visibility)\s*:/.test(el.getAttribute('style') ?? '')) {
      throw new Error(`paint list: <${tag} style="${el.getAttribute('style')}"> paints from a style; measure a still drawing`);
    }

    const matrix = tag === 'svg' ? inherited.matrix : multiply(inherited.matrix, parseTransform(el.getAttribute('transform')));
    const opacity = num(el, 'opacity', 1);
    const clip = referenced(el.getAttribute('clip-path'), 'clip');
    if (clip && clip.tagName !== 'clipPath') throw new Error('paint list: a clip that is not a <clipPath>');
    const filter = referenced(el.getAttribute('filter'), 'filter');
    let blur = inherited.blur;
    if (filter) {
      const steps = [...filter.children];
      if (filter.tagName !== 'filter' || steps.length !== 1 || steps[0].tagName !== 'feGaussianBlur') throw new Error('paint list: a filter that is not one Gaussian blur');
      blur = Math.hypot(blur, num(steps[0], 'stdDeviation') * scaleOf(matrix));
    }
    const next: Inherited = {
      matrix,
      fill: el.getAttribute('fill') ?? inherited.fill,
      stroke: el.getAttribute('stroke') ?? inherited.stroke,
      strokeWidth: el.getAttribute('stroke-width') ?? inherited.strokeWidth,
      strokeOpacity: el.getAttribute('stroke-opacity') ?? inherited.strokeOpacity,
      linecap: el.getAttribute('stroke-linecap') ?? inherited.linecap,
      linejoin: el.getAttribute('stroke-linejoin') ?? inherited.linejoin,
      groupOpacity: inherited.groupOpacity,
      clips: clip ? [...inherited.clips, { el: clip, matrix }] : inherited.clips,
      blur,
      part: el.getAttribute('data-part') ?? inherited.part,
    };

    if (CONTAINERS.includes(tag)) {
      next.groupOpacity = inherited.groupOpacity * opacity;
      for (const child of el.children) visit(child, next);
      return;
    }

    // SVG's defaults: black fill, no stroke, a stroke one unit wide.
    const fillValue = next.fill ?? '#000000';
    const strokeValue = next.stroke ?? 'none';
    const filled = fillValue !== 'none';
    const stroked = strokeValue !== 'none';
    if ((!filled && !stroked) || opacity * next.groupOpacity === 0) return;

    let outline = outlineOf(el);
    let measured = measure(outline, matrix);
    if (tag === 'rect' && next.clips.length > 0 && matrix[1] === 0 && matrix[2] === 0) {
      // A rectangle under a clip is a wash over the clipped region, drawn
      // oversize so that it is sure to cover it. How far it overshoots paints
      // nothing, so only the part inside the clip's box is measured.
      const inner = next.clips[next.clips.length - 1];
      const bounds = [...inner.el.children].map((child) => measure(outlineOf(child), multiply(inner.matrix, parseTransform(child.getAttribute('transform')))).box);
      const left = Math.max(measured.box.left, Math.min(...bounds.map((b) => b.left)));
      const right = Math.min(measured.box.right, Math.max(...bounds.map((b) => b.right)));
      const top = Math.max(measured.box.top, Math.min(...bounds.map((b) => b.top)));
      const bottom = Math.min(measured.box.bottom, Math.max(...bounds.map((b) => b.bottom)));
      outline = [{ points: [[left, top], [right, top], [right, bottom], [left, bottom]], closed: true }];
      measured = measure(outline, UNIT);
    }
    if (!stroked && measured.area === 0) return;

    const fill = filled ? paintOf(fillValue, matrix) : { text: 'none', light: [] };
    const stroke = stroked ? paintOf(strokeValue, matrix) : { text: 'none', light: [] };
    const strokeWidth = stroked ? Number(next.strokeWidth ?? 1) * scaleOf(matrix) : 0;
    const paint = [
      `fill ${fill.text}`,
      `stroke ${stroke.text}${stroked ? ` cap ${next.linecap ?? 'butt'} join ${next.linejoin ?? 'miter'} opacity ${fixed(Number(next.strokeOpacity ?? 1), 3)}` : ''}`,
      `opacity ${fixed(opacity, 3)} in ${fixed(next.groupOpacity, 3)}`,
      `blur ${fixed(next.blur, 2)}`,
      `clip ${next.clips.length > 0 ? clipText(next.clips) : 'none'}`,
    ].join('; ');
    layers.push({
      part: el.hasAttribute('data-part') ? next.part : `${next.part}/${tag}`,
      where: [measured.cx, measured.cy, measured.width, measured.height, measured.length, measured.area, strokeWidth],
      paint,
      print: hash(paint),
      light: [...fill.light, ...stroke.light],
    });
  };

  visit(root, { matrix: UNIT, fill: null, stroke: null, strokeWidth: null, strokeOpacity: null, linecap: null, linejoin: null, groupOpacity: 1, clips: [], blur: 0, part: 'svg' });
  return layers;
}

/**
 * How far a position or a size may differ and still be the same drawing, in
 * the root <svg>'s user units. See the note on tolerance at the top.
 */
export const TOLERANCE = 0.02;
/** A reference line states each number to two decimals: half of the last one is its own rounding. */
const WRITTEN = 0.005;

/** The room each measure gets: see the note on tolerance at the top. */
function toleranceAt(index: number, where: readonly number[]): number {
  if (index === 4) return TOLERANCE * 4;
  if (index === 5) return TOLERANCE * 0.1 * Math.max(4, where[4]);
  return TOLERANCE;
}

/**
 * A paint list as lines of text, one per painted shape:
 *
 * ```
 *   <part> <cx> <cy> <width> <height> <length> <area> <stroke> <paint hash> [<gradient frame>...]
 * ```
 */
export function paintLines(layers: readonly PaintLayer[]): string[] {
  return layers.map((layer) => [layer.part, ...layer.where.map((v) => fixed(v, 2)), layer.print, ...layer.light.map((v) => fixed(v, 2))].join(' '));
}

/**
 * Compare a drawing's paint list with its reference lines. Returns what
 * differs, as sentences; empty when it is the same drawing.
 */
export function paintDifferences(reference: readonly string[], layers: readonly PaintLayer[]): string[] {
  const out: string[] = [];
  const actual = paintLines(layers);
  if (reference.length !== actual.length) {
    out.push(`paints ${actual.length} shapes, the reference ${reference.length}: [${actual.map((l) => l.split(' ')[0]).join(' ')}] against [${reference.map((l) => l.split(' ')[0]).join(' ')}]`);
    return out;
  }
  const NAMES = ['centre x', 'centre y', 'width', 'height', 'length', 'area', 'stroke width'];
  reference.forEach((line, i) => {
    const expected = line.split(' ');
    const label = `shape ${i} (${layers[i].part})`;
    const found: string[] = [];
    const want = expected.slice(1, 8).map(Number);
    layers[i].where.forEach((value, k) => {
      if (!(Math.abs(value - want[k]) <= toleranceAt(k, want) + WRITTEN)) found.push(`${label}: ${NAMES[k]} ${fixed(value, 2)}, the reference ${fixed(want[k], 2)}`);
    });
    if (expected[8] !== layers[i].print) found.push(`${label}: painted differently (${layers[i].paint}); the reference was ${expected[8]}`);
    const light = expected.slice(9).map(Number);
    if (light.length !== layers[i].light.length) found.push(`${label}: its gradient is placed differently`);
    else layers[i].light.forEach((value, k) => !(Math.abs(value - light[k]) <= TOLERANCE + WRITTEN) && found.push(`${label}: gradient frame ${fixed(value, 2)}, the reference ${fixed(light[k], 2)}`));
    // A name is only a label and is never compared; but where a shape differs AND is another part, it is the order that changed.
    if (found.length > 0 && expected[0] !== layers[i].part) out.push(`shape ${i}: is ${layers[i].part} where the reference has ${expected[0]} (the paint order changed, or another shape is drawn)`);
    else out.push(...found);
  });
  return out;
}
