/**
 * THE INSTRUMENT, tested on itself: a paint list must not notice how a
 * drawing is written down, and must notice everything about what it paints.
 *
 * Each test takes a real reference drawing, rewrites its markup, and reads
 * both. The first half rewrites it in ways that paint the same picture; the
 * second half changes the picture, each time by one small thing.
 */
import { describe, expect, it } from 'vitest';
import { REFERENCE_CASES } from './cases';
import { TOLERANCE, paintDifferences, paintLines, paintList } from './paint-list';
import { drawReference } from './reference';

const identityOf = (name: string) => REFERENCE_CASES.find((c) => c.name === name)!.identity;
const CROWDED = drawReference(identityOf('crowded-crown'), 'adult', 'front');
const GRADIENT = drawReference(identityOf('gradient'), 'adult', 'side');
const STRIPED_BABY = drawReference(identityOf('striped'), 'baby', 'front');
const EGG = drawReference(identityOf('light-palette'), 'egg');
const DRAWINGS = { CROWDED, GRADIENT, STRIPED_BABY, EGG };

/** Rewrite a drawing through the DOM and write it out again. */
function rewrite(svg: string, change: (root: Element, doc: Document) => void): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  change(doc.documentElement, doc);
  return new XMLSerializer().serializeToString(doc);
}
const SVG_NS = 'http://www.w3.org/2000/svg';
const shapes = (root: Element) => [...root.querySelectorAll('path, ellipse, circle, rect')].filter((el) => !el.closest('defs'));
const part = (root: Element, name: string) => root.querySelector(`[data-part="${name}"]`)!;
/** What differs between a drawing and a rewriting of it. */
const differences = (original: string, rewritten: string) => paintDifferences(paintLines(paintList(original)), paintList(rewritten));

describe('a paint list does not notice how the drawing is written', () => {
  it.each(Object.entries(DRAWINGS))('%s: reads the same drawing twice the same way, and it paints something', (_name, svg) => {
    expect(paintList(svg).length).toBeGreaterThan(5);
    expect(paintLines(paintList(svg))).toEqual(paintLines(paintList(svg)));
    expect(differences(svg, svg)).toEqual([]);
  });

  it.each(Object.entries(DRAWINGS))('%s: ids, data attributes, attribute order and whitespace', (_name, svg) => {
    const rewritten = rewrite(svg, (root, doc) => {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const attributes = [...el.attributes].filter((a) => a.name !== 'xmlns').map((a) => [a.name, a.value] as const);
        for (const [name] of attributes) el.removeAttribute(name);
        // Written back in reverse, ids and references renamed, labels that are not `data-part` dropped.
        for (const [name, value] of attributes.reverse()) {
          if (name.startsWith('data-') && name !== 'data-part') continue;
          el.setAttribute(name, name === 'id' ? `renamed-${value}` : value.replace(/url\(#([^)]+)\)/g, 'url(#renamed-$1)'));
        }
        if (el !== root) el.before(doc.createTextNode('\n    '));
      }
    });
    expect(rewritten).not.toBe(svg);
    expect(differences(svg, rewritten)).toEqual([]);
  });

  it.each(Object.entries(DRAWINGS))('%s: how numbers are spelled, and coordinates written to two decimals instead of three', (_name, svg) => {
    const NUMBER = /-?\d+\.\d+|-?\d+/g;
    const coarse = (value: string) => value.replace(/-?\d+\.\d{3,}/g, (n) => String(Number(Number(n).toFixed(2))));
    const padded = (value: string) => value.replace(NUMBER, (n) => (n.includes('.') ? `${n}000` : `${n}.0`));
    const rewritten = rewrite(svg, (root) => {
      for (const el of shapes(root)) {
        // An arc that is a hair from a semicircle (the tip of a horn, of an ear) is the one shape whose
        // coordinates cannot be rounded harmlessly: its bulge depends on the last digit of its radius.
        // Such a path keeps its digits here and is only spelled differently.
        const arcs = /A/.test(el.getAttribute('d') ?? '');
        for (const name of ['d', 'cx', 'cy', 'rx', 'ry', 'r', 'x', 'y', 'width', 'height']) {
          if (el.hasAttribute(name)) el.setAttribute(name, arcs ? padded(el.getAttribute(name)!).replace(/ ([01])\.0 ([01])\.0 /g, ' $1 $2 ') : coarse(el.getAttribute(name)!));
        }
      }
    });
    expect(rewritten).not.toBe(svg);
    expect(differences(svg, rewritten)).toEqual([]);
  });

  it.each(Object.entries(DRAWINGS))('%s: other grouping, and transforms that cancel', (_name, svg) => {
    const rewritten = rewrite(svg, (root, doc) => {
      for (const el of shapes(root)) {
        const there = doc.createElementNS(SVG_NS, 'g');
        const back = doc.createElementNS(SVG_NS, 'g');
        there.setAttribute('transform', 'translate(31.5 -12) rotate(20) scale(1.25)');
        back.setAttribute('transform', 'scale(0.8) rotate(-20) translate(-31.5 12)');
        el.replaceWith(there);
        there.append(back);
        back.append(el);
      }
    });
    expect(differences(svg, rewritten)).toEqual([]);
  });

  it.each(Object.entries(DRAWINGS))('%s: an ellipse written as a path, with its rotation baked in', (_name, svg) => {
    let turned = 0;
    const rewritten = rewrite(svg, (root, doc) => {
      for (const el of shapes(root).filter((s) => s.tagName === 'ellipse' || s.tagName === 'circle')) {
        const n = (name: string) => Number(el.getAttribute(name) ?? 0);
        const [cx, cy] = [n('cx'), n('cy')];
        const [rx, ry] = el.tagName === 'circle' ? [n('r'), n('r')] : [n('rx'), n('ry')];
        const rotation = Number(/^rotate\((-?[\d.]+) /.exec(el.getAttribute('transform') ?? '')?.[1] ?? 0);
        const r = (rotation * Math.PI) / 180;
        // Four quarter arcs about the turned axes.
        const at = (t: number) => {
          const [x, y] = [rx * Math.cos(t), ry * Math.sin(t)];
          return `${cx + x * Math.cos(r) - y * Math.sin(r)},${cy + x * Math.sin(r) + y * Math.cos(r)}`;
        };
        const path = doc.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', `M ${at(0)} ${[1, 2, 3, 4].map((q) => `A ${rx} ${ry} ${rotation} 0 1 ${at((q * Math.PI) / 2)}`).join(' ')} Z`);
        for (const a of el.attributes) if (!['cx', 'cy', 'rx', 'ry', 'r', 'transform'].includes(a.name)) path.setAttribute(a.name, a.value);
        if (rotation !== 0) turned++;
        el.replaceWith(path);
      }
    });
    expect(rewritten).not.toContain('<ellipse');
    if (svg === CROWDED) expect(turned).toBeGreaterThan(3);
    expect(differences(svg, rewritten)).toEqual([]);
  });

  it('shapes that paint nothing, and how far a wash overshoots its clip', () => {
    const rewritten = rewrite(GRADIENT, (root, doc) => {
      const ghost = doc.createElementNS(SVG_NS, 'ellipse');
      for (const [name, value] of Object.entries({ cx: '300', cy: '300', rx: '90', ry: '40', fill: '#ff0000', opacity: '0' })) ghost.setAttribute(name, value);
      const outline = doc.createElementNS(SVG_NS, 'path');
      outline.setAttribute('d', 'M 0,0 L 500,500');
      outline.setAttribute('fill', 'none');
      part(root, 'body-base').after(ghost, outline);
      // The gradient pattern's rectangle is drawn far wider than the body it is clipped to.
      const wash = part(root, 'pattern-gradient');
      expect(wash.getAttribute('x')).toBe('-2000');
      wash.setAttribute('x', '-9000');
      wash.setAttribute('width', '20000');
      wash.setAttribute('height', String(Number(wash.getAttribute('height')) + 700));
    });
    expect(differences(GRADIENT, rewritten)).toEqual([]);
  });

  it('the frame it is shown in: a baby in its own square is the same baby', () => {
    const rewritten = rewrite(STRIPED_BABY, (root) => root.setAttribute('viewBox', '0 0 211.66666 238.125'));
    expect(rewritten).not.toBe(STRIPED_BABY);
    expect(differences(STRIPED_BABY, rewritten)).toEqual([]);
  });
});

describe('a paint list notices everything about what is painted', () => {
  /** A drawing changed in one way, and the differences that are reported. */
  const changed = (svg: string, change: (root: Element, doc: Document) => void) => differences(svg, rewrite(svg, change));
  const bump = (el: Element, name: string, by: number) => el.setAttribute(name, String(Number(el.getAttribute(name)) + by));

  it('a shape that moved, by more than the tolerance and by no less', () => {
    // 0.4 root units is 0.106 units of the frame: five times the tolerance.
    const moved = changed(CROWDED, (root) => bump(part(root, 'left-pupil'), 'cx', 0.4));
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatch(/\(left-pupil\): centre x/);
    // 0.15 of a root unit is 0.04: twice the tolerance, and seen. 0.03 is 0.008: inside it, the same drawing.
    expect(changed(CROWDED, (root) => bump(part(root, 'left-pupil'), 'cy', 0.15))).toHaveLength(1);
    expect(changed(CROWDED, (root) => bump(part(root, 'left-pupil'), 'cy', 0.03))).toEqual([]);
    expect(TOLERANCE).toBe(0.02);
  });

  it('a shape that grew, or bent', () => {
    expect(changed(CROWDED, (root) => bump(part(root, 'right-iris'), 'rx', 0.3)).join(' ')).toMatch(/right-iris\): width/);
    // The body's outline, one control point pulled out by two units.
    const bent = changed(CROWDED, (root) => {
      const body = part(root, 'body-base');
      const numbers = body.getAttribute('d')!.split(' ');
      const index = numbers.findIndex((token) => token === 'C') + 1;
      const [x, y] = numbers[index].split(',').map(Number);
      numbers[index] = `${x + 2},${y}`;
      body.setAttribute('d', numbers.join(' '));
    });
    expect(bent.join(' ')).toMatch(/body-base\): (length|area)/);
    // A special mark turned by three degrees where it lies.
    const turned = changed(CROWDED, (root) => {
      const mark = part(root, 'special-mark-shape');
      mark.setAttribute('transform', mark.getAttribute('transform')!.replace(/rotate\((-?[\d.]+)\)/, (_, a) => `rotate(${Number(a) + 3})`));
    });
    expect(turned.join(' ')).toMatch(/special-mark-shape\): (width|height|centre)/);
    // A line drawn thicker.
    expect(changed(CROWDED, (root) => bump(part(root, 'mouth'), 'stroke-width', 0.5)).join(' ')).toMatch(/mouth\): stroke width/);
  });

  it('paint: a colour, an opacity, a gradient stop, a blur, a clip', () => {
    const one = (found: string[], name: string) => {
      expect(found.join(' ')).toMatch(new RegExp(`\\(${name}\\): painted differently`));
      return found;
    };
    one(changed(CROWDED, (root) => part(root, 'body-shine').setAttribute('fill', '#fffffe')), 'body-shine');
    one(changed(CROWDED, (root) => part(root, 'body-shine').setAttribute('opacity', '0.31')), 'body-shine');
    // The spots' opacity is their group's.
    expect(one(changed(CROWDED, (root) => part(root, 'side-pattern').setAttribute('opacity', '0.6')), 'side-pattern-mark').length).toBe(CROWDED.match(/side-pattern-mark/g)!.length);
    // One stop of the body's own gradient, one step in one channel.
    one(changed(CROWDED, (root) => {
      const stop = root.querySelector('radialGradient[id$="-body"] stop')!;
      stop.setAttribute('stop-color', stop.getAttribute('stop-color')!.replace(/.$/, (c) => (c === '0' ? '1' : '0')));
    }), 'body-base');
    one(changed(CROWDED, (root) => root.querySelector('feGaussianBlur')!.setAttribute('stdDeviation', '12')), 'body-shadow');
    one(changed(CROWDED, (root) => part(root, 'special-mark').removeAttribute('clip-path')), 'special-mark-shape');
    one(changed(CROWDED, (root) => part(root, 'mouth').setAttribute('stroke-linecap', 'butt')), 'mouth');
  });

  it('where the light falls: a gradient in user space, moved', () => {
    const moved = changed(CROWDED, (root) => {
      const body = root.querySelector('radialGradient[id$="-body"]')!;
      body.setAttribute('gradientTransform', body.getAttribute('gradientTransform')!.replace(/translate\((-?[\d.]+) /, (_, x) => `translate(${Number(x) + 3} `));
    });
    expect(moved.join(' ')).toMatch(/body-base\): gradient frame/);
    // The gradient pattern starting lower on the body.
    const lower = changed(GRADIENT, (root) => bump(root.querySelector('linearGradient[id$="-pattern-gradient"]')!, 'y1', 6));
    expect(lower.join(' ')).toMatch(/pattern-gradient\): gradient frame/);
  });

  it('paint order, and a shape that is there or not', () => {
    // The pupil painted before the iris it sits on.
    const swapped = changed(CROWDED, (root) => part(root, 'left-iris').before(part(root, 'left-pupil')));
    expect(swapped.length).toBeGreaterThan(0);
    // A spot removed, and one added.
    expect(changed(CROWDED, (root) => part(root, 'side-pattern-mark').remove())[0]).toMatch(/^paints \d+ shapes, the reference \d+/);
    expect(changed(CROWDED, (root) => part(root, 'left-pupil').after(part(root, 'left-pupil').cloneNode(true)))[0]).toMatch(/^paints \d+ shapes/);
    // The baby's order is its own: its mouth is under its blush.
    expect(changed(STRIPED_BABY, (root) => root.querySelector('[data-part="character"]')!.append(part(root, 'mouth'))).length).toBeGreaterThan(0);
  });
});

describe('a paint list refuses what it cannot measure', () => {
  const broken = (change: (root: Element, doc: Document) => void) => () => paintList(rewrite(CROWDED, change));

  it('throws rather than skip paint it does not understand', () => {
    expect(broken((root, doc) => part(root, 'body-base').after(doc.createElementNS(SVG_NS, 'polygon')))).toThrow(/<polygon> is not understood/);
    expect(broken((root, doc) => part(root, 'body-base').after(doc.createElementNS(SVG_NS, 'use')))).toThrow(/<use>/);
    expect(broken((root) => part(root, 'mouth').setAttribute('d', 'M 0,0 l 5,5'))).toThrow(/path command "l"/);
    expect(broken((root) => part(root, 'mouth').setAttribute('transform', 'skewX(10)'))).toThrow(/skewX/);
    expect(broken((root) => part(root, 'mouth').setAttribute('mask', 'url(#m)'))).toThrow(/mask/);
    expect(broken((root) => part(root, 'mouth').setAttribute('style', 'transform: rotate(4deg)'))).toThrow(/style/);
    expect(broken((root) => part(root, 'body-base').setAttribute('fill', 'url(#nowhere)'))).toThrow(/refers to nothing/);
    expect(broken((root) => part(root, 'body-base').setAttribute('fill', 'red'))).toThrow(/not understood|refers to nothing/);
    expect(() => paintList('<div/>')).toThrow(/not an SVG/);
  });

  it('reads a live (animated) drawing only where the animation is not what paints it', () => {
    // A still drawing is what is pinned; a transform-origin for a stylesheet to use changes nothing painted.
    expect(() => paintList(rewrite(CROWDED, (root) => part(root, 'mouth').setAttribute('style', 'transform-origin: 3px 4px')))).not.toThrow();
  });
});
