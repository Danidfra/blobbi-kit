/**
 * The string API: a finished Blobbi SVG, synchronously, from plain data.
 *
 * Two entry points share one pipeline (`registry.ts`):
 *
 *  - `renderBlobbiSvg(options)` is the generation-aware API. It takes the same
 *    plain visual data the React component takes, plus facing and closed eyes,
 *    and returns the drawing (optionally with gaze markup).
 *  - `loadBlobbiSvg(stage, adultType, ...)` is the historical positional API.
 *    It is V1 by definition (it predates generations), its `view` is the V1
 *    `'front' | 'rear'`, and its output is pinned byte for byte by
 *    `v1-fingerprints.test.ts`.
 */
import type { BlobbiView } from '../svg';
import { applyGazeMarkup } from '../svg';
import { buildBlobbiMarkup } from './registry';
import type { BlobbiFacing, BlobbiVisualGeneration, ResolvedArtwork } from './types';
import { DEFAULT_VISUAL_GENERATION } from './types';
import { normalizeBlobbiExpression, type BlobbiExpression } from '../expression-model';
import {
  BLOBBI_MOTION_STYLE_ELEMENT,
  blobbiMotionAttributes,
  normalizeBlobbiMotion,
  type BlobbiMotion,
} from '../motion-model';
import { normalizeBlobbiEggCrack, type BlobbiEggCrack } from '../egg-model';
import type { BlobbiV3Visual } from './v3/identity';

export type { BlobbiView };

export interface RenderBlobbiSvgOptions {
  stage?: 'egg' | 'baby' | 'adult';
  /** Absent means `'v1'`. */
  visualGeneration?: BlobbiVisualGeneration;
  adultType?: string;
  baseColor?: string;
  secondaryColor?: string;
  eyeColor?: string;
  facing?: BlobbiFacing;
  eyesClosed?: boolean;
  /** `'artwork'` (default) keeps the V1 sleeping Zzz; `'none'` draws the creature asleep only. */
  sleepIndicator?: 'artwork' | 'none';
  /** Whether the V2 drawings keep their baked ground shadow. `'none'` (default) draws the creature only. */
  groundShadow?: 'none' | 'artwork';
  /**
   * Facial expression: a preset name or explicit parts. Drawn into the SVG
   * markup on artwork with a semantic face (V2 front and side); a no-op on
   * V1 and on the V2 back. `eyesClosed` wins over the expression's eyes.
   */
  expression?: BlobbiExpression;
  /**
   * Body motion state. Unlike expression this is WRAPPER render state: the
   * drawing is unchanged, the root `<svg>` gains `data-blobbi-motion` and
   * `data-blobbi-motion-phase`, and the package's motion stylesheet is
   * injected so the string is self-contained. `'still'` (the default) emits
   * nothing.
   */
  motion?: BlobbiMotion;
  /** Egg shell crack state; drawn on the egg stage only. */
  eggCrack?: BlobbiEggCrack;
  /**
   * The V3 identity (seed, colours, trait kinds); read only when
   * `visualGeneration` is `'v3'`. See `artwork/v3/identity.ts`.
   */
  v3?: BlobbiV3Visual;
  /**
   * V3 only: draw ONE FRAME of `motion`, this far through its cycle (0..1),
   * instead of leaving the motion to the stylesheet. For sprite sheets,
   * thumbnails and tests: the frame is plain markup, identical everywhere.
   */
  motionPhase?: number;
  /** SVG id namespace; strongly recommended when several Blobbis share a page. */
  instanceId?: string;
  /**
   * Mark the movable eye parts and inject the gaze stylesheet, so a host can
   * steer the pupils through the `--blobbi-eye-x` / `--blobbi-eye-y` CSS
   * variables. Off by default: static drawings carry no extra markup.
   *
   * V3 also accepts a direction (`{ x, y }`, each -1..1, screen-relative) and
   * draws that gaze into the markup: a static picture looking somewhere.
   */
  gaze?: boolean | { x: number; y: number };
}

export interface RenderedBlobbiSvg {
  svg: string;
  /** What was drawn: generation, view, mirroring, whether pupils can move. */
  artwork: ResolvedArtwork;
}

/**
 * Render a Blobbi to an SVG string, for any generation and facing.
 *
 * Pure and deterministic. Unknown stages draw the baby; the egg draws the
 * shell (with `eggCrack`); unknown V1 forms draw the default form; a V2 baby
 * draws the V1 baby until Baby V2 exists; a V3 Blobbi is generated from
 * `v3`, at any stage.
 */
export function renderBlobbiSvg(options: RenderBlobbiSvgOptions): RenderedBlobbiSvg {
  const stage = options.stage === 'adult' || options.stage === 'egg' ? options.stage : 'baby';
  const motion = normalizeBlobbiMotion(options.motion);
  const { svg, artwork } = buildBlobbiMarkup(
    {
      stage,
      visualGeneration: options.visualGeneration ?? DEFAULT_VISUAL_GENERATION,
      adultType: options.adultType,
      facing: options.facing ?? 'front',
      eyesClosed: options.eyesClosed ?? false,
      sleepIndicator: options.sleepIndicator === 'none' ? 'none' : 'artwork',
      groundShadow: options.groundShadow === 'artwork' ? 'artwork' : 'none',
      expression: normalizeBlobbiExpression(options.expression),
      eggCrack: normalizeBlobbiEggCrack(options.eggCrack),
      v3: options.v3,
      motion,
      motionPhase: typeof options.motionPhase === 'number' && Number.isFinite(options.motionPhase) ? options.motionPhase : undefined,
      gaze: typeof options.gaze === 'object' && options.gaze !== null ? bakedGaze(options.gaze) : undefined,
    },
    {
      baseColor: options.baseColor,
      secondaryColor: options.secondaryColor,
      eyeColor: options.eyeColor,
    },
    options.instanceId,
  );
  const withGaze =
    options.gaze === true && artwork.gazeable
      ? applyGazeMarkup(svg, artwork.generation, { mirrored: artwork.mirrored, travel: artwork.gazeTravel })
      : svg;
  return {
    svg:
      artwork.motionStyles === undefined
        ? applyMotionMarkup(withGaze, motion, options.instanceId ?? '')
        : applyOwnMotionStyles(withGaze, artwork.motionStyles),
    artwork,
  };
}

const axis = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0);
const bakedGaze = (gaze: { x: number; y: number }) => ({ x: axis(gaze.x), y: axis(gaze.y) });

/**
 * A drawing that animates its own parts carries its motion in its markup
 * already; all that is missing for a self-contained string is its stylesheet.
 */
function applyOwnMotionStyles(svgText: string, styles: string): string {
  if (!styles) return svgText;
  return svgText.replace(/<svg\b([^>]*)>/i, (open: string) => `${open}<style data-blobbi-rig-motion-styles="">${styles}</style>`);
}

/**
 * Put the motion attributes on the root `<svg>` and inject the motion
 * stylesheet right after it, the same place gaze puts its style. `'still'`
 * returns the input string itself.
 */
function applyMotionMarkup(svgText: string, motion: BlobbiMotion, instanceId: string): string {
  const attrs = blobbiMotionAttributes(motion, instanceId);
  if (!attrs) return svgText;
  const attrText = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  return svgText.replace(/<svg\b([^>]*)>/i, (_m, rest: string) => `<svg${rest}${attrText}>${BLOBBI_MOTION_STYLE_ELEMENT}`);
}

/**
 * Load and customize a V1 Blobbi SVG synchronously (no network fetch).
 *
 * The historical positional API, kept unchanged for V1 consumers: `view`
 * selects WHICH DRAWING to produce, in the same spirit as `isSleeping`
 * selecting the sleeping artwork: `'rear'` derives the back of the character
 * from the front artwork by dropping its face blocks (see `svg/rear-view.ts`).
 * For V2 artwork use {@link renderBlobbiSvg}.
 */
// NOTE: `loadBlobbiSvg('egg', ...)` keeps drawing the V1 baby, exactly as it
// always has (pinned by `v1-fingerprints.test.ts`): this positional API is a
// byte-for-byte compatibility surface. The egg shell is reached through
// `renderBlobbiSvg({ stage: 'egg' })` and the component.
export function loadBlobbiSvg(
  stage: string,
  adultType?: string,
  baseColor?: string,
  secondaryColor?: string,
  eyeColor?: string,
  isSleeping?: boolean,
  instanceId?: string,
  view: BlobbiView = 'front',
): string {
  return buildBlobbiMarkup(
    {
      stage: stage === 'adult' ? 'adult' : 'baby',
      visualGeneration: 'v1',
      adultType,
      facing: view === 'rear' ? 'back' : 'front',
      eyesClosed: isSleeping ?? false,
    },
    { baseColor, secondaryColor, eyeColor },
    instanceId,
  ).svg;
}
