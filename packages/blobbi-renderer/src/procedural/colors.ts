/**
 * COLOUR: any hue, never a broken Blobbi.
 *
 * Two jobs live here.
 *
 * 1. `generateColors(seed)` picks an individual's TRAIT colours (body,
 *    marking, eye, accent) from anywhere on the hue wheel, in OKLCH so that
 *    "the same lightness" means the same lightness to the eye. Each hue gets
 *    the lightness it looks good at (yellow is only yellow when it is light;
 *    blue-violet can sit darker), chroma is a share of what the screen can
 *    show there, and one of three relationships (analogous, complementary
 *    accent, split-complementary accent) decides the eye and accent hues.
 *
 * 2. `derivePalette(colors)` turns trait colours into every ROLE the drawing
 *    paints with. The role offsets are not invented: they are measured from
 *    the authored purple (how much lighter the body's highlight is than its
 *    mid tone, how much darker and bluer the feet are, …) and applied to any
 *    body colour in OKLCH. Guardrails then keep the face readable whatever
 *    was asked for.
 *
 * With no trait colour the palette is the authored one, literal for literal.
 * `mapping: 'kit'` keeps the kit's Adult V2 RGB rule instead, so a Blobbi
 * that already has colours in the current generation can be drawn with the
 * exact hexes the current renderer gives it.
 */
import { geneRng } from './rng';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** A colour that may be interpolated into SVG attributes: bare hex, else undefined. */
export function sanitizeHex(value: unknown): string | undefined {
  if (typeof value !== 'string' || !HEX.test(value)) return undefined;
  const hex = value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value;
  return hex.toLowerCase();
}

// ─── Colour math ─────────────────────────────────────────────────────────────

export interface Oklch {
  /** Lightness 0..1. */
  l: number;
  /** Chroma, 0 (grey) to about 0.32. */
  c: number;
  /** Hue in degrees. */
  h: number;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const wrap = (h: number) => ((h % 360) + 360) % 360;

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = rgbOf(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: wrap((Math.atan2(B, A) * 180) / Math.PI) };
}

function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** The most chroma the screen can show at a lightness and hue. */
export function maxChroma(l: number, h: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear({ l, c: mid, h }))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** OKLCH to `#rrggbb`. Out-of-gamut colours keep their lightness and hue and give up chroma. */
export function oklchToHex(color: Oklch): string {
  const l = Math.min(1, Math.max(0, color.l));
  const c = Math.min(Math.max(0, color.c), maxChroma(l, color.h));
  const rgb = oklchToLinear({ l, c, h: color.h }).map((v) => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255));
  return `#${((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1)}`;
}

/** WCAG relative luminance and contrast ratio, for the readability guardrails. */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Perceptual distance between two colours (Euclidean in OKLab). */
export function distance(a: string, b: string): number {
  const p = hexToOklch(a);
  const q = hexToOklch(b);
  const ax = p.c * Math.cos((p.h * Math.PI) / 180);
  const ay = p.c * Math.sin((p.h * Math.PI) / 180);
  const bx = q.c * Math.cos((q.h * Math.PI) / 180);
  const by = q.c * Math.sin((q.h * Math.PI) / 180);
  return Math.hypot(p.l - q.l, ax - bx, ay - by);
}

/** A blend of two colours in OKLab (perceptually even), `t` of the way from `a` to `b`. */
export function mixOklab(a: string, b: string, t: number): string {
  const p = hexToOklch(a);
  const q = hexToOklch(b);
  const ax = p.c * Math.cos((p.h * Math.PI) / 180);
  const ay = p.c * Math.sin((p.h * Math.PI) / 180);
  const bx = q.c * Math.cos((q.h * Math.PI) / 180);
  const by = q.c * Math.sin((q.h * Math.PI) / 180);
  const x = ax + (bx - ax) * t;
  const y = ay + (by - ay) * t;
  return oklchToHex({ l: p.l + (q.l - p.l) * t, c: Math.hypot(x, y), h: wrap((Math.atan2(y, x) * 180) / Math.PI) });
}

/** `over` painted on `under` at an opacity. */
export function composite(over: string, under: string, opacity: number): string {
  const a = rgbOf(over);
  const b = rgbOf(under);
  const mix = a.map((v, i) => Math.round((v * opacity + b[i] * (1 - opacity)) * 255));
  return `#${((1 << 24) + (mix[0] << 16) + (mix[1] << 8) + mix[2]).toString(16).slice(1)}`;
}

// The kit's RGB shifts, kept for `mapping: 'kit'`.
const clampByte = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);
function shift(color: string, amount: number): string {
  const num = parseInt(color.slice(1), 16);
  const r = clampByte((num >> 16) + amount);
  const g = clampByte(((num >> 8) & 0xff) + amount);
  const b = clampByte((num & 0xff) + amount);
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}
export const lighten = (color: string, percent: number) => shift(color, Math.round(2.55 * percent));
export const darken = (color: string, percent: number) => shift(color, -Math.round(2.55 * percent));

// ─── Trait colours and palette ───────────────────────────────────────────────

export const COLOR_SCHEMES = ['analogous', 'complementary', 'split'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** The trait colours. Each is optional: absent means the artwork's own. */
export interface BlobbiColors {
  /** The body's mid tone; limbs, feet and line work follow it. */
  base?: string;
  /** Markings. */
  secondary?: string;
  /** The iris. */
  eye?: string;
  /** Small details: antenna tips, the tip of a curled tail. Absent: they use the limb colours. */
  accent?: string;
  /** `'kit'` derives roles with the Adult V2 RGB rule instead of the OKLCH one. */
  mapping?: 'kit';
}

/** Every literal colour the drawing uses, by role. */
export interface BlobbiPalette {
  bodyLight: string;
  bodyMid: string;
  bodyDark: string;
  limbLight: string;
  limbDark: string;
  footLight: string;
  footDark: string;
  /** Eyebrows, tuft details, freckles, tail veins. */
  line: string;
  /** Markings (the authored side-pattern colour). */
  marking: string;
  irisLight: string;
  irisMid: string;
  irisDark: string;
  accentLight: string;
  accentDark: string;
  hornLight: string;
  hornDark: string;
  cheek: string;
  /** The belly patch (drawn at low opacity). */
  belly: string;
  // The baby's own paint (the official Baby V1): a flatter body, a slate eye, a paler blush.
  babyLight: string;
  babyMid: string;
  babyDark: string;
  babyEyeLight: string;
  babyEyeDark: string;
  babyCheek: string;
  // Lighting and features, never traits.
  pupil: string;
  white: string;
  feature: string;
  bodyShadow: string;
  groundShadow: string;
}

export const AUTHORED_PALETTE: Readonly<BlobbiPalette> = Object.freeze({
  bodyLight: '#c792ff',
  bodyMid: '#8749ef',
  bodyDark: '#5420c8',
  limbLight: '#9c61f4',
  limbDark: '#5422bc',
  footLight: '#8248e8',
  footDark: '#46199f',
  line: '#4f239e',
  marking: '#481696',
  irisLight: '#54308d',
  irisMid: '#201538',
  irisDark: '#090711',
  // The authored drawing has no accent: details use the limb colours.
  accentLight: '#9c61f4',
  accentDark: '#5422bc',
  hornLight: '#ffe6b8',
  hornDark: '#e0a468',
  cheek: '#ff7ab7',
  belly: '#ffffff',
  // `#8b5cf6` / `#7c3aed` / `#6d28d9`, `#374151` / `#1e293b`, `rgba(255,182,193,…)`.
  babyLight: '#8b5cf6',
  babyMid: '#7c3aed',
  babyDark: '#6d28d9',
  babyEyeLight: '#374151',
  babyEyeDark: '#1e293b',
  babyCheek: '#ffb6c1',
  pupil: '#080711',
  white: '#ffffff',
  feature: '#21102e',
  bodyShadow: '#2d0d68',
  groundShadow: '#2f183f',
});

/** How a role differs from the tone it is derived from, measured on the authored palette. */
export interface RoleDelta {
  dl: number;
  chroma: number;
  dh: number;
}

export function deltaOf(role: string, from: string): RoleDelta {
  const a = hexToOklch(role);
  const b = hexToOklch(from);
  let dh = a.h - b.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return { dl: a.l - b.l, chroma: b.c === 0 ? 1 : a.c / b.c, dh };
}

/**
 * Apply an authored offset to another tone. Lightness offsets are scaled to
 * the headroom the new tone has, so a light yellow's highlight does not clip
 * to white and a dark blue's shadow does not clip to black.
 */
export function applyDelta(tone: Oklch, delta: RoleDelta, reference: Oklch): string {
  const l = delta.dl >= 0 ? tone.l + (delta.dl * (1 - tone.l)) / (1 - reference.l) : tone.l + (delta.dl * tone.l) / reference.l;
  return oklchToHex({ l, c: tone.c * delta.chroma, h: wrap(tone.h + delta.dh) });
}

const AUTHORED_MID = hexToOklch(AUTHORED_PALETTE.bodyMid);
const AUTHORED_IRIS = hexToOklch(AUTHORED_PALETTE.irisMid);
const BODY_ROLES = ['bodyLight', 'bodyDark', 'limbLight', 'limbDark', 'footLight', 'footDark', 'line'] as const;
const BODY_DELTAS = Object.fromEntries(BODY_ROLES.map((role) => [role, deltaOf(AUTHORED_PALETTE[role], AUTHORED_PALETTE.bodyMid)])) as Record<
  (typeof BODY_ROLES)[number],
  RoleDelta
>;
// The baby's body tones, measured against the ADULT's mid tone: the same
// individual is a little bluer and much flatter-shaded as a baby.
const BABY_ROLES = ['babyLight', 'babyMid', 'babyDark'] as const;
const BABY_DELTAS = Object.fromEntries(BABY_ROLES.map((role) => [role, deltaOf(AUTHORED_PALETTE[role], AUTHORED_PALETTE.bodyMid)])) as Record<
  (typeof BABY_ROLES)[number],
  RoleDelta
>;
const IRIS_LIGHT = deltaOf(AUTHORED_PALETTE.irisLight, AUTHORED_PALETTE.irisMid);
const IRIS_DARK = deltaOf(AUTHORED_PALETTE.irisDark, AUTHORED_PALETTE.irisMid);

/** Cheek colours to choose from: the authored pink first, then alternatives for bodies it would vanish on. */
const CHEEKS = ['#ff7ab7', '#ff8a65', '#ef4f86', '#ffd0e4'] as const;
/** The authored cheek is drawn at this opacity; a cheek must still read at it. */
const CHEEK_OPACITY = 0.74;
const CHEEK_MIN_DISTANCE = 0.085;

/** The cheek that stays visible on this body: the authored pink unless it would disappear. */
export function chooseCheek(bodyMid: string): string {
  const seen = (cheek: string) => distance(composite(cheek, bodyMid, CHEEK_OPACITY), bodyMid);
  if (seen(CHEEKS[0]) >= CHEEK_MIN_DISTANCE) return CHEEKS[0];
  return [...CHEEKS].sort((a, b) => seen(b) - seen(a))[0];
}

/**
 * Horns are a warm honey, dark enough to stand out against a pale page as
 * well as against the body. On a body of nearly that colour they turn brown
 * or ivory.
 */
function hornFor(bodyMid: string): { light: string; dark: string } {
  const honey = { light: AUTHORED_PALETTE.hornLight, dark: AUTHORED_PALETTE.hornDark };
  const apart = (horn: { light: string; dark: string }) => Math.min(distance(horn.light, bodyMid), distance(horn.dark, bodyMid));
  if (apart(honey) >= 0.16) return honey;
  // On a honey-coloured body: whichever of honey, brown and ivory is furthest from it.
  const others = [honey, { light: '#c98f5e', dark: '#96603a' }, { light: '#fffaf0', dark: '#e6dccb' }];
  return others.sort((a, b) => apart(b) - apart(a))[0];
}

function kitPalette(p: BlobbiPalette, base?: string, secondary?: string, eye?: string) {
  if (base) {
    p.bodyLight = lighten(base, 26);
    p.bodyMid = base;
    p.bodyDark = darken(base, 19);
    p.limbLight = lighten(base, 8);
    p.limbDark = darken(base, 20);
    p.footLight = darken(base, 2);
    p.footDark = darken(base, 27);
    p.line = darken(base, 22);
    p.accentLight = p.limbLight;
    p.accentDark = p.limbDark;
    // The kit's Baby V1 rule: the base colour is the body's darkest stop.
    p.babyLight = lighten(base, 40);
    p.babyMid = lighten(base, 20);
    p.babyDark = base;
  }
  if (secondary) {
    p.marking = secondary;
    // With a secondary colour the kit's baby is two-toned: lit in it, shaded in the base.
    if (base) {
      p.babyLight = secondary;
      p.babyMid = lighten(secondary, 20);
    }
  }
  if (eye) {
    p.irisLight = lighten(eye, 20);
    p.irisMid = eye;
    p.irisDark = darken(eye, 9);
    p.babyEyeLight = lighten(eye, 30);
    p.babyEyeDark = eye;
  }
}

/** Resolve trait colours to a full palette. Invalid colours count as absent. */
export function derivePalette(colors: BlobbiColors | undefined): BlobbiPalette {
  const base = sanitizeHex(colors?.base);
  const secondary = sanitizeHex(colors?.secondary);
  const eye = sanitizeHex(colors?.eye);
  const accent = sanitizeHex(colors?.accent);
  const p: BlobbiPalette = { ...AUTHORED_PALETTE };
  if (colors?.mapping === 'kit') {
    kitPalette(p, base, secondary, eye);
    return p;
  }
  if (base) {
    const mid = hexToOklch(base);
    p.bodyMid = base;
    for (const role of BODY_ROLES) p[role] = applyDelta(mid, BODY_DELTAS[role], AUTHORED_MID);
    p.accentLight = p.limbLight;
    p.accentDark = p.limbDark;
    p.cheek = chooseCheek(base);
    for (const role of BABY_ROLES) p[role] = applyDelta(mid, BABY_DELTAS[role], AUTHORED_MID);
    // The baby keeps its paler blush wherever the adult keeps the authored pink.
    p.babyCheek = p.cheek === AUTHORED_PALETTE.cheek ? AUTHORED_PALETTE.babyCheek : p.cheek;
    const horn = hornFor(base);
    p.hornLight = horn.light;
    p.hornDark = horn.dark;
  }
  if (secondary) p.marking = secondary;
  if (eye) {
    const mid = hexToOklch(eye);
    p.irisMid = eye;
    p.irisLight = applyDelta(mid, IRIS_LIGHT, AUTHORED_IRIS);
    p.irisDark = applyDelta(mid, IRIS_DARK, AUTHORED_IRIS);
    // The baby's eye is one disc: the iris colour, a little lit.
    p.babyEyeLight = oklchToHex({ l: mid.l + 0.11, c: mid.c, h: mid.h });
    p.babyEyeDark = eye;
  }
  if (accent) {
    const mid = hexToOklch(accent);
    p.accentLight = oklchToHex({ l: mid.l + 0.07, c: mid.c, h: mid.h });
    p.accentDark = oklchToHex({ l: mid.l - 0.13, c: mid.c, h: mid.h });
  }
  return p;
}

// ─── Generation ──────────────────────────────────────────────────────────────

/**
 * The lightness each hue is at its best as a Blobbi body, as (hue, lightness)
 * stops round the OKLCH wheel. Yellows and limes must be light or they turn
 * to mustard and olive; blues and violets can be deeper. The stop near 293°
 * is the authored purple's own lightness.
 */
const HUE_LIGHTNESS: readonly (readonly [number, number])[] = [
  [0, 0.7],
  [30, 0.68],
  [60, 0.75],
  [90, 0.83],
  [110, 0.86],
  [135, 0.82],
  [150, 0.78],
  [180, 0.77],
  [210, 0.75],
  [240, 0.68],
  [265, 0.62],
  [293, AUTHORED_MID.l + 0.02],
  [320, 0.64],
  [345, 0.68],
  [360, 0.7],
];

export function bodyLightnessFor(hue: number): number {
  const h = wrap(hue);
  for (let i = 1; i < HUE_LIGHTNESS.length; i++) {
    const [h0, l0] = HUE_LIGHTNESS[i - 1];
    const [h1, l1] = HUE_LIGHTNESS[i];
    if (h <= h1) return l0 + ((l1 - l0) * (h - h0)) / (h1 - h0);
  }
  return HUE_LIGHTNESS[0][1];
}

/** The body may not be darker than this: the mouth and brows are dark lines and need a light ground. */
export const MIN_BODY_LIGHTNESS = 0.565;
/** Nor lighter than this: the eye whites and the shine need a body to stand out from. */
export const MAX_BODY_LIGHTNESS = 0.87;
/** Above this chroma a body is neon rather than Blobbi (the authored purple is 0.22). */
export const MAX_BODY_CHROMA = 0.205;
/** Below this chroma a body reads as grey mud rather than as a colour. */
export const MIN_BODY_CHROMA = 0.075;

export interface GeneratedColors extends Required<Pick<BlobbiColors, 'base' | 'secondary' | 'eye'>> {
  accent?: string;
  scheme: ColorScheme;
}

/**
 * An individual's trait colours from its seed. Deterministic; each choice
 * has its own keyed stream. The hue is the first draw of `color.base`, as it
 * was before the generator grew, so a seed keeps its hue family.
 */
export function generateColors(seed: string): GeneratedColors {
  const hue = geneRng(seed, 'color.base').range(0, 360);
  const tone = geneRng(seed, 'color.tone');
  const l = Math.min(MAX_BODY_LIGHTNESS, Math.max(MIN_BODY_LIGHTNESS, bodyLightnessFor(hue) + tone.centered() * 0.045));
  // Between soft and vivid, never grey: a share of what the screen can show.
  const limit = maxChroma(l, hue);
  // The floor: yellows and limes go khaki the moment they lose chroma, so
  // they keep the most of it; elsewhere under about three quarters reads as
  // dusty (salmons) or grey (teals).
  const floor = hue > 55 && hue < 135 ? 0.88 : 0.74;
  // The ceiling: where the screen can show far more chroma than the authored
  // purple has (magenta, violet, lime), full strength is fluorescent.
  const c = Math.min(limit, MAX_BODY_CHROMA, Math.max(MIN_BODY_CHROMA, limit * (floor + (0.96 - floor) * tone.next())));
  const base = oklchToHex({ l, c, h: hue });

  const roll = geneRng(seed, 'color.scheme').next();
  const scheme: ColorScheme = roll < 0.5 ? 'analogous' : roll < 0.75 ? 'complementary' : 'split';
  const away = geneRng(seed, 'color.accent');
  const accentHue = scheme === 'complementary' ? hue + 180 : hue + (away.chance(0.5) ? 150 : -150);

  // Markings stay tone on tone whatever the scheme: a darker neighbour of the body.
  const mark = geneRng(seed, 'color.secondary');
  const secondary = oklchToHex({
    l: l - mark.range(0.2, 0.27),
    c: c * 1.05,
    h: wrap(hue + (mark.chance(0.5) ? 1 : -1) * mark.range(16, 38)),
  });

  // The iris is always dark enough to read on the eye white; its hue follows the scheme.
  const iris = geneRng(seed, 'color.eye');
  const eyeHue = scheme === 'analogous' ? hue + iris.range(-30, 30) : accentHue;
  const eye = oklchToHex({ l: iris.range(0.22, 0.3), c: iris.range(0.05, 0.11), h: wrap(eyeHue) });

  const colors: GeneratedColors = { base, secondary, eye, scheme };
  if (scheme !== 'analogous') {
    const al = Math.min(0.82, Math.max(0.6, bodyLightnessFor(accentHue)));
    colors.accent = oklchToHex({ l: al, c: maxChroma(al, accentHue) * 0.72, h: wrap(accentHue) });
  }
  return colors;
}
