const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const renderer = read('public/client-enemy-rendering.js');
const server = read('server.js');
const config = read('public/client-config.js');
const html = read('public/index.html');
const readme = read('README.md');

assert(server.includes('const BUILD_VERSION = "6-11-366";'), 'server build must be 6-11-366');
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-366";'), 'client build must be 6-11-366');
assert(html.includes('/client-enemy-rendering.js?v=366'), 'enemy renderer cache key must be v340');
assert(readme.includes('## v6-11-340 — Crab wet status fix'), 'historical README v340 changelog missing');

const start = renderer.indexOf('function drawCrab(');
const end = renderer.indexOf('\nfunction mushroomIsAwakePresentation', start);
assert(start >= 0 && end > start, 'drawCrab body not found');
const crabBody = renderer.slice(start, end);

assert(
  crabBody.includes('if ((Number(crab.wetTime) || 0) > 0) {'),
  'Crab Wet rendering must be guarded by active wetTime'
);
assert(crabBody.includes('drawWetStatus('), 'Crab should retain Wet presentation when actually Wet');
assert(!/\n\s*drawWetStatus\([\s\S]*?\n\s*\);\n\}/.test(crabBody.replace(/if \(\(Number\(crab\.wetTime\)[\s\S]*?\n\s*\}/, '')),
  'Crab must not retain an unconditional Wet draw call');

// Match the existing enemy pattern so this regression catches future drift.
for (const species of ['slime', 'mushroom', 'goblin']) {
  assert(renderer.includes(`if ((Number(${species}.wetTime) || 0) > 0) {`), `${species} Wet guard missing`);
}

console.log('Crab wet status fix regression checks passed.');
