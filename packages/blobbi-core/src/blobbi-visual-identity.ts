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
 * WHAT IS NOT HERE, deliberately. Render STATE (size, facing, sleeping, gaze)
 * and HOST inputs (accessories, effects, inventory) are not identity: the
 * same Blobbi is the same Blobbi asleep, seen from behind, wearing a hat.
 * Those stay with the host and the renderer. Transport data (the event, the
 * d-tag, the seed) is not identity either; it is how the identity was
 * derived, which the renderer has no reason to know.
 */
import type { BlobbiCompanion, BlobbiPattern, BlobbiSpecialMark, BlobbiStage } from './blobbi';
import { getTagValue } from './blobbi';

/**
 * Plain, serializable visual identity of a Blobbi.
 *
 * Every value survives `JSON.parse(JSON.stringify(...))`. Optionality follows
 * the domain: `parseBlobbiEvent` always resolves a stage and a full set of
 * visual traits (seed-derived, with legacy-tag fallbacks and defaults), so
 * those are required; an adult form exists only when the event carries or
 * derives one; a theme exists only when the extension tag is present; a name
 * is emitted only when non-empty.
 */
export interface BlobbiVisualIdentity {
  /** Life stage: `'egg' | 'baby' | 'adult'`. */
  stage: BlobbiStage;
  /** Adult form (`'bloomi'`, `'catti'`, ...), as the domain resolved it. */
  adultType?: string;
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
  /** Theme variant from the `theme` extension tag (e.g. `'divine'`), when present. */
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
  Partial<Pick<BlobbiCompanion, 'adultType' | 'name' | 'allTags'>>;

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
 */
export function getBlobbiVisualIdentity(blobbi: BlobbiVisualIdentitySource): BlobbiVisualIdentity {
  const { stage, visualTraits, adultType, name, allTags } = blobbi;

  const identity: BlobbiVisualIdentity = {
    stage,
    baseColor: visualTraits.baseColor,
    secondaryColor: visualTraits.secondaryColor,
    eyeColor: visualTraits.eyeColor,
    pattern: visualTraits.pattern,
    specialMark: visualTraits.specialMark,
  };

  if (adultType !== undefined && adultType !== '') {
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
