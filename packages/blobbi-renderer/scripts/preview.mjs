#!/usr/bin/env node
/**
 * Visual preview harness for the renderer artwork.
 *
 * Renders, from the BUILT package (`dist/`), a static HTML page that shows:
 *   - Adult V1 (a handful of forms) for reference;
 *   - Adult V2 front, right, left, back;
 *   - the same V2 views in several trait palettes;
 *   - awake | sleeping pairs for every V2 facing (closed eyes are derived);
 *   - a V2 gaze demo driven by the CSS variables;
 *   - every expression preset on the V2 front, right and left profile;
 *   - the three motion states (still, idle, walking) on V2 and V1.
 * Everything is inlined SVG generated at script time; the page needs no server,
 * no framework and no network. Open `preview/index.html` in a browser.
 *
 * Development only. `preview/` is gitignored and `scripts/` is not published.
 *
 *   npm run build --workspace @blobbi-kit/renderer && npm run preview --workspace @blobbi-kit/renderer
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const { renderBlobbiSvg, loadBlobbiSvg, BLOBBI_EMOTIONS, BLOBBI_MOTIONS } = await import('../dist/index.js');

const PALETTES = [
  { name: 'authored (no colors)', colors: {} },
  { name: 'purple traits', colors: { baseColor: '#8749ef', secondaryColor: '#481696', eyeColor: '#201538' } },
  { name: 'mint', colors: { baseColor: '#55c4a2', secondaryColor: '#1f6e59', eyeColor: '#26343f' } },
  { name: 'rose', colors: { baseColor: '#f2a0c0', secondaryColor: '#c2185b', eyeColor: '#3a2a1a' } },
  { name: 'amber', colors: { baseColor: '#f59e0b', secondaryColor: '#7c2d12', eyeColor: '#1e3a5f' } },
];
const FACINGS = ['front', 'right', 'left', 'back'];
const V1_FORMS = ['catti', 'bloomi', 'froggi', 'pandi', 'crysti', 'leafy'];

let i = 0;
const cell = (label, svg, extra = '') =>
  `<figure${extra}><div class="box">${svg}</div><figcaption>${label}</figcaption></figure>`;

const v2Rows = PALETTES.map((p) => {
  const cells = FACINGS.map((facing) => {
    const { svg } = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing, ...p.colors, instanceId: `p${i++}` });
    return cell(`v2 · ${facing}`, svg);
  }).join('');
  return `<section><h2>Adult V2 — ${p.name}</h2><div class="row">${cells}</div></section>`;
}).join('');

const v1Row = V1_FORMS.map((form) =>
  cell(`v1 · ${form}`, loadBlobbiSvg('adult', form, '#8749ef', '#c792ff', '#201538', false, `v1-${form}`)),
).join('');

// Awake | sleeping, side by side, for every facing; the sleeping drawing is
// the awake one with `closeAdultV2Eyes` applied (no second SVG exists).
const sleepRows = [PALETTES[0], PALETTES[2]].map((p) => {
  const cells = FACINGS.map((facing) => {
    const awake = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing, ...p.colors, instanceId: `s${i++}` }).svg;
    const asleep = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing, ...p.colors, eyesClosed: true, instanceId: `s${i++}` }).svg;
    return `<div class="pair">${cell(`v2 · ${facing} · awake`, awake)}${cell(`v2 · ${facing} · sleeping`, asleep)}</div>`;
  }).join('');
  return `<section><h2>Adult V2 — awake | sleeping — ${p.name}</h2><div class="row">${cells}</div></section>`;
}).join('');

const gaze = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing: 'front', instanceId: 'gaze', gaze: true }).svg;
const gazeSide = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing: 'right', instanceId: 'gaze-s', gaze: true }).svg;
const gazeLeft = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing: 'left', instanceId: 'gaze-l', gaze: true }).svg;

// Every expression preset, front / right / left (the left profile is the
// mirrored right one, so a preset that reads correctly there proves the
// transforms survive the mirror). The expression is IN the SVG string.
const expressionRows = ['front', 'right', 'left'].map((facing) => {
  const cells = BLOBBI_EMOTIONS.map((emotion) => {
    const { svg } = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing, expression: emotion, ...PALETTES[2].colors, instanceId: `x-${facing}-${emotion}` });
    return cell(`${emotion}`, svg);
  }).join('');
  return `<section><h2>Adult V2 — expressions — ${facing}</h2><div class="row">${cells}</div></section>`;
}).join('');

// Sleeping wins over the expression's eyes: happy + eyesClosed smiles in its sleep.
const sleepingHappy = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing: 'front', expression: 'happy', eyesClosed: true, ...PALETTES[2].colors, instanceId: 'x-sleep-happy' }).svg;
const backUpset = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing: 'back', expression: 'upset', ...PALETTES[2].colors, instanceId: 'x-back-upset' }).svg;

// Motion is wrapper/CSS state: the string API puts the attributes on the root
// <svg> and injects the package stylesheet, so each cell animates on its own.
const motionCells = BLOBBI_MOTIONS.map((motion) => {
  const v2 = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing: 'right', motion, expression: motion === 'walking' ? 'happy' : 'neutral', ...PALETTES[2].colors, instanceId: `m-${motion}` }).svg;
  const v1 = renderBlobbiSvg({ stage: 'adult', adultType: 'catti', motion, baseColor: '#8749ef', secondaryColor: '#c792ff', eyeColor: '#201538', instanceId: `m1-${motion}` }).svg;
  return cell(`v2 · right · ${motion}`, v2) + cell(`v1 · catti · ${motion}`, v1);
}).join('');

const html = `<!doctype html>
<meta charset="utf-8">
<title>Blobbi renderer preview</title>
<style>
  body{font:14px system-ui,sans-serif;margin:24px;background:#f6f3fb;color:#221}
  h1{margin:0 0 4px} h2{margin:24px 0 8px;font-size:15px}
  .row{display:flex;gap:16px;flex-wrap:wrap}
  figure{margin:0;text-align:center}
  .box{width:240px;height:240px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center}
  .box svg{width:100%;height:100%}
  figcaption{margin-top:6px;color:#555}
  .pair{display:flex;gap:4px;padding:6px;border-radius:14px;background:#ece6f7}
  .gaze{--blobbi-eye-x:0;--blobbi-eye-y:0}
  input[type=range]{width:200px}
</style>
<h1>Blobbi renderer preview</h1>
<p>Generated from <code>dist/</code> by <code>scripts/preview.mjs</code>. Static markup; no framework.</p>
<section><h2>Adult V1 (reference)</h2><div class="row">${v1Row}</div></section>
${v2Rows}
${sleepRows}
<section><h2>Adult V2 — gaze (CSS variables on the wrapper; no JS animation)</h2>
  <div class="row">
    ${cell('v2 · front · gaze', gaze, ' class="gaze" id="gaze-front"')}
    ${cell('v2 · right · gaze', gazeSide, ' class="gaze" id="gaze-side"')}
    ${cell('v2 · left · gaze (mirrored; same screen direction)', gazeLeft, ' class="gaze" id="gaze-left"')}
    <div><label>x <input id="gx" type="range" min="-1" max="1" step="0.05" value="0"></label><br>
         <label>y <input id="gy" type="range" min="-1" max="1" step="0.05" value="0"></label></div>
  </div>
</section>
${expressionRows}
<section><h2>Adult V2 — precedence and faceless views</h2>
  <div class="row">
    ${cell('happy + eyesClosed (sleeping wins the eyes)', sleepingHappy)}
    ${cell('back + upset (unchanged: no face)', backUpset)}
  </div>
</section>
<section><h2>Motion — still | idle | walking (CSS on the root svg; reduced-motion disables)</h2>
  <div class="row">${motionCells}</div>
</section>
<script>
  const set = () => { for (const el of document.querySelectorAll('.gaze')) {
    el.style.setProperty('--blobbi-eye-x', gx.value); el.style.setProperty('--blobbi-eye-y', gy.value); } };
  gx.oninput = set; gy.oninput = set;
</script>
`;

const out = join(here, '..', 'preview');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), html);
console.log(`wrote ${join(out, 'index.html')}`);
