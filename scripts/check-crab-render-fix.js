const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }

const rendering = read('public', 'client-enemy-rendering.js');
const html = read('public', 'index.html');
const server = read('server.js');
const config = read('public', 'client-config.js');
const readme = read('README.md');

assert(server.includes('const BUILD_VERSION = "6-11-359";'), 'server build must be 6-11-359');
assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-359";'), 'client build must be 6-11-359');
assert(html.includes('/client-enemy-rendering.js?v=359'), 'current Crab renderer cache key must be v340');
assert(rendering.includes('function drawCrab(crab, camX, camY)'), 'Crab renderer missing');
assert(!rendering.includes('drawEnemySpawnShimmer('), 'undefined drawEnemySpawnShimmer call must not remain');
assert(readme.includes('## v6-11-338 — Crab render fix'), 'historical README v338 changelog missing');

console.log('Crab render fix regression checks passed.');
