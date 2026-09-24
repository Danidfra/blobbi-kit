/**
 * Egg V1 SVG customizer: shell colour from `baseColor`, spots from
 * `secondaryColor`, ids namespaced per instance. Mirrors the baby customizer
 * so an egg and the baby it becomes share one colour language: the same seed
 * gives the same base and secondary, so the hatched baby's body reads as the
 * shell's colour and the spots' colour.
 */
import { lightenColor, uniquifySvgIds, ensureSvgFillsContainer } from '../../../../svg';

export interface EggSvgCustomization {
  baseColor?: string;
  secondaryColor?: string;
}

export function customizeEggSvg(svgText: string, customization: EggSvgCustomization, instanceId?: string): string {
  let modifiedSvg = ensureSvgFillsContainer(svgText);

  if (customization.baseColor) {
    modifiedSvg = applyShellGradient(modifiedSvg, customization.baseColor);
    modifiedSvg = applySpotGradient(modifiedSvg, customization.secondaryColor ?? lightenColor(customization.baseColor, 12), !customization.secondaryColor);
  } else if (customization.secondaryColor) {
    modifiedSvg = applySpotGradient(modifiedSvg, customization.secondaryColor, false);
  }

  if (instanceId) modifiedSvg = uniquifySvgIds(modifiedSvg, instanceId);
  return modifiedSvg;
}

function applyShellGradient(svgText: string, baseColor: string): string {
  const regex = /<radialGradient[^>]*id=["']blobbiEggGradient["'][^>]*>([\s\S]*?)<\/radialGradient>/;
  const match = svgText.match(regex);
  if (!match) return svgText;
  const gradient = `<radialGradient id="blobbiEggGradient" cx="0.36" cy="0.3" r="0.85">
      <stop offset="0%" style="stop-color:${lightenColor(baseColor, 45)}"/>
      <stop offset="55%" style="stop-color:${lightenColor(baseColor, 22)}"/>
      <stop offset="100%" style="stop-color:${baseColor}"/>
    </radialGradient>`;
  return svgText.replace(match[0], gradient);
}

function applySpotGradient(svgText: string, spotColor: string, subtle: boolean): string {
  const regex = /<radialGradient[^>]*id=["']blobbiEggSpotGradient["'][^>]*>([\s\S]*?)<\/radialGradient>/;
  const match = svgText.match(regex);
  if (!match) return svgText;
  const innerOpacity = subtle ? 0.55 : 0.95;
  const outerOpacity = subtle ? 0.4 : 0.8;
  const gradient = `<radialGradient id="blobbiEggSpotGradient" cx="0.4" cy="0.4">
      <stop offset="0%" style="stop-color:${lightenColor(spotColor, 12)};stop-opacity:${innerOpacity}"/>
      <stop offset="100%" style="stop-color:${spotColor};stop-opacity:${outerOpacity}"/>
    </radialGradient>`;
  return svgText.replace(match[0], gradient);
}
