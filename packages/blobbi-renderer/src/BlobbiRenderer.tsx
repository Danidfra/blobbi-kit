/**
 * BlobbiRenderer: the PURE Blobbi renderer.
 *
 * Renders exclusively from explicit props: no Nostr hooks, no profile hooks,
 * no equipment subscriptions, no location/world knowledge, no host CSS. Given
 * plain visual data and visual state, it draws the Blobbi; that is the entire
 * contract.
 *
 * Geometry contract (see README, "The canonical box"):
 *  - ONE square renderer box per render, sized INLINE from `size` (a token, a
 *    pixel number or a CSS length), so no consumer build has to generate a
 *    class for it;
 *  - the body SVG fills the box exactly (an absolutely positioned wrapper plus
 *    the SVG's own width/height 100% and square viewBox);
 *  - accessories position by percentages of the SAME box and size as a
 *    fraction of it ({@link ACCESSORY_BASE_PERCENT} x saved scale);
 *  - accessories paint in normalized layer order: behind-body placements,
 *    then the body, then front placements (see `accessory-normalize.ts`);
 *  - accessories may overflow the box; the renderer clips nothing.
 *
 * Visual EFFECTS interleave with that order without disturbing it:
 *
 *   [fx behind] -> accessories behind -> BODY -> [fx mid] -> accessories front
 *   -> [fx front]
 *
 * They are decoration only: every effect element is absolutely positioned and
 * `pointer-events: none`, so nothing an effect does can change a measurement,
 * move an anchor or intercept a click. See `effects/`.
 *
 * Styling boundary: everything that affects geometry is an inline style.
 * The only class names emitted are `blobbi-renderer` plus the two optional
 * decoration modifiers (`--interactive`, `--framed`) that
 * `BLOBBI_RENDERER_STYLESHEET` styles if a host mounts it, and whatever the
 * host passes in `className`.
 */
import { useMemo, type CSSProperties } from 'react';
import { loadBlobbiSvg } from './artwork/load-blobbi-svg';
import { applyGazeMarkup } from './svg';
import {
  ACCESSORY_BASE_PERCENT,
  resolveBlobbiRenderSize,
  type BlobbiRendererSize,
} from './blobbi-render-size';
import { normalizeBlobbiRenderModel, type BlobbiVisual } from './blobbi-render-model';
import type { NormalizedAccessoryPlacement } from './accessory-normalize';
import { BlobbiEffectLayer, BlobbiEffectStyles } from './effects/BlobbiEffectLayers';
import {
  normalizeBlobbiVisualEffects,
  type BlobbiVisualEffect,
} from './effects/effect-model';

/**
 * A string-to-string hook applied to the finished body SVG before it reaches
 * the DOM. The bundled artwork is trusted package data, so the renderer ships
 * no sanitizer of its own; a host that wants defense in depth (or that
 * post-processes the markup itself) passes one here. It MUST be pure: the
 * output is memoized on the function's identity, so pass a stable reference.
 */
export type BlobbiSvgSanitizer = (svg: string) => string;

export interface BlobbiRendererProps {
  /** Plain visual data. See {@link BlobbiVisual}. */
  visual: BlobbiVisual;
  /**
   * Stable id namespace for the inline SVG's gradient/clip ids. Two rendered
   * Blobbis must never share an instance id (their gradients would collide).
   */
  instanceId: string;
  /**
   * Box size: a token (`'sm'`..`'3xl'`), a pixel number, or a CSS length
   * string such as `'100%'`. Defaults to `'lg'` (96px).
   */
  size?: BlobbiRendererSize;
  isSleeping?: boolean;
  /** Kept distinct from sleeping for the seated legacy prop; both close eyes. */
  eyesClosed?: boolean;
  facing?: 'front' | 'back';
  /** Normalized gaze direction (-1..1 per axis); undefined renders statically. */
  eyeOffset?: { x: number; y: number };
  /** Pre-normalized accessory placements (already sorted; see accessory-normalize). */
  accessories?: readonly NormalizedAccessoryPlacement[];
  /**
   * Visual effects to draw around this Blobbi: plain, serializable
   * `{ id, intensity? }` data and nothing else. No component, class name, CSS
   * or animation expression is accepted here, and an id this package does not
   * implement is ignored rather than rendered as something arbitrary.
   *
   * Normalized INSIDE the renderer (unlike accessories, which arrive
   * pre-normalized) because effect resolution contains no host policy at all.
   */
  effects?: readonly BlobbiVisualEffect[];
  /** Optional pure post-processor for the body SVG string. */
  sanitize?: BlobbiSvgSanitizer;
  /**
   * Accessible name for the image (`aria-label`). When neither `label` nor
   * `title` is given and the renderer is not clickable, the Blobbi is treated
   * as decorative and hidden from assistive technology.
   */
  label?: string;
  /** Tooltip text (`title`). Also used as the accessible name if `label` is absent. */
  title?: string;
  className?: string;
  /**
   * Extra inline styles merged AFTER the renderer's own. A host may override
   * the box (`{ width: '100%', height: '100%' }`); doing so is the host's
   * responsibility and only makes sense without accessories.
   */
  style?: CSSProperties;
  onClick?: () => void;
  /** Adds the `blobbi-renderer--interactive` class and a pointer cursor. */
  interactive?: boolean;
  /**
   * `false` adds the `blobbi-renderer--framed` class (the legacy circular
   * frame). The box and body fill are identical in both modes; only decoration
   * differs, and only if the host mounts `BLOBBI_RENDERER_STYLESHEET`.
   */
  transparent?: boolean;
}

/** Join class names, skipping falsy entries. No dependency needed for this. */
function classNames(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** `position: absolute; inset: 0` spelled out, so every CSS engine agrees. */
const FILL_PARENT: CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const ACCESSORY_LAYER_STYLE: CSSProperties = {
  ...FILL_PARENT,
  pointerEvents: 'none',
};

const ACCESSORY_IMAGE_STYLE: CSSProperties = {
  // `display: block` and `max-width: none` are what a Tailwind preflight would
  // give an <img>; stated inline so hosts without a reset render identically.
  display: 'block',
  width: '100%',
  height: '100%',
  maxWidth: 'none',
  objectFit: 'contain',
};

/**
 * Static (non-editing) accessory image, sized as a fraction of the box.
 *
 * Source selection is DATA, not policy: the placement arrives with an ordered
 * `sources` list (resolved by the accessory normalizer's asset adapter) and
 * this component only walks it. That is why the renderer imports no asset-path
 * module and knows nothing about any host's asset layout.
 */
function AccessoryPlacementView({ placement }: { placement: NormalizedAccessoryPlacement }) {
  return (
    <div
      data-accessory-code={placement.code}
      data-accessory-layer={placement.layer}
      style={{
        position: 'absolute',
        left: `${placement.xPercent}%`,
        top: `${placement.yPercent}%`,
        // The box is square, so identical width/height percentages stay square.
        width: ACCESSORY_BASE_PERCENT,
        height: ACCESSORY_BASE_PERCENT,
        transform: `translate(-50%, -50%) scale(${placement.scale}) rotate(${placement.rotationDeg}deg) ${placement.flipX ? 'scaleX(-1)' : ''}`,
        transformOrigin: 'center',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
      title={placement.code}
    >
      <img
        src={placement.imageUrl}
        alt={placement.code}
        style={ACCESSORY_IMAGE_STYLE}
        draggable={false}
        data-source-index="0"
        onError={(e) => {
          // Advance through the candidate list, then give up and hide. The
          // cursor lives on the element rather than in React state so a failing
          // image costs no re-render of the Blobbi around it.
          const target = e.currentTarget;
          const next = Number(target.dataset.sourceIndex ?? '0') + 1;
          target.dataset.sourceIndex = String(next);
          if (next < placement.sources.length) {
            target.src = placement.sources[next];
          } else {
            target.style.display = 'none';
          }
        }}
      />
    </div>
  );
}

/**
 * One accessory layer group (behind or in front of the body). Placements are
 * already sorted by the normalizer; DOM order is the paint order.
 */
export function AccessoryLayerView({
  placements,
  layer,
  className,
}: {
  placements: readonly NormalizedAccessoryPlacement[];
  layer: 'behind' | 'front';
  className?: string;
}) {
  const layerPlacements = placements.filter((p) => p.layer === layer);
  if (layerPlacements.length === 0) return null;

  return (
    <div
      className={className}
      style={ACCESSORY_LAYER_STYLE}
      data-accessory-layer-group={layer}
    >
      {layerPlacements.map((placement) => (
        <AccessoryPlacementView key={placement.id} placement={placement} />
      ))}
    </div>
  );
}

export function BlobbiRenderer({
  visual,
  instanceId,
  size = 'lg',
  isSleeping = false,
  eyesClosed = false,
  facing = 'front',
  eyeOffset,
  accessories = [],
  effects,
  sanitize,
  label,
  title,
  className,
  style,
  onClick,
  interactive = false,
  transparent = true,
}: BlobbiRendererProps) {
  // ALL defaulting, validation and clamping happens in one pure function
  // (blobbi-render-model.ts). Below this line there are no domain rules, only
  // geometry and markup.
  //
  // Not memoized on purpose: it is plain object construction, and its inputs
  // (`visual`, `accessories`, `eyeOffset`) are freshly built by callers on most
  // renders, so a `useMemo` here would cost a dependency comparison and never
  // hit. The EXPENSIVE work, building the SVG string, is memoized below on
  // the resolved scalars instead.
  const model = normalizeBlobbiRenderModel({
    visual,
    instanceId,
    facing,
    isSleeping,
    eyesClosed,
    eyeOffset,
    accessories,
  });

  // Effect resolution: pure, total and cheap, and it returns a shared frozen
  // empty array when there is nothing to draw, so the common case, a Blobbi
  // with no effects, allocates nothing.
  const resolvedEffects = normalizeBlobbiVisualEffects(effects);

  // Whether gaze markup must be injected. A BOOLEAN, deliberately: gaze
  // direction changes every animation frame while a Blobbi walks or watches,
  // and the SVG string must not be regenerated for a direction change; only
  // the CSS variables below move.
  const gazeEnabled = model.gaze !== null;

  const svgContent = useMemo(() => {
    try {
      const customizedSvg = loadBlobbiSvg(
        model.stage,
        model.adultType,
        model.baseColor,
        model.secondaryColor,
        model.eyeColor,
        model.eyesClosed,
        model.instanceId,
        model.view,
      );
      // When gaze is enabled, mark the pupils/highlights once so they can be
      // moved via CSS variables. Static contexts (no eyeOffset) keep the SVG
      // untouched, so previews/modals/cards render exactly as before.
      const withGaze = gazeEnabled ? applyGazeMarkup(customizedSvg) : customizedSvg;
      return sanitize ? sanitize(withGaze) : withGaze;
    } catch (err) {
      console.error('Failed to load Blobbi SVG:', err);
      return '';
    }
  }, [
    model.stage,
    model.adultType,
    model.baseColor,
    model.secondaryColor,
    model.eyeColor,
    model.eyesClosed,
    model.instanceId,
    model.view,
    gazeEnabled,
    sanitize,
  ]);

  if (!svgContent) return null;

  const box = resolveBlobbiRenderSize(size);

  // Gaze CSS variables on the body wrapper: only the pupils/highlights move
  // (via the injected `.blobbi-pupil` style), never the whole SVG.
  const bodyStyle: CSSProperties = model.gaze
    ? ({
        ...FILL_PARENT,
        ['--blobbi-eye-x' as string]: `${model.gaze.x}`,
        ['--blobbi-eye-y' as string]: `${model.gaze.y}`,
      } as CSSProperties)
    : FILL_PARENT;

  const rootStyle: CSSProperties = {
    position: 'relative',
    width: box.css,
    height: box.css,
    boxSizing: 'border-box',
    ...(interactive ? { cursor: 'pointer' } : null),
    ...style,
  };

  // Image semantics. A named Blobbi is an image with that name; an unnamed,
  // non-clickable one is decoration and is hidden from assistive technology
  // rather than announced as an anonymous graphic.
  const accessibleName = label ?? title;
  const decorative = accessibleName === undefined && onClick === undefined;

  return (
    <div
      className={classNames(
        'blobbi-renderer',
        interactive && 'blobbi-renderer--interactive',
        !transparent && 'blobbi-renderer--framed',
        className,
      )}
      style={rootStyle}
      role="img"
      aria-label={accessibleName}
      aria-hidden={decorative ? true : undefined}
      data-blobbi-renderer=""
      data-blobbi-size={box.label}
      title={title}
      onClick={onClick}
    >
      <BlobbiEffectStyles effects={resolvedEffects} />
      <BlobbiEffectLayer effects={resolvedEffects} layer="behind" instanceId={model.instanceId} />
      <AccessoryLayerView placements={model.accessories} layer="behind" />
      {/* The body fills the renderer box exactly: the wrapper is absolutely
          positioned over the whole box and the SVG carries width/height="100%"
          with its square viewBox (xMidYMid meet), so it neither distorts nor
          overflows. */}
      <div
        data-blobbi-body-box=""
        style={bodyStyle}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      {/* Between the body and the front accessories: where a body-overlay
          effect (Pixel Glitch, Electric Charge) belongs. It paints ON the
          Blobbi without ever painting over its hat. */}
      <BlobbiEffectLayer effects={resolvedEffects} layer="mid" instanceId={model.instanceId} />
      <AccessoryLayerView placements={model.accessories} layer="front" />
      <BlobbiEffectLayer effects={resolvedEffects} layer="front" instanceId={model.instanceId} />
    </div>
  );
}

/** @deprecated Renamed to {@link BlobbiRenderer}; kept for one migration cycle. */
export const BlobbiRendererView = BlobbiRenderer;
/** @deprecated Renamed to {@link BlobbiRendererProps}; kept for one migration cycle. */
export type BlobbiRendererViewProps = BlobbiRendererProps;
