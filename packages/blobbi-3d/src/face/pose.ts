/**
 * Runtime blending between two of the kit's face poses: what a 3D character
 * does while an expression eases in. The poses themselves (key poses,
 * blending by weight, lids) are the kit's `expressions`.
 */
import type { FacePose } from '@blobbi-kit/renderer/procedural';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolate two poses, `t` of the way from `a` to `b`. */
export function lerpFacePose(a: FacePose, b: FacePose, t: number): FacePose {
  const mix = <T extends object>(x: T, y: T): T => {
    const out = {} as Record<string, number>;
    for (const key of Object.keys(x)) out[key] = lerp((x as Record<string, number>)[key], (y as Record<string, number>)[key], t);
    return out as T;
  };
  return {
    mouth: mix(a.mouth, b.mouth),
    browLeft: mix(a.browLeft, b.browLeft),
    browRight: mix(a.browRight, b.browRight),
    lid: lerp(a.lid, b.lid, t),
    irisScale: lerp(a.irisScale, b.irisScale, t),
    blush: lerp(a.blush, b.blush, t),
  };
}
