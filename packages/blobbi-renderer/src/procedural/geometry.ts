/** Shared geometry primitives. Pure math; no SVG strings except `fmt`. */

export interface Pt {
  x: number;
  y: number;
}

export interface Cubic {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p1: Pt;
}

export interface EllipseShape {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Degrees, about the ellipse's own centre. */
  rotation?: number;
}

export const pt = (x: number, y: number): Pt => ({ x, y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);

/**
 * Format a coordinate for SVG. Three decimals is a thousandth of an artwork
 * unit (the body is ~528 wide). Throws on a non-finite number: an invalid
 * coordinate must fail loudly here, never reach the DOM as `NaN`.
 */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`procedural blobbi: non-finite coordinate (${n})`);
  const rounded = Math.round(n * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export const fmtPt = (p: Pt) => `${fmt(p.x)},${fmt(p.y)}`;

export function cubicAt(seg: Cubic, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * seg.p0.x + b * seg.c1.x + c * seg.c2.x + d * seg.p1.x,
    y: a * seg.p0.y + b * seg.c1.y + c * seg.c2.y + d * seg.p1.y,
  };
}

/** `steps + 1` points along a cubic, endpoints included. */
export function sampleCubic(seg: Cubic, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) out.push(cubicAt(seg, i / steps));
  return out;
}

/** Rotate `p` about `origin` by `degrees` (clockwise on screen, as SVG does). */
export function rotateAbout(p: Pt, origin: Pt, degrees: number): Pt {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

/**
 * Linear interpolation along a polyline: the `out` coordinate where the
 * `key` coordinate equals `value`. The polyline must be monotonic in `key`.
 * Values outside the polyline clamp to its ends.
 */
export function interpolatePolyline(points: readonly Pt[], key: 'x' | 'y', value: number): number {
  const out = key === 'x' ? 'y' : 'x';
  const first = points[0];
  const last = points[points.length - 1];
  const ascending = last[key] >= first[key];
  if (ascending ? value <= first[key] : value >= first[key]) return first[out];
  if (ascending ? value >= last[key] : value <= last[key]) return last[out];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const inside = ascending ? value <= b[key] : value >= b[key];
    if (inside) {
      const span = b[key] - a[key];
      const t = span === 0 ? 0 : (value - a[key]) / span;
      return a[out] + (b[out] - a[out]) * t;
    }
  }
  return last[out];
}

// ─── Debug marks ─────────────────────────────────────────────────────────────

export type DebugGroup = 'body' | 'eyes' | 'mouth' | 'brows' | 'antenna' | 'limbs' | 'markings';

/** What the debug overlay draws. Collected by the geometry builders, in root units. */
export type DebugMark =
  | { kind: 'anchor'; at: Pt; group: DebugGroup }
  | { kind: 'control'; at: Pt; from: Pt; group: DebugGroup }
  | { kind: 'bounds'; x: number; y: number; width: number; height: number; group: DebugGroup }
  | { kind: 'axis'; x: number; y1: number; y2: number }
  | { kind: 'guide'; from: Pt; to: Pt; group: DebugGroup };
