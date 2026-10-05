/**
 * The renderer's INPUT NORMALIZATION boundary (Phase 4).
 *
 * `BlobbiRendererView` accepts loose, partially-populated visual data; it is
 * fed by relay events, presence payloads, editor previews and test fixtures,
 * none of which can be trusted to be complete. This module is the single pure
 * function that turns that into a fully-resolved {@link BlobbiRenderModel}: the
 * renderer's JSX then contains no defaulting, no domain rules and no clamping.
 *
 * Everything here is pure and React-free, so the same normalization runs in the
 * world, in the profile-modal preview, in the accessory editor and in a plain
 * Node test: which is what makes "local and remote render identically" a
 * structural fact rather than a convention.
 *
 * Documented fallback behavior for incomplete input:
 *  - unknown/absent `stage` → `'baby'` (the historical fallback artwork);
 *    `'egg'` draws the egg shell;
 *  - `adultType` is carried ONLY for the adult stage, defaulting to
 *    {@link DEFAULT_ADULT_TYPE}; an unrecognized value is corrected downstream
 *    by the adult SVG resolver;
 *  - absent colors are left undefined, which means "the artwork's own colors";
 *    a color that is not a bare hex color (`#rgb` / `#rrggbb`) is treated as
 *    absent too: colors are spliced into SVG attribute values as strings, so
 *    this is the renderer's own guarantee, not something a host must remember;
 *  - a non-finite gaze axis becomes 0; finite axes clamp to -1..1;
 *  - rear facing has no pupils in its markup at all, so gaze is dropped
 *    outright rather than injected and left unused;
 *  - unknown/absent `visualGeneration` -> `'v1'`, unknown/absent `facing` ->
 *    `'front'`, so pre-existing consumers and pre-existing Blobbis are
 *    untouched;
 *  - a `'v3'` visual's identity (`visual.v3`) is resolved field by field:
 *    anything missing or malformed is what its seed gives; with no usable
 *    seed at all there is no individual to draw, and the canonical V3 body
 *    is drawn in the visual's plain colours. `v3` is ignored entirely by the
 *    other generations;
 *  - an empty/blank `instanceId` falls back to {@link FALLBACK_INSTANCE_ID}
 *    rather than producing an SVG id prefix shared by every such renderer;
 *  - unknown/absent `expression` -> neutral (per part), unknown/absent
 *    `motion` -> `'still'`: the two expressive-state inputs default to
 *    exactly what the renderer drew before they existed.
 */
import type { NormalizedAccessoryPlacement } from './accessory-normalize';
import type { BlobbiFacing, BlobbiVisualGeneration } from './artwork/types';
import { DEFAULT_VISUAL_GENERATION } from './artwork/types';
import { sanitizeArtworkColor } from './svg/colors';
import {
  normalizeBlobbiExpression,
  type BlobbiExpression,
  type ResolvedBlobbiExpression,
} from './expression-model';
import { normalizeBlobbiSleepIndicator, type BlobbiSleepIndicator } from './svg/sleep-indicator';
import { normalizeBlobbiGroundShadow, type BlobbiGroundShadow } from './svg/ground-shadow';
import { normalizeBlobbiMotion, type BlobbiMotion } from './motion-model';
import { normalizeBlobbiEggCrack, type BlobbiEggCrack } from './egg-model';
import { blobbiV3Key, normalizeBlobbiV3Visual, type BlobbiV3Identity, type BlobbiV3Visual } from './artwork/v3/identity';

/**
 * The visual identity of a Blobbi: the plain, serializable input the renderer
 * draws from. Every field is optional and every value survives
 * `JSON.parse(JSON.stringify(...))`; nothing here is a domain object, a Nostr
 * event or a parsed companion. Hosts map their own model to this shape.
 */
export interface BlobbiVisual {
  /** Life stage. The egg draws the shell; its crack state is render state (`eggCrack`). */
  stage?: 'egg' | 'baby' | 'adult';
  /**
   * Artwork generation. `'v1'` is the original sixteen-form generation and
   * the default when absent, so every existing consumer and every pre-existing
   * Blobbi keeps drawing exactly as before; `'v2'` is the canonical anatomy;
   * `'v3'` is the procedural generation, drawn from {@link BlobbiVisual.v3}.
   * This is identity data (the domain kit reads it from the Blobbi's event),
   * never a renderer-version switch.
   */
  visualGeneration?: BlobbiVisualGeneration;
  /**
   * The V3 identity: the seed, the colours and the trait kinds of a
   * procedural Blobbi (see `artwork/v3/identity.ts`). Read only when
   * `visualGeneration` is `'v3'`. `@blobbi-kit/core` parses it from the
   * Blobbi's event; `getBlobbiVisualIdentity(companion)` carries it here.
   */
  v3?: BlobbiV3Visual;
  /** Adult form (`'bloomi'`, `'catti'`, ...). Ignored unless `stage` is `'adult'`. */
  adultType?: string;
  baseColor?: string;
  secondaryColor?: string;
  eyeColor?: string;
  /**
   * Seed-derived pattern (`'solid' | 'spotted' | ...`). Carried as plain data
   * for hosts and future artwork; the current body drawings do not render it.
   */
  pattern?: string;
  /**
   * Seed-derived special mark (`'star' | 'heart' | ...`). Carried as plain data;
   * the current body drawings do not render it.
   */
  specialMark?: string;
  /** Theme variant (e.g. a crossover theme). Carried as plain data only. */
  theme?: string;
  /**
   * Display name. Carried as data only: the component's accessible name and
   * tooltip come from its `label` / `title` props, never from here.
   */
  name?: string;
}

/** @deprecated Renamed to {@link BlobbiVisual}; kept for one migration cycle. */
export type BlobbiRenderVisual = BlobbiVisual;

/** Which drawing to produce. `'rear'` is derived from the front artwork. */
export type BlobbiRenderView = 'front' | 'rear';

export interface BlobbiRenderModelInput {
  visual: BlobbiVisual;
  instanceId: string;
  /** `'front' | 'back' | 'left' | 'right'`; V1 draws its front for both profiles. */
  facing?: BlobbiFacing;
  isSleeping?: boolean;
  /** Kept distinct from sleeping for the seated legacy prop; both close eyes. */
  eyesClosed?: boolean;
  /** Normalized gaze direction (-1..1 per axis); undefined renders statically. */
  eyeOffset?: { x: number; y: number };
  accessories?: readonly NormalizedAccessoryPlacement[];
  /** Facial expression: a preset name or explicit parts. See `expression-model.ts`. */
  expression?: BlobbiExpression;
  /** `'artwork'` (default) keeps the V1 sleeping drawings' baked Zzz; `'none'` draws the creature asleep only. */
  sleepIndicator?: BlobbiSleepIndicator;
  /** Whether the V2 drawings keep their baked ground shadow. See `svg/ground-shadow.ts`. */
  groundShadow?: BlobbiGroundShadow;
  /** Body motion state. See `motion-model.ts`. */
  motion?: BlobbiMotion;
  /** Egg shell crack state. See `egg-model.ts`. Ignored unless the stage is `'egg'`. */
  eggCrack?: BlobbiEggCrack;
}

/** Fully resolved, renderable state. Every field is defined and valid. */
export interface BlobbiRenderModel {
  stage: 'egg' | 'baby' | 'adult';
  /** Resolved artwork generation; `'v1'` when the visual named none. */
  visualGeneration: BlobbiVisualGeneration;
  /** The resolved V3 identity; null unless the generation is `'v3'` and the visual carried a seed. */
  v3: BlobbiV3Identity | null;
  /** A stable key for `v3` (empty when null): equal identities, equal keys. */
  v3Key: string;
  /** Present only when `stage === 'adult'`. */
  adultType?: string;
  /** Validated hex colors (`#rgb` / `#rrggbb`), or undefined for the artwork's own. */
  baseColor?: string;
  secondaryColor?: string;
  eyeColor?: string;
  name?: string;
  facing: BlobbiFacing;
  /**
   * The V1 drawing family: `'rear'` iff `facing === 'back'`, `'front'`
   * otherwise (including both profiles). Kept for V1 consumers; the artwork
   * registry works from `facing` and `visualGeneration` directly.
   */
  view: BlobbiRenderView;
  /**
   * Selects the closed-eye (sleeping) artwork. `isSleeping` and the legacy
   * seated `eyesClosed` collapse here: both mean the same thing to the drawing,
   * and nothing downstream can tell them apart.
   */
  eyesClosed: boolean;
  /** Resolved sleep indicator; `'artwork'` unless `'none'` was asked for. */
  sleepIndicator: BlobbiSleepIndicator;
  /** Resolved ground-shadow choice; `'none'` (the creature only) when none was asked for. */
  groundShadow: BlobbiGroundShadow;
  /** Clamped gaze, or null when gaze must not be applied at all. */
  gaze: { x: number; y: number } | null;
  accessories: readonly NormalizedAccessoryPlacement[];
  /** Sanitized SVG id namespace; safe to embed in an `id` attribute. */
  instanceId: string;
  /** Resolved expression; the shared neutral instance when none was asked for. */
  expression: ResolvedBlobbiExpression;
  /** Resolved motion state; `'still'` when none was asked for. */
  motion: BlobbiMotion;
  /** Resolved crack state; `'none'` when none was asked for or the stage is not an egg. */
  eggCrack: BlobbiEggCrack;
}

/** Stage used when the input names none, or names one we do not draw. */
export const DEFAULT_STAGE = 'baby' as const;

/** Adult form used when the adult stage arrives without a type. */
export const DEFAULT_ADULT_TYPE = 'bloomi';

/** Instance id used when the caller supplies nothing usable. */
export const FALLBACK_INSTANCE_ID = 'blobbi';

const VALID_STAGES: ReadonlySet<string> = new Set(['egg', 'baby', 'adult']);
const VALID_FACINGS: ReadonlySet<string> = new Set(['front', 'back', 'left', 'right']);
const VALID_GENERATIONS: ReadonlySet<string> = new Set(['v1', 'v2', 'v3']);

function clampGazeAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

/**
 * Sanitize an id namespace to the characters that are safe in an SVG `id`.
 *
 * Matches the transformation `uniquifySvgIds` applies internally, so doing it
 * here is idempotent and changes no existing id; it only makes the rule part
 * of the public contract instead of an implementation detail.
 */
export function normalizeInstanceId(instanceId: string | undefined): string {
  const sanitized = (instanceId ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
  // `___` etc. is a caller passing punctuation only: still degenerate, still
  // shared between instances. Treat "nothing but separators" as nothing.
  return /[a-zA-Z0-9]/.test(sanitized) ? sanitized : FALLBACK_INSTANCE_ID;
}

/**
 * Resolve loose visual input into a complete, renderable model. Pure: same
 * input, same output, in any runtime.
 */
export function normalizeBlobbiRenderModel(
  input: BlobbiRenderModelInput,
): BlobbiRenderModel {
  const { visual, isSleeping = false, eyesClosed = false } = input;

  const stage = VALID_STAGES.has(visual.stage ?? '')
    ? (visual.stage as 'egg' | 'baby' | 'adult')
    : DEFAULT_STAGE;
  // Unknown facings and generations (external JSON) fall back like an unknown
  // stage does: to the historical default, never to nothing.
  const facing: BlobbiFacing = VALID_FACINGS.has(input.facing ?? '')
    ? (input.facing as BlobbiFacing)
    : 'front';
  const visualGeneration: BlobbiVisualGeneration = VALID_GENERATIONS.has(visual.visualGeneration ?? '')
    ? (visual.visualGeneration as BlobbiVisualGeneration)
    : DEFAULT_VISUAL_GENERATION;

  const isRearFacing = facing === 'back';
  const v3 = visualGeneration === 'v3' ? normalizeBlobbiV3Visual(visual.v3) : null;

  return {
    stage,
    visualGeneration,
    v3,
    v3Key: blobbiV3Key(v3),
    adultType: stage === 'adult' ? visual.adultType || DEFAULT_ADULT_TYPE : undefined,
    baseColor: sanitizeArtworkColor(visual.baseColor),
    secondaryColor: sanitizeArtworkColor(visual.secondaryColor),
    eyeColor: sanitizeArtworkColor(visual.eyeColor),
    name: visual.name,
    facing,
    view: isRearFacing ? 'rear' : 'front',
    eyesClosed: isSleeping || eyesClosed,
    sleepIndicator: normalizeBlobbiSleepIndicator(input.sleepIndicator),
    groundShadow: normalizeBlobbiGroundShadow(input.groundShadow),
    gaze:
      input.eyeOffset === undefined || isRearFacing
        ? null
        : { x: clampGazeAxis(input.eyeOffset.x), y: clampGazeAxis(input.eyeOffset.y) },
    accessories: input.accessories ?? [],
    instanceId: normalizeInstanceId(input.instanceId),
    expression: normalizeBlobbiExpression(input.expression),
    motion: normalizeBlobbiMotion(input.motion),
    eggCrack: stage === 'egg' ? normalizeBlobbiEggCrack(input.eggCrack) : 'none',
  };
}
