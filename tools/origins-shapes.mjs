// Map shapes for "Where they're from" (History > Map): the world's countries and the US states, already projected to
// SVG path strings so the page needs no map library. Keyed the way Basketball-Reference's birthplace pages are: a
// country's two-letter code (FR, AU ...) and US-<state> (US-NY ...). Run by the origins workflow, which installs
// d3-geo, topojson-client, world-atlas, us-atlas and i18n-iso-countries first.
//   node tools/origins-shapes.mjs <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import countries from 'i18n-iso-countries';
const require = createRequire(import.meta.url);
const load = p => JSON.parse(readFileSync(require.resolve(p), 'utf8'));
const round = d => String(d || '').replace(/(\d+\.\d)\d+/g, '$1');

// world: Natural Earth projection, 960 x 500, Antarctica left out
const wT = load('world-atlas/countries-110m.json'), world = feature(wT, wT.objects.countries);
world.features = world.features.filter(f => f.properties.name !== 'Antarctica');
const proj = geoNaturalEarth1().fitExtent([[4, 4], [956, 496]], world), wp = geoPath(proj);
const W = {};
for (const f of world.features) {
  const code = countries.numericToAlpha2(String(f.id).padStart(3, '0')) || ({ Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' })[f.properties.name];
  const d = round(wp(f)); if (!d) continue;
  if (code && W[code]) W[code].d += d; else W[code || `x${f.id || f.properties.name}`] = { n: f.properties.name, d };
}
// US states: the atlas comes already projected (Albers USA, 975 x 610)
// simplified to keep the file small: drop the finest 85% of the detail
const usT0 = presimplify(load('us-atlas/states-albers-10m.json')), usT = simplify(usT0, quantile(usT0, 0.85)), us = feature(usT, usT.objects.states), up = geoPath(null);
const FIPS = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR' };
const U = {};
for (const f of us.features) { const st = FIPS[String(f.id).padStart(2, '0')]; if (!st) continue; U[`US-${st}`] = { n: f.properties.name, d: round(up(f)) }; }
const out = process.argv[2] || 'shapes.json';
writeFileSync(out, JSON.stringify({ world: { w: 960, h: 500, shapes: W }, us: { w: 975, h: 610, shapes: U } }));
console.log('shapes: countries', Object.keys(W).length, 'states', Object.keys(U).length);
