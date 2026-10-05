/**
 * THE EGG: the shell a Blobbi incubates in, drawn from the same genome.
 *
 * ```
 *              genome
 *     ┌──────────┼──────────────┐
 *   egg genes   colours,       shape and trait genes
 *     │         markings        │
 *     ▼            │            ▼
 *   deriveEgg ◄────┘      deriveMorphology(stage) ──► baby, adult
 * ```
 *
 * An egg is NOT a third anatomy. It has no face, no limbs, no views and no
 * traits to project, so it does not go through the morphology, plan and
 * view machinery the baby and adult share; forcing it to would hollow that
 * model out. It is its own small representation with its own genes
 * (`genome.egg`, on `egg.*` streams), and it READS the Blobbi's identity
 * only for what a shell could plausibly show:
 *
 *  - the body's colour tints the shell and colours its spots;
 *  - flank spots on the Blobbi make a more spotted shell, in their colour;
 *  - cheek freckles become fine speckles; a belly patch a pale patch;
 *  - an accent colour marks one small spot.
 *
 * It reads nothing else. Horns, ears, tails, antennae, the tuft and every
 * proportion of the body are invisible in the egg (a test renders eggs that
 * differ only in those and requires identical output): hatching is a
 * surprise.
 *
 * The canonical egg is the official one (the kit's Egg V1): the same shell
 * path, the same four spots, highlight, shade and three cumulative crack
 * groups, in the same colours.
 */
import {
  AUTHORED_PALETTE,
  applyDelta,
  deltaOf,
  distance,
  hexToOklch,
  lighten,
  mixOklab,
  oklchToHex,
  sanitizeHex,
  type BlobbiColors,
} from './colors';
import { clampGene, type BlobbiGenome, type EggGeneName } from './genome';
import { type EllipseShape, type Pt, fmt, fmtPt, lerp, pt } from './geometry';
import { motionPose, poseTransform, type BlobbiMotion } from './motion';
import type { GeneRange } from './morphology';

// ─── The official drawing ────────────────────────────────────────────────────

/** Root units per unit of the Egg V1 drawing's 100-unit box. An egg is a little smaller than the baby it holds. */
export const EGG_UNIT = 4.6;
const AXIS = 408.65657;
/** The ground line every stage shares; the shell's base (`y = 91`) rests on it. */
const GROUND = 801;
const BASE_Y = 91;
const BOX_TOP = GROUND - BASE_Y * EGG_UNIT;
/** The official drawing's box, in root units: the egg's own frame. */
export const EGG_BOX = { x: AXIS - 50 * EGG_UNIT, y: BOX_TOP, size: 100 * EGG_UNIT } as const;

export const EGG_CRACKS = ['none', 'light', 'medium', 'heavy'] as const;
/** How far along hatching the shell looks. The host decides it (from incubation progress); the egg only draws it. */
export type EggCrack = (typeof EGG_CRACKS)[number];

/** `M 50 10 C 68 10 82 34 82 57 C 82 78 68 91 50 91 C 32 91 18 78 18 57 C 18 34 32 10 50 10 Z` */
const SHELL = { top: 10, sideY: 57, half: 32, topHandle: 18, sideUp: 23, sideDown: 21, baseHandle: 18 } as const;

/** The four authored spots, then two more that only a spotted Blobbi's egg carries. */
const SPOTS = [
  { cx: 38, cy: 40, rx: 5, ry: 6, rotation: -20 },
  { cx: 62, cy: 54, rx: 4.5, ry: 5.5, rotation: 15 },
  { cx: 45, cy: 72, rx: 4, ry: 4.8, rotation: -10 },
  { cx: 60, cy: 27, rx: 2.6, ry: 3.2, rotation: 0 },
  { cx: 29, cy: 59, rx: 3.3, ry: 4.1, rotation: 12 },
  { cx: 60, cy: 77, rx: 3, ry: 3.7, rotation: -16 },
] as const;
/** The small spot high on the right: the one an accent colour marks. */
const ACCENT_SPOT = 3;

const HIGHLIGHT = { cx: 38, cy: 30, rx: 7, ry: 11, rotation: -18, opacity: 0.38 } as const;
/** `M 66 24 C 76 36 78 60 68 78 C 64 84 58 88 50 90 C 62 86 72 76 74 60 C 76 46 72 32 66 24 Z` */
const SHADE: readonly (readonly [number, number])[] = [
  [66, 24], [76, 36], [78, 60], [68, 78], [64, 84], [58, 88], [50, 90], [62, 86], [72, 76], [74, 60], [76, 46], [72, 32], [66, 24],
];
/** The crack groups, cumulative: light draws the first, medium the first two, heavy all three. */
const CRACKS: readonly { points: readonly (readonly [number, number])[]; width: number }[][] = [
  [{ points: [[30, 50], [36, 47], [41, 52], [47, 48]], width: 1.6 }],
  [
    { points: [[47, 48], [54, 53], [61, 47], [68, 52]], width: 1.6 },
    { points: [[41, 52], [39, 59]], width: 1.1 },
  ],
  [
    { points: [[54, 53], [56, 62], [52, 68]], width: 1.6 },
    { points: [[61, 47], [64, 40], [62, 34]], width: 1.1 },
    { points: [[36, 47], [31, 42]], width: 1.1 },
    { points: [[68, 52], [73, 58]], width: 1.1 },
    { points: [[30, 50], [26, 55]], width: 1.1 },
  ],
];

// ─── Ranges ──────────────────────────────────────────────────────────────────

/**
 * How far a shell may drift from the official one. Deliberately tight: these
 * are individual eggs of one kind, not kinds of egg.
 */
export const EGG_RANGES: Readonly<Record<EggGeneName, GeneRange>> = {
  width: { base: 1, spread: 0.05, unit: 'scale', label: 'Width' },
  height: { base: 1, spread: 0.04, unit: 'scale', label: 'Height' },
  // Above 1 the crown is blunter and rounder; below, more pointed.
  taper: { base: 1, spread: 0.14, unit: 'scale', label: 'Roundness' },
  // Sideways drift of the crown, in the drawing's own units: a shell is never perfectly true.
  lean: { base: 0, spread: 1.3, unit: 'units', label: 'Lean' },
  highlight: { base: 1, spread: 0.16, unit: 'scale', label: 'Highlight' },
};

// ─── Palette ─────────────────────────────────────────────────────────────────

export interface EggPalette {
  shellLight: string;
  shellMid: string;
  shellDark: string;
  spotLight: string;
  spotDark: string;
  /** Spot gradient opacities, centre and edge. */
  spotInner: number;
  spotOuter: number;
  /** The one accent spot, when the Blobbi has an accent colour. */
  accentLight: string | null;
  accentDark: string | null;
  speckle: string;
  crack: string;
}

/** `#fff8ec` / `#f3e1c3` / `#d6b487` shell, `#c9a7ea` / `#a67cd0` spots, `#1f2937` cracks. */
export const AUTHORED_EGG_PALETTE: Readonly<EggPalette> = Object.freeze({
  shellLight: '#fff8ec',
  shellMid: '#f3e1c3',
  shellDark: '#d6b487',
  spotLight: '#c9a7ea',
  spotDark: '#a67cd0',
  spotInner: 0.95,
  spotOuter: 0.8,
  accentLight: null,
  accentDark: null,
  speckle: '#a67cd0',
  crack: '#1f2937',
});

const SHELL_MID = hexToOklch(AUTHORED_EGG_PALETTE.shellMid);
const SHELL_LIGHT = deltaOf(AUTHORED_EGG_PALETTE.shellLight, AUTHORED_EGG_PALETTE.shellMid);
const SHELL_DARK = deltaOf(AUTHORED_EGG_PALETTE.shellDark, AUTHORED_EGG_PALETTE.shellMid);
// The authored spots are a pastel of the authored BODY: that relation is the clue the egg gives.
const BODY_MID = hexToOklch(AUTHORED_PALETTE.bodyMid);
const SPOT_LIGHT = deltaOf(AUTHORED_EGG_PALETTE.spotLight, AUTHORED_PALETTE.bodyMid);
const SPOT_DARK = deltaOf(AUTHORED_EGG_PALETTE.spotDark, AUTHORED_PALETTE.bodyMid);
/** How much of the body's colour reaches the shell: enough to tell eggs apart, little enough to stay eggshell. */
const SHELL_TINT = 0.5;
/** Below this a shell reads as grey rather than as a tint. */
export const MIN_SHELL_CHROMA = 0.024;

/**
 * The egg's colours, from the Blobbi's.
 *
 * The SHELL stays an eggshell: the authored cream, tinted halfway toward a
 * very pale pastel of the body's hue, then lit and shaded by the authored
 * offsets. The SPOTS are a pastel of the body (as the authored lavender is
 * of the authored purple), or of the marking colour when the Blobbi has
 * flank spots. An ACCENT colour marks one small spot and nothing else.
 *
 * With no body colour the palette is the official one, literal for literal;
 * `mapping: 'kit'` is the kit's Egg V1 rule (the shell painted in the body
 * colour itself).
 */
export function deriveEggPalette(colors: BlobbiColors | undefined, spotted: boolean): EggPalette {
  const base = sanitizeHex(colors?.base);
  const secondary = sanitizeHex(colors?.secondary);
  const accent = sanitizeHex(colors?.accent);
  const p: EggPalette = { ...AUTHORED_EGG_PALETTE };
  if (colors?.mapping === 'kit') {
    if (base) {
      p.shellLight = lighten(base, 45);
      p.shellMid = lighten(base, 22);
      p.shellDark = base;
    }
    const spot = secondary ?? (base ? lighten(base, 12) : undefined);
    if (spot) {
      p.spotLight = lighten(spot, 12);
      p.spotDark = spot;
      // Without a secondary colour the kit's spots are a faint tone of the shell.
      if (!secondary) [p.spotInner, p.spotOuter] = [0.55, 0.4];
      p.speckle = spot;
    }
    return p;
  }
  if (!base) return p;

  const body = hexToOklch(base);
  const pastel = oklchToHex({ l: 0.9, c: Math.min(0.075, body.c * 0.4), h: body.h });
  p.shellMid = mixOklab(AUTHORED_EGG_PALETTE.shellMid, pastel, SHELL_TINT);
  // Warm cream and a cool pastel cancel toward grey; a shell keeps at least a breath of its Blobbi's hue.
  const mixed = hexToOklch(p.shellMid);
  if (mixed.c < MIN_SHELL_CHROMA) p.shellMid = oklchToHex({ l: mixed.l, c: MIN_SHELL_CHROMA, h: body.h });
  const mid = hexToOklch(p.shellMid);
  p.shellLight = applyDelta(mid, SHELL_LIGHT, SHELL_MID);
  p.shellDark = applyDelta(mid, SHELL_DARK, SHELL_MID);

  // A spotted Blobbi's egg wears the marking colour; any other wears the body's.
  const source = spotted && secondary ? hexToOklch(mixOklab(base, secondary, 0.6)) : body;
  p.spotLight = applyDelta(source, SPOT_LIGHT, BODY_MID);
  p.spotDark = applyDelta(source, SPOT_DARK, BODY_MID);
  // A light body's pastel can fade into the shell: deepen the spots until they read.
  for (let i = 0; i < 6 && distance(p.spotDark, p.shellMid) < 0.13; i++) {
    const [light, dark] = [hexToOklch(p.spotLight), hexToOklch(p.spotDark)];
    p.spotLight = oklchToHex({ l: light.l - 0.04, c: light.c * 1.12, h: light.h });
    p.spotDark = oklchToHex({ l: dark.l - 0.04, c: dark.c * 1.12, h: dark.h });
  }
  p.speckle = p.spotDark;
  if (accent) {
    const a = hexToOklch(accent);
    p.accentLight = oklchToHex({ l: Math.min(0.86, a.l + 0.08), c: a.c * 0.8, h: a.h });
    p.accentDark = oklchToHex({ l: a.l - 0.04, c: a.c * 0.85, h: a.h });
  }
  return p;
}

// ─── Appearance ──────────────────────────────────────────────────────────────

/** An egg, resolved: everything in the official drawing's own units. */
export interface EggAppearance {
  width: number;
  height: number;
  taper: number;
  lean: number;
  highlight: number;
  spots: (EllipseShape & { accent: boolean })[];
  speckles: { cx: number; cy: number; r: number }[];
  /** A pale patch low on the shell: the trace of a belly patch. */
  patch: (EllipseShape & { opacity: number }) | null;
  palette: EggPalette;
}

const resolve = (range: GeneRange, gene: unknown) => range.base + clampGene(gene) * range.spread;
const unit01 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(0.999999, Math.max(0, v)) : 0);

/**
 * Resolve a genome to its egg. Pure and total; reads the egg's own genes,
 * the colours and the three markings, and nothing else of the Blobbi.
 */
export function deriveEgg(genome: BlobbiGenome): EggAppearance {
  const g = genome.egg;
  const t = genome.traits;
  const spotted = t.spots.enabled === true;

  // A plain egg has three or four spots; a spotted Blobbi's has five, or six when both its flanks are marked, and larger.
  const count = spotted ? (t.spots.side === 'both' ? 6 : 5) : g.spotCount === 3 ? 3 : 4;
  const boost = spotted ? 1.12 : 1;
  // With three spots, the low one is the one missing.
  const order = count === 3 ? [0, 1, 3] : [0, 1, 2, 3, 4, 5].slice(0, count);
  const hasAccent = sanitizeHex(genome.colors?.accent) !== undefined && genome.colors?.mapping !== 'kit';
  const spots = order.map((i) => {
    const canon = SPOTS[i];
    const gene = g.spots?.[i] ?? { dx: 0, dy: 0, size: 0, rotation: 0 };
    const size = (1 + 0.14 * clampGene(gene.size)) * boost;
    return {
      cx: canon.cx + 2.2 * clampGene(gene.dx),
      cy: canon.cy + 2.2 * clampGene(gene.dy),
      rx: canon.rx * size,
      ry: canon.ry * size,
      rotation: canon.rotation + 12 * clampGene(gene.rotation),
      accent: hasAccent && i === ACCENT_SPOT,
    };
  });

  // Freckles on the cheeks become fine speckles across the shell.
  const speckles = t.freckles.enabled
    ? (g.speckles ?? []).map((s) => {
        const angle = unit01(s.u) * Math.PI * 2;
        const reach = Math.sqrt(unit01(s.v)) * 0.8;
        return { cx: 50 + Math.cos(angle) * reach * 27, cy: 53 + Math.sin(angle) * reach * 35, r: 0.55 + 0.45 * unit01(s.size) };
      })
    : [];

  const patch = t.belly.enabled
    ? { cx: 50, cy: 69 + 2 * clampGene(t.belly.height), rx: 15 * (1 + 0.1 * clampGene(t.belly.size)), ry: 11 * (1 + 0.1 * clampGene(t.belly.size)), opacity: 0.42 }
    : null;

  return {
    width: resolve(EGG_RANGES.width, g.width),
    height: resolve(EGG_RANGES.height, g.height),
    taper: resolve(EGG_RANGES.taper, g.taper),
    lean: resolve(EGG_RANGES.lean, g.lean),
    highlight: resolve(EGG_RANGES.highlight, g.highlight),
    spots,
    speckles,
    patch,
    palette: deriveEggPalette(genome.colors, spotted),
  };
}

// ─── Geometry ────────────────────────────────────────────────────────────────

export interface EggGeometry {
  /** The shell outline, in root units. */
  shellD: string;
  /** The shell's box in root units. */
  bounds: { left: number; right: number; top: number; bottom: number };
  spots: (EllipseShape & { accent: boolean })[];
  speckles: { cx: number; cy: number; r: number }[];
  patch: (EllipseShape & { opacity: number }) | null;
  highlight: EllipseShape & { opacity: number };
  shadeD: string;
  /** Crack strokes to draw for the crack level. */
  cracks: { d: string; width: number }[];
  groundShadow: EllipseShape;
  /** The point the shell rocks about: where it touches the ground. */
  ground: Pt;
  palette: EggPalette;
}

export function buildEggGeometry(egg: EggAppearance, crack: EggCrack = 'none'): EggGeometry {
  /**
   * The shell's own deformation, applied to everything on it (spots, shade,
   * cracks ride the shell): wider about the axis, taller from the base, and
   * leaning more the higher up.
   */
  const warp = (x: number, y: number): Pt => {
    const up = (BASE_Y - y) / (BASE_Y - SHELL.top);
    return pt(50 + (x - 50) * egg.width + egg.lean * up, BASE_Y - (BASE_Y - y) * egg.height);
  };
  const root = (p: Pt): Pt => pt(AXIS + (p.x - 50) * EGG_UNIT, BOX_TOP + p.y * EGG_UNIT);
  const at = (x: number, y: number) => root(warp(x, y));

  // The shell: four anchors (crown, right, base, left). Roundness lengthens the crown's handles.
  const crownHandle = SHELL.topHandle * egg.taper;
  const sideUp = SHELL.sideUp * lerp(1, egg.taper, 0.4);
  const shell: [Pt, Pt, Pt][] = [
    [at(50 + crownHandle, SHELL.top), at(50 + SHELL.half, SHELL.sideY - sideUp), at(50 + SHELL.half, SHELL.sideY)],
    [at(50 + SHELL.half, SHELL.sideY + SHELL.sideDown), at(50 + SHELL.baseHandle, BASE_Y), at(50, BASE_Y)],
    [at(50 - SHELL.baseHandle, BASE_Y), at(50 - SHELL.half, SHELL.sideY + SHELL.sideDown), at(50 - SHELL.half, SHELL.sideY)],
    [at(50 - SHELL.half, SHELL.sideY - sideUp), at(50 - crownHandle, SHELL.top), at(50, SHELL.top)],
  ];
  const shellD = `M ${fmtPt(at(50, SHELL.top))} ${shell.map(([a, b, c]) => `C ${fmtPt(a)} ${fmtPt(b)} ${fmtPt(c)}`).join(' ')} Z`;

  const onShell = <T extends EllipseShape>(e: T): T => {
    const c = at(e.cx, e.cy);
    return { ...e, cx: c.x, cy: c.y, rx: e.rx * EGG_UNIT * egg.width, ry: e.ry * EGG_UNIT * egg.height };
  };
  const level = EGG_CRACKS.indexOf(crack);
  const cracks = CRACKS.slice(0, Math.max(0, level)).flatMap((group) =>
    group.map((stroke) => ({ d: `M ${stroke.points.map(([x, y]) => fmtPt(at(x, y))).join(' L ')}`, width: stroke.width * EGG_UNIT })),
  );
  const shade = SHADE.map(([x, y]) => at(x, y));
  let shadeD = `M ${fmtPt(shade[0])}`;
  for (let i = 1; i < shade.length; i += 3) shadeD += ` C ${fmtPt(shade[i])} ${fmtPt(shade[i + 1])} ${fmtPt(shade[i + 2])}`;

  const left = at(50 - SHELL.half, SHELL.sideY).x;
  const right = at(50 + SHELL.half, SHELL.sideY).x;
  return {
    shellD,
    bounds: { left: Math.min(left, right), right: Math.max(left, right), top: at(50, SHELL.top).y, bottom: at(50, BASE_Y).y },
    spots: egg.spots.map(onShell),
    speckles: egg.speckles.map((s) => {
      const c = at(s.cx, s.cy);
      return { cx: c.x, cy: c.y, r: s.r * EGG_UNIT };
    }),
    patch: egg.patch && onShell(egg.patch),
    highlight: onShell({ ...HIGHLIGHT, rx: HIGHLIGHT.rx * egg.highlight, ry: HIGHLIGHT.ry * egg.highlight }),
    shadeD: `${shadeD} Z`,
    cracks,
    groundShadow: { cx: AXIS, cy: GROUND + 6, rx: 26 * EGG_UNIT * egg.width, ry: 4 * EGG_UNIT },
    ground: pt(AXIS, GROUND),
    palette: egg.palette,
  };
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

const safe = (prefix: string | undefined) => (prefix ?? 'pb').replace(/[^a-zA-Z0-9_-]/g, '_') || 'pb';
const ellipseTag = (e: EllipseShape, attrs: string) =>
  `<ellipse cx="${fmt(e.cx)}" cy="${fmt(e.cy)}" rx="${fmt(Math.max(0, e.rx))}" ry="${fmt(Math.max(0, e.ry))}"${
    e.rotation ? ` transform="rotate(${fmt(e.rotation)} ${fmt(e.cx)} ${fmt(e.cy)})"` : ''
  } ${attrs}/>`;

export interface EggDrawOptions {
  idPrefix?: string;
  groundShadow?: boolean;
  motion?: BlobbiMotion;
  phase?: number;
}

/** The egg's `<defs>` and parts, in root units, back to front. Part names are the kit's. */
export function drawEgg(geo: EggGeometry, options: EggDrawOptions = {}): { defs: string; parts: string; rig: string } {
  const p = geo.palette;
  const id = (name: string) => `${safe(options.idPrefix)}-${name}`;
  let defs =
    // The kit's gradients: over each shape's own box, lit from the upper left.
    `<radialGradient id="${id('shell')}" cx="0.36" cy="0.3" r="0.85"><stop offset="0" stop-color="${p.shellLight}"/><stop offset="0.55" stop-color="${p.shellMid}"/><stop offset="1" stop-color="${p.shellDark}"/></radialGradient>` +
    `<radialGradient id="${id('spot')}" cx="0.4" cy="0.4"><stop offset="0" stop-color="${p.spotLight}" stop-opacity="${p.spotInner}"/><stop offset="1" stop-color="${p.spotDark}" stop-opacity="${p.spotOuter}"/></radialGradient>` +
    `<clipPath id="${id('shell-clip')}"><path d="${geo.shellD}"/></clipPath>`;
  if (p.accentLight && p.accentDark) {
    defs += `<radialGradient id="${id('accent')}" cx="0.4" cy="0.4"><stop offset="0" stop-color="${p.accentLight}" stop-opacity="0.95"/><stop offset="1" stop-color="${p.accentDark}" stop-opacity="0.85"/></radialGradient>`;
  }

  let parts = '';
  if (options.groundShadow) {
    defs += `<filter id="${id('blur')}" x="-0.2" y="-1" width="1.4" height="3"><feGaussianBlur stdDeviation="9"/></filter>`;
    parts += ellipseTag(geo.groundShadow, `data-part="ground-shadow" fill="#2f183f" opacity="0.18" filter="url(#${id('blur')})"`);
  }
  let shell = `<path data-part="egg-shell" d="${geo.shellD}" fill="url(#${id('shell')})"/>`;
  // Everything painted on the shell is clipped to it, so a warped shell never leaks a mark.
  shell += `<g clip-path="url(#${id('shell-clip')})">`;
  if (geo.patch) {
    defs += `<radialGradient id="${id('patch')}"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.7"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
    shell += ellipseTag(geo.patch, `data-part="egg-patch" fill="url(#${id('patch')})" opacity="${geo.patch.opacity}"`);
  }
  shell += `<g data-part="egg-spots">`;
  for (const spot of geo.spots) {
    shell += ellipseTag(spot, `data-part="${spot.accent ? 'egg-accent-spot' : 'egg-spot'}" fill="url(#${id(spot.accent && p.accentLight ? 'accent' : 'spot')})"`);
  }
  shell += `</g>`;
  if (geo.speckles.length > 0) {
    shell += `<g data-part="egg-speckles" fill="${p.speckle}" opacity="0.6">`;
    for (const s of geo.speckles) shell += `<circle data-part="egg-speckle" cx="${fmt(s.cx)}" cy="${fmt(s.cy)}" r="${fmt(s.r)}"/>`;
    shell += `</g>`;
  }
  shell += `</g>`;
  shell += ellipseTag(geo.highlight, `data-part="egg-highlight" fill="#ffffff" opacity="${geo.highlight.opacity}"`);
  shell += `<path data-part="egg-shade" d="${geo.shadeD}" fill="#000000" opacity="0.07"/>`;
  if (geo.cracks.length > 0) {
    shell += `<g data-part="egg-cracks" fill="none" stroke="${p.crack}" stroke-opacity="0.55" stroke-linecap="round" stroke-linejoin="round">`;
    for (const crack of geo.cracks) shell += `<path d="${crack.d}" stroke-width="${fmt(crack.width)}"/>`;
    shell += `</g>`;
  }
  parts += shell;

  // The whole shell is one rig part: it rocks on the point it rests on.
  const motion = options.motion ?? 'still';
  let rig = ' data-rig="body"';
  if (motion !== 'still') {
    if (options.phase === undefined) rig += ` style="transform-origin:${fmt(geo.ground.x)}px ${fmt(geo.ground.y)}px"`;
    else {
      const transform = poseTransform(motionPose(motion, 'front', 'body', options.phase, 1, 'rest'), geo.ground);
      if (transform) rig += ` transform="${transform}"`;
    }
  }
  return { defs, parts, rig };
}
