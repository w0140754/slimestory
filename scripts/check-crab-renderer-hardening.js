const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const renderer = read('public', 'client-enemy-rendering.js');
const html = read('public', 'index.html');
const server = read('server.js');
const config = read('public', 'client-config.js');
const readme = read('README.md');

assert(server.includes('const BUILD_VERSION = "6-11-358";'), 'server build must be 6-11-358');
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-358";'), 'client build must be 6-11-358');
assert(html.includes('/client-enemy-rendering.js?v=358'), 'enemy renderer cache key must be v340');
assert(readme.includes('## v6-11-339 — Crab renderer hardening'), 'historical README v339 changelog missing');

const start = renderer.indexOf('function drawCrab(');
const end = renderer.indexOf('\nfunction mushroomIsAwakePresentation', start);
assert(start >= 0 && end > start, 'drawCrab block not found');
const crabBlock = renderer.slice(start, end);

assert(!crabBlock.includes('drawEnemySpawnShimmer('), 'Crab renderer still references undefined drawEnemySpawnShimmer');
assert(!crabBlock.includes('drawBurnEffect('), 'Crab renderer still references undefined drawBurnEffect');
assert(crabBlock.includes('drawPixelFlame('), 'Crab burn presentation must use existing drawPixelFlame primitive');
assert(crabBlock.includes('drawWetStatus('), 'Crab wet presentation must remain wired');

// Guard the regression class that caused v337/v338: Crab-only standalone draw helpers
// must either be the renderer itself or proven shared presentation primitives.
const helperCalls = [...crabBlock.matchAll(/(?<!\.)\b(draw[A-Z][A-Za-z0-9_]*)\s*\(/g)].map(m => m[1]);
const allowed = new Set(['drawCrab', 'drawPixelFlame', 'drawWetStatus']);
const unknown = [...new Set(helperCalls.filter(name => !allowed.has(name)))];
assert(unknown.length === 0, `drawCrab contains unapproved standalone draw helper(s): ${unknown.join(', ')}`);


console.log('Crab renderer hardening regression checks passed.');
