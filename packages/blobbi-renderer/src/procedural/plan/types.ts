/**
 * A STAGE PLAN: the art-directed canonical drawing of one life stage, as
 * numbers. It is what "small authored geometry" means in this engine: the
 * anchors of a silhouette, where the canonical eye sits, the shape of the
 * arm paddle. A plan is never drawn as is; the builders read it, apply an
 * individual's morphology and generate the character.
 *
 * A plan has a FRONT and a SIDE drawing of the same canonical individual
 * (the back view is the front, seen from behind). All coordinates are in
 * root units (the Adult V2 artwork's own unit), in the frame of the shared
 * viewBox, so a unit is the same size in every view and at every stage.
 */
import type { BrowPose, MouthPose } from '../expressions';
import type { Pt } from '../geometry';

export type LifeStage = 'baby' | 'adult';
export type View = 'front' | 'side' | 'back';
export type Direction = 'left' | 'right';

export const LIFE_STAGES: readonly LifeStage[] = ['baby', 'adult'];

/**
 * Where an individual is in its life, as a host knows it. `baby` and `adult`
 * are ANATOMIES (life stages, with a plan and a morphology each). `egg` is
 * not: it is the shell the same individual incubates in, with a small model
 * of its own (`egg.ts`). They share this one name so a host can simply say
 * which of the three to draw.
 */
export type BlobbiStage = 'egg' | LifeStage;
export const BLOBBI_STAGES: readonly BlobbiStage[] = ['egg', 'baby', 'adult'];
export const VIEWS: readonly View[] = ['front', 'side', 'back'];
export const DIRECTIONS: readonly Direction[] = ['left', 'right'];

/** One anchor of a silhouette, with the handles that arrive at and leave it. */
export interface PlanAnchor {
  at: Pt;
  in: Pt;
  out: Pt;
  /** How much this anchor follows the `topWidth` gene (0..1). */
  top?: number;
  /** How much it follows the `belly` gene (0..1). */
  belly?: number;
  /** A crown or base anchor: its handles lengthen with `roundness`. */
  round?: boolean;
}

/**
 * How a stage is PAINTED and what it stands on. The two stages are different
 * drawings of one creature: the adult is the layered Adult V2 artwork, the
 * baby is the official Baby V1, a floating seed with flat shading and no
 * limbs. The builders are the same; this says which paint they use.
 */
export interface StageLook {
  /**
   * `v2`: the authored user-space gradient, a contact shadow and a shine.
   * `v1`: a three-stop gradient over the body's box and a soft inner glow.
   */
  body: 'v2' | 'v1';
  /** `layered`: white, iris, pupil, two highlights. `simple`: shaded white, one dark disc, one highlight. */
  eye: 'layered' | 'simple';
  /** `legs` walks on its feet; `hop` has none and bobs along, floating. */
  gait: 'legs' | 'hop';
}

/** A closed eye's stroke, in eye radii from the eye's centre. */
export interface ClosedLid {
  chord: number;
  sag: number;
  reach: number;
  lineWidth: number;
}

/** The inner eye, in eye-local units, as offsets from the eye white's centre. */
export interface EyeLocal {
  iris: { dx: number; dy: number; rx: number; ry: number };
  pupil: { dx: number; dy: number; rx: number; ry: number };
  highlight: { dx: number; dy: number; rx: number; ry: number };
  glint: { dx: number; dy: number; r: number; opacity: number };
}

export interface TuftPlan {
  /** The point the tuft grows from: scaling and tilting pivot on it. */
  root: Pt;
  main: { cx: number; cy: number; rx: number; ry: number; rotation: number };
  secondary: { cx: number; cy: number; rx: number; ry: number; rotation: number };
  /** Quadratic detail strokes: `ctrl` and `end` are relative to `start`. */
  details: { start: Pt; ctrl: Pt; end: Pt; width: number }[];
}

/** A closed paddle as cubics relative to its shoulder point: `[c1, c2, end]` each. */
export type ArmTemplate = readonly (readonly [Pt, Pt, Pt])[];

export interface FrontPlan {
  body: {
    axisX: number;
    top: number;
    baseY: number;
    /** Right-side anchors as offsets from the crown; the left side mirrors them. */
    anchors: PlanAnchor[];
    /** Half the width at the widest anchor. */
    halfWidth: number;
    /** Half the width of the crown (the shoulder anchor): head features are placed in fractions of it. */
    crownHalfWidth: number;
    /**
     * For a `v1` body: how far above the crown the authored path's box
     * reaches (its gradient is laid over that box).
     */
    boxAbove?: number;
  };
  eyes: EyePlan & { left: Pt; right: Pt; localLeft: EyeLocal; localRight: EyeLocal };
  /** Absent on a stage that has no brows. */
  brows: { width: number; strokeWidth: number; opacity: number; left: Pt; right: Pt; neutralLeft: BrowPose; neutralRight: BrowPose } | null;
  cheeks: CheekPlan & { left: Pt; right: Pt };
  mouth: MouthPlan;
  /** Absent on a stage that has no feet. */
  feet: { spacing: number; cy: number; rx: number; ry: number; rotation: number; shadow: { dy: number; rx: number; ry: number } } | null;
  arms: { left: Pt; right: Pt; template: ArmTemplate; scale: number } | null;
  tuft: TuftPlan | null;
  shine: { dx: number; dy: number; rx: number; ry: number; rotation: number } | null;
  /** The `v1` body's soft inner light: its centre in the canonical drawing, and its radii. */
  glow: { center: Pt; rx: number; ry: number; opacity: number } | null;
  groundShadow: { cy: number; rx: number; ry: number };
  /** The ground line under the character: where its soles are, or what it floats above. */
  ground: number;
}

export interface EyePlan {
  k: number;
  white: { rx: number; ry: number };
  /** Full gaze deflection, in eye-local units. */
  gazeTravel: number;
  /** The closed eye's stroke, where it differs from the adult's. */
  closed?: ClosedLid;
  /**
   * What a wide eye does. The adult's shows more white by shrinking the
   * inner eye (the default); the baby's whole eye grows a little.
   */
  wide?: { white: number; inner: number };
}

export interface CheekPlan {
  rx: number;
  ry: number;
  /** Resting opacity of the cheek and of its highlight (0: no highlight). */
  opacity: number;
  highlightOpacity: number;
  highlight: { dx: number; dy: number; rx: number; ry: number };
  /** How much a strong blush enlarges the cheek (the baby's grows; the adult's only deepens). */
  strongScale?: number;
  /** The artwork's sleeping face has no blush. */
  hiddenAsleep?: boolean;
}

export interface MouthPlan {
  start: Pt;
  width: number;
  strokeWidth: number;
  neutral: MouthPose;
  /** How deep this stage's mouth shapes are, relative to the adult's (the baby's are quieter). */
  depthScale: number;
  /** The mouth of a sleeping face with no expression, where the artwork has one. */
  asleep?: MouthPose;
}

export interface SidePlan {
  body: {
    /** The vertical line depth is scaled about. */
    axisX: number;
    /** The closed profile, facing right, starting at the crown and running down the face. */
    anchors: PlanAnchor[];
    /** The `v2` body's radial gradient, in user space. */
    gradient: { cx: number; cy: number; rx: number; ry: number; mid: number } | null;
    shadow: { dx: number; dy: number } | null;
  };
  eye: EyePlan & { center: Pt; local: EyeLocal };
  brow: { width: number; strokeWidth: number; opacity: number; start: Pt; neutral: BrowPose } | null;
  cheek: CheekPlan & { center: Pt };
  /** The profile mouth: the visible half, sloping down toward the face's edge. */
  mouth: MouthPlan & { slope: number };
  feet: {
    near: { cx: number; cy: number; rx: number; ry: number; rotation: number };
    far: { cx: number; cy: number; rx: number; ry: number; rotation: number; opacity: number };
  } | null;
  arms: { near: { start: Pt; template: ArmTemplate }; far: { start: Pt; template: ArmTemplate; opacity: number }; scale: number } | null;
  tuft: TuftPlan | null;
  shine: { cx: number; cy: number; rx: number; ry: number; rotation: number } | null;
  glow: { center: Pt; rx: number; ry: number; opacity: number } | null;
  groundShadow: { cx: number; cy: number; rx: number; ry: number };
  ground: number;
}

/** How developed each trait is at this stage, as a multiplier on its adult size. */
export interface Development {
  antenna: number;
  horn: number;
  ear: number;
  /** 0: the trait has not appeared yet at this stage. */
  tail: number;
  marking: number;
  /** Whether a belly patch shows at this stage. */
  belly: boolean;
}

/**
 * A patch of the body's SURFACE, anatomically: degrees round the body from
 * the middle of the face (0 the face, 90 a flank, 180 the middle of the
 * back) and fractions of the body's height from the crown. A view's frame
 * turns such a place into where it is drawn, or says it is turned away.
 */
export interface SurfaceRegion {
  theta: readonly [number, number];
  y: readonly [number, number];
  /** How large a mark may be here, relative to its full size: a small patch takes a smaller mark. Default 1. */
  size?: number;
}

/**
 * The places a special mark may live. Each is a patch of skin nothing else
 * uses: clear of the eyes, brows, cheeks and mouth through EVERY expression
 * (a raised brow, a wide eye, the widest open mouth), of the arms and feet,
 * and of where crown traits root. The numbers in each plan are measured on
 * that stage's own face (`surface.test.ts` holds them to it).
 *
 *  - `forehead`  above the brows (higher than a raised one reaches), a little to one side of the middle
 *  - `chest`     under the mouth, to one side of the middle
 *  - `hip`       low on a flank, ahead of the arm
 *  - `shoulder`  high on the back, to one side
 */
export const MARK_REGIONS = ['forehead', 'chest', 'hip', 'shoulder'] as const;
export type MarkRegionName = (typeof MARK_REGIONS)[number];

export interface SurfacePlan {
  /**
   * The band of the body's height the face lives in (brows to mouth and
   * cheeks, with room for every expression). A pattern stays behind the
   * flanks at these heights.
   */
  face: { top: number; bottom: number };
  marks: Readonly<Record<MarkRegionName, SurfaceRegion>>;
}

export interface StagePlan {
  stage: LifeStage;
  /** Overall size relative to the adult: scales unit-valued genes and trait dimensions. */
  scale: number;
  development: Development;
  look: StageLook;
  /** Where things that lie ON the skin may go at this stage. */
  surface: SurfacePlan;
  front: FrontPlan;
  side: SidePlan;
}
