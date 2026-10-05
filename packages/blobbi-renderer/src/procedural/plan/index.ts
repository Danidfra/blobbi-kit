import { ADULT_PLAN } from './adult';
import { BABY_PLAN } from './baby';
import type { FrontPlan, LifeStage, StagePlan, TuftPlan } from './types';

export * from './types';
export { ADULT_PLAN, BABY_PLAN };
export { BABY_BOX, BABY_UNIT } from './baby';

export const STAGE_PLANS: Readonly<Record<LifeStage, StagePlan>> = { adult: ADULT_PLAN, baby: BABY_PLAN };

export const planFor = (stage: LifeStage): StagePlan => STAGE_PLANS[stage] ?? ADULT_PLAN;

/**
 * The front plan as seen from BEHIND: anatomy reflected about the body's
 * axis. What was on the viewer's right is now on the viewer's left: the tuft
 * leans the other way and the arms swap. Lighting does not turn with the
 * character, so the shine and the gradients stay where the plan put them.
 */
export function mirrorFrontPlan(plan: FrontPlan): FrontPlan {
  const axis = plan.body.axisX;
  const flipX = (x: number) => 2 * axis - x;
  const leaf = (l: TuftPlan['main']) => ({ ...l, cx: flipX(l.cx), rotation: -l.rotation });
  const { arms, tuft } = plan;
  return {
    ...plan,
    arms: arms && { ...arms, left: { x: flipX(arms.right.x), y: arms.right.y }, right: { x: flipX(arms.left.x), y: arms.left.y } },
    tuft: tuft && {
      root: { x: flipX(tuft.root.x), y: tuft.root.y },
      main: leaf(tuft.main),
      secondary: leaf(tuft.secondary),
      details: tuft.details.map((d) => ({
        start: { x: flipX(d.start.x), y: d.start.y },
        ctrl: { x: -d.ctrl.x, y: d.ctrl.y },
        end: { x: -d.end.x, y: d.end.y },
        width: d.width,
      })),
    },
  };
}
