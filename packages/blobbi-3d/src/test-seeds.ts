/**
 * TEST ONLY. The V3 lab's rule for naming seeds (`seedFor` in
 * blobbi-procedural's `kit.ts`): a label stands for one real 64-digit seed,
 * so `abc123` here is the same individual as `abc123` in the lab. Never
 * shipped; it is bookkeeping about WHICH Blobbi to look at.
 */
import { canonicalBlobbiV3Seed } from '@blobbi-kit/renderer';

export function seedFromLabel(label: string): string {
  const own = canonicalBlobbiV3Seed(label);
  if (own) return own;
  let out = '';
  for (let word = 0; word < 8; word++) {
    let h = (0x811c9dc5 ^ (word * 0x9e3779b1)) >>> 0;
    for (let i = 0; i <= label.length; i++) h = Math.imul(h ^ (i < label.length ? label.charCodeAt(i) : label.length + 0x10000), 0x01000193) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out;
}
