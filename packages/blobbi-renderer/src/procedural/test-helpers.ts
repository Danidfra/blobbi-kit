/** Shared by the engine tests. */
import { DOCUMENT_TRANSFORM, VIEWBOX } from './renderer';

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

export const seeds = (n: number, prefix = 'seed') => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

/** Every numeric attribute value and path number in a piece of SVG markup. */
export function numbersIn(svg: string): number[] {
  const out: number[] = [];
  for (const attr of svg.matchAll(/\s(?:cx|cy|rx|ry|r|x|y|x1|y1|x2|y2|width|height|opacity|stroke-width|offset)="([^"]*)"/g)) {
    out.push(Number(attr[1].replace('%', '')));
  }
  for (const d of svg.matchAll(/\sd="([^"]*)"/g)) {
    for (const token of d[1].split(/[\s,]+|(?=[A-Za-z])|(?<=[A-Za-z])/)) {
      if (token && !/^[A-Za-z]$/.test(token)) out.push(Number(token));
    }
  }
  return out;
}

/** Attribute value of the first element carrying `data-part="<part>"`. */
export function attrOf(svg: string, part: string, attr: string): string | undefined {
  const tag = new RegExp(`<[a-z]+\\b[^>]*data-part="${part}"[^>]*>`).exec(svg)?.[0];
  return tag ? new RegExp(`\\s${attr}="([^"]*)"`).exec(tag)?.[1] : undefined;
}

/** Everything wrong with a piece of generated markup, as messages; empty when it is sound. */
export function problemsIn(svg: string): string[] {
  const problems: string[] = [];
  if (/NaN|Infinity|undefined|null/.test(svg)) problems.push('invalid token');
  if (numbersIn(svg).some((n) => !Number.isFinite(n))) problems.push('non-finite number');
  for (const m of svg.matchAll(/\s(rx|ry|r|width|height|stroke-width)="([^"]*)"/g)) {
    if (!(Number(m[2].replace('%', '')) >= 0)) problems.push(`negative ${m[1]} ${m[2]}`);
  }
  for (const m of svg.matchAll(/\sopacity="([^"]*)"/g)) {
    const v = Number(m[1]);
    if (!(v >= 0 && v <= 1)) problems.push(`opacity ${m[1]}`);
  }
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color)="(#[^"]*)"/g)) {
    if (!/^#[0-9a-f]{6}$/.test(m[1])) problems.push(`colour ${m[1]}`);
  }
  const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) if (!ids.has(m[1])) problems.push(`dangling reference ${m[1]}`);
  return problems;
}

/** The viewBox, in root units: what is outside it is cut off. */
export const ROOT_BOUNDS = {
  left: (0 - DOCUMENT_TRANSFORM.tx) / DOCUMENT_TRANSFORM.scale,
  right: (VIEWBOX.width - DOCUMENT_TRANSFORM.tx) / DOCUMENT_TRANSFORM.scale,
  top: (0 - DOCUMENT_TRANSFORM.ty) / DOCUMENT_TRANSFORM.scale,
  bottom: (VIEWBOX.height - DOCUMENT_TRANSFORM.ty) / DOCUMENT_TRANSFORM.scale,
};
