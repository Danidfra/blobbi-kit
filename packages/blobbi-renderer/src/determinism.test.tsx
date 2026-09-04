/**
 * INPUT PURITY and DETERMINISM.
 *
 * The renderer is a function: same input, same markup, and the input comes
 * back untouched. Hosts hand it objects straight from their stores and caches,
 * so a mutation here would corrupt state the host believes it owns; a
 * non-deterministic render would make two Blobbis with the same data look
 * different and would defeat every memo boundary above the renderer.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import {
  BlobbiRenderer,
  loadBlobbiSvg,
  normalizeAccessoryPlacements,
  normalizeBlobbiRenderModel,
  normalizeBlobbiVisualEffects,
  type AccessoryPlacementInput,
  type BlobbiVisual,
  type BlobbiVisualEffect,
} from './index';

/** Freeze an object graph so any write throws (strict mode, ESM). */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

const snapshot = (value: unknown) => JSON.stringify(value);

function fixtures() {
  const visual: BlobbiVisual = {
    stage: 'adult',
    adultType: 'froggi',
    baseColor: '#66aa33',
    secondaryColor: '#aadd88',
    eyeColor: '#223344',
    pattern: 'spotted',
    specialMark: 'star',
    theme: 'plain',
    name: 'Frozen',
  };
  const accessoriesInput: AccessoryPlacementInput[] = [
    { code: 'headwear-a', slot: 'headwear', x: 50, y: 20, scale: 1.1, rot: 5, url: 'https://x.test/a.png' },
    { code: 'back-b', slot: 'back', x: 50, y: 60, scale: 1.3, rot: 0, flipX: true, url: 'https://x.test/b.png' },
  ];
  const effects: BlobbiVisualEffect[] = [
    { id: 'celestial-aura' },
    { id: 'golden-sparkles', intensity: 0.7 },
  ];
  const eyeOffset = { x: 0.3, y: -0.2 };
  return { visual, accessoriesInput, effects, eyeOffset };
}

describe('inputs are never mutated', () => {
  it('rendering leaves visual, accessories, effects and eyeOffset byte-identical', () => {
    const { visual, accessoriesInput, effects, eyeOffset } = fixtures();
    const accessories = normalizeAccessoryPlacements(accessoriesInput);
    const before = snapshot({ visual, accessoriesInput, accessories, effects, eyeOffset });

    const { rerender } = render(
      <BlobbiRenderer
        visual={visual}
        instanceId="pure-1"
        accessories={accessories}
        effects={effects}
        eyeOffset={eyeOffset}
        facing="front"
        size="xl"
      />,
    );
    rerender(
      <BlobbiRenderer
        visual={visual}
        instanceId="pure-1"
        accessories={accessories}
        effects={effects}
        eyeOffset={eyeOffset}
        facing="back"
        isSleeping
        size={200}
      />,
    );

    expect(snapshot({ visual, accessoriesInput, accessories, effects, eyeOffset })).toBe(before);
  });

  it('deep-frozen inputs render without throwing (nothing writes to them)', () => {
    const { visual, accessoriesInput, effects, eyeOffset } = fixtures();
    deepFreeze(visual);
    deepFreeze(accessoriesInput);
    deepFreeze(effects);
    deepFreeze(eyeOffset);
    const accessories = deepFreeze(normalizeAccessoryPlacements(accessoriesInput));

    expect(() =>
      render(
        <BlobbiRenderer
          visual={visual}
          instanceId="pure-frozen"
          accessories={accessories}
          effects={effects}
          eyeOffset={eyeOffset}
        />,
      ),
    ).not.toThrow();
    expect(() => normalizeBlobbiRenderModel({ visual, instanceId: 'x', accessories })).not.toThrow();
    expect(() => normalizeBlobbiVisualEffects(effects)).not.toThrow();
  });

  it('the normalizers return new arrays and leave their inputs alone', () => {
    const { accessoriesInput, effects } = fixtures();
    const accessoriesBefore = snapshot(accessoriesInput);
    const effectsBefore = snapshot(effects);

    const placements = normalizeAccessoryPlacements(accessoriesInput, { facing: 'back' });
    const resolved = normalizeBlobbiVisualEffects(effects);

    expect(placements).not.toBe(accessoriesInput);
    expect(resolved).not.toBe(effects);
    expect(snapshot(accessoriesInput)).toBe(accessoriesBefore);
    expect(snapshot(effects)).toBe(effectsBefore);
  });
});

describe('identical inputs produce identical output', () => {
  it('loadBlobbiSvg is referentially transparent across repeated calls and forms', () => {
    for (const [stage, form] of [['baby', undefined], ['adult', 'crysti'], ['adult', 'pandi']] as const) {
      const a = loadBlobbiSvg(stage, form, '#123456', '#abcdef', '#0f0f0f', false, 'det', 'front');
      const b = loadBlobbiSvg(stage, form, '#123456', '#abcdef', '#0f0f0f', false, 'det', 'front');
      const c = loadBlobbiSvg(stage, form, '#123456', '#abcdef', '#0f0f0f', false, 'det', 'rear');
      expect(a).toBe(b);
      expect(c).toBe(loadBlobbiSvg(stage, form, '#123456', '#abcdef', '#0f0f0f', false, 'det', 'rear'));
      expect(a).not.toBe(c);
    }
  });

  it('two separate renders of the same props emit identical markup, effects included', () => {
    const { visual, accessoriesInput, effects, eyeOffset } = fixtures();
    const accessories = normalizeAccessoryPlacements(accessoriesInput);
    const draw = () =>
      render(
        <BlobbiRenderer
          visual={visual}
          instanceId="det-twin"
          accessories={accessories}
          effects={effects}
          eyeOffset={eyeOffset}
          size="2xl"
        />,
      ).container.innerHTML;
    expect(draw()).toBe(draw());
  });

  it('the normalized model is a pure projection of its input', () => {
    const { visual } = fixtures();
    const input = { visual, instanceId: 'model', facing: 'back' as const, eyeOffset: { x: 9, y: -9 } };
    expect(normalizeBlobbiRenderModel(input)).toEqual(normalizeBlobbiRenderModel(input));
    // Rear facing drops gaze rather than clamping it, deterministically.
    expect(normalizeBlobbiRenderModel(input).gaze).toBeNull();
  });
});

describe('instance ids keep simultaneous renderers apart', () => {
  it('distinct ids share no SVG id and every url(#…) resolves within its own drawing', () => {
    const { visual, effects } = fixtures();
    const { container } = render(
      <div>
        <BlobbiRenderer visual={visual} instanceId="iso-a" effects={effects} />
        <BlobbiRenderer visual={visual} instanceId="iso-b" effects={effects} eyeOffset={{ x: 1, y: 0 }} />
        <BlobbiRenderer visual={{ ...visual, stage: 'baby' }} instanceId="iso-c" />
      </div>,
    );
    const roots = [...container.querySelectorAll('[data-blobbi-renderer]')];
    expect(roots).toHaveLength(3);

    const idSets = roots.map((root) => new Set([...root.querySelectorAll('[id]')].map((el) => el.id)));
    for (let i = 0; i < idSets.length; i++) {
      for (let j = i + 1; j < idSets.length; j++) {
        const shared = [...idSets[i]].filter((id) => idSets[j].has(id));
        expect(shared, `renderers ${i} and ${j} share ids`).toEqual([]);
      }
    }
    roots.forEach((root, i) => {
      const refs = [...root.innerHTML.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of new Set(refs)) {
        expect(idSets[i].has(ref), `dangling url(#${ref}) in renderer ${i}`).toBe(true);
      }
    });
  });
});
