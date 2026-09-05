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
  /** SVG id namespace; strongly recommended when several Blobbis share a page. */
  instanceId?: string;
  /**
   * Mark the movable eye parts and inject the gaze stylesheet, so a host can
   * steer the pupils through the `--blobbi-eye-x` / `--blobbi-eye-y` CSS
   * variables. Off by default: static drawings carry no extra markup.
   */
  gaze?: boolean;
}

export interface RenderedBlobbiSvg {
  svg: string;
  /** What was drawn: generation, view, mirroring, whether pupils can move. */
  artwork: ResolvedArtwork;
}

/**
 * Render a Blobbi to an SVG string, for any generation and facing.
 *
 * Pure and deterministic. Unknown stages draw the baby; unknown V1 forms draw
 * the default form; a V2 baby draws the V1 baby until Baby V2 exists.
 */
export function renderBlobbiSvg(options: RenderBlobbiSvgOptions): RenderedBlobbiSvg {
  const stage = options.stage === 'adult' || options.stage === 'egg' ? options.stage : 'baby';
  const { svg, artwork } = buildBlobbiMarkup(
    {
      stage,
      visualGeneration: options.visualGeneration ?? DEFAULT_VISUAL_GENERATION,
      adultType: options.adultType,
      facing: options.facing ?? 'front',
      eyesClosed: options.eyesClosed ?? false,
    },
    {
      baseColor: options.baseColor,
      secondaryColor: options.secondaryColor,
      eyeColor: options.eyeColor,
    },
    options.instanceId,
  );
  return {
    svg: options.gaze && artwork.gazeable ? applyGazeMarkup(svg, artwork.generation) : svg,
    artwork,
  };
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
