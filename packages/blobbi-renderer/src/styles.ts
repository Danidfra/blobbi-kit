/**
 * The renderer's OPTIONAL decoration stylesheet, as text.
 *
 * Everything that affects geometry (the box, the body fill, accessory and
 * effect placement) is inline and needs no CSS from anyone. The two things
 * below are decoration a host may want and may equally ignore:
 *
 *  - `.blobbi-renderer--interactive` (emitted when `interactive` is set): a
 *    hover lift and a short transition, the affordance the historical Island
 *    renderer expressed with utility classes;
 *  - `.blobbi-renderer--framed` (emitted when `transparent={false}`): the
 *    circular frame and soft shadow of the historical framed mode. The frame's
 *    gradient fill was always host-defined and still is: paint it on the same
 *    class from the host stylesheet.
 *
 * Mount it once, however the host mounts CSS (`<style>{BLOBBI_RENDERER_STYLESHEET}</style>`,
 * a CSS-in-JS injection, a build-time copy). Nothing in the package injects it
 * for you, because the geometry does not depend on it. Every selector is
 * namespaced `blobbi-renderer` so it cannot collide with a host rule.
 */
export const BLOBBI_RENDERER_STYLESHEET = `
.blobbi-renderer--interactive{transition:transform .2s ease,box-shadow .2s ease;}
.blobbi-renderer--interactive:hover{transform:scale(1.05);}
.blobbi-renderer--framed{border-radius:9999px;box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1);}
@media (prefers-reduced-motion: reduce){
.blobbi-renderer--interactive{transition:none;}
}
`;
