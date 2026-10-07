/**
 * The rig's pose semantics, on real parts: a raised arm goes OUT from the
 * body's axis, not into the torso, and a swung arm goes forward. Measured
 * on the arm meshes in the body's frame, for both arms, across seeds whose
 * bodies and arms differ.
 */
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { deriveMorphology } from '@blobbi-kit/renderer/procedural';
import { buildBodySurface, type BodySurface } from '../geometry/body';
import { buildParts, type Pivoted } from '../geometry/parts';
import { createBlobbiIdentity, genomeOf } from '../identity/identity';
import type { BlobbiMaterials } from '../materials/materials';
import { seedFromLabel } from '../test-seeds';
import { bindRig, clonePose, createRig, REST_POSE, type BlobbiPose } from './rig';

const DEG = Math.PI / 180;

function build(label: string) {
  const scene = new Scene(new NullEngine());
  const mat = (name: string) => new StandardMaterial(name, scene);
  const m = { body: mat('b'), limb: mat('l'), foot: mat('f'), accent: mat('a'), horn: mat('h'), line: mat('n'), eyeWhite: mat('w'), iris: mat('i'), pupil: mat('p'), glint: mat('g'), feature: mat('e'), cheek: mat('c'), lid: mat('d') };
  const materials: BlobbiMaterials = { ...m, all: Object.values(m), dispose: () => undefined };
  const morphology = deriveMorphology(genomeOf(createBlobbiIdentity(seedFromLabel(label))), 'adult');
  const surface = buildBodySurface({ bodyWidth: morphology.bodyWidth, bodyHeight: morphology.bodyHeight, topWidth: morphology.topWidth, belly: morphology.belly, roundness: morphology.roundness, lean: morphology.lean });
  const nodes = createRig(scene, 'test');
  const parts = buildParts(scene, nodes.body, nodes.feet, surface, morphology, materials, 'test');
  const rig = bindRig(nodes.root, nodes.body, nodes.feet, parts);
  return { scene, surface, parts, rig };
}

/** How far inside the skin a body-frame point is (0 when outside). */
function depth(surface: BodySurface, p: Vector3): number {
  const v = (p.y - surface.baseY) / (surface.topY - surface.baseY);
  if (v > 1 || v < 0) return 0;
  const skin = surface.pointAt(Math.atan2(-p.x, p.z), v, 0);
  return Math.max(0, Math.hypot(skin.x, skin.z) - Math.hypot(p.x, p.z));
}

/** The arm's vertices in the body's frame. */
function armPoints(body: TransformNode, arm: Pivoted): Vector3[] {
  const inv = Matrix.Invert(body.computeWorldMatrix(true));
  const mesh = arm.meshes[0];
  const wm = mesh.computeWorldMatrix(true);
  const pos = mesh.getVerticesData('position') ?? [];
  const out: Vector3[] = [];
  for (let i = 0; i < pos.length; i += 3) out.push(Vector3.TransformCoordinates(Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), wm), inv));
  return out;
}

const measure = (surface: BodySurface, points: Vector3[]) => {
  const tip = points.reduce((low, p) => (p.y < low.y ? p : low), points[0]);
  const inside = points.filter((p) => depth(surface, p) > 0.003).length / points.length;
  return { tipOut: Math.abs(tip.x), tipForward: tip.z, inside, maxDepth: Math.max(...points.map((p) => depth(surface, p))) };
};

describe('rig: arm pose semantics', () => {
  for (const label of ['canonical', 'abc123', 'blobbi-1', 'pattern-0', 'variety-56', 'mark-0']) {
    it(`${label}: a raised arm goes out from the body, a swung arm goes forward, both arms`, () => {
      const { scene, surface, parts, rig } = build(label);
      for (const side of ['leftArm', 'rightArm'] as const) {
        rig.apply(REST_POSE);
        const rest = measure(surface, armPoints(rig.body, parts[side]));
        const raised: BlobbiPose = clonePose(REST_POSE);
        raised[side].raise = 50 * DEG;
        rig.apply(raised);
        const up = measure(surface, armPoints(rig.body, parts[side]));
        // Out, not in: the tip is further from the axis, and no more of the arm is in the torso than at rest.
        expect(up.tipOut, `${side} raised tip`).toBeGreaterThan(rest.tipOut + 0.05);
        expect(up.inside, `${side} raised inside`).toBeLessThanOrEqual(rest.inside);
        expect(up.maxDepth, `${side} raised depth`).toBeLessThanOrEqual(rest.maxDepth + 1e-6);
        const swung: BlobbiPose = clonePose(REST_POSE);
        swung[side].swing = 40 * DEG;
        rig.apply(swung);
        const forward = measure(surface, armPoints(rig.body, parts[side]));
        expect(forward.tipForward, `${side} swung tip`).toBeGreaterThan(rest.tipForward + 0.05);
      }
      scene.dispose();
    });
  }
});
