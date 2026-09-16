/**
 * Visual identity: the pure projection of a Blobbi's domain state onto the
 * fields a renderer needs to draw it.
 *
 * This is the one place where "which Blobbi is this, visually" is decided for
 * every host. Before it existed, Blobbi Island and Ditto each hand-copied
 * `visualTraits.baseColor`, `adultType`, `stage` and `name` into their own
 * renderer input; two copies of the same mapping is how a hat ends up on the
 * wrong body.
 *
 * DEPENDENCY DIRECTION. `@blobbi-kit/core` does not import the renderer and
 * the renderer does not import core. {@link BlobbiVisualIdentity} is declared
 * here on its own; the renderer's `BlobbiVisual` is declared over there on its
 * own. They are structurally compatible by design, so a host writes
 * `<BlobbiRenderer visual={getBlobbiVisualIdentity(companion)} />` with no
 * adapter object and no shared type package, and either side can evolve
 * without the other compiling against it.
 *
 * WHAT IS HERE. Every PERSISTENT visual trait the domain resolves for a
 * Blobbi: the stage, the artwork generation, the three colours, the pattern,
 * the special mark, the size category, the adult form, the theme tag and the
 * name. The seed-derived traits are exactly the six `deriveVisualTraits`
 * returns; nothing the seed decides is left out, so a host never has to reach
 * back into `visualTraits` for a trait the identity forgot.
 *
 * WHAT IS NOT HERE, deliberately. Render STATE (box size, facing, sleeping,
 * gaze) and HOST inputs (accessories, effects, inventory) are not identity:
 * the same Blobbi is the same Blobbi asleep, seen from behind, wearing a hat.
 * Those stay with the host and the renderer. Transport data (the event, the
 * d-tag, the seed) is not identity either; it is how the identity was
 * derived, which the renderer has no reason to know. Application UI themes
 * (light/dark, host styling) are not identity: they describe the app, not the
 * creature.
 */
import type {
  BlobbiCompanion,
  BlobbiPattern,
  BlobbiSize,
  BlobbiSpecialMark,
  BlobbiStage,
  BlobbiVisualGeneration,
} from './blobbi';
import { getTagValue, parseVisualGeneration } from './blobbi';
import { isValidAdultForm, type AdultForm } from './types/adult';

/**
 * Plain, serializable visual identity of a Blobbi.
 *
 * Every value survives `JSON.parse(JSON.stringify(...))`. Optionality follows
 * the domain: `parseBlobbiEvent` always resolves a stage and a full set of
 * visual traits (seed-derived, with legacy-tag fallbacks and defaults), so
 * those are required; an adult form exists only when the event carries or
 * derives a form from the canonical vocabulary; a theme exists only when the
 * extension tag is present; a name is emitted only when non-empty.
 */
export interface BlobbiVisualIdentity {
  /** Life stage: `'egg' | 'baby' | 'adult'`. */
  stage: BlobbiStage;
  /**
   * Artwork generation: `'v1'` (the original sixteen adult forms) or `'v2'`
   * (the canonical anatomy). Always present in the projection; `'v1'` for
   * every event without a `visual_generation` tag.
   */
  visualGeneration: BlobbiVisualGeneration;
  /**
   * Adult form, always one of {@link ADULT_FORMS} (`'bloomi'`, `'catti'`, ...).
   * Seed-derived for every adult with a seed. A value outside the vocabulary
   * (a malformed legacy `adult_type` tag) never enters the identity; it is
   * omitted, and the renderer's own default applies.
   */
  adultType?: AdultForm;
  /** Canonical CSS hex color. */
  baseColor: string;
  /** Canonical CSS hex color. */
  secondaryColor: string;
  /** Canonical CSS hex color. */
  eyeColor: string;
  /** Seed-derived pattern: `'solid' | 'spotted' | 'striped' | 'gradient'`. */
  pattern: BlobbiPattern;
  /** Seed-derived special mark: `'none' | 'star' | 'heart' | 'sparkle' | 'blush'`. */
  specialMark: BlobbiSpecialMark;
  /**
   * Seed-derived size category: `'small' | 'medium' | 'large'`. Persistent
   * identity like the pattern and the mark; the current body drawings do not
   * scale by it, so it is carried for hosts and future artwork.
   */
  size: BlobbiSize;
  /**
   * Blobbi theme variant from the `theme` extension tag (e.g. `'divine'`),
   * when present. This is a property of the CREATURE, written on its kind
   * 31124 event by the feature that themed it (Ditto's divine eggs read it
   * this way); it is not an application UI theme. The protocol defines no
   * closed vocabulary for it, so it is carried as the opaque string the tag
   * holds, exactly as `crossover_app` would be. Nothing in the kit draws it.
   */
  theme?: string;
  /** Display name, when the Blobbi has one. */
  name?: string;
}

/**
 * The part of a {@link BlobbiCompanion} the projection reads. Structural, so
 * a full parsed companion works as-is and so does a minimal object built from
 * `deriveVisualTraits` (an adoption preview, a test fixture) that has never
 * been a Nostr event.
 */
export type BlobbiVisualIdentitySource = Pick<BlobbiCompanion, 'stage' | 'visualTraits'> &
  Partial<Pick<BlobbiCompanion, 'adultType' | 'name' | 'allTags' | 'visualGeneration'>>;

/**
 * Project a Blobbi's domain state onto its visual identity.
 *
 * Pure: reads the given fields, allocates a new object, mutates nothing,
 * touches no relay and no clock. Identical input yields an identical result.
 * The mapping is field-for-field with the domain's own semantics; no
 * renderer policy (defaulting an absent adult form, dropping a form on a
 * non-adult, clamping a color) is applied here. Those decisions belong to the
 * renderer's normalization, so a renderer and a host card that both start from
 * this object can never disagree about what they were given.
 *
 * The one rule applied here is VOCABULARY: `adultType` is emitted only when it
 * is a canonical adult form. That is not policy, it is the type of the field.
 */
export function getBlobbiVisualIdentity(blobbi: BlobbiVisualIdentitySource): BlobbiVisualIdentity {
  const { stage, visualTraits, adultType, name, allTags, visualGeneration } = blobbi;

  const identity: BlobbiVisualIdentity = {
    stage,
    // A parsed companion carries the generation already; a minimal source
    // (adoption preview, fixture) may carry only tags, or nothing: then v1.
    visualGeneration: visualGeneration ?? parseVisualGeneration(allTags ?? []),
    baseColor: visualTraits.baseColor,
    secondaryColor: visualTraits.secondaryColor,
    eyeColor: visualTraits.eyeColor,
    pattern: visualTraits.pattern,
    specialMark: visualTraits.specialMark,
    size: visualTraits.size,
  };

  if (adultType !== undefined && isValidAdultForm(adultType)) {
    identity.adultType = adultType;
  }

  const theme = allTags ? getTagValue(allTags, 'theme') : undefined;
  if (theme !== undefined && theme !== '') {
    identity.theme = theme;
  }

  if (name !== undefined && name !== '') {
    identity.name = name;
  }

  return identity;
}
