/**
 * MOTION: state applied to the same geometry. Never a second character.
 *
 * A drawing is a set of named RIG parts (the body, each leg, each arm, the
 * tuft, each antenna, ear and tail), each with a pivot. A motion is a pure
 * function from a phase (0..1 through one cycle) to a small transform per
 * rig part. That one definition is used two ways:
 *
 *  - BAKED: `state.phase` is given, and the transforms are written into the
 *    SVG. A frame is then plain markup: testable, rasterizable, usable for a
 *    sprite sheet, identical everywhere.
 *  - LIVE: no phase is given, the drawing carries `data-blobbi-rig-motion`, and
 *    `MOTION_STYLESHEET` (keyframes sampled from the very same functions)
 *    animates the rig parts in the browser.
 *
 * The walk is a walk, not a slide: each foot is planted and carried back
 * along the ground for half the cycle, then lifted and swung forward, half a
 * cycle apart from the other; the body rises over the planted foot; the arms
 * swing against the legs; and the soft parts (tuft, antennae, ears, tail)
 * follow a beat late.
 *
 * Reduced motion: the stylesheet stops everything under
 * `prefers-reduced-motion: reduce`.
 */
import type { View } from './plan/types';
import { PROCEDURAL_GENERATION } from './version';

export const MOTIONS = ['still', 'idle', 'walking'] as const;
export type BlobbiMotion = (typeof MOTIONS)[number];

export const RIG_PARTS = [
  'body',
  'left-leg',
  'right-leg',
  'near-leg',
  'far-leg',
  'left-arm',
  'right-arm',
  'near-arm',
  'far-arm',
  'tuft',
  'antenna',
  'ear',
  'tail',
] as const;
export type RigPart = (typeof RIG_PARTS)[number];

/** A rig part's transform at one instant: move, then turn and scale about its pivot. */
export interface RigPose {
  tx: number;
  ty: number;
  /** Degrees, clockwise on screen. */
  rot: number;
  sx: number;
  sy: number;
}

const REST: RigPose = { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 };
const TAU = Math.PI * 2;
const wave = (phase: number, lag = 0) => Math.sin(TAU * (phase - lag));
const frac = (p: number) => p - Math.floor(p);
/** Smooth start and stop. */
const ease = (u: number) => u * u * (3 - 2 * u);

/** Seconds per cycle. The walk's is the kit's. */
export const MOTION_DURATION: Record<Exclude<BlobbiMotion, 'still'>, number> = { idle: 4, walking: 0.62 };

/** Walk amounts, in root units at adult size. */
/** The far arm swings a little wider than the near one: it is what brings it into view past the body. */
const WALK = { stride: 27, lift: 30, step: 26, bounce: 7, armSwing: 13, farArmSwing: 22 } as const;

/** One foot of the profile walk: planted and carried back, then lifted and swung forward. */
function stride(phase: number): { tx: number; ty: number } {
  const p = frac(phase);
  if (p < 0.5) return { tx: WALK.stride * (1 - 4 * p), ty: 0 };
  const u = (p - 0.5) / 0.5;
  return { tx: WALK.stride * (-1 + 2 * ease(u)), ty: -WALK.lift * Math.sin(Math.PI * u) };
}

/** Secondary motion: the soft parts trail the body's bounce. */
function follow(part: RigPart, phase: number, amount: number): RigPose {
  switch (part) {
    case 'tuft':
      return { ...REST, rot: amount * 3.2 * wave(2 * phase, 0.16) };
    case 'antenna':
      return { ...REST, rot: amount * 6 * wave(2 * phase, 0.22) };
    case 'ear':
      return { ...REST, rot: amount * 3.6 * wave(2 * phase, 0.2) };
    case 'tail':
      return { ...REST, rot: amount * (7 * wave(phase, 0.12) + 2.5 * wave(2 * phase, 0.2)) };
    default:
      return REST;
  }
}

/** `legs` walks, `hop` floats and bobs (the baby), `rest` sits where it is and only rocks (the egg). */
export type Gait = 'legs' | 'hop' | 'rest';

/**
 * A body with no legs: the floating baby. It hovers when idle (a slow rise
 * and fall with its breath) and travels in quick bobs, as the kit's legless
 * drawings always have: up twice a cycle, a small sway, a squash on landing.
 */
function hopPose(motion: Exclude<BlobbiMotion, 'still'>, part: RigPart, p: number, scale: number): RigPose {
  if (motion === 'idle') {
    const breath = (1 - Math.cos(TAU * p)) / 2;
    if (part === 'body') return { ...REST, ty: -9 * scale * breath, sx: 1 + 0.01 * breath, sy: 1 + 0.014 * breath };
    if (part === 'antenna') return { ...REST, rot: 3 * wave(p, 0.12) };
    if (part === 'ear') return { ...REST, rot: 1.6 * wave(p, 0.15) };
    return REST;
  }
  if (part === 'body') {
    const up = Math.sin(TAU * p) ** 2;
    return { ...REST, ty: -20 * scale * up, rot: 1.4 * -Math.cos(TAU * p), sx: 1.025 - 0.04 * up, sy: 0.975 + 0.045 * up };
  }
  return follow(part, p, 1);
}

/**
 * The transform of one rig part at a phase. `scale` is the life stage's
 * size (a small body takes small steps) and `gait` is how it gets about.
 */
export function motionPose(motion: BlobbiMotion, view: View, part: RigPart, phase: number, scale = 1, gait: Gait = 'legs'): RigPose {
  if (motion === 'still') return REST;
  const p = frac(phase);
  if (gait === 'hop') return hopPose(motion, part, p, scale);
  if (gait === 'rest') {
    // An egg does not walk. Asked to move at all, it rocks gently on its base:
    // slowly when idle, a little quicker when something stirs inside.
    if (part !== 'body') return REST;
    return motion === 'idle' ? { ...REST, rot: 1.6 * wave(p) } : { ...REST, rot: 3.2 * wave(2 * p), ty: -2 * scale * Math.sin(TAU * p) ** 2 };
  }

  if (motion === 'idle') {
    // A slow breath: the body swells a little and settles.
    const breath = (1 - Math.cos(TAU * p)) / 2;
    if (part === 'body') return { ...REST, sx: 1 + 0.012 * breath, sy: 1 + 0.018 * breath };
    if (part === 'antenna') return { ...REST, rot: 2.5 * wave(p) };
    if (part === 'tuft') return { ...REST, rot: 1.2 * wave(p, 0.1) };
    if (part === 'ear') return { ...REST, rot: 1.4 * wave(p, 0.15) };
    if (part === 'tail') return { ...REST, rot: 4 * wave(p, 0.05) };
    return REST;
  }

  if (view === 'side') {
    switch (part) {
      case 'body':
        // Highest as the legs pass each other, lowest with both feet down.
        return { ...REST, ty: -WALK.bounce * scale * Math.sin(TAU * p) ** 2, rot: 0.9 * wave(p) };
      case 'near-leg': {
        const s = stride(p);
        return { ...REST, tx: s.tx * scale, ty: s.ty * scale };
      }
      case 'far-leg': {
        const s = stride(p + 0.5);
        return { ...REST, tx: s.tx * scale, ty: s.ty * scale };
      }
      // An arm swings back as the leg on its side comes forward.
      case 'near-arm':
        return { ...REST, rot: WALK.armSwing * Math.cos(TAU * p) };
      // The far arm swings against the near one, about its own (hidden) shoulder:
      // forward as the near arm goes back, when its hand can just be seen past the belly.
      case 'far-arm':
        return { ...REST, rot: -WALK.farArmSwing * Math.cos(TAU * p) };
      default:
        return follow(part, p, 1);
    }
  }

  // Front and back: the feet step in place, the body rocks from foot to foot.
  switch (part) {
    case 'body':
      return { ...REST, ty: -4 * scale * Math.sin(TAU * p) ** 2, rot: 1.1 * wave(p) };
    case 'left-leg':
      return { ...REST, ty: -WALK.step * scale * Math.max(0, wave(p)) + 4 * scale * Math.max(0, -wave(p)) };
    case 'right-leg':
      return { ...REST, ty: -WALK.step * scale * Math.max(0, -wave(p)) + 4 * scale * Math.max(0, wave(p)) };
    case 'left-arm':
      return { ...REST, rot: 4 * wave(p) };
    case 'right-arm':
      return { ...REST, rot: 4 * wave(p) };
    default:
      return follow(part, p, 0.8);
  }
}

const n = (v: number) => String(Math.round(v * 1000) / 1000);

/** A pose as an SVG `transform` attribute about a pivot, or '' at rest. */
export function poseTransform(pose: RigPose, pivot: { x: number; y: number }): string {
  if (pose === REST || (pose.tx === 0 && pose.ty === 0 && pose.rot === 0 && pose.sx === 1 && pose.sy === 1)) return '';
  let out = '';
  if (pose.tx !== 0 || pose.ty !== 0) out += `translate(${n(pose.tx)} ${n(pose.ty)})`;
  if (pose.rot !== 0) out += `${out ? ' ' : ''}rotate(${n(pose.rot)} ${n(pivot.x)} ${n(pivot.y)})`;
  if (pose.sx !== 1 || pose.sy !== 1) {
    out += `${out ? ' ' : ''}translate(${n(pivot.x)} ${n(pivot.y)}) scale(${n(pose.sx)} ${n(pose.sy)}) translate(${n(-pivot.x)} ${n(-pivot.y)})`;
  }
  return out;
}

const KEYFRAME_STEPS = 16;
const GEN = `[data-blobbi-generation="${PROCEDURAL_GENERATION}"]`;
/**
 * The attribute a live drawing's root carries. Not `data-blobbi-motion`: the
 * kit's wrapper stylesheet animates ANY element with that attribute (it is
 * how the V1 and V2 drawings move, as one piece), and a procedural drawing
 * moves by its rig parts instead, never as a whole on top of that.
 */
export const LIVE_MOTION_ATTRIBUTE = 'data-blobbi-rig-motion';

const FAMILIES = [['side', 'legs'], ['front', 'legs'], ['hop', 'hop'], ['rest', 'rest']] as const;
type Family = (typeof FAMILIES)[number][0];
const BASE_RULE = `${GEN} [data-rig]{transform-box:view-box;}\n`;
const REDUCED_RULE = `@media (prefers-reduced-motion: reduce){${GEN} [data-rig]{animation:none !important;}}\n`;

/** One motion of one family: keyframes sampled from `motionPose`, one animation per rig part that moves. */
function familyRules(motion: Exclude<BlobbiMotion, 'still'>, family: Family, gait: Gait): string {
  let css = '';
  // A hopping or resting body moves the same way whichever side it is seen from.
  const views = family === 'side' ? ['side'] : family === 'front' ? ['front', 'back'] : ['front', 'side', 'back'];
  for (const part of RIG_PARTS) {
    const frames: string[] = [];
    let moves = false;
    for (let i = 0; i <= KEYFRAME_STEPS; i++) {
      const pose = motionPose(motion, family === 'side' ? 'side' : 'front', part, i / KEYFRAME_STEPS, 1, gait);
      if (pose !== REST) moves = true;
      // Translations scale with the stage through a custom property on the root.
      frames.push(
        `${n((100 * i) / KEYFRAME_STEPS)}%{transform:translate(calc(var(--pb-scale,1)*${n(pose.tx)}px),calc(var(--pb-scale,1)*${n(pose.ty)}px)) rotate(${n(pose.rot)}deg) scale(${n(pose.sx)},${n(pose.sy)});}`,
      );
    }
    if (!moves) continue;
    const name = `pb-${motion}-${family}-${part}`;
    const selector = views.map((v) => `${GEN}[data-blobbi-gait="${gait}"][${LIVE_MOTION_ATTRIBUTE}="${motion}"][data-blobbi-view="${v}"] [data-rig="${part}"]`).join(',');
    // The delay is negative: the drawing starts part-way through its cycle (`--pb-phase`, 0 when unset).
    css += `${selector}{animation:${name} ${MOTION_DURATION[motion]}s linear infinite;animation-delay:calc(var(--pb-phase,0) * -${MOTION_DURATION[motion]}s);}\n@keyframes ${name}{${frames.join('')}}\n`;
  }
  return css;
}

/** The live stylesheet: keyframes sampled from `motionPose`, one animation per rig part and view family. */
function buildStylesheet(): string {
  let css = BASE_RULE;
  for (const motion of ['idle', 'walking'] as const) {
    for (const [family, gait] of FAMILIES) css += familyRules(motion, family, gait);
  }
  return css + REDUCED_RULE;
}

const sheets = new Map<string, string>();
/**
 * The part of the live stylesheet ONE drawing needs: its motion, for its
 * gait, seen from its side. The whole sheet is large (every motion of every
 * family); a host that mounts a sheet beside each moving Blobbi mounts this
 * instead. The rules are the same text, so mounting both is harmless.
 */
export function motionStylesheetFor(motion: BlobbiMotion, gait: Gait, view: View): string {
  if (motion === 'still') return '';
  const family: Family = gait === 'hop' ? 'hop' : gait === 'rest' ? 'rest' : view === 'side' ? 'side' : 'front';
  const key = `${motion}:${family}`;
  let css = sheets.get(key);
  if (css === undefined) {
    css = BASE_RULE + familyRules(motion, family, gait) + REDUCED_RULE;
    sheets.set(key, css);
  }
  return css;
}

/** Mount once in the host. Every selector is scoped to procedural Blobbis. */
export const MOTION_STYLESHEET = buildStylesheet();
