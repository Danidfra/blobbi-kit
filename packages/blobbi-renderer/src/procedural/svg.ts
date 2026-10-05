/**
 * SVG WRITING: the only place markup is produced.
 *
 * The view builders decide WHAT is drawn and in what order; the helpers here
 * write each kind of part the same way in every view, so an eye is an eye
 * and an arm is an arm whichever side the Blobbi is seen from. Part names
 * follow the kit's Adult V2 `data-part` contract where one exists.
 */
import type { BlobbiPalette } from './colors';
import type { BrowGeometry, CheekGeometry, EyeGeometry, MouthGeometry } from './face';
import { type DebugGroup, type DebugMark, type EllipseShape, type Pt, fmt } from './geometry';
import type { ArmGeometry, Box, FootGeometry, TuftGeometry } from './limbs';
import { motionPose, poseTransform, type BlobbiMotion, type Gait, type RigPart } from './motion';
import type { StageLook, View } from './plan/types';
import type { Appendage, PaintRole, Prim } from './traits/appendages';
import type { MarkingsGeometry } from './traits/markings';

export interface RenderOptions {
  /** Namespace for gradient, filter and clip ids. Required when several Blobbis share a page. */
  idPrefix?: string;
  /** Keep the artwork's ground shadow. Off by default, like the kit: the floor belongs to the host. */
  groundShadow?: boolean;
  /** Draw the construction overlay: `true` for everything, or the groups to show. */
  debug?: boolean | readonly DebugGroup[];
  /**
   * `shared` (default): every stage in one viewBox to one scale, so a baby is
   * small beside an adult. `stage`: the stage's own box, as its official
   * artwork is framed (the baby fills its square).
   */
  frame?: 'shared' | 'stage';
  /**
   * Live motion only: where in its cycle this drawing starts, 0..1. A host
   * with many Blobbis gives each its own, so a crowd does not move in step.
   * Ignored by a still drawing and by a baked frame (which has `state.phase`).
   */
  motionOffset?: number;
  /**
   * Replace palette roles after they are derived. For EXPERIMENTS only (the
   * trait-colour sheets use it to try alternatives side by side); a real
   * drawing gets its colours from the genome.
   */
  paletteOverride?: Partial<BlobbiPalette>;
}

/** How the rig is posed: live (the stylesheet animates it) or baked at a phase. */
export interface RigState {
  motion: BlobbiMotion;
  view: View;
  phase: number | undefined;
  scale: number;
  gait: Gait;
}

const safeId = (prefix: string | undefined) => (prefix ?? 'pb').replace(/[^a-zA-Z0-9_-]/g, '_') || 'pb';
export const radius = (r: number) => fmt(Math.max(0, r));

export function ellipse(e: EllipseShape, attrs: string): string {
  const rotate = e.rotation ? ` transform="rotate(${fmt(e.rotation)} ${fmt(e.cx)} ${fmt(e.cy)})"` : '';
  return `<ellipse cx="${fmt(e.cx)}" cy="${fmt(e.cy)}" rx="${radius(e.rx)}" ry="${radius(e.ry)}"${rotate} ${attrs}/>`;
}

/** Everything a drawing accumulates: definitions, ids, colours, the rig. */
export class Drawing {
  defs = '';
  private boxes = 0;
  private clips = 0;
  readonly prefix: string;

  constructor(
    prefix: string | undefined,
    readonly palette: BlobbiPalette,
    readonly rig: RigState,
    readonly look: StageLook,
  ) {
    this.prefix = safeId(prefix);
    const c = palette;
    const linear = (name: string, x2: number, y2: number, a: string, b: string) =>
      `<linearGradient id="${this.id(name)}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
    this.defs +=
      linear('limb', 1, 1, c.limbLight, c.limbDark) +
      linear('foot', 0, 1, c.footLight, c.footDark) +
      (look.eye === 'simple'
        ? // The Baby V1 eye: a faintly shaded white and one dark disc, both lit from the upper left.
          `<radialGradient id="${this.id('eye-white')}" cx="0.3" cy="0.3"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f1f5f9"/></radialGradient>` +
          `<radialGradient id="${this.id('iris')}" cx="0.3" cy="0.3"><stop offset="0" stop-color="${c.babyEyeLight}"/><stop offset="1" stop-color="${c.babyEyeDark}"/></radialGradient>`
        : `<radialGradient id="${this.id('iris')}" cx="0.34" cy="0.24" r="0.78"><stop offset="0" stop-color="${c.irisLight}"/><stop offset="0.55" stop-color="${c.irisMid}"/><stop offset="1" stop-color="${c.irisDark}"/></radialGradient>`);
  }

  /** The body's mid tone at this stage: what a lid is tinted with. */
  get skin(): string {
    return this.look.body === 'v1' ? this.palette.babyMid : this.palette.bodyMid;
  }

  /** The colour of the face's dark lines at this stage. */
  get feature(): string {
    return this.look.eye === 'simple' ? '#1e293b' : this.palette.feature;
  }

  id(name: string): string {
    return `${this.prefix}-${name}`;
  }

  url(name: string): string {
    return `url(#${this.id(name)})`;
  }

  /** Gradients only some individuals need are defined the first time they are used. */
  private ensure(name: 'accent' | 'horn') {
    if (this.defs.includes(`id="${this.id(name)}"`)) return;
    const [a, b] = name === 'accent' ? [this.palette.accentLight, this.palette.accentDark] : [this.palette.hornLight, this.palette.hornDark];
    this.defs += `<linearGradient id="${this.id(name)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  }

  paint(role: PaintRole): string {
    switch (role) {
      case 'limb':
        return this.url('limb');
      case 'accent':
      case 'horn':
        this.ensure(role);
        return this.url(role);
      case 'line':
        return this.palette.line;
      case 'white':
        return this.palette.white;
      case 'cheek':
        return this.palette.cheek;
      case 'marking':
        return this.palette.marking;
      case 'shade':
        return this.look.body === 'v1' ? this.palette.babyDark : this.palette.bodyDark;
      case 'belly': {
        // A glow, not a disc: light in the middle, nothing at the edge.
        if (!this.defs.includes(`id="${this.id('belly')}"`)) {
          this.defs += `<radialGradient id="${this.id('belly')}"><stop offset="0" stop-color="${this.palette.belly}" stop-opacity="1"/><stop offset="0.55" stop-color="${this.palette.belly}" stop-opacity="0.7"/><stop offset="1" stop-color="${this.palette.belly}" stop-opacity="0"/></radialGradient>`;
        }
        return this.url('belly');
      }
    }
  }

  /** The body's radial gradient, in user space, so lids and patches can share it seamlessly. */
  bodyGradient(g: { cx: number; cy: number; rx: number; ry: number }, mid: number) {
    const c = this.palette;
    const [light, middle, dark] = this.look.body === 'v1' ? [c.babyLight, c.babyMid, c.babyDark] : [c.bodyLight, c.bodyMid, c.bodyDark];
    this.defs +=
      `<radialGradient id="${this.id('body')}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${fmt(g.cx)} ${fmt(g.cy)}) scale(${fmt(g.rx)} ${fmt(g.ry)})">` +
      `<stop offset="0" stop-color="${light}"/><stop offset="${mid}" stop-color="${middle}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`;
  }

  blur(name: string, stdDeviation: number, region: string) {
    this.defs += `<filter id="${this.id(name)}" ${region}><feGaussianBlur stdDeviation="${fmt(stdDeviation)}"/></filter>`;
  }

  /** The limb gradient stretched corner to corner over a box. */
  limbOver(box: Box): string {
    const name = `limb-${this.boxes++}`;
    this.defs +=
      `<linearGradient id="${this.id(name)}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="1" gradientTransform="translate(${fmt(box.x1)} ${fmt(box.y1)}) scale(${fmt(box.x2 - box.x1)} ${fmt(box.y2 - box.y1)})">` +
      `<stop offset="0" stop-color="${this.palette.limbLight}"/><stop offset="1" stop-color="${this.palette.limbDark}"/></linearGradient>`;
    return this.url(name);
  }

  clip(content: string): string {
    const name = `clip-${this.clips++}`;
    this.defs += `<clipPath id="${this.id(name)}">${content}</clipPath>`;
    return this.url(name);
  }

  /**
   * Attributes for a rig part. Live: its pivot, for the stylesheet to turn
   * it about. Baked: the transform of this frame.
   */
  rigAttrs(part: RigPart, pivot: Pt): string {
    const name = ` data-rig="${part}"`;
    const { motion, view, phase, scale, gait } = this.rig;
    if (motion === 'still') return name;
    if (phase === undefined) return `${name} style="transform-origin:${fmt(pivot.x)}px ${fmt(pivot.y)}px"`;
    const transform = poseTransform(motionPose(motion, view, part, phase, scale, gait), pivot);
    return transform ? `${name} transform="${transform}"` : name;
  }
}

// ─── Parts ───────────────────────────────────────────────────────────────────

export function drawEye(d: Drawing, eye: EyeGeometry): string {
  const c = d.palette;
  const part = eye.part;
  const simple = d.look.eye === 'simple';
  // On the front the inner parts are sided (`left-iris`); on the profile they are not (`iris`).
  const inner = part === 'eye' ? '' : `${part.replace('-eye', '')}-`;
  const lid = eye.lid;
  if (lid?.closed) {
    return (
      `<g data-part="${part}" data-blobbi-eyes="closed">` +
      `<path data-part="${part}-closed" d="${lid.line}" fill="none" stroke="${d.feature}" stroke-width="${fmt(lid.lineWidth)}" stroke-linecap="round"/>` +
      `</g>`
    );
  }
  let out = `<g data-part="${part}">`;
  out += ellipse(eye.white, `data-part="${part}-white" fill="${simple ? d.url('eye-white') : c.white}"`);
  out += `<g data-part="${part}-inner">`;
  if (!simple) out += ellipse(eye.iris, `data-part="${inner}iris" fill="${d.url('iris')}"`);
  out += ellipse(eye.pupil, `data-part="${inner}pupil" fill="${simple ? d.url('iris') : c.pupil}"`);
  out += ellipse(eye.highlight, `data-part="${part}-highlight-primary" fill="${c.white}"`);
  if (!simple) out += ellipse(eye.glint, `data-part="${part}-highlight-secondary" fill="${c.white}" opacity="${fmt(eye.glint.opacity)}"`);
  out += `</g>`;
  if (lid) {
    // The lid is the Blobbi's own skin: the body gradient, in the body's
    // user space, so it is seamless with the head around the eye. The kit's
    // flat lid tint is laid over it and fades as the eye shuts. The clip is
    // a hair larger than the eye white, so no white fringe survives.
    const clip = d.clip(ellipse({ ...eye.white, rx: eye.white.rx + 0.7, ry: eye.white.ry + 0.7 }, ''));
    const shapes = [lid.upper, lid.lower].filter((s): s is string => s !== null);
    out += `<g data-part="${part}-lid" clip-path="${clip}">`;
    for (const s of shapes) out += `<path d="${s}" fill="${d.url('body')}"/>`;
    if (lid.tint > 0) for (const s of shapes) out += `<path d="${s}" fill="${d.skin}" opacity="${fmt(lid.tint)}"/>`;
    out += `</g>`;
    out += `<path data-part="${part}-lid-edge" d="${lid.line}" fill="none" stroke="${d.feature}" stroke-width="${fmt(lid.lineWidth)}" stroke-linecap="round" opacity="${fmt(lid.lineOpacity)}"/>`;
  }
  return out + `</g>`;
}

export function drawBrow(d: Drawing, brow: BrowGeometry): string {
  return `<path data-part="${brow.part}" d="${brow.d}" fill="none" stroke="${d.palette.line}" stroke-width="${fmt(brow.strokeWidth)}" stroke-linecap="round" opacity="${fmt(brow.opacity)}"/>`;
}

export function drawCheek(d: Drawing, cheek: CheekGeometry): string {
  const c = d.palette;
  const color = d.look.eye === 'simple' ? c.babyCheek : c.cheek;
  // The profile's cheek is two bare ellipses in the kit; the front's are grouped.
  const base = cheek.part === 'cheek' ? 'cheek' : `${cheek.part}-base`;
  return (
    `<g data-part="${cheek.part === 'cheek' ? 'cheek-group' : cheek.part}">` +
    ellipse(cheek.base, `data-part="${base}" fill="${color}" opacity="${fmt(cheek.baseOpacity)}"`) +
    (cheek.highlightOpacity > 0 ? ellipse(cheek.highlight, `data-part="${cheek.part}-highlight" fill="${c.white}" opacity="${fmt(cheek.highlightOpacity)}"`) : '') +
    `</g>`
  );
}

export function drawMouth(d: Drawing, mouth: MouthGeometry): string {
  let stroke = d.feature;
  if (d.look.eye === 'simple') {
    // The Baby V1 mouth is stroked with a gradient, lighter at its corners.
    // Stated in user space: a flat mouth has no height for a box gradient to use.
    d.defs +=
      `<linearGradient id="${d.id('mouth')}" gradientUnits="userSpaceOnUse" x1="${fmt(mouth.left.x)}" y1="0" x2="${fmt(mouth.right.x)}" y2="0">` +
      `<stop offset="0" stop-color="#374151"/><stop offset="0.5" stop-color="#1e293b"/><stop offset="1" stop-color="#374151"/></linearGradient>`;
    stroke = d.url('mouth');
  }
  return `<path data-part="mouth" d="${mouth.d}" fill="${mouth.open ? d.feature : 'none'}" stroke="${stroke}" stroke-width="${fmt(mouth.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function drawFoot(d: Drawing, foot: FootGeometry): string {
  const opacity = foot.opacity < 1 ? ` opacity="${fmt(foot.opacity)}"` : '';
  // The leg group is what the walk moves; the foot keeps its own rotation inside it.
  return (
    `<g data-part="${foot.side}-leg"${d.rigAttrs(`${foot.side}-leg` as RigPart, { x: foot.foot.cx, y: foot.foot.cy })}>` +
    ellipse(foot.foot, `data-part="${foot.side}-foot" fill="${d.url('foot')}"${opacity}`) +
    `</g>`
  );
}

export function drawArm(d: Drawing, arm: ArmGeometry): string {
  const opacity = arm.opacity < 1 ? ` opacity="${fmt(arm.opacity)}"` : '';
  return (
    `<g${d.rigAttrs(`${arm.side}-arm` as RigPart, arm.shoulder)}>` +
    `<path data-part="${arm.side}-arm" d="${arm.d}" fill="${d.limbOver(arm.box)}"${opacity}/>` +
    `</g>`
  );
}

/** How far forward of the crown's middle the tuft's leaves root: the second leaf is the nearer one. */
export const TUFT_FORE = { main: 0, secondary: 0.12 } as const;

function drawAppendage(d: Drawing, a: Appendage): string {
  const side = a.side === 0 ? '' : ` data-side="${a.side === 1 ? 'right' : 'left'}"`;
  const rig = a.sway ? d.rigAttrs(a.sway, a.pivot) : '';
  let out = `<g data-part="${a.part}"${side} data-layer="${a.layer}"${a.far ? ' data-far="true" opacity="0.8"' : ''}${rig}>`;
  for (const prim of a.prims) out += drawPrim(d, prim);
  return out + `</g>`;
}

/**
 * One leaf of the tuft, whole: its fill and its own vein. They are one
 * object at one depth, so nothing can come between them.
 */
function drawLeaf(d: Drawing, tuft: TuftGeometry, which: 'main' | 'secondary'): string {
  const detail = tuft.details[which === 'main' ? 0 : 1];
  let out = `<g data-part="tuft-leaf" data-leaf="${which}"${d.rigAttrs('tuft', tuft.root)}>`;
  out += ellipse(tuft[which], `data-part="tuft-${which}" fill="${d.url('limb')}"`);
  if (detail) {
    out += `<path data-part="tuft-detail-${which === 'main' ? 'left' : 'right'}" d="${detail.d}" fill="none" stroke="${d.palette.line}" stroke-width="${fmt(detail.strokeWidth)}" stroke-linecap="round" opacity="${fmt(tuft.detailOpacity)}"/>`;
  }
  return out + `</g>`;
}

/**
 * THE CROWN, composited as objects.
 *
 * What stands on a head is a few OBJECTS: the head's surface, the tuft's two
 * leaves, and each antenna, horn and ear. Each object has one depth (how
 * near the viewer its root is on the crown, from the view's frame) and is
 * painted whole at it: a leaf with its vein, a trait with its root, shade
 * and highlight. No piece of one object is ordered apart from the rest.
 *
 * The head's surface is the one opaque thing they all meet, so there are two
 * runs, each sorted by depth:
 *
 *  - before the head: every object rooted BEYOND its ridge (a trait whose
 *    root the head hides; the leaves, seen from behind);
 *  - after the head: every object rooted on the side of it the view shows
 *    (the leaves from the front and in profile; a trait with its root in view).
 *
 * So two antennae may both rise from behind the head, both stand on it in
 * front of the tuft, or one each, and a trait may stand between the two
 * leaves: whatever their depths say.
 */
export function drawCrown(d: Drawing, appendages: readonly Appendage[], tuft: TuftGeometry | null, leavesBehindBody: boolean): { behind: string; front: string } {
  type CrownObject = { depth: number; draw: () => string };
  const byDepth = (objects: CrownObject[]) =>
    objects
      .map((object, i) => ({ object, i }))
      .sort((p, q) => p.object.depth - q.object.depth || p.i - q.i)
      .map(({ object }) => object.draw())
      .join('');
  const leaves: CrownObject[] = tuft
    ? [
        { depth: tuft.depths.main, draw: () => drawLeaf(d, tuft, 'main') },
        { depth: tuft.depths.secondary, draw: () => drawLeaf(d, tuft, 'secondary') },
      ]
    : [];
  // What is on the profile's far flank (dimmed) is beyond everything else, whatever its depth says.
  const beyond: CrownObject[] = appendages.filter((a) => a.layer === 'behind').map((a) => ({ depth: a.far ? a.depth - 10 : a.depth, draw: () => drawAppendage(d, a) }));
  const onHead: CrownObject[] = appendages.filter((a) => a.layer === 'crown').map((a) => ({ depth: a.depth, draw: () => drawAppendage(d, a) }));
  return leavesBehindBody ? { behind: byDepth([...beyond, ...leaves]), front: byDepth(onHead) } : { behind: byDepth(beyond), front: byDepth([...leaves, ...onHead]) };
}

export function drawPrim(d: Drawing, prim: Prim): string {
  const fill = prim.fill ? d.paint(prim.fill) : 'none';
  let attrs = `data-part="${prim.part}" fill="${fill}"`;
  if (prim.stroke) attrs += ` stroke="${d.paint(prim.stroke)}" stroke-width="${fmt(prim.strokeWidth ?? 1)}" stroke-linecap="round"`;
  if (prim.opacity !== undefined) attrs += ` opacity="${fmt(prim.opacity)}"`;
  if (prim.ellipse) return ellipse(prim.ellipse, attrs);
  return `<path d="${prim.d ?? ''}" ${attrs}/>`;
}

/** The traits that point at the viewer, drawn over the body. */
export function drawAppendages(d: Drawing, appendages: readonly Appendage[], layer: 'over'): string {
  return appendages
    .filter((a) => a.layer === layer)
    .map((a) => drawAppendage(d, a))
    .join('');
}

/** The marks that lie on the body: the belly patch, then the flank spots, all clipped to the silhouette. */
export function drawBodyMarks(d: Drawing, markings: MarkingsGeometry, bodyD: string): string {
  if (!markings.belly && markings.marks.length === 0) return '';
  const clip = d.clip(`<path d="${bodyD}"/>`);
  let out = '';
  if (markings.belly) out += `<g clip-path="${clip}">${drawPrim(d, markings.belly)}</g>`;
  if (markings.marks.length > 0) {
    out += `<g data-part="side-pattern" opacity="${fmt(markings.markOpacity)}" clip-path="${clip}">`;
    for (const mark of markings.marks) out += ellipse(mark, `data-part="side-pattern-mark" fill="${d.palette.marking}"`);
    out += `</g>`;
  }
  return out;
}

export function drawFreckles(d: Drawing, markings: MarkingsGeometry): string {
  if (markings.freckles.length === 0) return '';
  let out = `<g data-part="freckles" fill="${d.palette.line}" opacity="${fmt(markings.freckleOpacity)}">`;
  for (const f of markings.freckles) out += `<circle data-part="freckle" cx="${fmt(f.cx)}" cy="${fmt(f.cy)}" r="${radius(f.r)}"/>`;
  return out + `</g>`;
}

// ─── Debug overlay ───────────────────────────────────────────────────────────

const DEBUG_COLORS: Record<DebugGroup, string> = {
  body: '#00b3ff',
  eyes: '#12c76a',
  mouth: '#ff8a00',
  brows: '#ffd60a',
  antenna: '#ff3b6b',
  limbs: '#7dd3fc',
  markings: '#a3e635',
};

export function drawDebug(marks: readonly DebugMark[], filter: boolean | readonly DebugGroup[]): string {
  const shown = (group: DebugGroup) => filter === true || (Array.isArray(filter) && filter.includes(group));
  let lines = '';
  let points = '';
  for (const mark of marks) {
    if (mark.kind === 'axis') {
      if (!shown('body')) continue;
      lines += `<line x1="${fmt(mark.x)}" y1="${fmt(mark.y1)}" x2="${fmt(mark.x)}" y2="${fmt(mark.y2)}" stroke="#ff3bd4" stroke-width="2" stroke-dasharray="10 7"/>`;
      continue;
    }
    if (!shown(mark.group)) continue;
    const color = DEBUG_COLORS[mark.group];
    switch (mark.kind) {
      case 'bounds':
        lines += `<rect x="${fmt(mark.x)}" y="${fmt(mark.y)}" width="${radius(mark.width)}" height="${radius(mark.height)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="7 6" opacity="0.8"/>`;
        break;
      case 'guide':
        lines += `<line x1="${fmt(mark.from.x)}" y1="${fmt(mark.from.y)}" x2="${fmt(mark.to.x)}" y2="${fmt(mark.to.y)}" stroke="${color}" stroke-width="1.4" opacity="0.8"/>`;
        break;
      case 'control':
        lines += `<line x1="${fmt(mark.from.x)}" y1="${fmt(mark.from.y)}" x2="${fmt(mark.at.x)}" y2="${fmt(mark.at.y)}" stroke="${color}" stroke-width="1.4" opacity="0.8"/>`;
        points += `<rect x="${fmt(mark.at.x - 4)}" y="${fmt(mark.at.y - 4)}" width="8" height="8" fill="#ffffff" stroke="${color}" stroke-width="2"/>`;
        break;
      case 'anchor':
        points += `<circle cx="${fmt(mark.at.x)}" cy="${fmt(mark.at.y)}" r="5" fill="${color}" stroke="#ffffff" stroke-width="1.6"/>`;
        break;
    }
  }
  return `<g data-part="debug" pointer-events="none">${lines}${points}</g>`;
}
