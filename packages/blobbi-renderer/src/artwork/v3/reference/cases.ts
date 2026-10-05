/**
 * THE REFERENCE BLOBBIS of algorithm 1: a small, fixed set of complete V3
 * identities whose morphology, palette and drawings are pinned
 * (`morphology.json`, `palette.json`, `paint.json`, held by
 * `reference.test.ts`).
 *
 * Each is written out in full, as an event would state it: nothing here is
 * computed, so retuning what a seed is GIVEN at creation (which is not
 * frozen: see `procedural/version.ts`) cannot move a reference. The seeds
 * are ordinary canonical seeds (SHA-256 digests, as a real Blobbi's is).
 *
 * Between them they carry every kind of every trait at least once:
 *
 * ```
 *                   antenna  horns     ears     tail  pattern   mark (region)       belly freckles
 *   plain           -        -         -        -     solid     -                   -     -
 *   antennae        double   -         -        -     solid     -                   -     -
 *   ears-and-horns  -        side      round    -     solid     -                   -     -
 *   tail            -        -         -        curl  solid     -                   yes   -
 *   spotted         single   -         -        nub   spotted   -                   -     -
 *   striped         -        forehead  -        -     striped   -                   -     yes
 *   gradient        -        -         pointed  leaf  gradient  sparkle (shoulder)  -     -
 *   special-mark    -        -         -        -     solid     star (forehead)     -     -
 *   crowded-crown   double   top       pointed  curl  spotted   heart (hip)         yes   yes
 *   light-palette   single   -         round    -     solid     moon (chest)        yes   yes
 *   as-created-1    double   forehead  -        curl  spotted   -                   -     -
 *   as-created-2    single   -         round    nub   solid     sparkle (chest)     -     -
 * ```
 *
 * The first ten state their traits to isolate one thing each (or, for
 * `crowded-crown`, to put everything on one head, which a seed alone never
 * does). `light-palette` is a very pale body with no accent colour: the
 * hardest case for marks and line work. The last two are exactly what
 * creation gave their seeds when they were written down.
 *
 * Every one of them is pinned as an egg, a baby and an adult.
 */
import type { BlobbiV3Identity } from '../identity';

export interface ReferenceCase {
  name: string;
  identity: BlobbiV3Identity;
}

const none = { antenna: 'none', horns: 'none', ears: 'none', tail: 'none', pattern: 'solid', specialMark: 'none', belly: false, freckles: false } as const;

export const REFERENCE_CASES: readonly ReferenceCase[] = [
  {
    name: 'plain',
    identity: { seed: 'b6b123d930eef236722122dc5c3aeb928b33e8903e87fb31c626abaede894f4d', algorithm: 1, colors: { base: '#eb66a0', secondary: '#ac1518', eye: '#430e1e' }, traits: { ...none } },
  },
  {
    name: 'antennae',
    identity: { seed: '9efb6e660ccdeedb7cf739c667e71bc2842e2c2318aae499f2c70e11f2c7b42f', algorithm: 1, colors: { base: '#85e44f', secondary: '#009267', eye: '#0e2102' }, traits: { ...none, antenna: 'double' } },
  },
  {
    name: 'ears-and-horns',
    identity: { seed: '3182f34c27357835ea7b551f60b5ad0c32452f1ad98725c6e5dfb328d6a07f86', algorithm: 1, colors: { base: '#cd5eda', secondary: '#5a09ac', eye: '#431f31' }, traits: { ...none, horns: 'side', ears: 'round' } },
  },
  {
    name: 'tail',
    identity: { seed: '0e7fed6ddf4931589f0811a5cbf98f50d69c39f663940965e4c382acee280e1f', algorithm: 1, colors: { base: '#7a69e9', secondary: '#004684', eye: '#38214a' }, traits: { ...none, tail: 'curl', belly: true } },
  },
  {
    name: 'spotted',
    identity: {
      seed: '32603d246c50229d05661a40986af7eca6146557b83448ec06574a0027894165',
      algorithm: 1,
      colors: { base: '#bb6be6', secondary: '#860065', eye: '#20320f', accent: '#9ada63' },
      traits: { ...none, antenna: 'single', tail: 'nub', pattern: 'spotted' },
    },
  },
  {
    name: 'striped',
    identity: {
      seed: 'ebb5da1dda7f2fb2af3064c977606d853494d0a1f7bf2e2417ba1fbf9031c451',
      algorithm: 1,
      colors: { base: '#f05a2b', secondary: '#9b0048', eye: '#002c36', accent: '#5ab8d0' },
      traits: { ...none, horns: 'forehead', pattern: 'striped', freckles: true },
    },
  },
  {
    name: 'gradient',
    identity: {
      seed: '85f3acae8106e4998ad22d639a8b41d971bd0ace4633b4f31f4d2492363d1c40',
      algorithm: 1,
      colors: { base: '#52d399', secondary: '#008780', eye: '#00362c' },
      traits: { ...none, ears: 'pointed', tail: 'leaf', pattern: 'gradient', specialMark: 'sparkle' },
    },
  },
  {
    name: 'special-mark',
    identity: { seed: '75e3f1e04e2d689ec403b47fa63a81bee90cfe616c09e380e6657652c0556bce', algorithm: 1, colors: { base: '#ae57dd', secondary: '#4300a7', eye: '#3a193f' }, traits: { ...none, specialMark: 'star' } },
  },
  {
    name: 'crowded-crown',
    identity: {
      seed: 'e7ddbe425cbd343679da4e24d40628213cb88815b9c1bc96956191501e827aea',
      algorithm: 1,
      colors: { base: '#42a6ce', secondary: '#005c69', eye: '#341000', accent: '#e98956' },
      traits: { antenna: 'double', horns: 'top', ears: 'pointed', tail: 'curl', pattern: 'spotted', specialMark: 'heart', belly: true, freckles: true },
    },
  },
  {
    name: 'light-palette',
    identity: {
      seed: '3157f17cae76b9e062dd3eda81561af0d0cb48e0b51c049fd0bae94881518b3e',
      algorithm: 1,
      colors: { base: '#f4ead6', secondary: '#dcc79c', eye: '#6b4a2b' },
      traits: { ...none, antenna: 'single', ears: 'round', specialMark: 'moon', belly: true, freckles: true },
    },
  },
  {
    name: 'as-created-1',
    identity: {
      seed: '31bb4983c5a1f44b80cdbebe9c0ec601ff9a37a845b8b8a4c4d37f32c2ff8b6e',
      algorithm: 1,
      colors: { base: '#4bd4a8', secondary: '#3e8026', eye: '#003229' },
      traits: { antenna: 'double', horns: 'forehead', ears: 'none', tail: 'curl', pattern: 'spotted', specialMark: 'none', belly: false, freckles: false },
    },
  },
  {
    name: 'as-created-2',
    identity: {
      seed: '87d874be679bdd9edb4a1f14712f15fac4979e1519516d68c9b6acd621f3b0c8',
      algorithm: 1,
      colors: { base: '#e456b9', secondary: '#8c002c', eye: '#0d3423', accent: '#63cf9d' },
      traits: { antenna: 'single', horns: 'none', ears: 'round', tail: 'nub', pattern: 'solid', specialMark: 'sparkle', belly: false, freckles: false },
    },
  },
];

/** The four colours of an identity, and nothing else: what the palette is derived from. */
export interface PaletteCase {
  name: string;
  /** What the case is for. */
  why: string;
  colors: BlobbiV3Identity['colors'];
}

/**
 * Explicit colours chosen to reach each branch of the palette derivation
 * that the reference Blobbis' own colours do not.
 */
export const PALETTE_CASES: readonly PaletteCase[] = [
  { name: 'accent-reads', why: 'an accent that stands off the body: the special mark takes it', colors: { base: '#7c5cf0', secondary: '#3a1d8a', eye: '#22124a', accent: '#ffd23f' } },
  { name: 'accent-too-close', why: 'an accent nearly the body colour: the mark falls back to a pale tint of the body', colors: { base: '#4fb3d9', secondary: '#1f5f7a', eye: '#10303d', accent: '#55b6da' } },
  { name: 'pale-no-accent', why: 'a near-white body: a pale tint would vanish, so the mark takes the pattern colour', colors: { base: '#faf6ee', secondary: '#cdbb99', eye: '#5a4630' } },
  { name: 'dark-body', why: 'a body darker than the generator ever makes: stated colours are honoured, roles still derive', colors: { base: '#2b3a67', secondary: '#0f1830', eye: '#d9a441', accent: '#e85d75' } },
  { name: 'grey-body', why: 'no chroma to carry a hue', colors: { base: '#9a9a9a', secondary: '#5c5c5c', eye: '#2a2a2a' } },
  { name: 'pink-body', why: 'the authored cheek pink would vanish on it, so the cheek is swapped', colors: { base: '#f47ab0', secondary: '#b3206a', eye: '#4a1030', accent: '#7ad3f4' } },
  { name: 'yellow-body', why: 'the lightest saturated hue: limbs, line and horns must still separate', colors: { base: '#f7dc4a', secondary: '#c98a00', eye: '#3d2b00' } },
];
