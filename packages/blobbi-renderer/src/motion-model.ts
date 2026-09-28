/**
 * The PUBLIC motion contract of `@blobbi-kit/renderer`.
 *
 * A motion state names how the BODY moves in place: `'still'` (as today),
 * `'idle'` (a slow breathing bob) or `'walking'`. It says nothing about WHERE
 * the Blobbi is or where it is going: position, heading, speed, routes and
 * timing belong to the host, which moves the renderer box through its world
 * and tells the renderer only which word applies right now. Direction is
 * `facing`, which already exists.
 *
 * What "walking" LOOKS like is this package's, per artwork: V1 and the baby
 * have no legs, so they walk as they always have, a quick bob with a sway
 * and a squash of the whole body. The V2 adult has legs (`left-leg`,
 * `right-leg`, `near-leg`, `far-leg` in the part contract), so it walks on
 * them: the body sways without bouncing, and each leg group lifts and
 * strides in turn, one full gait per cycle, in the drawing's own units. The
 * host says only `motion="walking"`; which gait it gets follows the
 * generation the drawing already carries (`data-blobbi-generation`).
 *
 * ## Representation
 *
 * Motion is WRAPPER/CSS render state, not SVG render state. The drawing is
 * untouched; the element that carries the body (the body box in the React
 * component, the root `<svg>` in the string API) gets two data attributes,
 * and a package-owned stylesheet animates elements that carry them:
 *
 *   data-blobbi-motion="idle" data-blobbi-motion-phase="3"
 *
 * `'still'` emits neither attribute and no stylesheet, so a Blobbi that is not
 * moving produces exactly the markup it produced before this contract existed.
 *
 * ## Determinism
 *
 * There is no timer and no random number anywhere. The animation itself runs
 * in the browser's CSS engine; the markup is a pure function of the inputs.
 * The phase bucket is a hash of `instanceId`, so a crowd of Blobbis does not
 * breathe in lockstep, and the same Blobbi always gets the same phase.
 * `prefers-reduced-motion` disables the animation in CSS.
 */
import { hashString } from './effects/deterministic';

export type BlobbiMotion = 'still' | 'idle' | 'walking';
export const BLOBBI_MOTIONS: readonly BlobbiMotion[] = ['still', 'idle', 'walking'];

const MOTION_SET: ReadonlySet<string> = new Set(BLOBBI_MOTIONS);

/** Resolve any input to a motion state. Unknown or absent input is `'still'`. */
export function normalizeBlobbiMotion(input: unknown): BlobbiMotion {
  return typeof input === 'string' && MOTION_SET.has(input) ? (input as BlobbiMotion) : 'still';
}

/** How many distinct animation phases exist. */
export const BLOBBI_MOTION_PHASES = 8;

/**
 * The phase bucket (0 .. {@link BLOBBI_MOTION_PHASES} - 1) for an instance.
 * Pure: the same id always yields the same bucket.
 */
export function blobbiMotionPhase(instanceId: string): number {
  return hashString(`${instanceId}:motion`) % BLOBBI_MOTION_PHASES;
}

/** The two attributes the stylesheet keys on. `null` for `'still'`: nothing is emitted. */
export function blobbiMotionAttributes(
  motion: BlobbiMotion,
  instanceId: string,
): { 'data-blobbi-motion': BlobbiMotion; 'data-blobbi-motion-phase': string } | null {
  if (motion === 'still') return null;
  return {
    'data-blobbi-motion': motion,
    'data-blobbi-motion-phase': String(blobbiMotionPhase(instanceId)),
  };
}

const IDLE_DURATION_S = 4;
const WALK_DURATION_S = 0.56;

const phaseRules = Array.from(
  { length: BLOBBI_MOTION_PHASES },
  (_, i) => `[data-blobbi-motion-phase="${i}"]{--blobbi-motion-phase:${i / BLOBBI_MOTION_PHASES};}`,
).join('\n');

const V2_WALK = `[data-blobbi-generation="v2"] [data-blobbi-motion="walking"],[data-blobbi-generation="v2"][data-blobbi-motion="walking"]`;
const v2Leg = (part: string) =>
  `[data-blobbi-generation="v2"] [data-blobbi-motion="walking"] [data-part="${part}"],[data-blobbi-generation="v2"][data-blobbi-motion="walking"] [data-part="${part}"]`;
const legRule = (part: string, keyframes: string) =>
  `${v2Leg(part)}{animation:${keyframes} ${WALK_DURATION_S}s ease-in-out infinite;animation-delay:calc(var(--blobbi-motion-phase,0) * -${WALK_DURATION_S}s);}`;

/**
 * The motion stylesheet, as text. Every selector is a `data-blobbi-motion*`
 * attribute (scoped, for the V2 gait, by the `data-blobbi-generation` the
 * drawing already carries) and every keyframe name is `blobbi-motion-*`, so
 * nothing here can collide with a host rule. Mount it once, or let the
 * renderer emit it next to each moving Blobbi (the string API injects it
 * into the SVG).
 *
 * Both animations are restrained on purpose: idle is a 4 s breath of about
 * one percent; walking is a half-second bob of a few percent with a degree of
 * sway and a hint of squash. The origin is the ground line, so the feet stay
 * planted and the body moves above them.
 *
 * The V2 adult's walk keeps the same cycle and phase (a host that keys a
 * shadow to the cycle sees one clock) but a different shape: the body only
 * sways (`blobbi-motion-walk-v2`, a degree either way and a slight rise at
 * each step, no squash), and the leg groups do the walking. On the front and
 * back views (drawn under a 0.2646 document scale, so their units are about
 * four per viewBox unit) each leg lifts about 26 units in its half of the
 * cycle and sets down again, pressing down a little while the other lifts so
 * the planted foot stays on the ground as the body rises; on the profile
 * (drawn in viewBox units) the near and far legs stride: back along the
 * ground while planted, up and forward while lifted, half a cycle apart, in
 * the direction the profile faces (the mirrored left profile mirrors the
 * stride with it). Nothing moves the feet while `motion` is `still` or
 * `idle`, and reduced motion stills the legs with the body.
 */
export const BLOBBI_MOTION_STYLESHEET = `
[data-blobbi-motion]{transform-origin:50% 100%;}
[data-blobbi-motion="idle"]{animation:blobbi-motion-idle ${IDLE_DURATION_S}s ease-in-out infinite;animation-delay:calc(var(--blobbi-motion-phase,0) * -${IDLE_DURATION_S}s);}
[data-blobbi-motion="walking"]{animation:blobbi-motion-walk ${WALK_DURATION_S}s ease-in-out infinite;animation-delay:calc(var(--blobbi-motion-phase,0) * -${WALK_DURATION_S}s);}
${V2_WALK}{animation-name:blobbi-motion-walk-v2;}
${legRule('left-leg', 'blobbi-motion-step-left')}
${legRule('right-leg', 'blobbi-motion-step-right')}
${legRule('near-leg', 'blobbi-motion-stride-near')}
${legRule('far-leg', 'blobbi-motion-stride-far')}
${phaseRules}
@keyframes blobbi-motion-idle{
0%,100%{transform:translateY(0) scale(1,1);}
50%{transform:translateY(-1%) scale(1.012,1.018);}
}
@keyframes blobbi-motion-walk{
0%,100%{transform:translateY(0) rotate(-1.4deg) scale(1.025,0.975);}
25%{transform:translateY(-3.5%) rotate(0deg) scale(0.985,1.02);}
50%{transform:translateY(0) rotate(1.4deg) scale(1.025,0.975);}
75%{transform:translateY(-3.5%) rotate(0deg) scale(0.985,1.02);}
}
@keyframes blobbi-motion-walk-v2{
0%,100%{transform:rotate(-1.1deg) translateY(0);}
25%{transform:rotate(0deg) translateY(-0.6%);}
50%{transform:rotate(1.1deg) translateY(0);}
75%{transform:rotate(0deg) translateY(-0.6%);}
}
@keyframes blobbi-motion-step-left{
0%,50%,100%{transform:translate(0,0);}
25%{transform:translate(0,-26px);}
75%{transform:translate(0,5px);}
}
@keyframes blobbi-motion-step-right{
0%,50%,100%{transform:translate(0,0);}
25%{transform:translate(0,5px);}
75%{transform:translate(0,-26px);}
}
@keyframes blobbi-motion-stride-near{
0%{transform:translate(-7px,0);}
25%{transform:translate(0,-8px);}
50%{transform:translate(7px,0);}
75%{transform:translate(0,1.4px);}
100%{transform:translate(-7px,0);}
}
@keyframes blobbi-motion-stride-far{
0%{transform:translate(7px,0);}
25%{transform:translate(0,1.4px);}
50%{transform:translate(-7px,0);}
75%{transform:translate(0,-8px);}
100%{transform:translate(7px,0);}
}
@media (prefers-reduced-motion: reduce){
[data-blobbi-motion]{animation:none !important;}
[data-blobbi-motion] [data-part]{animation:none !important;}
}
`;

/** `<style>` markup carrying the motion stylesheet, for the string API. */
export const BLOBBI_MOTION_STYLE_ELEMENT = `<style data-blobbi-motion-styles>${BLOBBI_MOTION_STYLESHEET}</style>`;
