/**
 * THE ARTWORK REGISTRY: the one place that decides which drawing a Blobbi gets.
 *
 * ```
 *   baby
 *   └── v1                      one body, awake + sleeping; rear derived
 *   adult
 *   ├── v1                      sixteen forms, awake + sleeping; rear derived
 *   │   └── forms 1..16
 *   └── v2                      one canonical anatomy, authored views
 *       ├── front
 *       ├── side                right-facing; left is a mirror
 *       └── back
 * ```
 *
 * Resolution is a pure function of the request: no clock, no randomness, no
 * DOM, no network, no host knowledge. `resolveBlobbiArtwork` picks the raw
 * markup and describes it; `buildBlobbiMarkup` runs the generation's pipeline
 * (customize colors, namespace ids, derive or mirror the view) and returns the
 * finished string. Everything generation-specific lives behind these two
 * functions, so `BlobbiRenderer` and `loadBlobbiSvg` contain no `if (v2)`.
 *
 * Adding artwork (see the README, "Adding artwork"):
 *  - a new V2 VIEW: author it under `adult/v2/`, register it in
 *    `ADULT_V2_VIEWS`, and teach `viewForFacing` which facing selects it;
 *  - Baby V2: add `baby/v2/`, and a `stage === 'baby'` branch in the V2 case
 *    below, exactly like the adult one;
 *  - a new GENERATION: add `'v3'` to `BlobbiVisualGeneration`, a `v3/` folder
 *    with its own customizer, and one new `case` in each `switch` here.
 */
import type {
  ArtworkAnchors,
  ArtworkColors,
  ArtworkRequest,
  BlobbiArtworkView,
  BlobbiFacing,
  BlobbiVisualGeneration,
  ResolvedArtwork,
} from './types';
import {
  getAdultBaseSvg,
  getAdultSleepingSvg,
  customizeAdultSvg,
  isValidAdultForm,
  getDefaultAdultForm,
  type AdultForm,
} from './adult/v1';
import { getBabyBaseSvg, getBabySleepingSvg, customizeBabySvg } from './baby/v1';
import { getAdultV2Artwork, customizeAdultV2Svg } from './adult/v2';
import { applyRearView } from '../svg';
import { mirrorSvgHorizontally } from './mirror';

// ─── Anchors ─────────────────────────────────────────────────────────────────

/** V1 artwork is a 200x200 (adult) / 100x100 (baby) square; the body fills it loosely. */
const V1_ANCHORS: ArtworkAnchors = { centerX: 0.5, headTopY: 0.18, eyeLineY: 0.48, groundY: 0.82 };

/**
 * V2 anchors, measured on the authored viewBox (211.67 x 238.13): the body
 * top (`body-base` at y = 136.79 in root space), the eye line and the
 * ground-shadow center, projected through the document transforms.
 */
const V2_FRONT_ANCHORS: ArtworkAnchors = { centerX: 0.5, headTopY: 0.158, eyeLineY: 0.473, groundY: 0.929 };
const V2_BACK_ANCHORS: ArtworkAnchors = { centerX: 0.5, headTopY: 0.158, groundY: 0.929 };
/** The profile's body sits slightly left of center; its eye is at the face. */
const V2_SIDE_ANCHORS: ArtworkAnchors = { centerX: 0.49, headTopY: 0.13, eyeLineY: 0.454, groundY: 0.91 };

// ─── View selection ──────────────────────────────────────────────────────────

/** Which authored view a facing selects for a generation, and whether it is mirrored. */
export function viewForFacing(
  generation: BlobbiVisualGeneration,
  facing: BlobbiFacing,
): { view: BlobbiArtworkView; mirrored: boolean } {
  switch (generation) {
    case 'v1':
      // V1 has no profile artwork: both profiles draw the front.
      return { view: facing === 'back' ? 'back' : 'front', mirrored: false };
    case 'v2':
      switch (facing) {
        case 'back':
          return { view: 'back', mirrored: false };
        case 'right':
          return { view: 'side', mirrored: false };
        case 'left':
          return { view: 'side', mirrored: true };
        default:
          return { view: 'front', mirrored: false };
      }
  }
}

// ─── Resolution ──────────────────────────────────────────────────────────────

/**
 * Pick the raw drawing for a request and describe it.
 *
 * Deterministic and total: every request resolves to some drawing (unknown
 * V1 forms fall back to the default form, exactly as before).
 */
export function resolveBlobbiArtwork(request: ArtworkRequest): ResolvedArtwork {
  const { view, mirrored } = viewForFacing(request.visualGeneration, request.facing);
  // The egg stage has no artwork of its own and draws the baby, historically.
  const stage: 'baby' | 'adult' = request.stage === 'adult' ? 'adult' : 'baby';

  switch (request.visualGeneration) {
    case 'v2': {
      if (stage === 'adult') {
        const art = getAdultV2Artwork(view);
        return {
          generation: 'v2',
          stage,
          view,
          mirrored,
          // No closed-eye V2 artwork exists yet; the awake drawing is used.
          eyesClosed: false,
          gazeable: art.hasFace,
          viewBox: art.viewBox,
          anchors: view === 'front' ? V2_FRONT_ANCHORS : view === 'back' ? V2_BACK_ANCHORS : V2_SIDE_ANCHORS,
          markup: art.markup,
        };
      }
      // Baby V2 is not designed yet: a V2 baby draws the V1 baby (documented).
      return resolveBlobbiArtwork({ ...request, visualGeneration: 'v1' });
    }
    case 'v1':
    default: {
      if (stage === 'adult') {
        const form: AdultForm =
          request.adultType && isValidAdultForm(request.adultType)
            ? (request.adultType as AdultForm)
            : getDefaultAdultForm();
        return {
          generation: 'v1',
          stage,
          view: view === 'back' ? 'back' : 'front',
          mirrored: false,
          eyesClosed: request.eyesClosed,
          gazeable: !request.eyesClosed && view !== 'back',
          form,
          viewBox: { width: 200, height: 200 },
          anchors: V1_ANCHORS,
          markup: request.eyesClosed ? getAdultSleepingSvg(form) : getAdultBaseSvg(form),
        };
      }
      return {
        generation: 'v1',
        stage,
        view: view === 'back' ? 'back' : 'front',
        mirrored: false,
        eyesClosed: request.eyesClosed,
        gazeable: !request.eyesClosed && view !== 'back',
        viewBox: { width: 100, height: 100 },
        anchors: V1_ANCHORS,
        markup: request.eyesClosed ? getBabySleepingSvg() : getBabyBaseSvg(),
      };
    }
  }
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

/**
 * Turn a resolved drawing into finished markup: colors applied, ids
 * namespaced, the view derived (V1 rear) or mirrored (V2 left profile).
 *
 * V1 runs exactly the historical sequence (`customize*Svg` then
 * `applyRearView`), which `v1-fingerprints.test.ts` pins byte for byte.
 */
export function finishBlobbiArtwork(
  resolved: ResolvedArtwork,
  colors: ArtworkColors,
  instanceId?: string,
): string {
  switch (resolved.generation) {
    case 'v2': {
      const customized = customizeAdultV2Svg(resolved.markup, colors, instanceId);
      return resolved.mirrored ? mirrorSvgHorizontally(customized, resolved.viewBox.width) : customized;
    }
    case 'v1':
    default: {
      const customized =
        resolved.stage === 'adult'
          ? customizeAdultSvg(
              resolved.markup,
              (resolved.form ?? getDefaultAdultForm()) as AdultForm,
              colors,
              resolved.eyesClosed,
              instanceId,
            )
          : customizeBabySvg(resolved.markup, colors, resolved.eyesClosed, instanceId);
      return resolved.view === 'back' ? applyRearView(customized) : customized;
    }
  }
}

/** Resolve and finish in one call. */
export function buildBlobbiMarkup(
  request: ArtworkRequest,
  colors: ArtworkColors,
  instanceId?: string,
): { svg: string; artwork: ResolvedArtwork } {
  const artwork = resolveBlobbiArtwork(request);
  return { svg: finishBlobbiArtwork(artwork, colors, instanceId), artwork };
}
