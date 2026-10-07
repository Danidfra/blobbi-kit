import { describe, expect, it } from 'vitest';
import { KEY_POSES, NEUTRAL_POSE, type FacePose } from '@blobbi-kit/renderer/procedural';
import { lerpFacePose } from './pose';

const close = (a: FacePose, b: FacePose) => {
  for (const part of ['mouth', 'browLeft', 'browRight'] as const) {
    for (const key of Object.keys(a[part])) expect((a[part] as unknown as Record<string, number>)[key], `${part}.${key}`).toBeCloseTo((b[part] as unknown as Record<string, number>)[key], 12);
  }
  for (const key of ['lid', 'irisScale', 'blush'] as const) expect(a[key]).toBeCloseTo(b[key], 12);
};

describe('lerpFacePose', () => {
  it('is the first pose at 0, the second at 1, and half way between at 0.5', () => {
    close(lerpFacePose(NEUTRAL_POSE, KEY_POSES.happy, 0), NEUTRAL_POSE);
    close(lerpFacePose(NEUTRAL_POSE, KEY_POSES.happy, 1), KEY_POSES.happy);
    const half = lerpFacePose(NEUTRAL_POSE, KEY_POSES.happy, 0.5);
    expect(half.mouth.low).toBeCloseTo((NEUTRAL_POSE.mouth.low + KEY_POSES.happy.mouth.low) / 2);
    expect(half.browLeft.ctrl).toBeCloseTo((NEUTRAL_POSE.browLeft.ctrl + KEY_POSES.happy.browLeft.ctrl) / 2);
  });
});
