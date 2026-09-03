const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const renderer = read("public", "client-enemy-rendering.js");
const readme = read("README.md");
const config = read("public", "client-config.js");
const html = read("public", "index.html");

assert(config.includes('const CLIENT_BUILD_VERSION = "6-11-360";'), 'client build must be 6-11-360');
assert(html.includes('/client-enemy-rendering.js?v=360') && html.includes('/client-enemies.js?v=360') && html.includes('/game.js?v=360'), 'v342 cache keys missing');
assert(readme.includes('## v6-11-342 — Crab face clip fix'), 'historical README v342 changelog missing');
const start = renderer.indexOf('function drawCrab(');
const end = renderer.indexOf('\nfunction mushroomIsAwakePresentation', start);
assert(start >= 0 && end > start, 'drawCrab body not found');
const crabBlock = renderer.slice(start, end);
assert(crabBlock.includes('const baseHeight = 16;'), 'Crab renderer should keep full 16px height during walk');
assert(!crabBlock.includes('const baseHeight = moving && scuttleWave > 0 ? 15 : 16;'), 'Old crab walk squash still present');
assert(crabBlock.includes('const frontOffsetY = moving ? (scuttleWave > 0 ? 0 : 1) : (idleFrontTwitch ? 0 : 0);'), 'Crab face offset fix missing');
console.log('Crab face clip fix regression checks passed.');
