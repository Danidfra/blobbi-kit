/**
 * Egg V1 SVG resolver: the one drawing, with the crack overlay reduced to the
 * requested state. Pure string work; no colours here (see the customizer).
 */
import { eggCrackLevel, type BlobbiEggCrack } from '../../../../egg-model';
import { EGG_BASE_SVG } from './egg-svg-data';

const CRACK_GROUP = (level: number) =>
  new RegExp(`\\s*<g data-part="egg-crack-${level}"[\\s\\S]*?</g>`, 'g');

/**
 * The egg markup for a crack state. Crack groups are cumulative in the
 * authored drawing; groups above the requested level are removed, so
 * `'none'` is the intact shell and `'heavy'` is the full overlay.
 */
export function getEggSvg(crack: BlobbiEggCrack): string {
  const level = eggCrackLevel(crack);
  let svg = EGG_BASE_SVG;
  for (let g = 3; g > level; g -= 1) svg = svg.replace(CRACK_GROUP(g), '');
  return svg;
}
